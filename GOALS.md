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
* Linux/Windows/macOS 不存在明显平台耦合

当前阶段不要求企业级架构。

> **这是一个个人工具，不是企业平台。**
