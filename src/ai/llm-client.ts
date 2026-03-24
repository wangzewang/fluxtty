import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from '../config/ConfigContext';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

/**
 * Infer which API provider to use from the model name when `provider` is not
 * explicitly set in config.
 *
 * Supported conventions:
 *   claude-*                → anthropic
 *   gpt-* | o1-* | o3-* | o4-* | chatgpt-*  → openai
 *   gemini-*                → google
 *   ollama/*                → ollama
 *   claude-cli              → claude-cli subprocess
 *   none                    → disabled (regex parser only)
 *   <provider>/<model>      → explicit provider prefix (e.g. "openai/gpt-4o")
 */
function inferProvider(model: string): string {
  if (!model || model === 'none') return 'none';
  if (model === 'claude-cli') return 'claude-cli';
  if (model.startsWith('claude-')) return 'anthropic';
  if (/^(gpt-|o1-|o3-|o4-|chatgpt-)/.test(model)) return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  if (model.startsWith('ollama/') || model.startsWith('ollama:')) return 'ollama';
  // Explicit provider prefix: "anthropic/claude-opus-4-6", "openai/gpt-4o", etc.
  if (model.includes('/')) return model.split('/')[0];
  // Unknown — try openai-compatible as a safe default (many local/cloud providers use it)
  return 'openai';
}

/** Strip an explicit provider prefix from the model name before sending to the API. */
function stripProviderPrefix(model: string): string {
  const knownPrefixes = ['anthropic/', 'openai/', 'google/', 'ollama/', 'ollama:'];
  for (const p of knownPrefixes) {
    if (model.startsWith(p)) return model.slice(p.length);
  }
  return model;
}

// ---------------------------------------------------------------------------
// Per-provider call functions
// ---------------------------------------------------------------------------

async function callAnthropic(
  messages: LLMMessage[],
  model: string,
  apiKey: string,
  baseUrl: string | null,
): Promise<string> {
  const url = (baseUrl ?? 'https://api.anthropic.com') + '/v1/messages';
  const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
  const chatMessages = messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    model: stripProviderPrefix(model),
    max_tokens: 1024,
    messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
  };
  if (systemParts.length > 0) body.system = systemParts.join('\n\n');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function callOpenAI(
  messages: LLMMessage[],
  model: string,
  apiKey: string,
  baseUrl: string | null,
): Promise<string> {
  const url = (baseUrl ?? 'https://api.openai.com') + '/v1/chat/completions';
  const body = {
    model: stripProviderPrefix(model),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGoogle(
  messages: LLMMessage[],
  model: string,
  apiKey: string,
  baseUrl: string | null,
): Promise<string> {
  const base = baseUrl ?? 'https://generativelanguage.googleapis.com';
  const modelName = stripProviderPrefix(model);
  const url = `${base}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
  const chatMessages = messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    contents: chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  };
  if (systemParts.length > 0) {
    body.system_instruction = { parts: [{ text: systemParts.join('\n\n') }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Gemini ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callOllama(
  messages: LLMMessage[],
  model: string,
  baseUrl: string | null,
): Promise<string> {
  const url = (baseUrl ?? 'http://localhost:11434').replace(/\/$/, '') + '/api/chat';
  const body = {
    model: stripProviderPrefix(model).replace(/^ollama[:/]?/, ''),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.message?.content ?? '';
}

async function callClaudeCLI(messages: LLMMessage[]): Promise<string> {
  // Merge system prompt + last user message into a single -p argument.
  const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return '';

  const prompt = systemParts.length > 0
    ? systemParts.join('\n\n') + '\n\n' + lastUser.content
    : lastUser.content;

  return invoke<string>('claude_cli_query', { prompt });
}

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------

export class LLMClient {
  async complete(messages: LLMMessage[], cfg: AppConfig): Promise<string> {
    const wai = cfg.workspace_ai;
    if (!wai.model || wai.model === 'none') return '';

    const provider = wai.provider ?? inferProvider(wai.model);
    if (provider === 'none') return '';

    // Resolve API key from env (env vars only accessible via Rust IPC)
    let apiKey = '';
    if (wai.api_key_env) {
      apiKey = await invoke<string>('get_env_var', { name: wai.api_key_env }).catch(() => '');
    }

    switch (provider) {
      case 'anthropic':
        return callAnthropic(messages, wai.model, apiKey, wai.base_url ?? null);
      case 'openai':
        return callOpenAI(messages, wai.model, apiKey, wai.base_url ?? null);
      case 'google':
        return callGoogle(messages, wai.model, apiKey, wai.base_url ?? null);
      case 'ollama':
        return callOllama(messages, wai.model, wai.base_url ?? null);
      case 'claude-cli':
        return callClaudeCLI(messages);
      default:
        throw new Error(`Unknown AI provider: "${provider}". Supported: anthropic, openai, google, ollama, claude-cli`);
    }
  }
}

export const llmClient = new LLMClient();
