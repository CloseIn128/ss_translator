本文件用于向协作者（包括 Copilot 等辅助工具）简要说明本仓库的主要功能模块、关键约定和开发规范。请在功能发生较大调整或新增重要模块时，补充或修改对应小节的说明，使其始终与当前代码保持一致。
如需增加新的功能模块，请比照"功能A/功能B"的结构补充相应小节，并使用清晰的中文描述实际业务含义和约束条件，而不要保留占位符性质的说明。

# 项目结构

## 目录结构

```
├── electron/                     # Electron 主进程（Node.js，CJS 模块）
│   ├── main.js                   # 应用入口，窗口创建与服务初始化
│   ├── preload.js                # 预加载脚本，暴露 IPC API
│   ├── ipc/                      # IPC 处理器模块
│   │   ├── dialogHandlers.js     # 对话框（文件夹选择等）
│   │   ├── projectHandlers.js    # 项目管理（创建/保存/加载）
│   │   ├── glossaryHandlers.js   # 术语库（项目 + 公共词库）
│   │   ├── aiHandlers.js         # AI 翻译配置与调用
│   │   ├── exportHandlers.js     # MOD 导出
│   │   ├── keywordHandlers.js    # 关键词提取与翻译
│   │   └── notificationHandlers.js # 系统通知
│   ├── services/                 # 业务逻辑服务
│   │   ├── configManager.js      # 配置持久化
│   │   ├── translator.js         # AI 翻译服务
│   │   ├── modParser.js          # MOD 文件解析
│   │   ├── glossary.js           # 术语库管理
│   │   ├── project.js            # 项目文件管理
│   │   ├── exporter.js           # 翻译导出
│   │   ├── csvParser.js          # CSV 解析/序列化
│   │   ├── relaxedJson.js        # Starsector 宽松 JSON 解析
│   │   └── uuid.js               # UUID 生成
│   └── data/
│       └── default_glossary.json # 内置默认词库
├── src/                          # React 前端（ESM，Vite 构建）
│   ├── App.jsx                   # 应用根组件
│   ├── main.jsx                  # 入口
│   ├── index.css                 # 全局样式
│   └── components/
│       ├── context/
│       │   └── TaskContext.jsx    # 任务管理与日志上下文
│       ├── layout/
│       │   ├── LeftNav.jsx       # 左侧导航栏
│       │   ├── LogPanel.jsx      # 日志面板
│       │   └── BottomBar.jsx     # 底部状态栏
│       └── pages/
│           ├── WelcomePage.jsx        # 欢迎页
│           ├── TranslationEditor.jsx  # 翻译编辑页
│           ├── GlossaryPanel.jsx      # 词库管理页
│           ├── KeywordExtractor.jsx   # 关键词提取页
│           └── SettingsPanel.jsx      # 模型配置页
└── tests/                        # 自动化测试（vitest）
    └── electron/services/        # 后端服务单元测试
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
- 系统通知通过 `app:notify` IPC 调用 Electron 的 `Notification` API，在 `preload.js` 中暴露为 `sendNotification(title, body)`

## 关键词提取 (KeywordExtractor)

### 功能

- 统一关键词提取通过 `keywords:extractAll` IPC，以流式批次（`keywords:batch`）发送结果到渲染进程
- 结构化提取先运行（基于 MOD 文件字段名），随后 AI 提取增量更新
- 提取结果只包含原文和分类，不提供翻译（`target` 始终为空）
- 翻译为独立步骤，通过 `keywords:translate` 进行，人名和星球/星系名不翻译
- 提取时自动过滤内置术语库和项目术语库中已有的词条
- 提取和翻译操作均受任务管理系统约束，执行期间不可启动其他任务

### 规范

- AI 提取提示词存储在 `config/model_config.json` 的 `keywordPrompt` 字段
- 分类可选值：势力名称、舰船名称、武器名称、人名、星球/星系名、游戏术语、物品名称、其他
- 操作内置术语库数据时需做防御性校验（`typeof source === 'string'`），避免格式异常导致崩溃

## AI 翻译 (TranslationService)

### 功能

- 批量翻译条目（`translateBatch`），支持传入术语表辅助
- 润色已有翻译（`polish`）
- 关键词翻译（`translateKeywords`），人名/星球名类别自动跳过
- 批量翻译和批量润色操作受任务管理系统约束，执行期间不可启动其他任务
- 单条翻译/润色不占用任务槽位，可随时执行

### 规范

- 提示词通过 `ConfigManager` 持久化，包括 `systemPrompt`、`polishPrompt`、`keywordPrompt`
- `_ensureModelConfigComplete()` 在启动时自动迁移补全缺失字段
- 后端文件（`electron/`）不经过 Vite 构建，修改后需用 `node --check ./electron/xxx.js` 验证语法
- `ai:configure` IPC 处理器中，若前端传入空 `apiKey`，会自动从磁盘配置中恢复已保存的密钥，避免设置面板保存时意外清空内存中的 API Key
- 批量翻译/润色的确认对话框（`Modal.confirm`）的 `onOk` 不返回 Promise，以确保对话框立即关闭，翻译任务在后台异步执行

# 界面布局

```
┌──────────────────────────────────────────────────────┐
│  LeftNav  │              app-content                 │
│  (侧边栏)  │  (TranslationEditor / GlossaryPanel /  │
│           │   KeywordExtractor / SettingsPanel)      │
│           │                                          │
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

- 字体大小状态由 `App.jsx` 的 `AppInner` 组件管理，通过 props 传递给 `SettingsPanel`
- `localStorage` key：`ss_translator_app_font_size`、`ss_translator_log_font_size`
- 默认值：程序 13px，日志 12px；程序范围 10-24px，日志范围 8-20px

# 构建与运行

- 安装依赖：`npm install`
- 开发模式：`pnpm dev`
- 前端构建：`npx vite build`
- 语法检查后端文件：`node --check electron/main.js`
- 运行测试：`npm test`（或 `npx vitest run`）
- 监听模式测试：`npm run test:watch`（或 `npx vitest`）

## 自动化测试

- 测试框架：vitest（与 Vite 原生集成）
- 测试文件位于 `tests/` 目录，与源码目录结构对应
- 后端服务测试使用 ESM 语法 + `createRequire` 导入 CJS 模块
- vitest 配置在 `vite.config.js` 的 `test` 字段中，已启用 `globals: true`
- 新增后端服务或修改逻辑后，应在 `tests/electron/services/` 下编写或更新对应测试
- 开发完成后需执行 `npm test` 确保所有测试通过

## IPC 处理器架构

- IPC 处理器从 `main.js` 拆分至 `electron/ipc/` 目录下的独立模块
- 每个模块导出 `register(ctx)` 函数，接收共享上下文对象
- 共享上下文 `ctx` 包含：`getMainWindow()`、`glossaryManager`、`translationService`、`projectManager`、`configManager`、`parseModFolder`、`exportMod`
- 新增 IPC 处理器时，在对应模块中添加，并在 `main.js` 中注册

# 作业规范

每次修改完后，应当更新本文件中的内容，使其反映所做的修改，帮助协作者快速了解项目结构和约定。
