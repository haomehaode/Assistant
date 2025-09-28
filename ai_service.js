// 统一AI服务：处理所有与大模型的交互
class AIService {
  constructor() {
    this.apiUrl = '';
    this.apiKey = '';
    this.model = '';
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  // 初始化配置
  async init() {
    const settings = await configManager.getAPIConfig();
    this.apiUrl = settings.apiUrl;
    this.apiKey = settings.apiKey;
    this.model = settings.model;
  }

  // 通用AI调用方法
  async callAI(messages, options = {}) {
    const defaultOptions = {
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 0.5,
      top_k: 0,
      repetition_penalty: 1.05,
      num_beams: 1,
      stream: false,
      user: 'browser-user'
    };

    const requestBody = {
      model: this.model,
      messages: messages,
      ...defaultOptions,
      ...options
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = (((data || {}).choices || [])[0] || {}).message?.content || '';
    
    return content;
  }

  // 解析AI响应中的JSON
  parseJSONResponse(response) {
    try {
      console.log('AI原始响应:', response);
      
      // 尝试提取JSON代码块
      const jsonMatch = response.match(/```(?:json)?\n([\s\S]*?)\n```/i);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      
      console.log('提取的JSON字符串:', jsonStr);
      
      const parsed = JSON.parse(jsonStr);
      console.log('解析后的数据:', parsed);
      
      return parsed;
    } catch (error) {
      console.error('解析AI响应失败:', error);
      console.log('原始响应:', response);
      throw new Error(`JSON解析失败: ${error.message}`);
    }
  }

  // 意图识别
  async detectIntent(prompt) {
    const system = `你是一个优秀的意图识别专家。请阅读用户任务描述，仅输出精简JSON，包含：任务类型数组。
说明：
- 任务类型从以下集合中选择，且可以是多个：
["general","analysis","code","image","browser_use","other"]
任务类型说明（帮助你更准确判断）：
- general: 普通问答/解释，少步骤、无需外部工具
- analysis: 归纳、对比、评估、做结论（通常需要多来源信息）
- code: 生成代码
- image: 生成图片/图像等非代码内容
- translation: 多语言翻译/润色
- browser_use: 智能浏览器自动化（导航、提取、交互、表单、登录、筛选、下单、截图等）
- other: 其他类型

输出要求：
- 仅输出合法JSON，不要输出任何解释、注释或markdown标记。
- 字段与格式：
  {
    "task_types": ["browser_use"],
  }

决策准则（强而克制地使用浏览器）：
1) 触发"browser_use"（满足≥1条即可）：
   - 需要最新/动态/在售/库存/价格/是否发布/时效事实
   - 需要网页交互：登录/表单/筛选/下单/分页/滚动/点击/下载
   - 需要网页结构化提取、多页浏览、站内搜索、指定站点信息
   - 用户明确要求"上网/打开网站/网页操作/在某网站搜索/访问URL"
2) 抑制（命中任一则不加入"browser_use"）：
   - 纯静态常识或定义可高置信直接回答
   - 与时间无关且不需权威出处
   - 历史对话已给出且仍然有效的权威答案`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ];

    try {
      const response = await this.callAI(messages, {
        temperature: 0.9,
        max_tokens: 256
      });
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error('意图识别失败:', error);
      return { task_types: [] };
    }
  }

  // 任务规划
  async buildPlanFromPrompt(prompt) {
    const system = `你是一个专业的浏览器自动化任务编排专家。请将复杂任务拆解为具体的浏览器操作子任务。
请以JSON格式返回拆解结果，格式如下：
{
    "name": "任务名称",
    "description": "任务详细描述",
    "sub_tasks": [
        {
            "name": "子任务名称",
            "description": "子任务详细描述",
            "browser_task": {
                "tool_name": "工具名称",
                "parameters": {
                    "参数名": "参数值"
                }
            },
            "web_content_tasks": ["页面内元素与内容操作（字符串数组）"],
            "dependencies": ["依赖的子任务名称"]
        }
    ]
}

可执行要求：
- browser_task：必须使用下方工具列表中的工具，格式为对象包含 tool_name 和 parameters
- web_content_tasks：通用自然语言描述，禁止带有具体选择器和属性

可用工具：
1. open_tab: 打开新标签页，参数: url (string) - 新标签页URL
2. close_tab: 关闭标签页，参数: tab_id (array of integers) - 需要关闭的标签页ID
3. query_tab: 查询当前标签页信息，参数: 无

重要规则（必须严格遵守）：
1. 单站点任务：如果任务只涉及1个网站，只能有1个子任务，所有网页操作都写在web_content_tasks中
2. 多站点任务：如果任务涉及多个网站，每个网站1个子任务，通过dependencies控制执行顺序
3. 网页操作：网页内的所有操作（搜索、点击、输入、滚动、提取、分析、总结、生成内容等）步骤都必须写在web_content_tasks中，不能拆分成多个子任务
4. 禁止拆分：同一个网站内的所有操作必须合并到一个子任务中，不能因为操作步骤多而拆分成多个子任务
5. 内容生成：如果任务包含内容生成（如生成攻略、分析报告等），这些操作也必须写在web_content_tasks中，不能单独成子任务`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ];

    try {
      const response = await this.callAI(messages, {
        temperature: 0.9,
        max_tokens: 2048
      });
      return this.parseJSONResponse(response);
    } catch (error) {
      console.error('任务规划失败:', error);
      throw new Error(`计划解析失败: ${error.message}`);
    }
  }

