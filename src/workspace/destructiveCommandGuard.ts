/**
 * Hard, non-negotiable interception for genuinely destructive shell text.
 * Applied regardless of who dispatched the action (human, AI, or system) and
 * regardless of any "autonomous"/no-confirm configuration — this is the one
 * check that always forces a human confirmation before text matching it is
 * ever written into a pane's PTY. Biased toward over-flagging: a false
 * positive just costs an extra y/n prompt.
 */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*)\b/i,               // rm -rf / rm -fr (any flag order/combo)
  /\bgit\s+push\b[^\n]*(--force\b|-f\b)/i,                 // git push --force / -f
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b[^\n]*-\w*[dfx]\w*[dfx]\w*/i,            // git clean -fd / -xdf etc.
  /\bdd\s+[^\n]*\bif=/i,
  /\bmkfs(\.\w+)?\b/i,
  /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i,  // curl|sh / wget|sh piping
  /\bdrop\s+(table|database|schema)\b/i,
  /\bdelete\s+from\b/i,                                    // SQL DELETE FROM — flagged regardless of WHERE clause
  /\bkubectl\s+delete\b/i,
  /\bsudo\s+rm\b/i,
  />\s*\/dev\/(sd|nvme|disk|hd)\w*/i,                      // redirect onto a raw block device
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bchmod\s+-R\s+000\b/i,
  /\b:(){ :\|:& };:/,                                      // classic fork bomb
];

export function isDestructiveCommand(text: string): boolean {
  if (!text || !text.trim()) return false;
  return DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(text));
}
