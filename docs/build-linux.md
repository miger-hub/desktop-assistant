# Linux 打包与运行

## 1. 打包

在 Linux 机器上安装 Node 22+、pnpm，然后：

```bash
pnpm install
pnpm run build:linux       # AppImage + deb
pnpm run build:linux:dir   # 只生成免安装目录 release/linux-unpacked/
```

产物在 `release/` 目录：

| 命令 | 产物 | 说明 |
| --- | --- | --- |
| `build:linux` | `Desktop Assistant-0.1.0-x64.AppImage` | 单文件，`chmod +x` 后双击 / 命令行运行，不依赖系统目录 |
| `build:linux` | `Desktop Assistant-0.1.0-x64.deb` | Debian / Ubuntu 系安装包 |
| `build:linux:dir` | `release/linux-unpacked/` | 免安装目录，直接运行里面的 `desktop-assistant` |

AppImage 首次运行：

```bash
chmod +x "Desktop Assistant-0.1.0-x64.AppImage"
./"Desktop Assistant-0.1.0-x64.AppImage"
```

### 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| AppImage 报缺 `libfuse` | 装 `fuse2`（Arch：`sudo pacman -S fuse2`，Debian：`sudo apt install libfuse2`），或加 `--appimage-extract-and-run` 运行 |
| `deb` 构建失败提示缺少工具 | 装 `fakeroot` / `dpkg`，或先用 `build:linux:dir` 验证 |
| 托盘图标不显示 | 确认桌面环境有托盘（GNOME 需要 AppIndicator 扩展）。托盘创建失败时会自动退回「关闭窗口即退出」，不会把窗口藏起来 |
| 点关闭后窗口不见了 | 说明托盘创建成功，窗口被收进托盘：点托盘图标或按 `Ctrl + Alt + A` 找回，托盘菜单里可以退出 |
| 全局快捷键无效 | Wayland 已默认启用 xdg-desktop-portal 的 `GlobalShortcuts`（KDE Plasma 5.27+ / GNOME 48+ 支持），首次注册时桌面环境可能弹一次授权框；不支持的环境会在启动时提示并自动降级为应用内快捷键（窗口聚焦时 `Ctrl + Alt + A` / `K` 仍可用） |
| 删除文件报“无法移入回收站” | 该挂载点没有回收站（部分外置盘 / tmpfs），确认后会走永久删除 |

## 2. 运行环境

- 数据库位置：`~/.config/desktop-assistant/data.db`（`app.getPath('userData')`）
- 备份：`~/.config/desktop-assistant/backups/`
- 桌面路径来自 `app.getPath('desktop')`，兼容 `XDG_DESKTOP_DIR` / 中文桌面目录
- `better-sqlite3` 使用 N-API 预编译二进制（`prebuilds/linux-x64.node`），不需要编译工具链

## 3. 与 Windows 打包的差异

- 不需要 wine；`electron-builder` 直接在 Linux 上产出 AppImage / deb
- 没有安装向导，AppImage 免安装；deb 安装后会在 `/usr/share/applications` 注册桌面项
- 托盘图标用内嵌的 PNG（`src/main/services/trayIcon.ts`），不依赖额外资源文件

## 4. 应用图标

默认使用 Electron 图标。要换成自己的图标，放一个 512×512 的 `build/icon.png`
即可，electron-builder 会用它生成各尺寸图标。
