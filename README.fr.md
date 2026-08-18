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

<h3 align="center">Un espace de travail terminal modal façon vim pour le développement avec IA.</h3>

<p align="center">
  Vous ne vous contentez plus d'écrire du code — vous supervisez des agents.<br/>
  fluxtty est un espace de travail piloté au clavier pour exécuter de nombreuses sessions d'IA en parallèle,<br/>
  avec l'efficacité modale qui a rendu vim indispensable.
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
  <a href="https://amoswzw.github.io/fluxtty/"><strong>Démo en direct →</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/amoswzw/fluxtty/releases/latest"><strong>Télécharger la dernière version</strong></a>
</p>

<p align="center">
  <img src="docs/fluxtty-preview.gif" width="100%" alt="fluxtty workspace preview" />
</p>

## L'idée

Quand l'IA écrit le code, votre travail passe de la saisie à la direction. Il vous faut un espace de travail conçu pour cela — pas un éditeur avec un terminal ajouté après coup.

| Avant | Maintenant |
| --- | --- |
| Écrire du code manuellement dans un éditeur. | Les agents écrivent ; vous relisez, orientez et débloquez. |
| Un seul terminal pour les commandes occasionnelles. | 8 à 12 sessions ouvertes en parallèle : agents, serveurs, shells. |
| Exécuter les tests soi-même, lire la sortie, corriger manuellement. | Surveiller les sorties, rediriger les agents, corriger le cap rapidement. |
| Changer de contexte entre l'éditeur, le navigateur et le terminal. | Le terminal est tout l'espace de travail. |

fluxtty applique la philosophie modale de vim à l'ensemble de l'espace de travail terminal :

| Besoin | Réponse de fluxtty |
| --- | --- |
| Surveiller plusieurs sessions à la fois | Les rangées en cascade gardent tous les agents visibles sans les entasser dans une grille minuscule |
| Se déplacer sans toucher la souris | Mode Normal : navigation `h j k l`, recherche floue `/`, `n` pour nouveau, `s` pour diviser, `q` pour fermer |
| Taper en toute sécurité dans n'importe quel shell | Le mode Insertion route la saisie vers le PTY actif — le mode Normal ne laisse jamais fuiter de touches vers un agent en cours d'exécution |
| Utiliser de vraies applications terminal | Le mode Terminal donne à xterm.js le contrôle brut du clavier pour vim, htop, les TUI et les invites d'agents |
| Coordonner l'espace de travail | L'IA de l'espace de travail peut exécuter, lire, créer, renommer, grouper, enchaîner et distribuer des actions entre les sessions |

## Installation

### Homebrew sur macOS

```bash
brew tap amoswzw/tap
brew install --cask fluxtty
```

### Téléchargement

