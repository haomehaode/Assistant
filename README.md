# AI 浏览器任务助手

一个完全由AI驱动的Chrome扩展，能够将自然语言任务转换为具体的浏览器操作步骤并自动执行。系统采用多智能体架构，具备强大的变化感知和自适应能力。

## ✨ 功能特性

### 🤖 完全AI驱动
- **多智能体架构**：任务规划、执行、监督三大AI智能体协同工作
- **变化感知**：AI能够感知页面变化并判断操作成功与否
- **智能决策**：完全由AI自主判断任务进度和完成状态
- **无硬编码限制**：移除所有迭代次数和重试限制，AI完全自主控制

### 🌐 智能浏览器自动化
- **智能页面分析**：基于CDP协议分析页面结构和元素
- **多操作支持**：点击、输入、搜索、滚动、导航等
- **动态适应**：根据页面变化自动调整执行策略
- **故障驱动监督**：执行失败时监督智能体自动介入分析和重新规划

### 🎯 核心能力
- **搜索操作**：在任意网站进行搜索和筛选
- **表单填写**：自动填写各种表单字段
- **页面导航**：智能跳转和页面切换
- **信息提取**：从页面中提取所需信息
- **多步骤任务**：支持复杂的多步骤操作流程
- **智能错误恢复**：AI分析失败原因并动态调整策略

## 🚀 快速开始

### 安装步骤

1. **下载扩展**
   ```bash
   git clone <repository-url>
   cd Assistant
   ```

2. **加载到Chrome**
   - 打开Chrome浏览器
   - 访问 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

3. **配置AI服务**
   - 点击扩展图标，选择"选项"
   - 填写API配置信息：
     - API URL：您的AI服务地址
     - API Key：您的API密钥
     - Model：使用的模型名称

### 使用方法

1. **打开侧边栏**
   - 在任意网页上点击扩展图标
   - 或使用快捷键打开侧边栏

2. **输入任务**
   - 在文本框中输入自然语言描述的任务
   - 例如："在淘宝搜索无线降噪耳机并筛选价格在500-1000元的"

3. **执行任务**
   - 点击"执行"按钮
   - 观察实时执行日志
   - 等待任务完成

## 📁 项目结构

