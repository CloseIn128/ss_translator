本文件用于向协作者（包括 Copilot 等辅助工具）简要说明本仓库的主要功能模块、关键约定和开发规范。请在功能发生较大调整或新增重要模块时，补充或修改对应小节的说明，使其始终与当前代码保持一致。
如需增加新的功能模块，请比照"功能A/功能B"的结构补充相应小节，并使用清晰的中文描述实际业务含义和约束条件，而不要保留占位符性质的说明。

# 项目结构

## 技术栈与语言

- 整个项目已完成 **TypeScript 迁移**（包括 Electron 后端和 React 前端），所有源文件均为 `.ts` / `.tsx`
- 后端（`electron/`）：TypeScript → CommonJS（通过 `tsconfig.electron.json` 编译到 `electron-dist/`），运行时为 Node.js CJS 模块
- 前端（`src/`）：TypeScript + React（TSX），通过 Vite 构建为 ESM，开发时热重载
- 类型定义（`types/`）：集中存放所有共享接口和类型，前后端均可引用
- 测试（`tests/`）：vitest 框架，测试文件为 `.test.js`（ESM 语法，直接 import `.ts` 模块）

## 目录结构

```
├── electron/                     # Electron 主进程（TypeScript，编译为 CJS）
│   ├── main.ts                   # 应用入口，窗口创建与服务初始化
│   ├── preload.ts                # 预加载脚本，暴露 IPC API（contextBridge）
│   ├── ipc/                      # IPC 处理器模块（每个导出 register(ctx) 函数）
│   │   ├── dialogHandlers.ts     # 对话框（文件夹选择等）
│   │   ├── projectHandlers.ts    # 项目管理（创建/保存/加载/重载）
│   │   ├── glossaryHandlers.ts   # 术语库（公共词库 CRUD、导入导出）
│   │   ├── aiHandlers.ts         # AI 翻译配置与调用（translate/polish/单条）
│   │   ├── exportHandlers.ts     # MOD 导出与导出预览
│   │   ├── keywordHandlers.ts    # 关键词提取、翻译、润色（流式批次）
│   │   ├── legacyHandlers.ts     # 老版本汉化加载/匹配
│   │   ├── notificationHandlers.ts # 系统通知（Electron Notification）
│   │   └── fileHandlers.ts       # 文件预览（diff 对比用原始/翻译内容）
│   ├── services/                 # 业务逻辑服务（TypeScript 类/函数）
│   │   ├── configManager.ts      # 配置持久化（ConfigManager 类，管理 model_config.json）
│   │   ├── translator.ts         # AI 翻译服务（TranslationService 类，支持并发批次）
│   │   ├── modParser.ts          # MOD 文件解析（parseModFolder 函数，解析 CSV/JSON/faction 等）
│   │   ├── glossary.ts           # 术语库管理（GlossaryManager 类）
│   │   ├── project.ts            # 项目文件管理（ProjectManager 类，.sst 格式）
│   │   ├── exporter.ts           # 翻译导出（exportMod 函数，CSV 列替换 + JSON 正则替换）
│   │   ├── legacyTranslation.ts  # 老版本汉化匹配服务（LegacyTranslationService 类）
│   │   ├── csvParser.ts          # CSV 解析/序列化（parseCSV, serializeCSV, parseCSVRow）
│   │   ├── relaxedJson.ts        # Starsector 宽松 JSON 解析（relaxedJsonToJson, parseRelaxedJson）
│   │   └── uuid.ts               # UUID v4 生成
│   └── data/
│       └── default_glossary.json # 内置默认词库（1278 条）
├── types/                        # 共享 TypeScript 类型定义
│   ├── index.ts                  # 类型统一导出入口
│   ├── project.ts                # 核心数据类型（Project, TranslationEntry, GlossaryEntry, KeywordEntry, ProjectStats, ModInfo）
│   ├── api.ts                    # 前端 IPC API 类型（ElectronAPI 接口, ApiResult, TranslateOptions 等）
│   ├── config.ts                 # 配置类型（AIConfig, AppConfig）
│   ├── translator.ts             # 翻译服务类型（TranslationConfig, TranslationRequest, TranslateEntryInput/Output）
│   ├── glossary.ts               # 术语库类型（GlossaryImportEntry）
│   ├── ipc.ts                    # IPC 上下文类型（IPCContext, IPCResponse）
│   ├── modParser.ts              # MOD 解析类型（ParseOptions, FileParseResult）
│   └── legacy.ts                 # 老版本汉化类型（LegacyTranslationEntry, LegacyMatchResult）
├── src/                          # React 前端（TypeScript + TSX，Vite 构建）
│   ├── App.tsx                   # 应用根组件（极简外壳，渲染布局 + message 反馈）
│   ├── main.tsx                  # React 入口（createRoot）
│   ├── index.css                 # 全局样式
│   ├── store/
│   │   └── useProjectStore.ts    # Zustand 状态管理（所有项目数据 + UI 状态 + IPC 操作）
│   ├── components/
│   │   ├── ExportPreviewModal.tsx # 导出预览弹窗（文件树 + Monaco diff）
│   │   ├── context/
│   │   │   └── TaskContext.tsx    # 任务管理与日志上下文（React Context）
│   │   ├── diff/
│   │   │   ├── DiffViewer.tsx    # 文件对比组件（Monaco DiffEditor + CSV 表格 diff）
│   │   │   └── diffUtils.ts     # Diff 工具函数（CSV 解析、LCS 算法）
│   │   └── layout/
│   │       ├── LeftNav.tsx       # 左侧导航栏（含四维度进度条）
│   │       ├── LogPanel.tsx      # 日志面板（可拖拽调整高度）
│   │       └── BottomBar.tsx     # 底部状态栏（任务状态 + 进度）
│   └── pages/                    # 页面模块（按功能拆分为独立目录）
│       ├── welcome/
│       │   └── index.tsx         # 欢迎页（新建/打开项目）
│       ├── project-info/
│       │   └── index.tsx         # 项目基本信息页（MOD 信息、MOD 专属提示词编辑）
│       ├── translation-editor/   # 翻译编辑器（主工作区）
│       │   ├── index.tsx         # 主协调组件（筛选状态、分页、文件选择）
│       │   ├── FileSidebar.tsx   # 左侧文件目录树（可拖拽调整宽度，进度统计）
│       │   ├── EditorHeader.tsx  # 筛选/操作栏（搜索、分类、状态、批量操作）
│       │   ├── EntryRow.tsx      # 单条翻译条目（内联编辑、审核切换、忽略）
│       │   ├── FileDiffView.tsx  # 文件对比预览面板（可折叠）
│       │   └── useTranslationActions.ts # 翻译操作 Hook（单条/批量翻译、润色、清空）
│       ├── glossary/             # 词库管理
│       │   ├── index.tsx         # 词库页面（Tab 切换项目/公共词库）
│       │   ├── ProjectGlossaryTab.tsx  # 项目术语库（支持导入/导出/关键词合并）
│       │   └── PublicGlossaryTab.tsx   # 公共术语库（内置词库编辑）
│       ├── keyword-extractor/    # 关键词提取
│       │   ├── index.tsx         # 关键词提取页面（提取/翻译/润色流程）
│       │   ├── KeywordTable.tsx  # 关键词表格（内联编辑、确认、分类）
│       │   └── useKeywordActions.ts # 关键词操作 Hook（提取、翻译、润色、加入词库）
│       ├── review/
│       │   └── index.tsx         # 审核页（逐条审核术语和翻译条目）
│       ├── settings/             # AI 模型设置
│       │   ├── index.tsx         # 设置页面（Tab 切换模型/提示词）
│       │   ├── ModelConfigTab.tsx    # 模型配置（API Key、URL、模型参数）
│       │   └── PromptConfigTab.tsx   # 提示词配置（系统/润色/关键词提示词）
│       ├── app-settings/
│       │   └── index.tsx         # 程序设置页（界面外观：字体大小、缩放）
│       └── request-history/      # 请求历史
│           ├── index.tsx         # 请求历史页面（列表 + 活动请求面板）
│           ├── ActiveRequestsPanel.tsx  # 活动请求面板（正在进行的 API 请求）
│           └── RequestDetailModal.tsx   # 请求详情弹窗（提示词、响应、耗时）
└── tests/                        # 自动化测试（vitest，ESM 语法）
    ├── components/diff/
    │   └── diffUtils.test.js     # Diff 工具函数测试
    └── electron/services/        # 后端服务单元测试
        ├── aiConfigure.test.js   # AI 配置集成测试
        ├── configManager.test.js # 配置管理测试
        ├── csvParser.test.js     # CSV 解析测试
        ├── exporter.test.js      # 导出功能测试
        ├── glossary.test.js      # 术语库测试
        ├── legacyTranslation.test.js # 老版本汉化测试
        ├── modParser.test.js     # MOD 解析测试
        ├── project.test.js       # 项目管理测试
        ├── relaxedJson.test.js   # 宽松 JSON 解析测试
        ├── translator.test.js    # 翻译服务测试
        └── uuid.test.js          # UUID 生成测试
```

