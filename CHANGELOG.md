# CHANGELOG.md

本项目所有值得记录的变更都写在这里。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)（`0.x` 阶段允许不兼容调整）。

> 说明：项目当前没有 git 历史与版本 tag，`0.1.0` 条目依据现有代码状态整理，
> 用于建立后续迭代的基线。

## [Unreleased]

ROADMAP Phase 1（稳定可用）的改动，尚未发版。规划见 [ROADMAP.md](ROADMAP.md)。

### Removed

- 移除「双击单个键隐藏窗口」与「组合键连按两次才切换（防误触）」两个配置
  （`setting.toggleDoublePressKey` / `setting.toggleShortcutDoublePress`）：显示 / 隐藏窗口统一用设置里的
  组合快捷键（全局 + 应用内兜底），不再支持单独修饰键连击，也不再要求连按两次；设置页对应选项、
  快捷键说明，以及相关的按键识别与判定代码一并去掉

### Added

- **工具插件（Phase 1）**：新增「工具」页（`Ctrl/Cmd + 7`，设置顺延为 8），内置
  JSON 格式化（树形 / 文本、双引号转义 / 去转义）/ JSON 数组转表格（条数设置、字段排序、null 与空字符串区分、
  复制 / 导出 CSV）/ XML / JSON 自动识别嵌套数据格式化（按各自类型树形 / 文本；
  XML 内嵌 JSON 按 JSON 子树展示并在 XML 文本里格式化）；
  支持安装本地文件夹或 ZIP、启用 / 禁用 / 卸载；
  全局搜索可搜到工具（匹配元数据）；工具页内可搜索当前输出并高亮到
  树节点 / 表格单元格 / 文本行（页面级搜索，不进入应用全局搜索）。已安装插件在渲染进程的 Blob Worker 沙箱里执行，
  支持 `text` / `table` / `tree` 结果，工具输入与结果不持久化；安装状态写入新的 `plugin` 表。
  插件开发规范见 [docs/plugin-development.md](docs/plugin-development.md)
- 新增可直接安装的外置插件示例
  [examples/plugins/case-converter](examples/plugins/case-converter)：支持大小写、标题、句首、
  反转大小写和去空白选项，含三语文案、README 与单测
- 新增外置插件示例
  [examples/plugins/snake-camel-converter](examples/plugins/snake-camel-converter)：支持
  snake_case / camelCase / PascalCase / kebab-case 互转；空格、Tab、换行等空白分隔多个转换单元并逐行输出；
  连续大写字母逐个视为单词并支持反向转换（如 `AAA` ↔ `a_a_a`）；含三语文案、README 与单测
- 全局搜索支持**系统已安装的应用**：Linux 扫 `$XDG_DATA_HOME` / `$XDG_DATA_DIRS` 下的 `.desktop`（含 Flatpak），
  Windows 扫开始菜单快捷方式，macOS 扫 `/Applications` 下的 `.app`；结果带系统真实图标，
  回车（不按方向键时打开第一条）直接启动应用，搜索弹框的类型过滤也多了「应用」一档
- 设置页新增「关闭搜索后清空关键字与结果」（`setting.clearSearchOnClose`，默认关闭）：打开后每次退出
  搜索弹框都会清空关键字、结果与高亮，下次打开是干净的；关闭时保留上次的关键字（默认行为，方便接着找）
- **全局搜索与主界面解耦**：搜索默认显示在独立的小窗口里（无边框、不占任务栏、失焦自动收起、Esc 关闭），
  呼出搜索不再显示主界面——主界面开着时也不会被关掉；设置页新增「搜索显示在主界面里」
  （`setting.searchInMainWindow`，默认关闭），打开后回到「先显示主界面 + 主界面里的弹框」的老行为
