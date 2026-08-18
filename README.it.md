# fluxtty

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.es-ES.md">Español</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.it.md">Italiano</a>
</p>

<p align="center">
  <img src="src-tauri/icons/icon.png" width="112" height="112" alt="fluxtty" />
</p>

<h3 align="center">Uno spazio di lavoro terminale in modalità vim per lo sviluppo con IA.</h3>

<p align="center">
  Non scrivi più solo codice — dirigi agenti.<br/>
  fluxtty è uno spazio di lavoro controllato da tastiera per eseguire molte sessioni IA in parallelo,<br/>
  con l'efficienza modale che ha reso vim indispensabile.
</p>

<p align="center">
  <a href="https://github.com/amoswzw/fluxtty/actions/workflows/ci.yml"><img src="https://github.com/amoswzw/fluxtty/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/amoswzw/fluxtty/actions/workflows/codeql.yml"><img src="https://github.com/amoswzw/fluxtty/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" /></a>
  <a href="https://github.com/amoswzw/fluxtty/releases/latest"><img src="https://img.shields.io/github/v/release/amoswzw/fluxtty" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-2f363d" alt="Platform" />
  <img src="https://img.shields.io/badge/Tauri-2.x-24b47e" alt="Tauri" />
  <img src="https://img.shields.io/badge/license-MIT-4f8cff" alt="License" />
</p>

<p align="center">
  <a href="https://amoswzw.github.io/fluxtty/"><strong>Demo live →</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/amoswzw/fluxtty/releases/latest"><strong>Scarica l'ultima versione</strong></a>
</p>

<p align="center">
  <img src="docs/fluxtty-preview.gif" width="100%" alt="fluxtty workspace preview" />
</p>

## L'idea

Quando l'IA scrive il codice, il tuo lavoro cambia dal digitare al dirigere. Ti serve uno spazio di lavoro progettato per questo — non un editor con un terminale aggiunto in un secondo momento.

| Prima | Ora |
| --- | --- |
| Scrivere codice manualmente in un editor. | Gli agenti scrivono; tu rivedi, guidi e sblocchi. |
| Un terminale per i comandi occasionali. | 8–12 sessioni aperte in parallelo: agenti, server, shell. |
| Eseguire i test da soli, leggere l'output, correggere manualmente. | Monitora gli output, reindirizza gli agenti, correggi la rotta velocemente. |
| Passare continuamente tra editor, browser e terminale. | Il terminale è l'intero spazio di lavoro. |

fluxtty applica la filosofia modale di vim all'intero spazio di lavoro del terminale:

| Esigenza | Risposta di fluxtty |
| --- | --- |
| Osservare molte sessioni contemporaneamente | Le righe a cascata mantengono tutti gli agenti visibili senza comprimerli in una griglia minuscola |
| Muoversi senza toccare il mouse | Modalità Normale: navigazione con `h j k l`, ricerca fuzzy con `/`, `n` nuovo, `s` dividi, `q` chiudi |
| Digitare in sicurezza in qualsiasi shell | La modalità Inserimento instrada l'input verso il PTY attivo — la modalità Normale non lascia mai passare tasti verso un agente in esecuzione |
| Usare vere app da terminale | La modalità Terminale dà a xterm.js il controllo raw della tastiera per vim, htop, TUI e prompt degli agenti |
| Coordinare lo spazio di lavoro | L'IA dello spazio di lavoro può eseguire, leggere, creare, rinominare, raggruppare, incatenare e inviare comandi tra le sessioni |

## Installazione

### Homebrew su macOS

```bash
brew tap amoswzw/tap
brew install --cask fluxtty
```

### Download