```
Assistant/
├── manifest.json          # 扩展配置文件
├── sidepanel.html         # 侧边栏界面
├── sidepanel.js           # 侧边栏逻辑
├── content.js             # 内容脚本（注入与消息桥接）
├── background.js          # 后台脚本（CDP 获取页面信息与执行动作）
├── options.html           # 配置页面
├── options.js             # 配置逻辑
├── config.js              # 配置管理器
├── ai_service.js          # AI服务接口
├── smart_executor.js      # 智能执行器
└── icons/                 # 图标资源
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🔧 技术架构

### AI智能体系统

#### 🤖 三大AI智能体
- **任务规划智能体**：分析用户任务并生成结构化规划
- **执行智能体**：分析页面状态和执行历史，生成下一步指令
- **监督智能体**：分析失败原因并重新规划任务

#### 🔧 工具组件
- **ConfigManager**：统一配置管理
- **Background(CDP)**：通过 `background.js` 使用 CDP 提供页面信息与动作
- **SmartExecutor**：单类负责编排与执行（内置执行逻辑与统计）

### 运行逻辑概览

1. 侧边栏/其它入口发起任务
   - 发送 `EXEC_SMART_TASK` 到扩展。
2. 后台转发到页面侧执行
   - `background.js` 等待 `content.js` 就绪后，将任务消息转发给当前页的内容脚本。
3. 内容脚本注入与桥接
   - `content.js` 注入 `config.js`、`ai_service.js`、`smart_executor.js`，实例化并复用 `SmartExecutor`，接收 `EXEC_SMART_TASK`/`STOP_EXECUTION`/`PING`。
4. 智能编排与执行（页面侧）
   - `SmartExecutor` 调用 `getPageInfoFromBackground()` 获取页面快照（URL/标题/viewport/过滤后的 DOM）。
   - 调用 `ai_service.getExecutionInstructions(...)` 生成下一步动作；
   - 执行动作时发送 `EXECUTE_ACTION` 给 `background.js`，由 CDP 在真实页面执行（点击/输入/滚动/导航/提取等）。
   - 每步后再次取 `GET_PAGE_INFO`，基于变化继续迭代，直至 `completed` 或被停止。
5. 日志与结果
   - 执行中通过 `EXECUTION_LOG` 推送到侧边栏进行展示；最终返回迭代次数与执行统计。

### 消息与数据流

- 侧边栏 → 后台：`EXEC_SMART_TASK`
- 后台 → 内容脚本：`EXEC_SMART_TASK`（转发）
- 内容脚本 ↔ 智能执行器：函数调用（同页）
- 智能执行器 → 后台：`GET_PAGE_INFO`、`EXECUTE_ACTION`
- 后台 ↔ CDP：`Page.*`、`DOM.*`、`Input.*` 等命令
- 智能执行器 → 侧边栏：`EXECUTION_LOG`（实时日志）

### 工作流程

1. **任务接收**：用户输入自然语言任务
2. **任务规划智能体**：AI分析任务并生成结构化规划
3. **页面分析**：获取当前页面的CDP格式信息
4. **执行智能体**：AI分析页面变化和执行历史，生成具体操作指令
5. **指令执行**：由 `SmartExecutor` 通过后台 CDP 执行具体操作
6. **变化感知**：AI对比页面变化判断操作成功与否
7. **监督智能体**：失败时AI分析原因并重新规划
8. **智能决策**：AI自主判断任务完成状态

## 🛠️ 开发指南

### 环境要求

- Chrome浏览器（支持Manifest V3）
- 现代JavaScript环境
- AI服务API（支持OpenAI兼容接口）

### 本地开发

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd Assistant
   ```

2. **修改配置**
   - 编辑 `config.js` 中的默认配置
   - 或通过扩展选项页面配置

3. **调试模式**
   - 在Chrome扩展管理页面启用"开发者模式"
   - 使用Chrome DevTools调试

### 自定义开发

- **添加新操作**：在 `background.js` 的 `executeActionViaCDP` 中添加新的动作类型
- **扩展AI智能体**：在 `ai_service.js` 中修改智能体的提示词和行为
- **优化页面分析**：修改 `background.js` 的 `getPageInfo` 逻辑
- **调整执行流程**：修改 `smart_executor.js` 中的编排与执行逻辑

### AI智能体定制

- **任务规划智能体**：修改 `buildPlanFromPrompt` 方法的提示词
- **执行智能体**：修改 `getExecutionInstructions` 方法的判断逻辑
- **监督智能体**：修改 `analyzeFailureAndRevise` 方法的分析策略

## 📝 使用示例

### 电商购物
```
在京东搜索"MacBook Pro"，筛选价格在10000-15000元，按销量排序
```

### 信息收集
```
在知乎搜索"人工智能发展趋势"，提取前5个回答的标题和摘要
```

### 表单填写
```
在招聘网站填写简历信息，包括姓名、邮箱、工作经历等
```

### 多步骤操作
```
打开百度，搜索"今日天气"，然后打开天气网站查看详细预报
```

## ⚠️ 注意事项

- 请确保在合法合规的网站上进行自动化操作
- 某些网站可能有反爬虫机制，请合理使用
- 建议在测试环境中先验证任务执行效果
- 定期更新AI服务配置以确保最佳性能
- AI智能体完全自主决策，请监控执行过程
- 系统无硬编码限制，AI会根据实际情况调整策略

## 🤝 贡献指南

欢迎提交Issue和Pull Request来改进这个项目！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者和用户！

---

**版本**: 0.2.0  
**最后更新**: 2024年12月  
**架构**: 完全AI驱动的多智能体系统