- 接入 Vuetify 4 作为 UI 组件库（`src/renderer/plugins/vuetify.ts` 显式注册组件，主题沿用原配色）
- 设置页新增「界面大小」：小 / 标准 / 大 / 特大（90% / 100% / 110% / 125%），用窗口缩放实现，落库为 `setting.uiScale`
- `Ctrl/Cmd + K` 的全局搜索改成浮动弹框（`GlobalSearchDialog.vue`），支持工作区 / 映射目录跳转、待办过滤、文件定位
- `Ctrl/Cmd + F` 改为过滤当前文件列表（`filter-bar`），只作用于当前目录，随目录切换自动清空
- 无系统边框窗口（`frame: false`）与自定义标题栏：拖动窗口、最小化 / 最大化 / 关闭、双击标题栏最大化
- 无系统边框需要的窗口控制 IPC（`window:minimize` / `window:toggle-maximize` / `window:close` / `window:is-maximized`）
- 工作区拖拽排序，新增 `workspace:reorder`，在主进程事务内重写 `sort_order`
- 键盘导航：侧边栏 / 工作区列表 ↑↓ 切换，文件列表 ↑↓、Shift+↑↓、Home/End、Ctrl/Cmd+A，搜索结果 ↑↓ + 回车
- Settings 页内置快捷键映射表
- `Ctrl/Cmd + K` 与 `Ctrl/Cmd + F` 跳到全局搜索并自动激活输入框
- 文件列表 `F5` 刷新、`Esc` 取消选择；`Enter` / `F2` / `Delete` 不再需要先点击列表
- 多选批量重命名：统一名称 + 自增序号，可保留扩展名，提交前预览并检测重名
- 无法移入回收站（无回收站的挂载点）时，提示改为永久删除作为兜底
- 文件列表超过 300 条时分批渲染，避免大目录一次插入过多 DOM
- 工作区 / 待办列表的加载状态
- IPC 层 `files.renameMany` / `file:rename-many` 批量重命名接口
- 测试：FileService 覆盖 / 覆盖重试 / 跨磁盘 EXDEV / 根目录保护 / 批量重命名，Workspace 拖拽排序校验，IPC Result 信封（成功、业务错误、未知异常、参数透传）
- 待办列表点击归属标签即可跳转到对应工作区（收件箱没有工作区，不跳转）
- 新增 Dracula 配色主题（官方色板：背景 `#282a36`、紫 `#bd93f9`、粉 `#ff79c6`、青 `#8be9fd` 等），主题可选 system / light / dark / dracula
- 板块键盘跳转：`Ctrl/Cmd + ←↑→↓` 按屏幕位置在工作区列表 / 映射目录 / 文件列表之间移动焦点（`stores/panels.ts` + `composables/panels.ts`，几何选择逻辑带单测）
- 数据库升级安全网：升级前用 `VACUUM INTO` 自动备份到 `<userData>/backups/`（保留最近 5 份），数据库版本高于程序支持的版本时拒绝启动并提示（`database/backup.ts`、`DatabaseService.schemaVersion / upgradeBackup`）
- 设置页新增「数据与备份」：结构版本、数据库与备份目录、立即备份、打开备份目录、导出待办为 Markdown
- 自动整理规则（Phase 2）：`rule` 表 + `RuleService`（按扩展名 / 名称关键字匹配，只处理普通文件，同名不覆盖），预览标出冲突与目录不存在，单条 / 全部执行
- 新增 `Rules` 页面（`Ctrl/Cmd + 4`）：规则增删改、启用开关、预览弹框、执行、最近操作与撤销
- 操作历史与撤销：`file_operation` 表按批次记录「原路径 → 新路径」，手动移动 / 重命名与规则执行都会入历史；`Ctrl/Cmd + Z` 或整理页「撤销」把文件移回原位（原位置被占用时只跳过失败条目）
- 目录监听：`WatcherService` 用 `fs.watch`（非递归、防抖 300ms）推送 `file:changed`，文件列表自动重新读取并保留仍存在的选中项；不支持监听的挂载点退化为手动刷新
- 快捷入口：`shortcut` 表（v4）+ `ShortcutService`，文件 / 目录 / 工作区置顶，侧边栏新增「快捷入口」区块（点击工作区与已映射目录在应用内跳转，其它条目交给系统默认程序；已置顶的按钮置灰，目标消失时标「不存在」）
- 备忘：`note` 表（v5）+ `NoteService` + 新增 `Notes` 页面（`Ctrl/Cmd + 4`），支持复制内容 / 链接、用浏览器打开链接；链接写入前规范化（补 `https://`，只放行 http / https）
- 搜索增强：`recent_file` 表（v6）+ `RecentService`，只记录用户主动打开的文件 / 目录（最多 50 条，可清空）；搜索弹框输入为空时展示「最近打开」
- 搜索弹框新增类型过滤（文件 / 目录 / 工作区 / 待办 / 备忘）与归属过滤（未归属 / 各工作区），文件搜索结果带上所属工作区
- 系统托盘：`TrayService` + 内嵌 base64 PNG 图标，托盘菜单支持显示 / 隐藏主窗口、打开全局搜索、退出；开启托盘后关闭窗口只是收进托盘
- 全局快捷键：`Ctrl/Cmd + Alt + A` 显示 / 隐藏窗口、`Ctrl/Cmd + Alt + K` 呼出搜索，新增 `app:open-search` 主进程推送（注册失败只记日志）
- 设置页新增「系统托盘」「全局快捷键」开关，改完即时生效，不用重启
- 新增 `app:open-url` IPC（`SystemService.openUrl`，只放行 http / https），备忘与搜索结果用它打开链接
- Linux / macOS 打包：`electron-builder` 增加 linux（AppImage + deb）与 mac（dmg + zip，x64 / arm64）目标，新增 `build:linux` / `build:linux:dir` / `build:mac` 脚本
- 文档：新增 [docs/build-linux.md](docs/build-linux.md)、[docs/build-macos.md](docs/build-macos.md)
- 测试：新增 ShortcutService（置顶去重、路径 resolve、目标消失、工作区级联）、NoteService（校验、链接规范化、搜索）、RecentService（去重计数、排序、上限、清空）
- 应用内兜底：`Ctrl/Cmd + Alt + A` 显示 / 隐藏窗口、`Ctrl/Cmd + Alt + K` 呼出搜索（新增 `window:toggle`，与全局快捷键同一套逻辑），窗口聚焦时一定可用
- 启动时逐个检查全局快捷键有没有冲突：`TrayService.shortcutStatus` 里每个快捷键带 `registered` 与失败原因（被别的程序占用 / 桌面环境不支持），通过 `system.info().globalShortcuts` 给渲染进程
- 设置页显示每个全局快捷键的注册状态，并新增「重新检测」按钮（`system.recheckShortcuts()` → `app:recheck-shortcuts`），清掉冲突后不用重启
- 测试：新增 `tests/tray-service.test.ts`（注册成功 / 返回 false / 抛异常 / 重新检测 / 关开关注销 / 回调动作）
- 剪贴板历史：`ClipboardService` + `SystemClipboardSource` 每秒轮询系统剪贴板，记录复制的文本与文件路径列表，新增 `Clipboard` 页面（`Ctrl/Cmd + 5`）支持再次复制 / 删除 / 清空
- 剪贴板历史只放在主进程内存里（不写 SQLite，退出应用即清空），默认 10 条、上限 50 条，设置页可改；带 `password` / `concealed` / `secret` 标记的内容与超过 100 KB 的文本不记录
- 剪贴板相关 IPC：`clipboard:list` / `clipboard:copy` / `clipboard:remove` / `clipboard:clear`，以及主进程推送 `clipboard:changed`
- 测试：新增 `tests/clipboard-service.test.ts`（去重、文件列表、条数上限与裁剪、删除后不回流、再次复制置顶）
- 全局搜索防抖可配置：`Ctrl/Cmd + K` 弹框停止输入后才搜索（默认 200ms，可选 不延时 / 200 / 300 / 500 / 1000ms），设置页新增「全局搜索防抖」；连续输入时旧请求结果不会再盖掉新结果
- 搜索结果条数可配置：默认展示 20 条（可选 10 / 20 / 30 / 50 / 60，上限对齐主进程单次搜索的 60 条），设置页新增「搜索结果条数」；超出部分在弹框里点「展开剩余 N 条」查看，可再「收起」
- 设置页新增「应用隐藏 / 最小化时收起全局搜索」（`setting.closeSearchOnHide`，默认开启）：窗口收进托盘、被全局快捷键隐藏或最小化时，`window:minimize` / `window:hide` 会推送 `window:hidden`，渲染进程按设置把搜索弹框收起来
- 全局快捷键可配置：设置页新增两个录制框（显示 / 隐藏窗口、呼出搜索），点一下再按组合键即可改（`setting.toggleShortcut` / `searchShortcut`）；改完立刻按新按键重新注册，应用内兜底的按键也跟着走同一份配置
- 快捷键录制带校验：必须「修饰键 + 一个键」、两个快捷键不能撞车，库里存了非法值会回退默认
- 「连按两次才显示 / 隐藏」开关（`setting.toggleShortcutDoublePress`，默认关闭）：打开后在 400ms 内连按两次快捷键才切换窗口，避免误触
- 支持**双击单个键**显示 / 隐藏窗口（`setting.toggleDoublePressKey`，设置页可选「双击 Ctrl（左右都算）/ 左 Ctrl / 右 Ctrl / Shift / 右 Shift / Alt / Meta」等），不再强制要求组合键；判定在渲染进程做（keydown 计时 + keyup 复位），因此**只在窗口聚焦时生效**——Electron 的 `globalShortcut` 不接受单独的修饰键
- 托盘菜单新增「设置…」，点击后显示窗口并跳到设置页（`app:open-settings`）
- 测试：TrayService 补了「托盘菜单包含设置项并能回调」与「改快捷键后按新按键重新注册」；SettingsService 补了快捷键校验 / 冲突 / 坏值回退

