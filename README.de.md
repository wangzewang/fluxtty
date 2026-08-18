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

<h3 align="center">Ein vim-modaler Terminal-Workspace für die KI-Entwicklung.</h3>

<p align="center">
  Du schreibst nicht mehr nur Code – du beaufsichtigst Agenten.<br/>
  fluxtty ist ein tastaturgesteuerter Workspace zum parallelen Betrieb vieler KI-Sitzungen,<br/>
  mit der modalen Effizienz, die vim unverzichtbar gemacht hat.
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
  <a href="https://amoswzw.github.io/fluxtty/"><strong>Live-Demo →</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/amoswzw/fluxtty/releases/latest"><strong>Neueste Version herunterladen</strong></a>
</p>

<p align="center">
  <img src="docs/fluxtty-preview.gif" width="100%" alt="fluxtty workspace preview" />
</p>

## Die Idee

Wenn KI den Code schreibt, verschiebt sich deine Aufgabe vom Tippen zum Steuern. Du brauchst einen Workspace, der dafür gebaut ist – keinen Editor mit angeflanschtem Terminal.

| Vorher | Jetzt |
| --- | --- |
| Code manuell in einem Editor schreiben. | Agenten schreiben; du überprüfst, steuerst und beseitigst Blockaden. |
| Ein Terminal für gelegentliche Befehle. | 8–12 Sitzungen parallel geöffnet: Agenten, Server, Shells. |
| Tests selbst ausführen, Ausgabe lesen, manuell patchen. | Ausgaben überwachen, Agenten umlenken, schnell nachsteuern. |
| Kontextwechsel zwischen Editor, Browser, Terminal. | Das Terminal ist der gesamte Workspace. |

fluxtty wendet die modale Philosophie von vim auf den gesamten Terminal-Workspace an:

| Bedarf | fluxtty-Antwort |
| --- | --- |
| Viele Sitzungen gleichzeitig im Blick behalten | Wasserfall-Zeilen halten alle Agenten sichtbar, ohne sie in ein winziges Raster zu quetschen |
| Bewegen, ohne die Maus zu berühren | Normal-Modus: Navigation mit `h j k l`, Fuzzy-Suche mit `/`, `n` für neu, `s` zum Teilen, `q` zum Schließen |
| Sicher in jede Shell tippen | Der Insert-Modus leitet Eingaben an das aktive PTY weiter – im Normal-Modus gelangen niemals Tastenanschläge zu einem laufenden Agenten |
| Echte Terminal-Anwendungen nutzen | Der Terminal-Modus gibt xterm.js die rohe Tastaturkontrolle für vim, htop, TUIs und Agenten-Prompts |
| Den Workspace koordinieren | Die Workspace-KI kann sitzungsübergreifend ausführen, lesen, erstellen, umbenennen, gruppieren, verketten und verteilen |

## Installation

### Homebrew unter macOS

```bash
brew tap amoswzw/tap
brew install --cask fluxtty
```

### Download

