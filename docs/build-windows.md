# Windows 打包与运行

## 1. 在 Windows 上打包（推荐）

在 Windows 机器上安装 Node 22+、pnpm，然后：

```powershell
pnpm install
pnpm run build:win            # 生成 NSIS 安装包
pnpm run build:win:portable   # 生成免安装单文件 exe
pnpm run build:win:unpacked   # 只生成免安装目录
```

产物在 `release/` 目录：

| 命令 | 产物 | 说明 |
| --- | --- | --- |
| `build:win` | `WorkMeta-0.1.0-x64-setup.exe` | 安装包，可选安装目录、建桌面/开始菜单快捷方式 |
| `build:win:portable` | `WorkMeta-0.1.0-x64-portable.exe` | 双击即用的绿色版，适合放 U 盘 |
| `build:win:unpacked` | `release/win-unpacked/` | 免安装目录，直接运行 `WorkMeta.exe` |

`build:win:unpacked` 产出的整个 `win-unpacked` 目录拷到 Windows 也能直接运行，
不需要安装，适合快速验证。

## 2. 在 Linux / macOS 上交叉打包

`electron-builder` 生成 Windows 安装包时，需要用 wine 改写 exe 的图标与版本信息
（`rcedit`）。所以交叉打包有两种做法：

**A. 只产出免安装目录（不需要 wine）**

```bash
pnpm run build:win:cross    # 跳过 exe 资源编辑，产物在 release/win-unpacked/
```

代价是 exe 使用 Electron 默认图标、没有版本信息，但程序功能完全正常。

**B. 装 wine 后产出完整安装包**

```bash
sudo pacman -S wine          # Arch / Manjaro
sudo apt install wine64      # Debian / Ubuntu

pnpm run build:win           # 生成 NSIS 安装包
pnpm run build:win:portable  # 生成免安装单文件 exe
```

或者用官方带 wine 的镜像：

```bash
docker run --rm -v "$PWD":/project -w /project electronuserland/builder:wine \
  sh -c "pnpm install && pnpm run build:win"
```

## 3. 安装包配置

配置在 `package.json` 的 `build` 字段：

- `appId` / `productName`：`com.workmeta.app` / `WorkMeta`
- `asar: true` + `asarUnpack: ["**/*.node"]`：SQLite 原生模块必须解包，否则无法加载
- `npmRebuild: false`：`better-sqlite3` 自带 N-API 预编译二进制（`prebuilds/win32-x64.node`），
  Windows 上不需要 node-gyp / electron-rebuild
- `nsis.oneClick: false`：走向导式安装，可自选安装目录，按用户级安装（不需要管理员权限）
- `nsis.deleteAppDataOnUninstall: false`：卸载时保留数据库，避免误删 Todo 与工作区数据

### 应用图标

默认使用 Electron 图标。要换成自己的图标，放一个 256×256 以上的
`build/icon.png`（或 `build/icon.ico`）即可，electron-builder 会自动使用。

## 4. 数据与运行环境

- 数据库位置：`%APPDATA%\Desktop Assistant\data.db`（若旧版本使用 `desktop-assistant` 目录则自动沿用，避免数据丢失）
- 首次运行会自动建库并执行 migration
- `better-sqlite3` 的 Windows 预编译模块只依赖 `KERNEL32.dll`（静态链接 C 运行时），
  不要求目标机器额外安装 VC++ Redistributable
- 桌面路径通过 `app.getPath('desktop')` 获取，兼容中文用户名与 OneDrive 重定向的桌面目录

## 5. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `wine process failed ENOENT` | 在 Linux 交叉打包但没有装 wine：改用 `pnpm run build:win:cross`，或在 Windows 上打包 |
| `default Electron icon is used` | 没有提供 `build/icon.png`，只是警告，不影响使用 |
| 启动后白屏 | 检查是否用了 `pnpm run build` 后的 `out/`，dev 模式请用 `pnpm dev` |
| 移动文件提示“目标已存在” | 默认不覆盖，确认后会以覆盖方式重试 |
