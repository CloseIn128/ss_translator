本文件用于向协作者（包括 Copilot 等辅助工具）简要说明本仓库的主要功能模块、关键约定和开发规范。请在功能发生较大调整或新增重要模块时，补充或修改对应小节的说明，使其始终与当前代码保持一致。
如需增加新的功能模块，请比照"功能A/功能B"的结构补充相应小节，并使用清晰的中文描述实际业务含义和约束条件，而不要保留占位符性质的说明。

# 项目结构

## 关键词提取 (KeywordExtractor)

### 功能

- 统一关键词提取通过 `keywords:extractAll` IPC，以流式批次（`keywords:batch`）发送结果到渲染进程
- 结构化提取先运行（基于 MOD 文件字段名），随后 AI 提取增量更新
- 提取结果只包含原文和分类，不提供翻译（`target` 始终为空）
- 翻译为独立步骤，通过 `keywords:translate` 进行，人名和星球/星系名不翻译
- 提取时自动过滤内置术语库和项目术语库中已有的词条

### 规范

- AI 提取提示词存储在 `config/model_config.json` 的 `keywordPrompt` 字段
- 分类可选值：势力名称、舰船名称、武器名称、人名、星球/星系名、游戏术语、物品名称、其他
- 操作内置术语库数据时需做防御性校验（`typeof source === 'string'`），避免格式异常导致崩溃

## AI 翻译 (TranslationService)

### 功能

- 批量翻译条目（`translateBatch`），支持传入术语表辅助
- 润色已有翻译（`polish`）
- 关键词翻译（`translateKeywords`），人名/星球名类别自动跳过

### 规范

- 提示词通过 `ConfigManager` 持久化，包括 `systemPrompt`、`polishPrompt`、`keywordPrompt`
- `_ensureModelConfigComplete()` 在启动时自动迁移补全缺失字段
- 后端文件（`electron/`）不经过 Vite 构建，修改后需用 `node -e "require('./electron/services/xxx.js')"` 验证语法

# 构建与运行

- 安装依赖：`npm install`
- 开发模式：`pnpm dev`
- 前端构建：`npx vite build`
- 无自动化测试套件

# 作业规范

每次修改完后，应当更新本文件中的内容，使其反映所做的修改，帮助协作者快速了解项目结构和约定。
