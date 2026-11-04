# AGENTS.md

## 1. 项目定位

这是一个简单的跨平台个人桌面助手，主要用于：

* 整理和分区桌面
* 映射其他目录到工作区
* 管理 Todo
* 快速访问文件、目录和工作区
* 后续支持自动整理规则

目标是**先做一个稳定、简单、自用的 MVP**，不要过度设计。

---

## 2. 技术栈

默认技术栈：

* Electron
* Vue 3
* TypeScript
* SQLite
* Vite
* pnpm

优先使用成熟、简单的依赖。

除非有明确需求，不引入：

* 独立 Java/Go 后端
* HTTP API
* 微服务
* Redis
* 云数据库
* 复杂状态管理
* Plugin System

---

## 3. 核心原则

### 简单优先

优先选择：

```text
简单 > 完美
本地 > 服务端
可维护 > 过度抽象
MVP > 提前设计
```

不要为了未来需求提前实现复杂架构。

### 本地优先

核心功能必须离线可用。

文件和 Todo 默认保存在用户本机。

### 文件安全

涉及文件的操作必须避免误操作。

批量：

* 移动
* 删除
* 重命名

必须考虑：

* 文件冲突
* 文件不存在
* 权限不足
* 操作失败

删除和批量操作尽量提供确认。

---

## 4. Electron 边界

Renderer：

```text
Vue UI
```

Main：

```text
文件系统
SQLite
Electron API
系统通知
窗口
```

Renderer 不应该直接访问：

```text
Node.js
fs
path
sqlite
```

统一通过：

```text
preload
IPC
```

访问。

---

## 5. 数据库

SQLite 用于保存：

* Workspace
* Directory Mapping
* Todo
* Rule
* Settings

不要把文件内容存入 SQLite。

数据库结构变化必须提供 migration。

---

## 6. 代码要求

修改代码前：

1. 先阅读相关代码
2. 理解现有结构
3. 尽量最小修改
4. 不无理由重构
5. 完成后运行相关检查

新增依赖前确认现有依赖是否已经能够解决问题。

---

## 7. 跨平台

目标：

```text
Linux
Windows
macOS
```

平台相关代码集中处理。

不要在业务代码中大量写：

```text
Linux path
Windows path
macOS path
```

使用 Node/Electron 提供的跨平台 API。

---

## 8. UI

UI 优先考虑：

* 简洁
* 快速
* 键盘操作
* 拖拽
* 少弹窗

核心入口：

```text
Workspace
Desktop
Todo
Search
Settings
```

---

## 9. 测试

优先测试核心逻辑：

* 文件操作
* Workspace
* Todo
* Directory Mapping
* SQLite Repository

文件操作测试使用临时目录，不操作真实用户文件。

---

## 10. Agent 行为

如果需求存在多种实现：

优先选择：

1. 当前项目最简单的方案
2. 最少依赖
3. 最少代码
4. 易于撤销
5. 易于测试

不要主动扩大项目范围。

---

## 11. Definition of Done

功能完成至少满足：

* 可以正常使用
* 不破坏已有功能
* 基本错误有处理
* 核心逻辑可测试
* 界面文案走 i18n（简体中文 / 繁体中文 / 英文三语齐全）
* Linux/Windows/macOS 不存在明显平台耦合

当前阶段不要求企业级架构。

> **这是一个个人工具，不是企业平台。**

---

## 12. 国际化（i18n）

支持简体中文（`zh-CN`，默认）、繁体中文（`zh-TW`，台湾用语）、英文（`en`）。
详细规范见 [`docs/i18n.md`](docs/i18n.md)。

核心约定：

* 文案统一放 `src/shared/i18n/messages/`，主进程与渲染进程共用同一套语言包。
* 渲染进程用 `src/renderer/i18n` 的 `t()`；主进程用 `src/main/i18n` 的 `t()`；
  语言设置在 `AppSettings.language`（`'system'` 跟随系统）。
* key 按「区域.用途」分组，变量用 `{name}` 占位符；不要用代码里的中文拼接再翻译。
* **新增文案必须三种语言同时补齐**，`tests/i18n.test.ts` 会校验三份语言包的 key 一致。
* 译文贴合目标语言习惯（繁体走台湾用语：檔案 / 資料夾 / 儲存 / 剪貼簿 / 系統匣…），
  不做逐字直译。
* 数据库里的用户内容（工作区名、待办、备忘正文等）不翻译；日志与注释保持中文。

---

## 13. 工具插件（Phase 1）

支持本地安装的工具插件（文件夹 / ZIP），详细开发规范见
[`docs/plugin-development.md`](docs/plugin-development.md)。

核心约定：

* Phase 1 只支持文本输入 + `text` / `table` / `tree` 结果；自定义 UI 属于 Phase 2。
* 插件代码**不在主进程执行**：已安装插件在渲染进程的 Blob Worker 沙箱里运行，
  没有 Node / Electron API，宿主禁用网络 API，单次运行有超时。
* 工具输入和结果**不持久化**；只保存安装状态（`plugin` 表）与启用状态。
* 工具**页面内**支持搜索当前输出并高亮（树节点 / 表格单元格 / 文本行）；
  这是页面级搜索，不进入应用全局搜索；输出只在当前运行期内存里，退出即清空。
* 插件安装时校验 manifest、id、相对路径、ZIP slip、入口大小和包大小。
* 内置工具和已安装工具都出现在「工具」页与全局搜索里；搜索只匹配元数据，不执行插件。
* 插件文案和内置工具文案必须支持 `zh-CN` / `zh-TW` / `en`。