## 日志系统 (LogPanel / TaskContext)

### 功能

- 公共日志面板位于主界面下半部分，通过底栏按钮切换显示/隐藏
- 所有功能模块（翻译编辑、关键词提取等）通过 `addLog(level, message, source)` 统一输出日志
- 日志级别：`debug`、`info`、`success`、`warning`、`error`
- 支持 Debug 模式开关，开启后显示 `debug` 级别日志（默认隐藏）
- 日志自动滚动到底部，支持手动滚动查看历史，最大保留 2000 条
- 日志面板高度可通过顶部拖拽手柄调整（默认 260px，最小 80px，最大 50vh）
- 日志条目中的时间、级别标签、来源列垂直对齐（固定宽度列）
- 日志字体大小独立配置，不受程序字体大小影响

### 规范

- 日志上下文通过 `TaskContext`（React Context）提供，组件内使用 `useTask()` 获取
- 新增功能模块输出日志时需指定 `source` 字段（如 `'翻译编辑'`、`'关键词提取'`）
- `debug` 级别用于详细的逐条翻译结果等开发信息，`info`/`success` 用于用户可见的状态变更
- `TaskContext.tsx` 定义了 `LogEntry`、`Task`、`TaskContextValue` 接口，提供完整类型安全

## 任务管理系统 (TaskContext / BottomBar)