### Changed

- 独立搜索窗口默认请求「屏幕上居中、靠上」的位置（约工作区高度的 10%，X11 / Windows / macOS 生效；
  Wayland 下位置由合成器决定，客户端只能请求，忽略即可），并且整张卡片支持拖动窗口
  （`-webkit-app-region: drag`，输入框 / 按钮 / chip / 列表行都是 `no-drag`，不影响点击与输入）
- 待办页的添加区与搜索区、备忘页的添加区、规则页的「最近操作」统一改成页面顶部的固定区
  （`.view__fixed`）：列表在下面单独滚动，这些区域固定在最上方不跟着滚
- 规则页的「最近操作」固定在规则列表上方：它被移出滚动区（`.view__body` 的兄弟节点
  `.rules__recent`），规则列表滚到底它也不会跟着滚走；卡片内容区最高 180px、超出在卡片内滚动。
  新建的规则改成排在其他规则**上方**（`RuleRepository.topSortOrder()`，列表顺序即执行顺序）
- 搜索弹框里应用结果的排版与其它结果对齐：图标改用 `v-icon` + 背景图承载（尺寸与左右边距和内置图标一致，
  标题不再比其它行左移 30px），应用的注释（Comment）改用正常字体，不再套等宽字体
- 「双击单键」的文案改成「双击单个键隐藏窗口」：这个手势只在窗口聚焦时有效（Electron 不接受单独的修饰键作为全局快捷键，实测抛 conversion failure），窗口藏起来之后就收不到按键了，再显示要用组合键或托盘图标；设置页选中双击键时会顺手弹一次提示，说明唤回方式
- 侧边栏新增 Clipboard 入口，页面快捷键变为 `Ctrl/Cmd + 1~7`（Notes 4，Clipboard 5，Rules 6，Settings 7）
- 备忘列表改为最新的排在最上面（新建备忘取当前最小 `sort_order` - 10），添加完立刻能看到
- 搜索弹框的归属工作空间下拉缩小到与筛选 chip 同一档（高 30px / 宽 148px），并与搜索输入框之间留出间距
- 侧边栏左下角的快捷键提示区整块移除：快捷键已经可以在设置页看到与修改，常驻提示太占地方
- 全局搜索弹框改为贴顶部（距顶 64px）：**有内容时**固定高度 460px（小窗口用 `max-height` 收紧，结果区内部滚动），**初始或没有结果时**按内容自适应并封顶 320px，不再一打开就是个大空框
- 搜索结果返回到达前保留上一次列表并按「搜索中」显示进度条，不再先闪一下「没有匹配的条目」
- 主题改由 Vuetify 主题系统管理（system / light / dark），自定义 CSS 变量替换为 Vuetify 主题变量
- 深色主题重新设计：背景 `#23262f` + 面板 `#2b2f39`（明确不用近黑色，面板与背景差一档），强调色同步提亮
- Dracula 主题的面板改成比背景亮一档（`#343746` / `#282a36`），描边用 Current Line `#44475a`，主题特征更明显
- 开关关闭态的滑轨 / 滑块颜色按主题分别设定，不再出现浅色下白底白滑块、深色下暗底暗滑块的问题
- 待办页的添加区与搜索区统一成同样的卡片、同样的输入尺寸，按钮高度与输入框对齐（48px），两区之间留出 16px 间距
- 待办页添加区按用途给输入框定宽（标题自适应、归属 160 / 优先级 120 / 截止 170），不再让 Vuetify 默认的 `flex: 1 1 auto` 平均分配宽度
- 文件列表图标从 emoji 换成 Vuetify 的 `v-icon` + MDI 图标，按类型取主题色，深浅主题下都一致
- 侧边栏新增 Rules 入口，页面快捷键变为 `Ctrl/Cmd + 1~5`（Settings 固定 5）
- 侧边栏新增 Notes 入口，页面快捷键变为 `Ctrl/Cmd + 1~6`（Notes 固定 4，Rules 5，Settings 6）
- 待办编辑态的截止日期框改用与添加态相同的定宽（此前被 Vuetify 的 `flex: 1 1 auto` 拉宽到 200px 左右）
- 侧边栏、对话框、Toast 之外的控件改用 Vuetify 组件（按钮 / 卡片 / 列表 / 输入框 / 开关 / 表格 / 空状态 / 进度条）
- 侧边栏只保留 Workspace / Desktop / Todo 三个主菜单，Settings 固定到左下角并用分隔线区分（快捷键相应变成 `Ctrl/Cmd + 1~4`）
- 原 Search 页面移除，搜索入口统一收敛到 `Ctrl/Cmd + K` 的弹框
- 批量移动与批量重命名：默认仍不覆盖，仅对失败项按覆盖方式重试，失败原因最多列 3 条
- 删除确认最多列出 5 个文件名，避免确认框被长列表撑开
- `FileService.list` 改为并行 `lstat`，大目录读取更快
- 目录内路径包含判断区分大小写策略按平台处理（win32 / darwin 不区分大小写）
- 搜索回车立即执行时会取消防抖，避免同一关键字搜索两次