**[Dernière version](https://github.com/amoswzw/fluxtty/releases/latest)** — macOS, Linux, Windows

| Plateforme | Paquet |
| --- | --- |
| macOS Apple Silicon | `fluxtty_*_aarch64.dmg` |
| macOS Intel | `fluxtty_*_x64.dmg` |
| Linux | `fluxtty_*_amd64.deb`, `.rpm`, `.AppImage` |
| Windows | `fluxtty_*_x64-setup.exe` |

### Compiler depuis les sources

Prérequis : [Rust](https://rustup.rs/) 1.77+, [Node.js](https://nodejs.org/) 18+, [prérequis de Tauri v2](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/amoswzw/fluxtty
cd fluxtty
npm install
npm run tauri build
```

```bash
npm run tauri dev   # développement
```

## Modes

fluxtty dispose d'une barre de saisie persistante avec un petit ensemble de modes explicites :

| Mode | Entrer | Ce qui se passe |
| --- | --- | --- |
| **Normal** | par défaut | Naviguer entre les panneaux et les rangées, faire défiler la sortie, diviser, fermer, renommer, rechercher. Aucune touche n'atteint le shell. |
| **Insertion** | `i` | Taper dans le shell actif via la barre de saisie. `Esc` revient au mode Normal. |
| **IA** | `a` | Accéder à l'invite de l'IA de l'espace de travail. Analyseur intégré avec `model: none` ; adossé à un LLM avec tout fournisseur configuré. |
| **Terminal** | `Ctrl+\` | Saisie terminal brute. xterm.js contrôle le clavier jusqu'à ce que `Ctrl+\` ramène au mode Normal. |
| **Recherche** | `/` | Recherche floue dans tous les panneaux par nom, groupe, cwd et statut. |
| **Vue** | `v` | Isoler la rangée active pour une observation concentrée. |

`:` en mode Normal ouvre le même chemin de commande de l'espace de travail en ligne.

## Commandes de l'espace de travail

Commandes intégrées disponibles quand `workspace_ai.model: none` :

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

`list`, `status`, `help`, `read`, `focus` et `!agent` s'exécutent immédiatement. Toutes les commandes qui modifient l'espace de travail sont mises en file d'attente via une étape de confirmation de plan avant leur exécution.

## Points forts

### Disposition en cascade

Les rangées s'empilent verticalement ; les divisions horizontales vivent à l'intérieur d'une rangée. Avec peu de rangées, fluxtty répartit l'espace uniformément. Avec beaucoup de rangées, chaque rangée devient une tranche d'espace de travail en pleine hauteur que l'on parcourt en défilant.

### Détection d'agent et complétion

Agents détectés : `claude`, `codex`, `aider`, `gemini`, `opencode`, `goose`, `cursor`, `qwen`, `amp`, `crush`, `openhands`. Quand un panneau exécute un agent, l'indicateur de mode le reflète et Tab bascule vers les complétions de commandes slash de cet agent.

### Identité de session et nommage automatique

Chaque panneau suit le nom, le groupe, le cwd, le statut, la dernière commande, le code de sortie, la session tmux, l'état d'écran alternatif et le type d'agent. Les nouveaux panneaux sont nommés d'après le cwd, puis renommés automatiquement quand des commandes significatives prennent le relais. Les renommages manuels restent figés.

### Notes de rangée

`m` ouvre un panneau de notes pour la rangée active — noms de branches, rappels de relecture, intention de l'agent. Les notes sont incluses dans les instantanés de restauration de l'espace de travail.

### Configuration à rechargement à chaud

`~/.config/fluxtty/config.yaml` se recharge à chaud à l'enregistrement. Couvre la fenêtre, la police, les couleurs, le curseur, le shell, tmux, les raccourcis clavier, le comportement de saisie, le fournisseur et le modèle de l'IA de l'espace de travail, le dimensionnement en cascade, la persistance et les valeurs par défaut de session.

## Configuration

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

## Raccourcis clavier

| Touche | Mode | Action |
| --- | --- | --- |
| `h` `j` `k` `l` | Normal | Se déplacer entre les panneaux et les rangées |
| `i` | Normal, Vue | Mode Insertion pour le PTY actif |
| `a` ou `:` | Normal | IA de l'espace de travail / invite de commande |
| `/` | Normal | Sélecteur flou de panneaux |
| `v` | Normal | Mode Vue pour la rangée active |
| `n` | Normal | Nouvelle rangée de terminal |
| `s` | Normal | Diviser la rangée active |
| `q` | Normal | Fermer le panneau actif |
| `m` | Normal | Basculer le panneau de notes de rangée |
| `r` | Normal | Renommer le panneau actif |
| `G` / `gg` | Normal | Aller à la fin / au début de l'espace de travail |
| `Ctrl+\` | Tous | Basculer le mode Terminal brut |
| `Esc` | Insertion, IA, Recherche, Vue | Revenir au mode Normal |
| `Tab` | Insertion | Complétion du shell ou des commandes slash de l'agent |
| `Cmd+,` / `Ctrl+,` | Tous | Ouvrir les paramètres |

## Développement

```bash
npm install
npm run tauri dev    # dev avec rechargement à chaud
npm test
npm run build
npm run tauri build  # bundle de production
```

## Contribuer

Les issues et pull requests sont les bienvenues. Restez ciblé dans vos changements, exécutez la suite de tests et joignez des captures d'écran ou des enregistrements pour les changements de comportement d'interface.

## Inspiration

L'idée de la disposition en cascade — des terminaux empilés verticalement, chacun remplissant la fenêtre au fur et à mesure du défilement — a été honteusement dérobée à [`infinite-scroll`](https://github.com/gaojude/infinite-scroll). Je préfère le mot « inspirée ».

---

## Licence

MIT