### 功能

- 全局任务管理：一次只能执行一个长时间任务（批量翻译、批量润色、关键词提取、关键词翻译）
- 底栏（BottomBar）固定在窗口底部，左侧为日志面板开关，中部显示当前任务名称、状态和进度
- 任务状态：`running`（运行中）、`completed`（已完成）、`failed`（失败）
- 任务完成/失败后：底栏高亮、弹出式消息提示、窗口非聚焦时发送系统通知（Electron Notification）
- 切换页面（如离开关键词提取界面）不会丢失任务状态，任务在后台继续执行

### 规范

- 任务通过 `startTask(name)` 开启，返回任务 ID（如果已有运行中任务则返回 `null`）
- 使用 `updateTaskProgress(progress, message)` 更新进度文本
- 使用 `completeTask(message)` 或 `failTask(error)` 结束任务
- 各功能发起批量操作前需检查 `isTaskRunning`，若有任务运行中则提示用户等待
- 系统通知通过 `app:notify` IPC 调用 Electron 的 `Notification` API，在 `preload.ts` 中暴露为 `sendNotification(title, body)`

## 关键词提取 (KeywordExtractor)

### 功能

- 统一关键词提取通过 `keywords:extractAll` IPC，以流式批次（`keywords:batch`）发送结果到渲染进程
- 结构化提取先运行（基于 MOD 文件字段名），随后 AI 提取增量更新
- 提取结果只包含原文和分类，不提供翻译（`target` 始终为空）
- 翻译为独立步骤，通过 `keywords:translate` 进行，人名和星球/星系名不翻译
- 提取时自动过滤内置术语库和项目术语库中已有的词条
- 提取和翻译操作均受任务管理系统约束，执行期间不可启动其他任务
- 关键词表支持内联编辑：点击译文可直接输入，点击分类可选择下拉菜单
- 关键词可标记为"已确认"状态，批量翻译/润色时排除已确认关键词，并将其作为术语表辅助翻译剩余关键词
- 加入术语库操作支持覆盖：当关键词与术语库中已有条目重名时，弹窗提示用户确认覆盖
- `keywords:translate` 和 `keywords:polish` IPC 接受可选的 `extraGlossary` 参数，传递已确认关键词作为额外术语表

### 规范

- AI 提取提示词存储在 `config/model_config.json` 的 `keywordPrompt` 字段
- 分类可选值：势力名称、舰船名称、武器名称、人名、星球/星系名、游戏术语、物品名称、其他
- 操作内置术语库数据时需做防御性校验（`typeof source === 'string'`），避免格式异常导致崩溃
- 关键词的 `confirmed` 字段（布尔值）随项目保存/加载持久化