**[Ultima versione](https://github.com/amoswzw/fluxtty/releases/latest)** — macOS, Linux, Windows

| Piattaforma | Pacchetto |
| --- | --- |
| macOS Apple Silicon | `fluxtty_*_aarch64.dmg` |
| macOS Intel | `fluxtty_*_x64.dmg` |
| Linux | `fluxtty_*_amd64.deb`, `.rpm`, `.AppImage` |
| Windows | `fluxtty_*_x64-setup.exe` |

### Compilare dal codice sorgente

Prerequisiti: [Rust](https://rustup.rs/) 1.77+, [Node.js](https://nodejs.org/) 18+, [prerequisiti di Tauri v2](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/amoswzw/fluxtty
cd fluxtty
npm install
npm run tauri build
```

```bash
npm run tauri dev   # sviluppo
```

## Modalità

fluxtty ha una barra di input persistente con un piccolo insieme di modalità esplicite:

| Modalità | Attivazione | Cosa succede |
| --- | --- | --- |
| **Normale** | predefinita | Naviga tra pannelli e righe, scorri l'output, dividi, chiudi, rinomina, cerca. Nessun tasto raggiunge la shell. |
| **Inserimento** | `i` | Digita nella shell attiva tramite la barra di input. `Esc` torna alla modalità Normale. |
| **IA** | `a` | Accedi al prompt dell'IA dello spazio di lavoro. Analizzatore integrato con `model: none`; supportato da LLM con qualsiasi provider configurato. |
| **Terminale** | `Ctrl+\` | Input di terminale raw. xterm.js possiede la tastiera finché `Ctrl+\` non torna alla modalità Normale. |
| **Trova** | `/` | Ricerca fuzzy in tutti i pannelli per nome, gruppo, cwd e stato. |
| **Vista** | `v` | Isola la riga attiva per un'osservazione concentrata. |

`:` in modalità Normale apre lo stesso percorso di comandi dello spazio di lavoro in linea.

## Comandi dello spazio di lavoro

Comandi integrati disponibili quando `workspace_ai.model: none`:

```text
run <cmd> in <session>
run <cmd> in group <group>
<cmd> in all sessions
run X then run Y in <session>
new [name] [in <group>]
rename <session> to <name>
close <session> | close idle | close group <group>
split
focus <session>
group <session> as <group>
note <session> <text>
read <session>
clear <session>
kill <session>
list | status | help
!agent <claude|codex|aider|gemini|opencode|goose|cursor|qwen|amp|crush|openhands|none>
```

`list`, `status`, `help`, `read`, `focus` e `!agent` vengono eseguiti immediatamente. Tutti i comandi che modificano lo spazio di lavoro vengono messi in coda tramite un passaggio di conferma del piano prima dell'esecuzione.

## Punti salienti

### Layout a cascata

Le righe si impilano verticalmente; le divisioni orizzontali vivono dentro una riga. Con poche righe, fluxtty divide lo spazio equamente. Con molte righe, ogni riga diventa una porzione dello spazio di lavoro ad altezza piena che scorri.

### Rilevamento e completamento degli agenti

Agenti rilevati: `claude`, `codex`, `aider`, `gemini`, `opencode`, `goose`, `cursor`, `qwen`, `amp`, `crush`, `openhands`. Quando un pannello sta eseguendo un agente, l'indicatore di modalità lo riflette e Tab passa ai completamenti dei comandi slash di quell'agente.

### Identità di sessione e denominazione automatica

Ogni pannello traccia nome, gruppo, cwd, stato, ultimo comando, codice di uscita, sessione tmux, stato dello schermo alternativo e tipo di agente. I nuovi pannelli vengono nominati in base al cwd, poi rinominati automaticamente quando comandi significativi prendono il controllo. Le rinomine manuali restano fisse.

### Note di riga

`m` apre un pannello di note per la riga attiva — nomi di branch, promemoria di revisione, intenzione dell'agente. Le note sono incluse nelle istantanee di ripristino dello spazio di lavoro.

### Configurazione con ricarica a caldo

`~/.config/fluxtty/config.yaml` si ricarica a caldo al salvataggio. Copre finestra, font, colori, cursore, shell, tmux, scorciatoie da tastiera, comportamento dell'input, provider e modello dell'IA dello spazio di lavoro, dimensionamento a cascata, persistenza e valori predefiniti di sessione.

## Configurazione

```yaml
# ~/.config/fluxtty/config.yaml

font:
  family: "JetBrains Mono"
  size: 13.0

colors:
  primary:
    background: "#0d1117"
    foreground: "#e6edf3"

input:
  live_typing: true

workspace_ai:
  model: none                    # or: claude-sonnet-4-6, gpt-4o, gemini-2.0-flash, ollama/llama3
  always_confirm_broadcast: true
  always_confirm_multi_step: true

waterfall:
  row_height_mode: viewport
  scroll_snap: false
```

## Scorciatoie da tastiera

| Tasto | Modalità | Azione |
| --- | --- | --- |
| `h` `j` `k` `l` | Normale | Spostati tra pannelli e righe |
| `i` | Normale, Vista | Modalità Inserimento per il PTY attivo |
| `a` o `:` | Normale | IA dello spazio di lavoro / prompt di comandi |
| `/` | Normale | Selettore fuzzy dei pannelli |
| `v` | Normale | Modalità Vista per la riga attiva |
| `n` | Normale | Nuova riga di terminale |
| `s` | Normale | Dividi la riga attiva |
| `q` | Normale | Chiudi il pannello attivo |
| `m` | Normale | Attiva/disattiva il pannello di note di riga |
| `r` | Normale | Rinomina il pannello attivo |
| `G` / `gg` | Normale | Vai in fondo / in cima allo spazio di lavoro |
| `Ctrl+\` | Qualsiasi | Attiva/disattiva la modalità Terminale raw |
| `Esc` | Inserimento, IA, Trova, Vista | Torna alla modalità Normale |
| `Tab` | Inserimento | Completamento shell o completamento comandi slash dell'agente |
| `Cmd+,` / `Ctrl+,` | Qualsiasi | Apri le impostazioni |

## Sviluppo

```bash
npm install
npm run tauri dev    # sviluppo con ricarica a caldo
npm test
npm run build
npm run tauri build  # bundle di produzione
```

## Contribuire

Issue e pull request sono benvenuti. Mantieni i cambiamenti mirati, esegui la suite di test e includi screenshot o registrazioni per i cambiamenti al comportamento dell'interfaccia.

## Ispirazione

L'idea del layout a cascata — terminali che si impilano verticalmente, ognuno che riempie il viewport mentre scorri — è stata sfacciatamente rubata da [`infinite-scroll`](https://github.com/gaojude/infinite-scroll). Preferisco la parola "ispirata".

---

## Licenza

MIT
