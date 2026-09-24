**Mac 使用**

首次运行 `./setup-macos.sh`，之后双击 `启动Mac.command`。源码与 Windows 版共用，Mac 依赖单独安装。
`npm run pack:mac` 生成 Apple 芯片的本地开发应用，使用 ad-hoc 签名，补全打包后的资源签名。本地开发包未启用 Hardened Runtime，不使用开发者证书，也未获得 Apple 公证；它不保证通过 Gatekeeper，不应当作公开分发包。正式分发需要 Developer ID 签名、Hardened Runtime 和 Apple 公证。

如果 macOS 弹出安全拦截，不要把“无法验证是否包含恶意软件”直接视为已经检出病毒，也不要把它当成安全证明。先核对完整提示和构建来源；本项目启动与打包脚本不会关闭 Gatekeeper 或自动移除隔离标记。

2026-09-24 本机验证：重建后的 `.app` 经 macOS 正常打开流程显示完整主界面，未操作安全放行或全局安全设置。完整资源签名校验通过。系统分发检查仍报告 ad-hoc 签名及缺少公证票据；此结果只覆盖当前 Mac 的本地运行，不代表已完成公开分发验收。