## AI 翻译 (TranslationService)

### 功能

- 批量翻译条目（`translateBatch`），支持传入术语表和 MOD 专属提示词辅助
- 润色已有翻译（`polish`），同样支持 MOD 专属提示词
- 关键词翻译（`translateKeywords`），人名/星球名类别自动跳过
- 批量翻译和批量润色操作受任务管理系统约束，执行期间不可启动其他任务
- 单条翻译/润色不占用任务槽位，可随时执行
- MOD 专属提示词通过 `modPrompt` 参数传入，以 `【MOD设定说明】` 格式注入到用户消息中
- 支持并发请求：`concurrentRequests` 配置参数控制同时发送的 API 请求数（默认 1），通过 `_runConcurrentBatches` 方法实现

### 规范

- 提示词通过 `ConfigManager` 持久化，包括 `systemPrompt`、`polishPrompt`、`keywordPrompt`
- `_ensureModelConfigComplete()` 在启动时自动迁移补全缺失字段
- 后端文件（`electron/`）使用 TypeScript，编译到 `electron-dist/`。修改后运行 `npx tsc -p tsconfig.electron.json --noEmit` 验证类型
- 前端文件（`src/`）使用 TypeScript + TSX，修改后运行 `npx tsc --noEmit` 验证类型
- `ai:configure` IPC 处理器中，若前端传入空 `apiKey`，会自动从磁盘配置中恢复已保存的密钥，避免设置面板保存时意外清空内存中的 API Key
- 批量翻译/润色的确认对话框（`Modal.confirm`）的 `onOk` 不返回 Promise，以确保对话框立即关闭，翻译任务在后台异步执行
- `ai:translate` 和 `ai:polish` IPC 处理器接受可选的 `modPrompt` 字段，传递给 TranslationService

## 老版本汉化辅助 (LegacyTranslationService)

### 功能

- 加载同一 MOD 的老版本已汉化文件夹，解析其中的中文文本
- 将老版本文本条目与当前新版本项目进行结构匹配，匹配策略按优先级：
  1. **完全匹配**：文件路径、行 ID、字段完全相同（最可靠）
  2. **结构匹配**：相同文件名 + 行 ID + 字段，适应版本间目录变化
- 匹配成功的条目可批量应用老版本翻译，支持"仅应用到未翻译条目"和"应用所有匹配"两种模式
- 老版本汉化数据存储在 `LegacyTranslationService`（主进程内存），不持久化

### 规范

- IPC 处理器位于 `electron/ipc/legacyHandlers.ts`，注册 `legacy:load`、`legacy:getInfo`、`legacy:match`、`legacy:clear`
- `LegacyTranslationService` 在 `electron/services/legacyTranslation.ts`，通过 `ctx.legacyTranslationService` 共享
- 日志输出 source 为 `'老版本汉化'`

## MOD 专属提示词

### 功能

- 每个项目可设置独立的 MOD 专属提示词（`project.modPrompt`）
- 提示词在 AI 翻译和润色时自动注入到上下文中，格式为 `【MOD设定说明】`
- 提示词随项目一起保存/加载（存储在 `.sst` 项目文件中）
- 编辑界面位于"基本信息"页面（`pages/project-info/index.tsx`）

### 规范

- `modPrompt` 是 project 对象上的字符串字段，由 zustand store 的 `updateProjectFields` 管理
- 翻译编辑器自动从 `project.modPrompt` 读取并传递给 `ai:translate` 和 `ai:polish`
- `translator.ts` 的 `_buildModPromptText(modPrompt)` 负责格式化

# 界面布局

```
┌──────────────────────────────────────────────────────┐
│  LeftNav  │              app-content                 │
│  (侧边栏)  │  (ProjectInfo / TranslationEditor /     │
│           │   GlossaryPanel / ReviewPanel /          │
│           │   SettingsPanel / AppSettingsPanel /     │
│           │   RequestHistory)                        │
├───────────┴──────────────────────────────────────────┤
│                    LogPanel (日志面板，可切换)           │
├──────────────────────────────────────────────────────┤
│  BottomBar (底栏：日志开关 | 任务状态 | 进度)            │
└──────────────────────────────────────────────────────┘
```

- `app-root` 为根容器，使用 `flex-direction: column` 垂直排列
- `app-layout` 包含 LeftNav + app-content，占据剩余空间（`flex: 1`）
- LogPanel 在 app-layout 下方，通过底栏按钮切换显示
- BottomBar 固定在最底部