  // 获取执行指令
  async getExecutionInstructions(pageInfo, previousResults = [], originalTaskPlan = null) {
    // 从原始任务规划中提取web_content_tasks
    if (originalTaskPlan && originalTaskPlan.sub_tasks && originalTaskPlan.sub_tasks.length > 0) {
      const webContentTasks = originalTaskPlan.sub_tasks[0].web_content_tasks || [];
      
      const systemPrompt = `你是一个智能执行器。请根据当前页面状态和执行历史，决定下一步要做什么。

## 任务规划（包含web_content_tasks）：
${JSON.stringify(originalTaskPlan, null, 2)}

## 执行历史（包含页面变化）：
${JSON.stringify(previousResults, null, 2)}

## 当前页面信息（仅可视区域）：
${JSON.stringify(pageInfo, null, 2)}

## 重要说明：
- 当前提供的页面信息仅包含可视区域内的元素
- 如果找不到需要的元素，可以请求滚动页面来查看更多内容
- 页面信息包含viewport信息，显示当前滚动位置和可滚动范围
- 执行历史中包含了每次操作的页面变化信息（pageInfoBefore 和 instruction）
- 请通过对比执行历史中上一次的页面信息（pageInfoBefore）和当前页面信息，判断上次指令是否成功
- 分析执行历史，确定当前执行到了任务规划的哪一步
- 判断标准：
  * 如果页面URL、标题、内容有明显变化，说明上次指令成功
  * 如果页面没有变化，说明上次指令失败，需要重新尝试
- 示例：
  * 点击搜索按钮成功：URL从 "https://www.baidu.com" 变为 "https://www.baidu.com/s?wd=关键词"
  * 输入文本成功：输入框的value值发生变化
  * 滚动成功：viewport的scrollY值发生变化
  * 导航成功：URL完全改变
- 只有上次指令成功，才能规划下一步指令
- 如果上次指令失败，需要重新尝试或调整策略
- 如果任务已完成，返回 completed: true

## 执行指令格式：
{
  "action": "动作类型",
  "description": "动作描述",
  "target": "CDP nodeid（纯数字字符串）",
  "value": "输入值（仅input动作需要）",
  "wait": "等待时间(毫秒)",
  "url": "导航URL（仅navigate动作需要）",
  "completed": true/false
}

## 支持的动作类型：
- "search": 搜索（输入+回车） - 需要target和value字段，自动按回车搜索
- "click": 点击元素 - 需要target字段
- "input": 输入文本 - 需要target和value字段，仅输入不搜索
- "wait": 等待 - 需要wait字段
- "scroll_page_down": 向下滚动一页 - 无需额外参数
- "scroll_page_up": 向上滚动一页 - 无需额外参数
- "navigate": 导航 - 需要url字段
- "extract": 提取信息 - 需要target字段

## 滚动策略：
- 如果当前可视区域没有找到目标元素，必须使用scroll_page_down向下滚动一页
- 如果需要返回查看之前的内容，使用scroll_page_up向上滚动一页
- 滚动后系统会自动更新页面信息，包含新可视区域的内容

## CDP分析要求：
1. 从CDP DOM树中找到合适的元素，使用其nodeId字段
2. 确保nodeid对应的是可见且可操作的元素
3. 必须使用CDP nodeid作为target，格式为纯数字字符串
4. 分析页面文本内容，理解页面功能和可操作区域
5. 如果之前的执行失败了，分析失败原因并调整策略

## 重要限制：
- 禁止使用CSS选择器（如document.querySelector）
- 必须使用CDP nodeid进行元素操作
- 优先使用click、input等基础动作
- 如果找不到目标元素，优先尝试滚动而不是放弃

请分析当前状态并决定下一步操作：`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请分析当前状态并决定下一步操作' }
      ];

      try {
        const response = await this.callAI(messages);
        const instruction = this.parseJSONResponse(response);
        
        // 验证必要字段
        if (!instruction.action && !instruction.completed) {
          throw new Error('响应中缺少action字段或completed字段');
        }
        
        return instruction;
      } catch (error) {
        console.error('获取执行指令失败:', error);
        throw new Error(`获取执行指令失败: ${error.message}`);
      }
    }
    