### Fixed

- 独立搜索窗口「上次没搜到内容 → 下次打开不按最近打开自适应」：窗口是常驻复用的，
  而「最近打开」只在第一次打开时取过、高度也停在「没有匹配」那个矮值上。现在每次呼出都会
  重新拉「最近打开」并重新量一次高度；隐藏期间算出来的高度会记下来，下次呼出（`show()`）时补上，
  不再因为"算高度时窗口已经收起"而丢掉这次调整
- Windows 上独立搜索窗口的圆角和面板对不上（面板有 8px 圆角、窗口却是直角）：搜索窗口改成
  **透明窗口**（面板圆角外面完全透明），窗口看起来就是圆角窗口；同时去掉不透明的
  `backgroundColor`，并把 `html / body / Vuetify 应用根` 的铺底设为透明，只让卡片自己画背景
- 独立搜索窗口「关闭」时没有清空搜索：失焦被收起也算关闭（不只是 Esc / 打开结果），
  现在这两种情况都会遵守「关闭搜索后清空关键字与结果」这个设置
- 独立搜索窗口的底边描边缺失 / 圆角处描边被切：窗口高度比卡片矮约 10px（卡片量高度时正处在
  「放大出现」的过渡里，`getBoundingClientRect()` 带着缩放偏小，而缩放变化不触发
  ResizeObserver，窗口就停在偏矮的高度上，卡片下沿连同描边被窗口切掉）。改成量布局高度
  （`offsetHeight`），并给卡片加 8px 圆角，描边沿圆角走、不再被窗口四角切一截