## 界面设置 (AppearanceTab)

### 功能

- 程序字体大小和日志字体大小可独立配置
- 设置通过 CSS 自定义属性 `--app-font-size` 和 `--log-font-size` 生效
- 设置值保存在 `localStorage`（前端本地存储，不涉及后端 IPC）
- 修改即时生效，无需点击保存按钮

### 规范

- 字体大小状态由 `App.tsx` 的 `AppInner` 组件管理，通过 props 传递给设置页面
- `localStorage` key：`ss_translator_app_font_size`、`ss_translator_log_font_size`
- 默认值：程序 13px，日志 12px；程序范围 10-24px，日志范围 8-20px

# 构建与运行

- 安装依赖：`npm install`
- 开发模式：`pnpm dev`
- 前端构建：`npx vite build`
- 后端编译：`npx tsc -p tsconfig.electron.json`（输出到 `electron-dist/`）
- 类型检查（全量）：`npm run typecheck`（等同于 `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit`）
- 前端类型检查：`npx tsc --noEmit`
- 后端类型检查：`npx tsc -p tsconfig.electron.json --noEmit`
- 运行测试：`npm test`（或 `npx vitest run`）
- 监听模式测试：`npm run test:watch`（或 `npx vitest`）

## 自动化测试

- 测试框架：vitest（与 Vite 原生集成）
- 测试文件位于 `tests/` 目录，与源码目录结构对应
- 测试文件使用 `.test.js` 扩展名，ESM 语法直接 `import` TypeScript 模块（vitest 自动转译）
- vitest 配置在 `vite.config.ts` 的 `test` 字段中，已启用 `globals: true`
- 新增后端服务或修改逻辑后，应在 `tests/electron/services/` 下编写或更新对应测试
- 开发完成后需执行 `npm test` 确保所有测试通过（当前共 148 个测试，12 个测试文件）

## 文件对比预览 (FileDiffView)

### 功能

- 在翻译编辑页的右侧面板上方显示选定文件的对比预览
- 左侧显示原始文件内容，右侧显示替换了全部翻译条目后的文件内容
- 支持 CSV 和 JSON 类型文件的翻译替换预览
- 变更行以颜色高亮标记（红色=原始，绿色=翻译后）
- 面板可折叠/展开，默认展开
- 显示变更行数统计
- 未变更行自动折叠，只显示变更行及其前后 3 行上下文
- 超过 5000 行的大文件自动切换为简单对比模式，避免 LCS 算法性能问题

### 规范

- 文件内容通过 `file:preview` IPC 获取，由 `fileHandlers.ts` 处理
- CSV 文件替换使用 `parseCSV`/`serializeCSV` 进行精确列替换
- JSON 文件替换使用正则字符串替换（与导出逻辑一致）
- 对比使用 LCS（最长公共子序列）算法，O(m*n) 时间/空间复杂度
- 行尾统一规范化为 LF（`\r\n` → `\n`），避免 CRLF 差异
- 选中"全部文件"时不显示对比面板
- 无变更时显示"无变更内容"提示

## 翻译编辑器组件架构

### 组件拆分

- `translation-editor/index.tsx`：主协调组件，管理筛选状态和分页，通过 zustand store 读取/更新项目数据
- `translation-editor/FileSidebar.tsx`：左侧文件目录树，按目录层级展示文件，支持拖拽调整宽度
- `translation-editor/EditorHeader.tsx`：筛选/操作栏（搜索、分类、状态、批量操作）
- `translation-editor/EntryRow.tsx`：单条翻译条目，支持内联编辑、AI 翻译/润色、审核状态切换
- `translation-editor/FileDiffView.tsx`：文件对比预览面板
- `translation-editor/useTranslationActions.ts`：翻译操作自定义 Hook（单条翻译、润色、批量翻译、批量润色、清空翻译）

### 状态管理（zustand）

- 所有项目状态和 UI 状态通过 `src/store/useProjectStore.ts`（zustand store）统一管理
- Store 接口 `ProjectStore` 包含：
  - **项目数据**：`project`、`selectedFile`、`updateEntry`、`batchUpdate`、`updateGlossary`、`updateKeywords`、`updateProjectFields`
  - **UI 状态**：`activeTab`（类型 `TabName`）、`zoomLevel`、`logVisible`
  - **IPC 操作**：`createProject`、`loadProject`、`saveProject`、`autoSave`、`exportMod`
  - **自动保存**：`startAutoSave`、`stopAutoSave`（3 分钟定时器）
