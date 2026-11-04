# Case Converter（大小写转换）外置插件

这是一个可直接安装的 Phase 1 外置插件示例。它把输入文本按选项转换成大写、小写、
单词首字母大写、句首大写或反转大小写。

## 安装

在应用里打开：

```text
工具 → 安装文件夹
```

选择本目录（包含 `plugin.json` 和 `main.js`）即可。

也可以把本目录压缩成 ZIP，然后使用「安装 ZIP」。

> `examples/` 只是源码示例，应用不会自动加载；必须手动安装。

## 转换方式

默认 `UPPERCASE`，可在工具页的「转换方式」里切换：

| 模式 | 输入 | 输出 |
| --- | --- | --- |
| `upper` | `Hello World` | `HELLO WORLD` |
| `lower` | `Hello World` | `hello world` |
| `title` | `hello world` | `Hello World` |
| `sentence` | `hello. world!` | `Hello. World!` |
| `toggle` | `Hello` | `hELLO` |

「去除首尾空白」默认开启；关闭后会保留输入前后的空格和换行。

大小写转换使用宿主传入的界面语言（`zh-CN` / `zh-TW` / `en`）作为 locale，尽量符合
对应语言的字母大小写规则。

## 目录结构

```text
case-converter/
  plugin.json   插件元数据、三语名称/描述/关键词/选项文案
  main.js       已打包好的 classic Worker 脚本（无需构建）
  README.md
```

## 修改后如何生效

应用安装时会把插件复制到 `<userData>/plugins/<id>/`。
修改本目录里的 `main.js` 或 `plugin.json` 后，需要在工具页重新安装一次才会生效。

## 搜索

- 应用顶部全局搜索会按名称、描述和关键词找到这个工具；
- 运行后，工具页面内的「搜索当前结果」可以搜索输出文本。

## 限制

插件运行在 Blob Worker 沙箱里：

- 没有 Node / DOM / 文件系统 / 网络 / 宿主 IPC；
- 不能直接读写剪贴板（工具页的「从剪贴板读取」由宿主完成）；
- 单次运行 5 秒超时，输入和结果上限 2 MB。
