// 直接使用ai_service，无需import

const elPrompt = document.getElementById('prompt');
const elLog = document.getElementById('log');
const elStatus = document.getElementById('status');
const elBtnGo = document.getElementById('btn-go');
const elBtnStop = document.getElementById('btn-stop');

// 全局状态管理
let isExecuting = false;
let currentExecutor = null;

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function appendLocal(line) {
  elLog.textContent += line + '\n';
  elLog.scrollTop = elLog.scrollHeight;
}

function clearLog() {
  elLog.textContent = '';
}

function log(type, message) {
  const line = `[${now()}] [${type}] ${message}`;
  appendLocal(line);
}

// 更新按钮状态
function updateButtonState(executing) {
  isExecuting = executing;
  elBtnGo.disabled = executing;
  elBtnStop.disabled = !executing;
  
  if (executing) {
    elBtnGo.textContent = '执行中...';
  } else {
    elBtnGo.textContent = '执行';
  }
}

function formatBrowserTask(browserTask) {
  if (typeof browserTask === 'object' && browserTask.tool_name) {
    return `${browserTask.tool_name}(${JSON.stringify(browserTask.parameters)})`;
  }
  return String(browserTask);
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('未找到活动标签页');
  return await chrome.tabs.sendMessage(tab.id, message);
}

async function executePlan(plan) {
  const runNode = async (node) => {
    if (!node) return;
    if (node.browser_task) {
      log('STEP', `开始 浏览器任务: ${formatBrowserTask(node.browser_task)}`);
      const t0 = performance.now();
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'EXEC_BROWSER_TASK', task: node }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!resp) {
            reject(new Error('没有收到响应'));
          } else if (!resp.ok) {
            reject(new Error(resp.error || '浏览器任务失败'));
          } else {
            resolve(resp.data);
          }
        });
      });
      const t1 = performance.now();
      log('STEP', `结束 浏览器任务: ${formatBrowserTask(node.browser_task)} 用时 ${(t1 - t0).toFixed(0)}ms`);
    }
    if (Array.isArray(node.web_content_tasks) && node.web_content_tasks.length) {
      log('STEP', `开始 页面任务: ${node.web_content_tasks.length} 条`);
      const t0 = performance.now();
      
      // 执行web_content_tasks
      try {
        // 设置实时日志监听
        const logListener = (message) => {
          if (message.type === 'EXECUTION_LOG') {
            log('EXEC', message.log);
          } else if (message.type === 'EXECUTION_STEP') {
            log('STEP', `步骤 ${message.step}: ${message.description}`);
          } else if (message.type === 'EXECUTION_RESULT') {
            if (message.success) {
              log('RESULT', `✅ ${message.description}`);
            } else {
              log('ERROR', `❌ ${message.description}: ${message.error}`);
            }
          }
        };
        
        chrome.runtime.onMessage.addListener(logListener);
        
        const resp = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'EXEC_SMART_TASK',
            taskOutline: node.web_content_tasks,
            options: { maxIterations: 10 },
            originalTaskPlan: plan, // 传递原始任务规划
            originalTaskDescription: prompt // 传递原始任务描述
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response) {
              reject(new Error('没有收到响应'));
            } else {
              resolve(response);
            }
          });
        });
        
        // 移除日志监听器
        chrome.runtime.onMessage.removeListener(logListener);
        
        if (!resp?.ok) {
          throw new Error(resp?.error || '页面任务失败');
        }
        
        const t1 = performance.now();
        log('STEP', `结束 页面任务 用时 ${(t1 - t0).toFixed(0)}ms`);
        
        // 显示执行结果摘要
        const results = resp.data.results || [];
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;
        log('RESULT', `执行完成: ${successCount}/${totalCount} 个步骤成功`);
        
      } catch (error) {
        const t1 = performance.now();
        log('ERROR', `页面任务失败 用时 ${(t1 - t0).toFixed(0)}ms: ${error.message}`);
        throw error; // 直接抛出错误
      }
    }
    if (Array.isArray(node.sub_tasks)) {
      for (const sub of node.sub_tasks) {
        await runNode(sub);
      }
    }
  };
  await runNode(plan);
}


