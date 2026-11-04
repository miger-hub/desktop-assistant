# Snake / Camel Converter（下划线与驼峰转换）外置插件

一个可直接安装的 Phase 1 外置插件，用于在以下命名风格之间转换：

- `snake_case`
- `camelCase`
- `PascalCase`
- `kebab-case`

输入里的空格、Tab、换行等空白字符会分隔多个**转换单元**；每个单元分别转换，输出一行一个结果。

## 安装

在应用里打开：

```text
工具 → 安装文件夹
```

选择本目录即可；也可以把本目录压缩成 ZIP 后用「安装 ZIP」。

`examples/` 是源码示例目录，应用不会自动加载，需要手动安装。

## 转换模式

默认是 `camelCase`：

| 输入 | `camelCase` | `snake_case` | `PascalCase` | `kebab-case` |
| --- | --- | --- | --- | --- |
| `foo_bar_baz` | `fooBarBaz` | `foo_bar_baz` | `FooBarBaz` | `foo-bar-baz` |
| `fooBarBaz` | `fooBarBaz` | `foo_bar_baz` | `FooBarBaz` | `foo-bar-baz` |
| `userID` | `userID` | `user_i_d` | `UserID` | `user-i-d` |
| `XMLHttpRequest` | `xMLHttpRequest` | `x_m_l_http_request` | `XMLHttpRequest` | `x-m-l-http-request` |

说明：

- 下划线、连字符视为单元内的单词分隔符；空格、Tab、换行等空白视为转换单元分隔符；
- camelCase / PascalCase 会自动拆成单词再重新组合；
- **连续大写字母会逐个视为单词**：`AAA` 转 snake_case 为 `a_a_a`；反向 `a_a_a` 转
  PascalCase 为 `AAA`，转 camelCase 为 `aAA`；
- 空格 / Tab / 换行不是单词内分隔符，而是转换单元分隔符，例如：

```text
输入：
foo_bar  baz-qux
quux

输出（toCamel）：
fooBar
bazQux
quux
```

## 目录结构

```text
snake-camel-converter/
  plugin.json
  main.js      已打包好的 Worker 脚本，无需构建
  README.md
```

## 修改后如何生效

应用会把插件复制到 `<userData>/plugins/<id>/`。
修改 `main.js` 或 `plugin.json` 后，需要在工具页重新安装一次。

## 搜索与结果

- 应用顶部全局搜索可通过「下划线」「驼峰」「snake」「camel」「pascal」「kebab」等关键词找到工具；
- 运行后，工具页面内的「搜索当前结果」可以搜索输出文本。

## 限制

插件运行在 Blob Worker 沙箱中：

- 没有 Node / DOM / 文件系统 / 网络 / 宿主 IPC；
- 不能直接读写剪贴板；
- 单次运行 5 秒超时，输入和结果上限 2 MB。