    // 如果没有任务规划，抛出错误
    throw new Error('缺少任务规划，无法生成执行指令');
  }

  // 监督智能体：分析失败并直接给出解决方案
  async analyzeFailureAndProvideSolution(executionRecord, pageInfo, originalTaskPlan, executionResults) {
    const system = `你是一个执行故障分析和解决方案专家。请分析执行失败的原因，并直接提供解决方案。

## 执行错误信息：
- 指令: ${executionRecord.instruction ? JSON.stringify(executionRecord.instruction, null, 2) : '无指令（异常）'}
- 操作前页面: ${executionRecord.pageInfoBefore ? '已提供' : '无'}

## 当前页面内容（完整信息）：
${JSON.stringify(pageInfo, null, 2)}

## 原始任务规划：
${JSON.stringify(originalTaskPlan, null, 2)}

## 执行历史（包含页面变化）：
${JSON.stringify(executionResults, null, 2)}

请分析错误原因并输出JSON格式：
{
  "failureType": "元素找不到|页面变化|操作顺序|其他",
  "reason": "具体错误原因分析",
  "solution": "解决方案描述",
  "action": "下一步动作类型",
  "description": "动作描述",
  "target": "CDP nodeid（纯数字字符串）",
  "value": "输入值（仅input动作需要）",
  "wait": "等待时间(毫秒)",
  "url": "导航URL（仅navigate动作需要）",
  "completed": true/false,
  "needReplan": true/false,
  "revisedPlan": {
    "name": "任务名称",
    "description": "任务详细描述", 
    "sub_tasks": [...]
  }
}

## 支持的动作类型：
- "search": 搜索（输入+回车） - 需要target和value字段，自动按回车搜索
- "click": 点击元素 - 需要target字段
- "input": 输入文本 - 需要target和value字段，仅输入不搜索
- "wait": 等待 - 需要wait字段
- "scroll_page_down": 向下滚动一页 - 无需额外参数
- "scroll_page_up": 向上滚动一页 - 无需额外参数
- "navigate": 导航 - 需要url字段
- "extract": 提取信息 - 需要target字段

重要说明：
- 仔细分析页面内容，找出为什么元素找不到
- 执行历史中包含了每次操作的页面变化信息（pageInfoBefore 和 instruction）
- 通过对比执行历史中上一次的页面信息（pageInfoBefore）和当前页面信息，判断操作是否真的失败了
- 分析执行历史，确定当前执行到了任务规划的哪一步
- 直接提供下一步的执行指令，不要只分析不行动
- 如果需要重新规划任务，同时提供新的规划和下一步指令
- 如果任务已完成，返回 completed: true`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: '请分析失败原因并直接提供解决方案' }
    ];

    try {
      const response = await this.callAI(messages);
      const result = this.parseJSONResponse(response);
      
      // 确保返回格式正确
      return {
        failureType: result.failureType || 'unknown',
        reason: result.reason || '分析失败',
        solution: result.solution || '重试当前步骤',
        action: result.action || null,
        description: result.description || null,
        target: result.target || null,
        value: result.value || null,
        wait: result.wait || null,
        url: result.url || null,
        completed: result.completed || false,
        needReplan: result.needReplan || false,
        revisedPlan: result.revisedPlan || null
      };
    } catch (error) {
      console.error('故障分析和解决方案生成失败:', error);
      return {
        failureType: 'unknown',
        reason: '分析失败',
        solution: '重试当前步骤',
        action: null,
        description: null,
        target: null,
        value: null,
        wait: null,
        url: null,
        completed: false,
        needReplan: false,
        revisedPlan: null
      };
    }
  }

  // 根据任务类型回答用户问题
  async answerUserQuestion(question, taskTypes = []) {
    // 根据任务类型选择相应的回答方法
    if (taskTypes.includes('code')) {
      return await this.answerCodeQuestion(question);
    } else if (taskTypes.includes('analysis')) {
      return await this.answerAnalysisQuestion(question);
    } else if (taskTypes.includes('image')) {
      return await this.answerImageQuestion(question);
    } else if (taskTypes.includes('translation')) {
      return await this.answerTranslationQuestion(question);
    } else {
      return await this.answerGeneralQuestion(question);
    }
  }

  // 普通问答/解释
  async answerGeneralQuestion(question) {
    const system = `你是一个智能助手，能够回答各种问题。请根据用户的问题提供准确、有用、详细的回答。

回答要求：
- 提供准确、有用的信息
- 回答要详细但不过于冗长
- 如果涉及专业领域，请提供专业且易懂的解释
- 如果问题需要最新信息，请说明你的知识截止时间
- 如果无法确定答案，请诚实说明并提供可能的解决方向

请用中文回答用户的问题。`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: question }
    ];

    try {
      const response = await this.callAI(messages, {
        temperature: 0.7,
        max_tokens: 2048
      });
      return response;
    } catch (error) {
      console.error('回答普通问题失败:', error);
      throw new Error(`回答失败: ${error.message}`);
    }
  }

  // 代码生成/编程问题
  async answerCodeQuestion(question) {
    const system = `你是一个专业的编程助手，擅长各种编程语言和技术栈。请根据用户的问题提供准确的代码解决方案。

回答要求：
- 提供完整、可运行的代码示例
- 包含必要的注释和说明
- 解释代码的工作原理
- 如果涉及多种语言，优先使用最合适的语言
- 提供最佳实践和注意事项
- 如果代码较长，提供分步骤的说明

请用中文回答，代码部分保持原语言。`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: question }
    ];

    try {
      const response = await this.callAI(messages, {
        temperature: 0.3,
        max_tokens: 3072
      });
      return response;
    } catch (error) {
      console.error('回答代码问题失败:', error);
      throw new Error(`代码回答失败: ${error.message}`);
    }
  }

  // 分析/归纳/对比/评估问题
  async answerAnalysisQuestion(question) {
    const system = `你是一个专业的分析专家，擅长归纳、对比、评估和做结论。请根据用户的问题提供深入的分析和见解。

回答要求：
- 提供结构化的分析框架
- 从多个角度进行分析
- 提供数据支撑和逻辑推理
- 给出明确的结论和建议
- 如果涉及对比，提供详细的对比分析
- 如果涉及评估，提供客观的评估标准

请用中文回答，保持专业性和客观性。`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: question }
    ];

    try {
      const response = await this.callAI(messages, {
        temperature: 0.5,
        max_tokens: 2560
      });
      return response;
    } catch (error) {
      console.error('回答分析问题失败:', error);
      throw new Error(`分析回答失败: ${error.message}`);
    }
  }

  // 图像/图片生成问题
  async answerImageQuestion(question) {
    const system = `你是一个专业的图像处理助手，擅长图像生成、编辑和设计。请根据用户的问题提供专业的图像相关建议。

回答要求：
- 提供详细的图像生成或处理建议
- 描述图像的具体特征和要求
- 推荐合适的工具和技术
- 提供实现步骤和注意事项
- 如果涉及AI图像生成，提供详细的提示词建议
- 考虑图像的质量、风格、尺寸等技术细节

请用中文回答，提供实用的建议。`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: question }
    ];

    try {
      const response = await this.callAI(messages, {
        temperature: 0.6,
        max_tokens: 2048
      });
      return response;
    } catch (error) {
      console.error('回答图像问题失败:', error);
      throw new Error(`图像回答失败: ${error.message}`);
    }
  }

  // 翻译/润色问题
  async answerTranslationQuestion(question) {
    const system = `你是一个专业的翻译和语言润色专家，擅长多语言翻译和文本润色。请根据用户的问题提供准确的翻译或润色建议。

回答要求：
- 提供准确的翻译结果
- 保持原文的语气和风格
- 考虑文化背景和语境
- 如果是润色，提供改进建议
- 提供多种表达方式供选择
- 解释翻译或润色的理由

请用中文回答，翻译结果保持原语言。`;

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: question }
    ];

    try {
      const response = await this.callAI(messages, {
        temperature: 0.4,
        max_tokens: 2048
      });
      return response;
    } catch (error) {
      console.error('回答翻译问题失败:', error);
      throw new Error(`翻译回答失败: ${error.message}`);
    }
  }

  // 构建对话历史
  buildConversationHistory(previousResults) {
    const history = [];
    
    // 从最近的执行结果中提取对话历史
    const recentResults = previousResults.slice(-3); // 取最近3次结果，减少冗余
    
    for (const result of recentResults) {
      if (result.success) {
        history.push({
          role: 'assistant',
          content: `执行成功: ${result.action}`
        });
      } else {
        history.push({
          role: 'assistant',
          content: `执行失败: ${result.error}`
        });
      }
    }
    
    return history;
  }
}

// 创建全局AI服务实例
const aiService = new AIService();

// 导出AI服务
window.AIService = AIService;
window.aiService = aiService;