- `App.tsx` 是极简外壳：渲染布局、提供 message 反馈，不持有项目状态
- 所有页面组件直接从 store 读取数据，不再通过 App.jsx 传递 props
- 只有 `messageApi`（Ant Design 消息 API，类型 `MessageInstance`）和少量 UI 回调作为 props 传递

### 术语未翻译横幅

- 当有术语缺少翻译时，TranslationEditor 顶部显示可关闭的黄色警告横幅
- 横幅提示术语未翻译数量，关闭后不再显示（直到数量变化时重新出现）

### 条目审核

- EntryRow 的审核按钮支持切换：已翻译/已润色 ↔ 已审核
- 审核状态通过 `status: 'reviewed'` 标记，取消审核恢复为 `'translated'`

### 条目来源信息

- CSV 条目显示"列: <字段名> | 行ID: <行标识>"，帮助用户定位原文来源
- JSON 条目显示"属性: <全路径>"（带点号的路径）或"字段: <字段名>"
- 来源信息以 monospace 字体显示在原文上方

### 条目忽略功能

- 每个条目可标记为"已忽略"（`entry.ignored: true`），忽略的条目视作不存在
- EntryRow 的操作栏提供忽略/取消忽略按钮（眼睛图标）
- 界面默认隐藏已忽略条目，EditorHeader 提供"显示已忽略"开关
- 被忽略的条目不参与：批量翻译、批量润色、清空翻译、MOD 导出、进度统计
- `ignored` 字段随项目保存/加载持久化
- FileSidebar 和 LeftNav 的进度统计排除已忽略条目

### LeftNav 进度

- LeftNav 显示四个维度的进度：术语翻译、术语审核、条目翻译、条目审核
- 翻译编辑界面不再显示总体进度（已移至 LeftNav）

## IPC 处理器架构

- IPC 处理器从 `main.js` 拆分至 `electron/ipc/` 目录下的独立模块
- 每个模块导出 `register(ctx)` 函数，接收共享上下文对象（类型 `IPCContext`，定义在 `types/ipc.ts`）
- 共享上下文 `ctx` 包含：`getMainWindow()`、`glossaryManager`、`translationService`、`projectManager`、`configManager`、`legacyTranslationService`、`parseModFolder`、`exportMod`
- 新增 IPC 处理器时，在对应模块中添加，并在 `main.ts` 中注册

## 内置默认词库

- 词库文件：`electron/data/default_glossary.json`，首次运行时复制到 `config/builtin_glossary.json` 供用户编辑
- 词库格式：JSON 数组，每项 `{ source, target, category }`
- 分类：势力名称、舰船名称、武器名称、物品名称、游戏术语、地名、人名、其他
- 当前共 1278 条词条，来源为游戏原版英文/中文资源文件对照提取（`example/vanilla_en` 与 `example/vanilla_cn`）
- 提取覆盖范围（按优先级）：
  - `.faction` 文件（势力显示名、舰队类型名、职阶名），提取势力名使用 `forceSet` 确保 `.faction` 文件中的翻译优先于 CSV 中的翻译
  - `default_ranks.json`、`default_fleet_type_names.json`（军衔、舰队类型）
  - `ship_data.csv`（舰船名称、级别、科技派系）、`.skin` 文件（变体舰船名、科技派系覆盖）
  - `weapon_data.csv`（武器名称、角色描述）、`wing_data.csv`（联队描述）
  - `hull_mods.csv`（船体插件名称及 D-mod 名称）
  - `ship_systems.csv`（舰船系统名称）、`skill_data.csv`（技能名称）
  - `commodities.csv`、`industries.csv`、`special_items.csv`、`abilities.csv`、`market_conditions.csv`、`submarkets.csv`、`sim_opponents.csv`、`personalities.csv`
  - `config/` 目录下的 JSON 文件（行星类型、战斗目标、联络人标签、情报标签等）
  - `strings/strings.json`、`strings/tooltips.json`（UI 短字符串）
- 如需更新词库，可参照 `example/` 目录中英文/中文对照文件重新提取

# 作业规范

每次修改完后，应当更新本文件中的内容，使其反映所做的修改，帮助协作者快速了解项目结构和约定。