- 独立搜索窗口的两处问题：① 窗口高度固定 500px，结果少的时候下面一大片空的——现在按内容自适应
  （弹框高度用 `ResizeObserver` 量出来报给主进程，主进程 `SearchWindow.resize()` 只改高度、
  顶边不动，结果多了长到上限后在结果区内部滚）；② 卡片那 1px 描边贴在窗口边缘时右侧画不出来
  （显示缩放 1.2 这类分数像素导致的），现在给宽度留 1px 余量，四边描边都完整
- 独立搜索窗口的三处问题：① 搜索窗口开着时「显示 / 隐藏主窗口」（托盘 / 快捷键）变成了"再显示一次"、
  关不掉主界面——现在 `applyToggleWindow()` 把「搜索窗口开着」也算作前台，一并收起主界面与搜索窗口；
  ② 搜索窗口不跟随主界面换主题——设置改动现在广播给所有窗口（`settings:changed`），搜索窗口收到就重新读设置；
  ③ 搜索窗口里弹框四周露出窗口背景（像一圈黑边）、界面放大后「归属」筛选被挤到下一行——弹框改成铺满窗口
  （盖掉 Vuetify 给浮层留的 24px 边距 / 圆角），窗口加宽到 800×500，chip 行改成可横向滚动
- 规则多了以后每张规则卡片的按钮点不到：`.view__body.stack` 是 flex 列，卡片被压缩到几十像素高，
  卡片里的按钮被裁掉，而且 `scrollHeight` 与 `clientHeight` 相等（等于整页不滚动）。现在卡片
  一律不压缩（和待办 / 备忘页同一套处理），超出交给页面自己滚动，按钮在列表底部也能点到
