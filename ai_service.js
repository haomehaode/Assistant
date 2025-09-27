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
  async getExecutionInstructions(pageInfo, taskOutline, previousResults = [], originalTaskPlan = null) {
    // 如果是web_content_tasks数组，按照顺序执行
    if (Array.isArray(taskOutline)) {
      const currentStep = previousResults.length;
      const totalSteps = taskOutline.length;
      
      if (currentStep >= totalSteps) {
        // 检查是否有失败的任务需要重试
        const hasFailedTasks = previousResults.some(result => !result.success);
        if (hasFailedTasks) {
          // 如果有失败的任务，继续重试
          const currentTask = taskOutline[currentStep - 1]; // 重试最后一个任务
          console.log(`🔄 重试失败的任务: ${currentTask}`);
          const instruction = await this.parseTaskToInstruction(currentTask, pageInfo, previousResults, originalTaskPlan, taskOutline);
          instruction.step = currentStep;
          instruction.totalSteps = totalSteps;
          instruction.retry = true;
          return instruction;
        }
        
        // 让AI基于页面内容判断任务是否真正完成
        console.log(`📋 所有步骤已执行完成，让AI判断任务是否真正完成`);
        const completionCheck = await this.checkTaskCompletion(pageInfo, taskOutline, previousResults, originalTaskPlan);
        return completionCheck;
      }
      
      const currentTask = taskOutline[currentStep];
      console.log(`📋 执行第 ${currentStep + 1}/${totalSteps} 个任务: ${currentTask}`);
      
      // 根据任务描述生成具体指令，传递完整的任务列表
      const instruction = await this.parseTaskToInstruction(currentTask, pageInfo, previousResults, originalTaskPlan, taskOutline);
      instruction.step = currentStep + 1;
      instruction.totalSteps = totalSteps;
      
      return instruction;
    }
    
    // 如果不是web_content_tasks数组，抛出错误
    throw new Error('不支持的任务格式，请使用web_content_tasks数组');
  }

  // 解析任务描述为具体指令
  async parseTaskToInstruction(taskDescription, pageInfo, previousResults = [], originalTaskPlan = null, allTasks = []) {
    // 构建对话历史
    const conversationHistory = this.buildConversationHistory(previousResults);
    
    // 构建完整的任务上下文信息
    const currentStep = previousResults.length + 1;
    const totalSteps = allTasks.length;
    const completedTasks = previousResults.filter(r => r.success).length;
    const remainingTasks = allTasks.slice(currentStep - 1);
    
    // 构建原始任务规划信息
    const originalPlanInfo = originalTaskPlan ? `
## 原始任务规划（总方向指导）：
${JSON.stringify(originalTaskPlan, null, 2)}

## 任务规划说明：
- 这是用户原始任务的完整规划，包含总体目标和子任务结构
- 当前执行的web_content_tasks是其中一个子任务的页面操作部分
- 请参考原始规划来理解当前步骤在整个任务中的位置和意义
- 如果当前步骤失败，请基于原始规划的目标来调整执行策略` : '';

    const systemPrompt = `你是一个智能网页操作指令解析器。根据任务描述和CDP格式的页面信息，生成具体的执行指令。

## 完整任务列表（web_content_tasks）：
${JSON.stringify(allTasks, null, 2)}

## 当前执行进度：
- 当前步骤：${currentStep}/${totalSteps}
- 已完成步骤：${completedTasks}
- 当前任务：${taskDescription}
- 剩余任务：${JSON.stringify(remainingTasks, null, 2)}

## 任务描述：
${taskDescription}

${originalPlanInfo}

## 当前页面信息（仅可视区域）：
${JSON.stringify(pageInfo, null, 2)}

## 之前的执行结果：
${JSON.stringify(previousResults.slice(-3), null, 2)}

## 重要说明：
- 当前提供的页面信息仅包含可视区域内的元素
- 如果找不到需要的元素，可以请求滚动页面来查看更多内容
- 页面信息包含viewport信息，显示当前滚动位置和可滚动范围
- 你有完整的任务列表，可以理解当前步骤在整个任务中的位置和作用
- 可以根据后续任务来调整当前步骤的执行策略
- 如果提供了原始任务规划，请参考其总体目标来指导当前步骤的执行

## 执行指令格式：
{
  "action": "动作类型",
  "description": "动作描述",
  "target": "CDP nodeid（纯数字字符串）",
  "value": "输入值（仅input动作需要）",
  "wait": "等待时间(毫秒)",
  "url": "导航URL（仅navigate动作需要）"
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

## 搜索操作策略：
- 对于搜索框，优先使用 "search" 动作，它会自动输入内容并按回车搜索
- 避免使用 "input" + "click" 的组合来搜索，直接使用 "search" 即可
- "search" 动作包含了输入和回车两个步骤，更符合用户习惯

## 滚动策略：
- 如果当前可视区域没有找到目标元素，必须使用scroll_page_down向下滚动一页
- scroll_page_down使用Page Down键滚动，正好滚动一个视口的高度，确保精确的页面切换
- 如果需要返回查看之前的内容，使用scroll_page_up向上滚动一页
- scroll_page_up使用Page Up键滚动，更符合用户习惯
- 禁止使用其他滚动方式，只能使用scroll_page_down和scroll_page_up
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

## 注意事项：
- 根据任务描述确定动作类型
- 从CDP DOM树中找到正确的元素nodeid
- 确保指令具体可执行
- 如果任务已完成，返回completed: true
- 考虑当前步骤在整个任务流程中的作用，为后续步骤做准备`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: `请解析任务: ${taskDescription}

当前进度：${currentStep}/${totalSteps}
剩余任务：${remainingTasks.length} 个

重要提示：
1. 从CDP DOM树中找到合适的元素，使用其nodeId字段
2. 必须使用CDP nodeid作为target，格式为纯数字字符串
3. 确保nodeid对应可见且可操作的元素
4. 分析页面文本内容，理解页面功能和可操作区域
5. 禁止使用CSS选择器（如document.querySelector）
6. 优先使用click、input等基础动作
7. 考虑当前步骤在整个任务流程中的作用` }
    ];

    try {
      const response = await this.callAI(messages);
      const parsed = this.parseJSONResponse(response);
      
      // 验证必要字段
      if (!parsed.action) {
        throw new Error('响应中缺少action字段');
      }
      
      return parsed;
    } catch (error) {
      console.error('解析任务指令失败:', error);
      throw new Error(`解析任务指令失败: ${error.message}`);
    }
  }

  // 检查任务是否真正完成
  async checkTaskCompletion(pageInfo, taskOutline, previousResults, originalTaskPlan) {
    const currentStep = previousResults.length;
    const totalSteps = taskOutline.length;
    const completedTasks = previousResults.filter(r => r.success).length;
    const remainingTasks = taskOutline.slice(currentStep);
    
    // 构建原始任务规划信息
    const originalPlanInfo = originalTaskPlan ? `
## 原始任务规划（总目标参考）：
${JSON.stringify(originalTaskPlan, null, 2)}

## 任务规划说明：
- 这是用户原始任务的完整规划，包含总体目标和子任务结构
- 当前执行的web_content_tasks是其中一个子任务的页面操作部分
- 请参考原始规划来判断当前子任务是否真正完成
- 考虑当前子任务的完成是否有助于实现总体目标` : '';

    const systemPrompt = `你是一个任务完成检查专家。请基于当前页面内容和任务要求，判断任务是否真正完成。

## 完整任务列表（web_content_tasks）：
${JSON.stringify(taskOutline, null, 2)}

## 当前执行进度：
- 当前步骤：${currentStep}/${totalSteps}
- 已完成步骤：${completedTasks}
- 剩余任务：${JSON.stringify(remainingTasks, null, 2)}

${originalPlanInfo}

## 当前页面信息：
${JSON.stringify(pageInfo, null, 2)}

## 执行历史：
${JSON.stringify(previousResults.slice(-3), null, 2)}

## 判断标准：
1. 检查是否完成了所有必要的操作步骤
2. 检查页面是否显示了预期的结果内容
3. 检查是否已经获取到足够的信息来满足任务目标
4. 考虑剩余任务是否还需要执行
5. 如果提供了原始任务规划，请参考其总体目标来判断当前子任务是否完成

## 输出格式：
{
  "completed": true/false,
  "description": "任务完成情况描述",
  "reason": "完成或未完成的原因"
}

如果任务已完成，返回 completed: true；如果还需要继续操作，返回 completed: false 并说明原因。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请检查任务是否真正完成

当前进度：${currentStep}/${totalSteps}
剩余任务：${remainingTasks.length} 个` }
    ];

    try {
      const response = await this.callAI(messages);
      const parsed = this.parseJSONResponse(response);
      
      if (parsed.completed) {
        return {
          action: 'completed',
          description: parsed.description || '任务已完成',
          completed: true
        };
      } else {
        // 如果任务未完成，让AI生成下一步操作
        const nextTask = taskOutline[taskOutline.length - 1]; // 继续执行最后一个任务
        const instruction = await this.parseTaskToInstruction(nextTask, pageInfo, previousResults, originalTaskPlan, taskOutline);
        instruction.step = previousResults.length + 1;
        instruction.totalSteps = taskOutline.length;
        instruction.retry = true;
        return instruction;
      }
    } catch (error) {
      console.error('任务完成检查失败:', error);
      // 如果检查失败，默认认为任务已完成
      return {
        action: 'completed',
        description: '任务已完成（检查失败）',
        completed: true
      };
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