**[Neueste Version](https://github.com/amoswzw/fluxtty/releases/latest)** — macOS, Linux, Windows

| Plattform | Paket |
| --- | --- |
| macOS Apple Silicon | `fluxtty_*_aarch64.dmg` |
| macOS Intel | `fluxtty_*_x64.dmg` |
| Linux | `fluxtty_*_amd64.deb`, `.rpm`, `.AppImage` |
| Windows | `fluxtty_*_x64-setup.exe` |

### Aus dem Quellcode erstellen

Voraussetzungen: [Rust](https://rustup.rs/) 1.77+, [Node.js](https://nodejs.org/) 18+, [Tauri-v2-Voraussetzungen](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/amoswzw/fluxtty
cd fluxtty
npm install
npm run tauri build
```

```bash
npm run tauri dev   # Entwicklung
```

## Modi

fluxtty hat eine dauerhafte Eingabeleiste mit einer kleinen Anzahl expliziter Modi:

| Modus | Aktivieren | Was passiert |
| --- | --- | --- |
| **Normal** | Standard | Zwischen Panes und Zeilen navigieren, Ausgabe scrollen, teilen, schließen, umbenennen, suchen. Keine Tastenanschläge erreichen die Shell. |
| **Einfügen** | `i` | Über die Eingabeleiste in die aktive Shell tippen. `Esc` kehrt zum Normal-Modus zurück. |
| **KI** | `a` | Den Workspace-KI-Prompt aufrufen. Integrierter Parser bei `model: none`; LLM-gestützt bei konfiguriertem Anbieter. |
| **Terminal** | `Ctrl+\` | Rohe Terminal-Eingabe. xterm.js übernimmt die Tastatur, bis `Ctrl+\` zum Normal-Modus zurückkehrt. |
| **Suchen** | `/` | Fuzzy-Suche über alle Panes nach Name, Gruppe, cwd und Status. |
| **Ansicht** | `v` | Die aktive Zeile isolieren, um sie fokussiert zu beobachten. |

`:` im Normal-Modus öffnet denselben Workspace-Befehlspfad inline.

## Workspace-Befehle

Integrierte Befehle, verfügbar bei `workspace_ai.model: none`:

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

`list`, `status`, `help`, `read`, `focus` und `!agent` werden sofort ausgeführt. Alle Workspace-verändernden Befehle durchlaufen vor der Ausführung einen Plan-Bestätigungsschritt.

## Highlights

### Wasserfall-Layout

Zeilen stapeln sich vertikal; horizontale Teilungen befinden sich innerhalb einer Zeile. Bei wenigen Zeilen teilt fluxtty den Platz gleichmäßig auf. Bei vielen Zeilen wird jede Zeile zu einem Workspace-Abschnitt in voller Höhe, durch den du scrollst.

### Agentenerkennung und Vervollständigung

Erkannte Agenten: `claude`, `codex`, `aider`, `gemini`, `opencode`, `goose`, `cursor`, `qwen`, `amp`, `crush`, `openhands`. Wenn in einem Pane ein Agent läuft, spiegelt die Modusanzeige dies wider, und Tab wechselt zu den Slash-Befehl-Vervollständigungen dieses Agenten.

### Sitzungsidentität und automatische Benennung

Jeder Pane verfolgt Name, Gruppe, cwd, Status, letzten Befehl, Exit-Code, tmux-Sitzung, Alternate-Screen-Status und Agententyp. Neue Panes werden nach dem cwd benannt und anschließend automatisch umbenannt, sobald wichtige Befehle übernehmen. Manuelle Umbenennungen bleiben fixiert.

### Zeilennotizen

`m` öffnet einen Notizbereich für die aktive Zeile – Branch-Namen, Review-Erinnerungen, Agentenabsicht. Notizen sind in den Wiederherstellungs-Snapshots des Workspace enthalten.

### Konfiguration mit Hot-Reload

`~/.config/fluxtty/config.yaml` wird beim Speichern per Hot-Reload neu geladen. Umfasst Fenster, Schriftart, Farben, Cursor, Shell, tmux, Tastenkürzel, Eingabeverhalten, Workspace-KI-Anbieter und -Modell, Wasserfall-Dimensionierung, Persistenz und Sitzungsvorgaben.

## Konfiguration

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

## Tastenkürzel

| Taste | Modus | Aktion |
| --- | --- | --- |
| `h` `j` `k` `l` | Normal | Zwischen Panes und Zeilen bewegen |
| `i` | Normal, Ansicht | Einfügen-Modus für das aktive PTY |
| `a` oder `:` | Normal | Workspace-KI / Befehls-Prompt |
| `/` | Normal | Fuzzy-Pane-Selektor |
| `v` | Normal | Ansichtsmodus für die aktive Zeile |
| `n` | Normal | Neue Terminal-Zeile |
| `s` | Normal | Die aktive Zeile teilen |
| `q` | Normal | Den aktiven Pane schließen |
| `m` | Normal | Zeilennotiz-Pane umschalten |
| `r` | Normal | Den aktiven Pane umbenennen |
| `G` / `gg` | Normal | Zum Ende / Anfang des Workspace springen |
| `Ctrl+\` | Beliebig | Rohen Terminal-Modus umschalten |
| `Esc` | Einfügen, KI, Suchen, Ansicht | Zum Normal-Modus zurückkehren |
| `Tab` | Einfügen | Shell-Vervollständigung oder Slash-Befehl-Vervollständigung des Agenten |
| `Cmd+,` / `Ctrl+,` | Beliebig | Einstellungen öffnen |

## Entwicklung

```bash
npm install
npm run tauri dev    # Entwicklung mit Hot Reload
npm test
npm run build
npm run tauri build  # Produktions-Bundle
```

## Mitwirken

Issues und Pull Requests sind willkommen. Halte Änderungen fokussiert, führe die Testsuite aus und füge bei Änderungen am UI-Verhalten Screenshots oder Aufnahmen bei.

## Inspiration

Die Idee des Wasserfall-Layouts — Terminals, die sich vertikal stapeln und beim Scrollen jeweils den Viewport ausfüllen — wurde schamlos von [`infinite-scroll`](https://github.com/gaojude/infinite-scroll) geklaut. Ich bevorzuge das Wort „inspiriert“.

---

## Lizenz

MIT
</content>