- Windows 上应用搜索结果没有正常图标：原来直接对 `.lnk` 取图标，拿到的是「快捷方式」自己
  那个带小箭头的图标（部分环境还取不到）。现在按 ① 快捷方式自带的 `icon` 文件 →
  ② `.lnk` 目标程序（`.exe`）的图标 → ③ `.lnk` 自己的图标 依次取；渲染进程拿到坏图时
  也会退回内置图标，不再留一个空方框
- 搜索弹框里按回车在「没有收起任何结果」时会被当成点了「展开 / 收起」那一行（`moreIndex` 与
  `activeIndex` 都是 -1），怎么按都没反应；现在只有真的收起了结果才会走展开逻辑，回车可以正常打开条目
- 双击修饰键只能把窗口藏起来、藏起来就再也回不来：隐藏前 `index.ts` 会先问 `TrayService.canRestoreWindow()`（托盘图标可用，或至少一个全局快捷键注册成功），两者都没有时**拒绝隐藏**并把原因回给渲染进程弹提示，避免窗口直接失联；渲染进程发起隐藏时还会用系统通知提示一次唤回方式（每次运行只提示一次）
- 侧边栏「设置」入口不再贴左下角：删掉快捷键提示区后，`margin-top: auto` 也跟着没了，设置按钮浮到了快捷入口下面；现在分隔线自己带 `margin-top: auto`，内容少的时候也固定在左下角
- 搜索弹框用方向键移动时高亮行不会滚动到可视区域（列表比弹框高时完全看不到选中的是哪一条）：现在每次移动后把选中行 `scrollIntoView`
- 「展开剩余 N 条」那一行原来用方向键选不到、回车也展开不了：现在它本身就是列表里的一行，可以高亮 / 回车展开，展开后同一行可以再回车收起
- 搜索弹框的关键字搜索结果里，带链接的备忘用回车只能跳到备忘页：现在直接打开链接（和行尾的「打开链接」按钮一致）
- 关掉再打开搜索弹框时会带着上次的「已展开」状态（脚本状态一直挂在组件上），现在每次打开都回到收起、清空高亮
- 全局快捷键「按了没反应」：macOS 与 Wayland（portal 不抢按键）下同一次 `Ctrl/Cmd + Alt + A` 会被全局快捷键和应用内兜底各处理一次，隐藏后立刻又被显示回来，等于没变；现在 `index.ts` 对 250ms 内的重复切换只认第一次
- 全局快捷键注册失败时只弹一条 7 秒的 Toast，窗口收在托盘时用户基本看不到，只会觉得「按了没反应」；现在启动时检查一次，有注册不上的用弹框说明是哪些按键、什么原因、需要用户自己怎么配置（改占用程序或关掉开关），并可以直接跳到设置页
- 窗口隐藏后无法再激活：`Ctrl/Cmd + Alt + A` / 托盘「显示 / 隐藏主窗口」走的 `toggleMainWindow` 只调用 `show() + focus()`，而被隐藏的窗口在 KDE Wayland 下仍处于最小化状态（实测 `isMinimized() === true`、`isFocused() === false`），窗口不会真的回到前台，看起来就是「按了没反应」；现在切换与 `showMainWindow` 共用同一条路径（恢复最小化 → 显示 → 置顶 → 聚焦），实测隐藏后再次触发可回到前台并获得焦点
- 备忘页「添加备忘」整块被空状态压成一条边框、看起来没有添加入口：`v-empty-state` 自带 `min-height: 100%`，把 flex 列里的卡片压缩了（与待办页同一个问题），现在添加卡片不参与压缩，并在标题栏补了「新建备忘」按钮
- Wayland 下全局快捷键完全不生效：Electron 默认用 X11 grab，在 Wayland 会话里注册「成功」但永远收不到按键，现在启动时启用 xdg-desktop-portal 的 `GlobalShortcuts` 后端（KDE Plasma 5.27+ / GNOME 48+ 等实现该 portal 的桌面环境可用）
- 「最近打开」在同一毫秒内连开多个文件时顺序随机：时间戳改为单调递增（`RecentService.nextOpenedAt`）
- 文件「移动到…」报 `An object could not be cloned.`：`moveDialog.sources` 是 Vue 的响应式数组（Proxy），直接传给 IPC 会被结构化克隆拒绝；现在过 IPC 前统一拷贝成普通数组
- 把文件"移动"到它自己所在的目录时不再报错：`moveIntoMany` 直接跳过这类条目并返回 `skipped`，UI 提示「已在目标目录」，不再弹出覆盖重试确认框
- 只改文件名大小写（Windows / macOS 大小写不敏感）不再被判定成"同名文件已存在"；同时避免覆盖分支误删源文件（新增 `isSamePath` 与单测）
- 对话框卡片不再透明：`v-card` 的全局默认是 outlined（透明背景），放在对话框里会透出下层内容，现在对话框卡片统一实心背景 + 阴影，遮罩加深到 0.5，且不使用模糊
- 工作区拖拽排序改为按指针位置计算插入点：拖到行间或列表下方的空白处都能排序，此前只有精确落在某一行上才会触发，容易看起来「拖不动」
- 拖动中的工作区会变淡、落点用一条线标出，面板内的拖拽不再可能变成拖动整个窗口
- 待办创建失败时不再清空已输入标题，编辑保存失败时不再关闭编辑区
- 映射目录失败时不再弹出「已映射」成功提示，并去掉重复的工作区加载
- 批量操作失败明细在 Toast 中换行显示（此前 `\n` 被折叠成一行）
- 快速切换目录时旧请求可能覆盖新目录列表的竞态
- 从其它页面返回 Workspace 时没有默认选中映射目录，文件区一直显示空状态
- 待办页列表为空时反而无法添加待办：`.todo__body` 是 flex 列，而 `v-empty-state` 自带 `min-height: 100%`，两者叠加把上方的添加 / 搜索卡片压缩到只剩 2px 边框（实测），现在卡片不参与压缩、空状态只占剩余高度
- 待办页「添加待办」输入框太小、截止日期框太大：Vuetify 的 `.v-input` 默认 `flex: 1 1 auto`，实测标题框被挤到 77px、日期框涨到 247px，现在按用途定宽
- 待办编辑态与添加态的「截止」输入框宽度不一致（编辑态被拉伸），现在两处都固定 170px

