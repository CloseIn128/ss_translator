# 🚀 远行星号 MOD 翻译工具 (SS Translator)

基于 Electron + React 的 Starsector（远行星号）MOD 翻译桌面工具，支持 AI 辅助翻译、名词库管理、翻译润色等功能。

## 功能特性

- **MOD 文件自动解析**：自动识别并提取 MOD 中所有可翻译文本
  - CSV 文件：`descriptions.csv`、`ship_data.csv`、`weapon_data.csv`、`hull_mods.csv`、`industries.csv`、`rules.csv` 等
  - JSON 文件：`.faction`、`.ship`、`.skin`、`tips.json`、`ship_names.json`
  - `mod_info.json` 元数据
  - `rules.csv` 中的 `AddText` 对话文本
- **AI 辅助翻译**：接入 OpenAI / DeepSeek / 任意 OpenAI 兼容 API
  - 批量翻译 & 单条翻译
  - 自动注入名词库到提示词
  - 保留变量占位符（`$player.name`、`%s` 等）
- **翻译润色**：基于 AI 对已翻译文本进行二次润色优化
- **名词库管理**：维护术语对照表，确保翻译一致性
  - 支持分类管理（势力名称、舰船名称、武器名称等）
  - CSV 导入/导出
- **翻译项目管理**：保存/加载翻译进度（`.sst` 项目文件）
- **MOD 导出**：将翻译写回 MOD 文件，输出完整的翻译版 MOD

## 技术栈

- **框架**：Electron + Vite + React
- **UI 组件库**：Ant Design (暗色主题)
- **包管理**：pnpm
- **AI API**：OpenAI-compatible (fetch)

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

这会同时启动 Vite 开发服务器和 Electron 应用。

### 生产构建

```bash
pnpm build     # 构建前端
pnpm start     # 启动 Electron（加载 dist/）
```

### 打包分发

```bash
pnpm dist      # 构建前端 + 打包 Electron 安装程序
```

## 项目结构

```
ss_translator/
├── electron/                 # Electron 主进程
│   ├── main.js              # 主进程入口 & IPC 处理
│   ├── preload.js           # 预加载脚本（IPC 桥接）
│   └── services/
│       ├── modParser.js     # MOD 文件解析器（核心）
│       ├── relaxedJson.js   # Starsector 宽松 JSON 解析器
│       ├── csvParser.js     # CSV 解析/序列化
│       ├── translator.js    # AI 翻译服务
│       ├── glossary.js      # 名词库管理
│       ├── project.js       # 项目管理
│       ├── exporter.js      # MOD 导出
│       └── uuid.js          # UUID 生成工具
├── src/                      # React 前端
│   ├── main.jsx             # React 入口
│   ├── App.jsx              # 根组件 & 状态管理
│   ├── index.css            # 全局样式
│   └── components/
│       ├── Header.jsx       # 顶部导航栏
│       ├── Sidebar.jsx      # 侧边栏（文件列表 & 进度）
│       ├── WelcomePage.jsx  # 欢迎页
│       ├── TranslationEditor.jsx  # 翻译编辑器（核心 UI）
│       ├── GlossaryPanel.jsx      # 名词库管理面板
│       └── SettingsPanel.jsx      # AI 设置面板
├── index.html               # HTML 入口
├── vite.config.js           # Vite 配置
└── package.json
```

## 使用流程

1. 启动应用，点击「打开MOD文件夹」选择要翻译的 MOD
2. 在「设置」面板配置 AI API（API Key、模型等）
3. 在「名词库」面板添加专有名词对照（可选但推荐）
4. 在「翻译编辑」面板进行翻译：
   - 点击条目右侧按钮进行 AI 单条翻译
   - 使用「批量翻译」翻译所有未翻译条目
   - 使用「批量润色」优化已翻译文本
   - 点击译文区域可手动编辑
5. 随时保存项目进度
6. 翻译完成后点击「导出」生成翻译版 MOD

## 支持的 AI 服务

| 服务商 | API 地址 | 推荐模型 |
|--------|---------|---------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` |
| 自定义 | 任意 OpenAI 兼容端点 | - |

