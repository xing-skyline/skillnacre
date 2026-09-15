<div align="center">

<img src="build/icon.png" alt="SkillNacre 图标" width="88" />

# SkillNacre · 技能匣

**选一个技能主源，让常用 AI 工具共享同一份 Skill。**

本地运行的中文 Windows 桌面应用，集中阅读、编辑、连接、同步和恢复 AI 技能。

[下载最新版](https://github.com/xing-skyline/skillnacre/releases/latest) · [中文使用说明](docs/使用说明.md) · [版本说明](docs/release-1.1.0.md) · [反馈问题](https://github.com/xing-skyline/skillnacre/issues)

![Windows x64](https://img.shields.io/badge/Windows-x64-6876d6)
![中文界面](https://img.shields.io/badge/界面-简体中文-8d78bd)
![MIT License](https://img.shields.io/badge/License-MIT-63a589)

</div>

![技能库：搜索功能、浏览内容、批量连接](docs/images/library.png)

> 截图使用虚构示例技能，展示软件操作，不包含个人技能库。

## 它能帮你做什么

如果你同时使用 Claude Code、Codex、Cursor 等工具，Skill 往往散落在多个目录。SkillNacre 让你选定一处作为**主源**，通过真正的目录软链接连接到各工具；修改源文件后，连接到它的工具目录会看到同一份内容。

- **主源自由选择**：CC Switch、任意 AI 工具的技能目录，或自己指定的文件夹。
- **自动识别工具路径**：扫描常见目录、环境变量和受支持的配置字段，展示候选位置、识别依据与技能数量，选好后一次应用。
- **读懂再使用**：按名称和功能搜索，阅读 `SKILL.md`，查看资源文件、实际位置与连接状态；支持收藏、分类和列表视图。
- **批量连接与组合**：选择技能和目标工具，查看操作预览后生成链接；保存常用技能组合，通过矩阵查看各工具连接情况。
- **比较后更新**：导入本地目录或公开 GitHub 仓库，记录来源、提交和基线，区分来源更新与本地修改，查看文件差异。
- **同步与恢复**：与同步盘在本机的文件夹双向手动同步；覆盖、编辑和移走技能前保存备份，支持操作记录内恢复和中断整理。

## 下载与安装

打开 **[Releases 下载页](https://github.com/xing-skyline/skillnacre/releases/latest)**，选择：

| 文件 | 适合谁 |
| --- | --- |
| `SkillNacre-Setup-1.1.0.exe` | 日常使用；可选择安装目录并创建桌面快捷方式 |
| `SkillNacre-Portable-1.1.0.exe` | 免安装启动；便于临时使用 |
| `SHA256SUMS.txt` | 核对下载文件的 SHA-256 校验值 |

发行包适用于 **Windows x64**，无需安装 Node.js 或 Python。通过 GitHub 导入技能时，需要本机安装 [Git for Windows](https://gitforwindows.org/)。

创建目录软链接需要 Windows 允许该操作，通常在系统设置中开启**开发者模式**。当前发行文件**未做发布者代码签名**，Windows 可能显示未知发布者提示。请从本仓库 Releases 获取文件，并按需核对校验值。

便携版的“免安装”指启动方式；它仍把配置和恢复备份保存在 `%APPDATA%\skilldock`。该目录名用于兼容早期本地版本，详情见[数据位置与迁移](docs/使用说明.md#数据位置与迁移)。

## 三分钟上手

1. **选择主源**：技能库 → **切换来源**，选一个 AI 工具目录，或浏览自己的技能文件夹。初始候选是 `~/.cc-switch/skills`，不要求安装 CC Switch。
2. **识别路径**：AI 工具 → **自动识别路径**。核对候选，勾选需要的工具，点击 **应用所选路径**。未找到的工具可手动指定。
3. **连接技能**：回到技能库，勾选技能 → **连接到 AI 工具** → 选择目标 → **预览操作** → 确认执行。
4. **查看与维护**：点击技能卡片阅读内容；修改前会保存备份。需要撤回操作时，进入 **操作记录** 查看恢复选项。

切换主源与应用路径只保存配置。已有链接仍指向原来源；切换后如需改连，应重新预览并执行连接。目标工具是否已在某次会话加载技能，需要在该工具内确认。

## 预置 AI 工具

| 工具 | 内置路径候选 |
| --- | --- |
| Claude Code | `~/.claude/skills`，以及 `CLAUDE_CONFIG_DIR` 指定的位置 |
| Codex | `~/.codex/skills` / `CODEX_HOME`（兼容入口），并识别 `~/.agents/skills` |
| Grok Build | `~/.grok/skills`，以及 `GROK_HOME` 指定的位置 |
| OpenCode | `~/.config/opencode/skills`，支持配置路径及共享发现目录 |
| Cursor | `~/.cursor/skills` |
| Hermes Agent | `~/.hermes/skills`，支持 `HERMES_HOME` 和 profiles |
| OpenClaw | `~/.openclaw/skills`，支持状态目录、工作区与额外技能目录 |
| DSH / 通用 Agents | `~/.agents/skills`，以及 `DSH_AGENTS_HOME` 指定的位置 |
| GitHub Copilot | `~/.copilot/skills` |
| Windsurf | `~/.codeium/windsurf/skills` |
| CC Switch | `~/.cc-switch/skills` |

所有路径都可以修改，也可以添加自定义工具。表格表示软件提供的候选配置，不保证每个工具版本都会读取其中每个位置。**Codex 新环境请优先核对 `~/.agents/skills`**；既有 `.codex/skills` 配置继续保留。[Codex 官方加载说明](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)、[OpenCode 官方发现规则](https://opencode.ai/docs/skills/)。

![自动识别路径：候选、数量与识别依据](docs/images/detection.png)

## 文件如何流动

```text
任一 AI 工具目录 / CC Switch / 自定义文件夹
                    │
                选为主源
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
      Claude Code  Codex    Cursor …
          通过目录软链接共享源技能

主源 ← 手动选择方向、预览与确认 → 同步盘的本机文件夹
```

同名普通目录会先移入备份，再建立软链接；正确链接保持不动。创建软链接失败时显示错误，不会自动换成复制。断开操作只处理指向当前主源的受管链接。内置目录、插件缓存与工具独立安装的条目按保护规则保留。

“云端备份”指坚果云、OneDrive 等同步客户端管理的**本机文件夹**。文件的上云传输由同步客户端完成。新安装需要自行选择该目录；未配置时仍可使用技能库和链接功能。

## 内容与数据保护

- 操作预览检查来源、目标与设置；预览后内容发生变化时，需要重新预览。
- 编辑和覆盖前保存备份；从操作记录恢复时再次核对当前版本，发生独立修改时可以另存恢复副本。
- 同步双方都有修改，或首次比较已有不同内容时，需要选择采用来源或跳过。
- 导入只读取和复制技能文件，不执行其中的脚本，也不安装技能自身依赖。
- 软件不要求账号，不内置遥测或模型调用；本地管理功能可离线使用。GitHub 导入和更新会访问 GitHub，打开文档链接会启动浏览器。

完整操作、目录格式、恢复方法和故障排查见 **[中文使用说明](docs/使用说明.md)**。

## 开发与验证

技术栈为 Electron + React + Vite，文件系统核心使用 Node.js。渲染器与主进程通过限定的 IPC 接口通信，启用上下文隔离和沙箱。

Windows 开发环境建议使用 Node.js 22.13 或更新的兼容版本，以及 Git。

```powershell
git clone https://github.com/xing-skyline/skillnacre.git
cd skillnacre
npm ci
npm run build
npm start
```

```powershell
npm test                         # 核心与文件系统回归
npm run test:ui                   # 独立示例目录中的桌面流程检查
npm run screenshots              # 用示例技能生成文档截图
node tests/github-smoke.mjs       # 需网络和 Git 的导入集成检查
npm run pack                     # 生成 release/win-unpacked
npm run dist                     # 生成 Windows 安装版与便携版
node tests/portable-smoke.mjs     # 检查便携版实际启动入口
```

桌面入口读取构建后的 `dist`。修改界面后先执行 `npm run build` 再启动。测试使用独立目录；软链接测试同样需要系统允许创建软链接。

```text
core/        目录发现、链接、同步、差异、来源、恢复与自动识别
electron/    桌面主进程、文件对话框和隔离接口
src/         中文界面及样式
tests/       核心测试、桌面测试和示例截图
scripts/     第三方许可生成
docs/        中文使用说明、版本说明及公开验证摘要
```

发行前的实际检查与尚未验证范围见[发布验证记录](docs/发布验证.md)。

## 当前范围

当前提供 Windows x64 发行包。尚未完成 macOS、Linux、WSL 内部目录或远程环境的安装与端到端验证。自动识别扫描常见本机位置，不进行整盘扫描；发现目录或命令不等于确认工具已经安装或技能已经加载。

当前支持公开 GitHub 仓库，逐个手动检查技能更新。组合应用会追加连接；项目工作区管理、统一 CLI、跨电脑恢复包和软件自动更新尚未实现。

## 开源与反馈

项目采用 [MIT License](LICENSE)。第三方依赖按各自许可证授权，完整声明见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)，发行包同时保留 Electron / Chromium 的许可文件。

遇到问题可[提交 Issue](https://github.com/xing-skyline/skillnacre/issues)，说明软件版本、Windows 版本、复现步骤与错误信息。粘贴日志或截图前，请隐藏个人路径、私有仓库地址与技能内容。发现潜在安全问题时，请使用仓库的 **Security → Advisories → Report a vulnerability** 私密报告入口。
