// 后台：执行 browser_task、协调 tabs 与 content 脚本，并控制侧边栏与日志页
console.log('Background script loaded');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('收到消息:', msg);
  
  if (msg && msg.type === 'EXEC_BROWSER_TASK') {
    console.log('执行浏览器任务:', msg.task);
    executeBrowserTask(msg.task, sender)
      .then((r) => {
        console.log('浏览器任务执行成功:', r);
        sendResponse({ ok: true, data: r });
      })
      .catch((e) => {
        console.error('浏览器任务执行失败:', e);
        sendResponse({ ok: false, error: String(e) });
      });
    return true; // 异步响应
  }
  
  if (msg && msg.type === 'EXEC_SMART_TASK') {
    console.log('执行智能任务:', msg.taskOutline);
    executeSmartTask(msg.taskOutline, msg.options, sender, msg.originalTaskPlan, msg.originalTaskDescription)
      .then((r) => {
        console.log('智能任务执行成功:', r);
        sendResponse({ ok: true, data: r });
      })
      .catch((e) => {
        console.error('智能任务执行失败:', e);
        sendResponse({ ok: false, error: String(e) });
      });
    return true; // 异步响应
  }
  
  
  sendResponse({ ok: false, error: '未知消息类型' });
  return true;
});

async function executeBrowserTask(task, sender) {
  const browserTask = task && task.browser_task;
  console.log('执行浏览器任务:', browserTask, 'sender:', sender);
  
  if (!browserTask) {
    throw new Error('没有 browser_task');
  }
  
  // 处理对象格式的 browser_task
  if (typeof browserTask === 'object' && browserTask.tool_name) {
    const { tool_name, parameters = {} } = browserTask;
    console.log('工具名称:', tool_name, '参数:', parameters);
    
    switch (tool_name) {
      case 'open_tab':
        const url = parameters.url || 'about:blank';
        console.log('准备打开标签页:', url);
        const newTab = await chrome.tabs.create({ url });
        console.log('标签页创建成功:', newTab);
        return newTab;
        
      case 'close_tab':
        if (sender && sender.tab && sender.tab.id) {
          await chrome.tabs.remove(sender.tab.id);
        }
        return true;
        
      case 'query_tab':
        const tab = (sender && sender.tab) || (await getActiveTab());
        return { url: tab?.url || '', title: tab?.title || '' };
        
      default:
        throw new Error('不支持的浏览器任务: ' + tool_name);
    }
  }
}

function normalizeBrowserTask(text) {
  if (typeof text !== 'string') return { action: '', params: {} };
  const m = text.match(/^(\S+)(?:\s+(.+))?$/);
  const action = (m && m[1]) || '';
  const paramText = (m && m[2]) || '';
  const params = {};
  if (paramText.includes('url=')) {
    const pm = paramText.match(/url=([^\s]+)/);
    if (pm) params.url = pm[1];
  }
  return { action, params };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true});
  return tabs && tabs[0];
}

// 执行智能任务
async function executeSmartTask(taskOutline, options, sender, originalTaskPlan = null, originalTaskDescription = null) {
  console.log('执行智能任务:', taskOutline, 'sender:', sender);
  
  if (!taskOutline || !Array.isArray(taskOutline)) {
    throw new Error('taskOutline 必须是数组');
  }
  
  const tab = (sender && sender.tab) || (await getActiveTab());
  if (!tab || !tab.id) {
    throw new Error('无法获取当前标签页');
  }
  
  try {
    // 等待content script加载完成
    await waitForContentScript(tab.id);
    
    // 直接向content script发送消息执行智能任务，避免递归调用
    const result = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'EXEC_SMART_TASK',
        taskOutline: taskOutline,
        options: options,
        originalTaskPlan: originalTaskPlan,
        originalTaskDescription: originalTaskDescription
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('消息发送失败:', chrome.runtime.lastError);
          // 检查是否是页面跳转相关的错误
          if (chrome.runtime.lastError.message?.includes('message channel closed') ||
              chrome.runtime.lastError.message?.includes('A listener indicated an asynchronous response')) {
            console.log('检测到页面跳转，等待页面稳定后重试...');
            // 等待页面稳定后重试
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                type: 'EXEC_SMART_TASK',
                taskOutline: taskOutline,
                options: options,
                originalTaskPlan: originalTaskPlan,
                originalTaskDescription: originalTaskDescription
              }, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(`重试也失败: ${chrome.runtime.lastError.message}`));
                } else {
                  resolve(retryResponse);
                }
              });
            }, 3000);
          } else {
            reject(new Error(chrome.runtime.lastError.message));
          }
        } else {
          resolve(response);
        }
      });
    });
    
    if (!result || !result.ok) {
      throw new Error(result?.error || '智能任务执行失败');
    }
    
    return result.data || {};
  } catch (error) {
    console.error('执行智能任务失败:', error);
    throw error;
  }
}

// 等待content script加载完成
async function waitForContentScript(tabId, maxRetries = 10, retryDelay = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 尝试发送ping消息测试连接
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (response && response.type === 'PONG') {
        console.log('Content script已准备就绪');
        return true;
      }
    } catch (error) {
      console.log(`等待content script加载... (${i + 1}/${maxRetries})`);
      if (i === maxRetries - 1) {
        throw new Error('Content script加载超时');
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

// 侧边栏设置
chrome.runtime.onInstalled.addListener(() => {
  console.log('扩展已安装');
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  console.log('点击扩展图标');
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch (e) {
    console.error('打开侧边栏失败:', e);
  }
});
