# 工具插件开发规范（Phase 1 / API v1）

Desktop Assistant 的工具插件是一类本地安装的小工具：用户可以在「工具」页安装文件夹或 ZIP，
安装后出现在工具页和全局搜索结果里。Phase 1 只支持文本输入和 text / table / tree 结果，
不支持自定义 UI。

## 1. Phase 1 能力范围

| 能力 | Phase 1 |
| --- | --- |
| 安装方式 | 本地文件夹 / ZIP |
| 输入 | 文本 |
| 结果 | text / table / tree / error |
| 选项 | select / switch |
| 自定义 UI | 不支持（API v1 预留，Phase 2） |
| 系统权限 | 无（没有文件、网络、剪贴板、Node 权限） |
| 输入/结果持久化 | 不持久化（只在内存里） |

插件运行在渲染进程的 Web Worker 沙箱里，主进程只负责安装、读取入口文件和保存启用状态。

## 2. 插件包结构

最小插件：

```text
my-tool/
  plugin.json
  main.js
```

ZIP 安装支持两种布局：

```text
plugin.json + main.js
my-tool/plugin.json + my-tool/main.js
```

即：`plugin.json` 在 ZIP 根部，或恰好位于一个顶层目录里。

## 3. plugin.json

```json
{
  "id": "com.example.json-formatter",
  "version": "1.0.0",
  "apiVersion": 1,
  "input": "text",
  "result": "text",
  "entry": "main.js",
  "locales": {
    "zh-CN": {
      "name": "JSON 格式化",
      "description": "格式化、压缩或按键排序 JSON",
      "keywords": ["json", "格式化", "压缩", "format", "minify"],
      "options": { "indent": "缩进" },
      "optionValues": { "indent:2": "2 空格", "indent:4": "4 空格" }
    },
    "zh-TW": {
      "name": "JSON 格式化",
      "description": "格式化、壓縮或依鍵排序 JSON",
      "keywords": ["json", "格式化", "壓縮", "format", "minify"],
      "options": { "indent": "縮排" },
      "optionValues": { "indent:2": "2 空格", "indent:4": "4 空格" }
    },
    "en": {
      "name": "JSON Formatter",
      "description": "Format, minify or sort JSON keys",
      "keywords": ["json", "format", "beautify", "minify"],
      "options": { "indent": "Indent" },
      "optionValues": { "indent:2": "2 spaces", "indent:4": "4 spaces" }
    }
  },
  "options": [
    { "key": "indent", "type": "select", "default": 2, "values": [2, 4] },
    { "key": "minify", "type": "switch", "default": false }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 唯一 id，只能是小写字母、数字、`.`、`_`、`-`，2–64 字符 |
| `version` | 是 | 版本号，非空字符串（建议 semver） |
| `apiVersion` | 是 | Phase 1 固定为 `1` |
| `input` | 是 | 固定为 `"text"` |
| `result` | 是 | `"text"` / `"table"` / `"tree"` |
| `entry` | 是 | 相对路径的 `.js` 文件，不能越出插件目录 |
| `icon` | 否 | 相对路径，Phase 1 预留（界面暂用通用图标） |
| `locales` | 是 | 至少一种语言的名称、描述、关键词 |
| `options` | 否 | 最多 20 个选项 |

### 语言包

- 支持 `zh-CN`、`zh-TW`、`en`；至少提供一种。
- 宿主按当前界面语言取，缺当前语言时回退 `en`，再回退任意一种。
- `keywords` 用于工具页过滤和全局搜索，建议同时包含中英文关键词。
- `options` / `optionValues` 用于选项文案；`optionValues` 的 key 是 `选项key:值`。

### 选项

`select`：

```json
{ "key": "indent", "type": "select", "default": 2, "values": [2, 4] }
```

`switch`：

```json
{ "key": "minify", "type": "switch", "default": false }
```

- `key` 只能包含字母、数字、`_`、`-`，且必须以字母开头。
- `select` 的 `default` 必须出现在 `values` 里。
- `switch` 的 `default` 必须是布尔值。

## 4. main.js 契约

`main.js` 必须是单文件 bundle（作者可以自由使用 TypeScript / npm 依赖，但要打成 IIFE），
并在 Worker 全局暴露 `self.run`：

```js
self.run = async function (input, options, context) {
  return { kind: 'text', text: input }
}
```

参数：

- `input`: 用户输入的字符串。
- `options`: 形如 `{ indent: 2, minify: false }` 的对象，值来自 manifest 默认值 / 用户选择。
- `context.locale`: 当前界面语言，`'zh-CN' | 'zh-TW' | 'en'`，可用于返回本地化错误。

约束：

- 只运行在 Web Worker 里：没有 DOM、没有 Node、没有 `require`、没有宿主 IPC。
- 不要改写 `self.onmessage`：宿主会追加自己的消息桥；插件只定义 `self.run`。
- 不要使用动态 `import()` / `require`；把依赖打进 `main.js`。
- 宿主禁用了 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`importScripts`。
- 单次运行超时 5 秒，超时会被强制终止。
- 插件不能读取剪贴板；工具页的「从剪贴板读取」和结果复制都由宿主完成。

## 5. 返回结果

### 文本

```js
return { kind: 'text', text: '...', language: 'json' }
```

`language` 可选（`json` / `plain`），Phase 1 只用于语义标记。

### 表格

```js
return {
  kind: 'table',
  columns: ['id', 'name'],
  rows: [
    ['1', 'Alice'],
    ['2', 'Bob']
  ],
  truncated: false
}
```

- `columns` 和每个单元格都必须是字符串。
- 每行单元格数量应与 `columns` 对齐；宿主会按列数截断。

### 树形

```js
return {
  kind: 'tree',
  nodes: [
    {
      key: 'user',
      path: '$/0',
      type: 'object',
      children: [
        { key: 'name', path: '$/0/0', type: 'string', value: 'Alice' },
        { key: 'age', path: '$/0/1', type: 'number', value: '30' }
      ]
    }
  ],
  text: '{"user":{"name":"Alice","age":30}}'
}
```

- `key` 是展示名称，`path` 必须唯一（工具页内搜索命中后用它展开并高亮节点）。
- `type` 为 `object` / `array` / `string` / `number` / `boolean` / `null`。
- `text` 可选，用于「复制」按钮。

### 错误

```js
return { kind: 'error', message: '这里放给用户看的原因' }
```

建议用 `context.locale` 返回对应语言。`message` 不落盘、不写日志。

工具产生结果后，**工具页面内**提供结果搜索：可以命中并高亮树节点、表格单元格或文本行，
用上一个 / 下一个匹配在结果里跳转。这是页面级搜索，不会进入应用顶部的全局搜索。
输入与结果只在本次运行的内存里，退出应用即清空。

## 6. 限制

| 项目 | 限制 |
| --- | --- |
| 单次输入 | 2 MB |
| 文本结果 | 2 MB |
| 表格行数 | 10,000（超出标记 truncated） |
| 表格列数 | 200 |
| 单个单元格 | 10,000 字符 |
| 树节点数 | 20,000 |
| 树嵌套深度 | 100 |
| `main.js` | 2 MB |
| 整个插件包 | 20 MB / 200 个文件 |
| 单次运行 | 5 秒 |

超过限制会以错误或截断的形式返回，不会卡死宿主。

## 7. 安装与更新

- 工具页 →「安装文件夹」：选择包含 `plugin.json` 的目录。
- 工具页 →「安装 ZIP」：选择 `.zip`，内含完整插件包。
- 安装时会复制到 `<userData>/plugins/<id>/`，不会直接从原目录运行。
- 同 id 再次安装视为更新，会替换旧版本并保留启用状态。
- 卸载会删除安装目录和插件状态；工具输入/结果不会保存。
- 修改源目录后需要重新安装才会生效（运行的是 userData 里的副本）。
- 从文件夹安装时会跳过 `.git`、`node_modules` 和符号链接；请先把 `main.js` 打成单文件。

## 8. 安全边界

Phase 1 的插件是不可信的第三方代码：

- 不进入主进程；主进程只读文件、复制安装、管理状态。
- 在 Blob Worker 里执行，CSP 允许 `worker-src blob:`。
- 没有 Node / Electron API。
- 网络 API 被宿主 shim 禁用。
- 安装时校验 id、路径（防 `../` / ZIP slip）、入口大小、包大小和文件数量。
- 插件输入/结果不写数据库、不写日志、不持久化。

注意：这是 MVP 级别的隔离，不是完整的系统级沙箱。不要在其中处理高敏感数据；
后续如果开放网络/文件权限，需要单独的权限声明与更强的隔离。

## 9. 本地开发流程

1. 新建目录，写 `plugin.json` 和 `main.js`。
2. 用 esbuild 等工具把 `main.js` 打成单文件 IIFE（不要依赖运行时 import）。
3. 在应用里打开「工具」→「安装文件夹」，选该目录。
4. 修改 `main.js` 后重新安装（或卸载后重装）。
5. 用工具页的输入框、`Ctrl/Cmd + Enter`、复制 CSV/Markdown 验证。

最小示例：

```js
self.run = async (input, options, context) => {
  try {
    const value = JSON.parse(input)
    return {
      kind: 'text',
      text: JSON.stringify(value, null, options.indent === 4 ? 4 : 2),
      language: 'json'
    }
  } catch (error) {
    const prefix = context.locale === 'en' ? 'Invalid JSON' : 'JSON 不合法'
    return { kind: 'error', message: `${prefix}: ${error.message}` }
  }
}
```

## 10. 版本与兼容

- 当前 `apiVersion` 固定为 `1`。
- 不支持的 `apiVersion` 会在安装时被拒绝，不会加载。
- Phase 2 会把 `result: "custom"`（sandbox iframe）纳入 API；Phase 1 的插件不受影响。

## 11. 可安装示例

项目中提供了可直接安装的示例插件：

- [`examples/plugins/case-converter`](../examples/plugins/case-converter)：大小写 / 标题 / 句首 / 反转
- [`examples/plugins/snake-camel-converter`](../examples/plugins/snake-camel-converter)：snake_case / camelCase / PascalCase / kebab-case

它们都包含 `plugin.json`、已打包好的 `main.js` 和说明文档，覆盖文本结果、选项、三语文案和
页面级结果搜索；在「工具 → 安装文件夹」中选择对应目录即可。