elBtnGo.addEventListener('click', async () => {
  try {
    // 检查是否正在执行
    if (isExecuting) {
      log('WARN', '任务正在执行中，请等待完成或点击停止按钮');
      return;
    }
    
    const prompt = elPrompt.value.trim();
    if (!prompt) { elStatus.textContent = '请输入任务'; return; }
    
    // 检查配置
    const isConfigComplete = await configManager.isConfigComplete();
    if (!isConfigComplete) {
      elStatus.textContent = '请先配置API设置';
      log('ERROR', 'API配置不完整，请前往选项页面设置');
      return;
    }
    
    // 更新按钮状态
    updateButtonState(true);
    
    // 清空日志
    clearLog();
    
    log('FLOW', '开始 识别意图');
    elStatus.textContent = '识别意图中...';
    const t0 = performance.now();
    await aiService.init();
    const intent = await aiService.detectIntent(prompt);
    const t1 = performance.now();
    appendLocal(JSON.stringify(intent, null, 2));
    log('FLOW', `结束 识别意图 用时 ${(t1 - t0).toFixed(0)}ms`);
    const needBrowser = Array.isArray(intent.task_types) && intent.task_types.includes('browser_use');
    if (!needBrowser) { 
      // 获取任务类型，用于选择相应的AI回答方法
      const taskTypes = intent.task_types || [];
      const taskTypeNames = {
        'general': '普通问答',
        'analysis': '分析归纳',
        'code': '代码生成',
        'image': '图像处理',
        'translation': '翻译润色',
        'other': '其他类型'
      };
      
      const primaryTaskType = taskTypes.length > 0 ? taskTypes[0] : 'general';
      const taskTypeName = taskTypeNames[primaryTaskType] || '普通问答';
      
      elStatus.textContent = `该任务无需浏览器自动化，使用AI进行${taskTypeName}回答`;
      log('FLOW', `开始 使用AI进行${taskTypeName}回答`);
      log('INFO', `识别到的任务类型: ${taskTypes.join(', ')}`);
      
      try {
        const t2 = performance.now();
        const aiResponse = await aiService.answerUserQuestion(prompt, taskTypes);
        const t3 = performance.now();
        appendLocal(aiResponse);
        log('FLOW', `AI ${taskTypeName}回答完成 用时 ${(t3 - t2).toFixed(0)}ms`);
        elStatus.textContent = `AI ${taskTypeName}回答完成`;  
      } catch (error) {
        log('ERROR', `AI ${taskTypeName}回答失败: ${error.message}`);
        elStatus.textContent = `AI ${taskTypeName}回答失败`;
      }
      return; 
    }
    log('FLOW', '开始 生成计划');
    elStatus.textContent = '生成计划中...';
    const t2 = performance.now();
    
    // 任务规划阶段：使用通用规划（此时页面还未打开）
    log('INFO', '任务规划阶段：生成通用任务指导，具体执行将在页面打开后基于实际页面信息进行');
    const plan = await aiService.buildPlanFromPrompt(prompt);
    const t3 = performance.now();
    appendLocal(JSON.stringify(plan, null, 2));
    log('FLOW', `结束 生成计划 用时 ${(t3 - t2).toFixed(0)}ms`);
    log('FLOW', '开始 执行计划');
    elStatus.textContent = '执行中...';
    const t4 = performance.now();
    await executePlan(plan);
    const t5 = performance.now();
    log('FLOW', `结束 执行计划 总用时 ${(t5 - t4).toFixed(0)}ms`);
    elStatus.textContent = '执行完成';
  } catch (e) {
    elStatus.textContent = '失败: ' + e.message;
    log('ERROR', e.message || String(e));
  } finally {
    // 重置按钮状态
    updateButtonState(false);
    currentExecutor = null;
  }
});

// 停止按钮事件监听器
elBtnStop.addEventListener('click', async () => {
  try {
    if (!isExecuting) {
      log('WARN', '当前没有正在执行的任务');
      return;
    }
    
    log('STOP', '用户请求停止任务执行...');
    elStatus.textContent = '正在停止...';
    
    // 发送停止消息到content script
    try {
      await sendToActiveTab({ type: 'STOP_EXECUTION' });
      log('STOP', '停止信号已发送');
    } catch (error) {
      log('ERROR', `发送停止信号失败: ${error.message}`);
    }
    
    // 立即更新UI状态
    updateButtonState(false);
    elStatus.textContent = '任务已停止';
    currentExecutor = null;
    
    log('STOP', '任务执行已停止');
    
  } catch (error) {
    log('ERROR', `停止任务失败: ${error.message}`);
    elStatus.textContent = '停止失败';
  }
});

