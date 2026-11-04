# macOS 打包与运行

## 1. 打包

在 macOS 上安装 Node 22+、pnpm，然后：

```bash
pnpm install
pnpm run build:mac          # dmg + zip（x64 与 arm64）
```

产物在 `release/` 目录：

| 产物 | 说明 |
| --- | --- |
| `Desktop Assistant-0.1.0-x64.dmg` | Intel Mac 安装镜像 |
| `Desktop Assistant-0.1.0-arm64.dmg` | Apple Silicon 安装镜像 |
| `Desktop Assistant-0.1.0-<arch>.zip` | 免安装压缩包，解压后拖进「应用程序」 |

只想在本机快速验证时，只产出免安装目录：

```bash
pnpm run build
npx electron-builder --mac --dir     # 产物：release/mac/ 或 release/mac-arm64/
```

## 2. 首次打开被 Gatekeeper 拦下

本项目没有配置代码签名与公证（个人自用工具，不引入 Apple Developer 账号），
所以从 dmg 安装后第一次打开可能提示「无法验证开发者」。处理方式：

```bash
# 方式一：在「系统设置 → 隐私与安全性」里点「仍要打开」
# 方式二：命令行去掉隔离属性
xattr -dr com.apple.quarantine "/Applications/Desktop Assistant.app"
```

要彻底消除提示需要签名 + 公证（`CSC_LINK` / `APPLE_ID` 等环境变量），
当前 MVP 不做，见 [ROADMAP.md](../ROADMAP.md) 的 Phase 3 说明。

## 3. 运行环境与平台差异

- 数据库位置：`~/Library/Application Support/desktop-assistant/data.db`
- 备份：同目录下的 `backups/`
- 桌面路径来自 `app.getPath('desktop')`，兼容 iCloud 同步的桌面目录
- 删除走系统废纸篓；「在文件管理器中显示」调用 Finder
- 开启系统托盘时，关闭窗口（红点）只是收进菜单栏；`Cmd + Q` 或托盘菜单「退出」才是真退出
- 全局快捷键 `Cmd + Alt + A` / `Cmd + Alt + K`（`Alt` 即 `⌥`）；部分系统版本需要给应用
  「辅助功能」权限（系统设置 → 隐私与安全性 → 辅助功能）

## 4. 应用图标

默认使用 Electron 图标。要换成自己的图标，放一个 1024×1024 的 `build/icon.png`
（或 `build/icon.icns`）即可。