---

## [0.1.0] - 2026-09-18

首个可用 MVP：Electron + Vue 3 + TypeScript + SQLite，本地优先，无独立后端。

### Added

**Workspace**

- 工作区创建、重命名、删除；删除只清理映射与待办，不触碰真实文件
- 将真实目录映射进工作区，读取时标记目录是否存在；支持移除映射
- 工作区名称唯一性与长度校验，支持自定义排序值（新建默认 `MAX+10`）

**Desktop 与文件操作**

- 桌面与映射目录浏览：目录优先、名称自然排序、隐藏文件可选显示
- 打开文件 / 进入目录 / 在系统文件管理器中定位 / 复制路径
- 新建文件夹、重命名、复制、移动
- 多选（Ctrl/Cmd 单选、Shift 连选）与批量移动到目标目录
- 删除默认走系统回收站，需永久删除时可通过 `files.remove(paths, { permanent: true })` 显式调用
- 拖拽移动文件，支持从系统拖入
- 文件冲突默认不覆盖，可确认后覆盖；跨磁盘移动自动降级为复制 + 删除
- 批量操作逐个执行，单个失败不影响其它条目并返回失败汇总
- 禁止对文件系统根目录操作，禁止把目录移动 / 复制进自身子目录

**Todo**

- 创建、编辑、删除待办
- 状态（todo / doing / done）、优先级（low / normal / high）、截止日期（YYYY-MM-DD）
- 待办可归属工作区，也可放入收件箱（`workspace_id IS NULL`）
- 按工作区、状态、关键字过滤；列表按未完成、优先级、截止日期排序

