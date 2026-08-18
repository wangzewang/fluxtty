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

<h3 align="center">面向 AI 开发的 vim 模态终端工作区。</h3>

<p align="center">
  你不再只是写代码——你在监督智能体。<br/>
  fluxtty 是一个键盘驱动的工作区，用于并行运行多个 AI 会话，<br/>
  拥有让 vim 变得不可或缺的那种模态效率。
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
  <a href="https://amoswzw.github.io/fluxtty/"><strong>在线演示 →</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/amoswzw/fluxtty/releases/latest"><strong>下载最新版本</strong></a>
</p>

<p align="center">
  <img src="docs/fluxtty-preview.gif" width="100%" alt="fluxtty workspace preview" />
</p>

## 理念

当 AI 编写代码时，你的工作就从打字转向了指挥。你需要一个为此而生的工作区——而不是一个硬塞了终端的编辑器。

| 以前 | 现在 |
| --- | --- |
| 在编辑器里手动写代码。 | 智能体负责编写；你负责审阅、引导和解决阻塞。 |
| 一个终端，偶尔敲几条命令。 | 8–12 个会话并行打开：智能体、服务器、shell。 |
| 自己跑测试、看输出、手动打补丁。 | 监控输出，重新引导智能体，快速纠正方向。 |
| 在编辑器、浏览器、终端之间来回切换上下文。 | 终端就是整个工作区。 |

fluxtty 把 vim 的模态哲学应用到了整个终端工作区：

| 需求 | fluxtty 的答案 |
| --- | --- |
| 同时观察多个会话 | 瀑布式行布局让所有智能体保持可见，不会被挤进一个狭小的网格里 |
| 不碰鼠标也能移动 | 普通模式：`h j k l` 导航，`/` 模糊搜索，`n` 新建，`s` 分割，`q` 关闭 |
| 安全地向任意 shell 输入 | 插入模式将输入路由到当前激活的 PTY——普通模式绝不会把按键泄漏进正在运行的智能体 |
| 使用真正的终端应用 | 终端模式为 vim、htop、TUI 和智能体提示符提供 xterm.js 的原始键盘控制 |
| 协调整个工作区 | 工作区 AI 可以在各会话之间执行、读取、创建、重命名、分组、编排流水线和调度任务 |

## 安装

### macOS 上使用 Homebrew

```bash
brew tap amoswzw/tap
brew install --cask fluxtty
```

### 下载

**[最新版本](https://github.com/amoswzw/fluxtty/releases/latest)** — macOS、Linux、Windows

| 平台 | 安装包 |
| --- | --- |
| macOS Apple Silicon | `fluxtty_*_aarch64.dmg` |
| macOS Intel | `fluxtty_*_x64.dmg` |
| Linux | `fluxtty_*_amd64.deb`、`.rpm`、`.AppImage` |
| Windows | `fluxtty_*_x64-setup.exe` |

### 从源码构建

前置条件：[Rust](https://rustup.rs/) 1.77+、[Node.js](https://nodejs.org/) 18+、[Tauri v2 前置条件](https://tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/amoswzw/fluxtty
cd fluxtty
npm install
npm run tauri build
```

```bash
npm run tauri dev   # 开发模式
```

## 模式

fluxtty 拥有一个持久存在的输入栏，配合一组明确的模式：

| 模式 | 进入方式 | 发生的事情 |
| --- | --- | --- |
| **普通** | 默认 | 在面板与行之间导航，滚动输出，分割、关闭、重命名、搜索。没有任何按键会传到 shell。 |
| **插入** | `i` | 通过输入栏向当前激活的 shell 输入内容。`Esc` 返回普通模式。 |
| **AI** | `a` | 进入工作区 AI 的提示符。`model: none` 时为内置解析器；配置任意提供方后由 LLM 驱动。 |
| **终端** | `Ctrl+\` | 原始终端输入。xterm.js 掌控键盘，直到 `Ctrl+\` 返回普通模式。 |
| **查找** | `/` | 按名称、分组、cwd 和状态对所有面板进行模糊搜索。 |
| **视图** | `v` | 隔离显示当前激活行，便于专注观察。 |

在普通模式下按 `:` 会打开同样的内联工作区命令输入路径。

## 工作区命令

当 `workspace_ai.model: none` 时可用的内置命令：

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

`list`、`status`、`help`、`read`、`focus` 和 `!agent` 会立即执行。所有会改变工作区状态的命令都会先进入计划确认步骤，然后才会运行。

## 亮点

### 瀑布式布局

行纵向堆叠；水平分割存在于行内部。行数少时，fluxtty 会平均分配空间。行数多时，每一行都会变成一个可滚动的、占满视口高度的工作区切片。

### 智能体检测与补全

可检测的智能体：`claude`、`codex`、`aider`、`gemini`、`opencode`、`goose`、`cursor`、`qwen`、`amp`、`crush`、`openhands`。当某个面板正在运行智能体时，模式指示器会体现出来，Tab 键会切换为该智能体的斜杠命令补全。

### 会话身份与自动命名

每个面板都会追踪名称、分组、cwd、状态、上一条命令、退出码、tmux 会话、备用屏幕状态和智能体类型。新面板会根据 cwd 命名，当有重要命令接管时会自动重命名。手动重命名过的面板会被固定，不再自动更改。

### 行备注

`m` 会为当前激活的行打开一个备注面板——分支名称、审查提醒、智能体的意图。备注会被包含在工作区恢复快照中。

### 配置热重载

`~/.config/fluxtty/config.yaml` 保存后即热重载。涵盖窗口、字体、颜色、光标、shell、tmux、按键绑定、输入行为、工作区 AI 的提供方与模型、瀑布布局尺寸、持久化以及会话默认值。

## 配置

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

## 按键绑定

| 按键 | 模式 | 操作 |
| --- | --- | --- |
| `h` `j` `k` `l` | 普通 | 在面板与行之间移动 |
| `i` | 普通、视图 | 为当前激活的 PTY 进入插入模式 |
| `a` 或 `:` | 普通 | 工作区 AI / 命令提示符 |
| `/` | 普通 | 模糊面板选择器 |
| `v` | 普通 | 为当前激活行进入视图模式 |
| `n` | 普通 | 新建终端行 |
| `s` | 普通 | 分割当前激活行 |
| `q` | 普通 | 关闭当前激活面板 |
| `m` | 普通 | 切换行备注面板 |
| `r` | 普通 | 重命名当前激活面板 |
| `G` / `gg` | 普通 | 跳转到工作区底部 / 顶部 |
| `Ctrl+\` | 任意 | 切换原始终端模式 |
| `Esc` | 插入、AI、查找、视图 | 返回普通模式 |
| `Tab` | 插入 | shell 补全或智能体斜杠命令补全 |
| `Cmd+,` / `Ctrl+,` | 任意 | 打开设置 |

## 开发

```bash
npm install
npm run tauri dev    # 带热重载的开发模式
npm test
npm run build
npm run tauri build  # 生产环境打包
```

## 贡献

欢迎提交 issue 和 pull request。请保持改动聚焦，运行测试套件，并为影响 UI 行为的改动附上截图或录屏。

## 灵感来源

瀑布式布局的想法——终端纵向堆叠，随着滚动逐个填满视口——毫不掩饰地借鉴自 [`infinite-scroll`](https://github.com/gaojude/infinite-scroll)。我更愿意称之为「受到启发」。

---

## 许可证

MIT