**Search**

- 搜索文件名、Todo 标题与描述、工作区名称、映射目录
- 文件名结果上限 60 条，无结果时快速返回

**Settings**

- 主题（light / dark / system）、显示隐藏文件、删除前确认
- 查看系统路径（home / desktop / documents / downloads / userData / database）
- 打开应用数据目录，便于备份数据库

**架构与基础设施**

- Electron 主进程 / preload / 渲染进程三层边界：渲染进程不接触 fs、path、SQLite
- `window.desktop` 业务化 API（files / workspace / todo / settings / system），集中定义于 `src/shared/ipc.ts`
- preload 启用 `contextIsolation` 与沙箱，不暴露 `ipcRenderer` / `process`
- IPC 统一 `Result` 信封与错误码，错误不会跨进程丢失
- SQLite（better-sqlite3）连接管理：WAL、外键约束、`userData/data.db`
- migration 机制与 `schema_migration` 记录表
- 初始表结构：`workspace` / `mapped_directory` / `todo` / `setting`
- 核心逻辑单测：FileService、WorkspaceService、TodoService、migration、SettingsService

**打包与文档**

- Windows 打包脚本：NSIS 安装包、绿色版单文件、Linux 交叉打包（无 wine）
- `better-sqlite3` 使用 N-API 预编译二进制，无需 electron-rebuild
- 卸载保留用户数据（`deleteAppDataOnUninstall: false`）
- 文档：`README.md`、`AGENTS.md`、`ARCHITECTURE.md`、`docs/build-windows.md`

**本次文档迭代**

- 新增 `DATABASE.md`：表结构、约束、数据约定、migration 流程与备份说明
- 新增 `ROADMAP.md`：当前能力盘点、阶段规划、非目标与版本规划
- 新增 `CHANGELOG.md`：变更记录基线与后续维护约定

### Known Limitations

- 未实现文件监听（`fs.watch`），进入目录时读取，可手动刷新
- 未实现全文搜索 / 文件内容索引
- 未实现自动整理规则、标签、快捷入口、操作撤销
- Todo 与文件之间没有自动关联
- 只配置了 Windows 分发（含 Linux 交叉打包脚本），Linux / macOS 分发包与说明尚未完成

[Unreleased]: #unreleased
[0.1.0]: #010---2026-09-18
