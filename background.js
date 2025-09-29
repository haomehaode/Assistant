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
  
  if (msg && msg.type === 'GET_PAGE_INFO') {
    console.log('获取页面信息');
    getPageInfo(sender)
      .then((info) => {
        console.log('页面信息获取成功');
        sendResponse({ ok: true, pageInfo: info });
      })
      .catch((e) => {
        console.error('页面信息获取失败:', e);
        sendResponse({ ok: false, error: String(e) });
      });
    return true; // 异步响应
  }

  if (msg && msg.type === 'EXECUTE_ACTION') {
    console.log('执行页面动作(经CDP):', msg.action);
    executeActionViaCDP(sender, msg)
      .then((r) => sendResponse({ ok: true, data: r }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  
  
  sendResponse({ ok: false, error: '未知消息类型' });
  return true;
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true});
  return tabs && tabs[0];
}

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

// 汇总页面信息（URL、标题、时间戳、viewport、DOM）
async function getPageInfo(sender) {
  const tab = (sender && sender.tab) || (await getActiveTab());
  if (!tab || !tab.id) {
    throw new Error('无法获取当前标签页');
  }

  await chrome.debugger.attach({ tabId: tab.id }, '1.3');
  try {
    // 启用所需的调试域
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable');
    // 1) viewport
    const metrics = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.getLayoutMetrics');
    const v = metrics && metrics.layoutViewport ? metrics.layoutViewport : { clientWidth: 0, clientHeight: 0, pageX: 0, pageY: 0 };
    const viewport = {
      width: v.clientWidth || 0,
      height: v.clientHeight || 0,
      scrollX: v.pageX || 0,
      scrollY: v.pageY || 0,
      scrollMaxX: 0,
      scrollMaxY: 0
    };

    // 2) 获取扁平DOM并仅保留可视范围内的“可操作/有信息”节点
    const flat = await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.getFlattenedDocument', { depth: -1, pierce: true });
    const bodyNode = flat.nodes.find(n => n.nodeName && n.nodeName.toLowerCase() === 'body');
    if (!bodyNode) throw new Error('未找到body节点');

    const nodeMap = new Map(flat.nodes.map(n => [n.nodeId, n]));
    const childrenByParent = new Map();
    for (const n of flat.nodes) {
      if (n.parentId != null) {
        if (!childrenByParent.has(n.parentId)) childrenByParent.set(n.parentId, []);
        childrenByParent.get(n.parentId).push(n.nodeId);
      }
    }

    const attrWhitelist = new Set(['id','name','role','aria-label','title','type','value','placeholder','checked','disabled','readonly','href','src','alt','contenteditable','tabindex']);
    const actionableTags = new Set(['input','textarea','select','button','a','form','label']);
    const semanticTags = new Set(['h1','h2','h3','h4','h5','h6','ul','ol','li','table','tr','td','th','summary','details']);

    const isActionable = (name, attrs) => {
      if (actionableTags.has(name)) return true;
      if (semanticTags.has(name)) return true;
      if (!attrs) return false;
      return Boolean(attrs.href || attrs.placeholder || attrs.type || attrs.role || attrs.value);
    };

    const pickAttrs = (node) => {
      const out = {};
      if (!node.attributes) return out;
      for (let i = 0; i < node.attributes.length; i += 2) {
        const k = node.attributes[i];
        const val = node.attributes[i+1];
        if (attrWhitelist.has(k)) out[k] = val;
      }
      return out;
    };

    const isVisibleInViewport = async (backendNodeId) => {
      try {
        const box = await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.getBoxModel', { backendNodeId });
        const q = box && box.model && box.model.content || [];
        if (q.length < 8) return false;
        const minX = Math.min(q[0], q[2], q[4], q[6]);
        const maxX = Math.max(q[0], q[2], q[4], q[6]);
        const minY = Math.min(q[1], q[3], q[5], q[7]);
        const maxY = Math.max(q[1], q[3], q[5], q[7]);
        if ((maxX - minX) <= 0 || (maxY - minY) <= 0) return false;
        // 与viewport相交
        return !(maxX < 0 || maxY < 0 || minX > viewport.width || minY > viewport.height);
      } catch (_) {
        return false;
      }
    };

    const getInnerText = async (backendNodeId) => {
      try {
        const resolved = await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.resolveNode', { backendNodeId });
        const objectId = resolved && resolved.object && resolved.object.objectId;
        if (!objectId) return '';
        const { result } = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: function() { return (this && this.innerText) ? this.innerText.trim() : (this && this.textContent ? this.textContent.trim() : ''); }.toString(),
          returnByValue: true
        });
        const text = (result && result.value) || '';
        return text.length > 200 ? text.slice(0, 200) : text;
      } catch (_) {
        return '';
      }
    };

    const buildFilteredTree = async (node, isRoot = false) => {
      if (!node || node.nodeType !== 1) return null; // 仅元素
      const name = (node.nodeName || '').toLowerCase();
      const backendNodeId = (node.backendNodeId !== undefined ? node.backendNodeId : node.nodeId);
      const attrs = pickAttrs(node);
      const actionable = isActionable(name, attrs);

      // 根节点(body)始终保留并遍历其子；其它节点需可见
      let visible = true;
      if (!isRoot) {
        visible = await isVisibleInViewport(backendNodeId);
        if (!visible) return null;
      }

      const out = {
        nodeId: backendNodeId,
        nodeName: name
      };
      if (actionable && attrs && Object.keys(attrs).length > 0) {
        out.attributes = attrs;
      }

      if (actionable || semanticTags.has(name) || ['p','span','div','li','a','button','label'].includes(name)) {
        const txt = await getInnerText(backendNodeId);
        if (txt) out.text = txt;
      }

      const childIds = childrenByParent.get(node.nodeId) || [];
      const builtChildren = [];
      for (const cid of childIds) {
        const child = nodeMap.get(cid);
        const built = await buildFilteredTree(child, false);
        if (built) builtChildren.push(built);
      }
      if (builtChildren.length > 0) out.children = builtChildren;

      if (!isRoot && !out.text && (!out.children || out.children.length === 0) && !actionable) return null;
      return out;
    };

    const dom = await buildFilteredTree(bodyNode, true);

    return {
      url: tab.url || '',
      title: tab.title || '',
      timestamp: new Date().toISOString(),
      viewport,
      dom
    };
  } finally {
    await chrome.debugger.detach({ tabId: tab.id });
  }
}

// 使用 CDP 执行动作（所有操作基于真实 nodeId）
async function executeActionViaCDP(sender, payload) {
  const tab = (sender && sender.tab) || (await getActiveTab());
  if (!tab || !tab.id) throw new Error('无法获取当前标签页');

  const { action, target, value, url, wait } = payload || {};
  await chrome.debugger.attach({ tabId: tab.id }, '1.3');
  try {
    // 启用所需的调试域
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable');
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable');
    switch (action) {
      case 'navigate': {
        if (!url) throw new Error('缺少导航URL');
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.navigate', { url });
        return { action, url };
      }
      case 'wait': {
        const ms = wait || 1000;
        await new Promise(r => setTimeout(r, ms));
        return { action, wait: ms };
      }
      case 'click': {
        if (!target) throw new Error('缺少目标元素nodeid');
        const backendNodeId = Number(target);
        if (!backendNodeId) throw new Error('目标nodeId无效');
        // 调用 DOM.scrollIntoViewIfNeeded
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.scrollIntoViewIfNeeded', { backendNodeId });
        // 取 box 模型中心点
        const box = await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.getBoxModel', { backendNodeId });
        const quad = box && box.model && box.model.content || [];
        if (quad.length < 8) throw new Error('无法获取元素位置');
        const x = Math.round((quad[0] + quad[2] + quad[4] + quad[6]) / 4);
        const y = Math.round((quad[1] + quad[3] + quad[5] + quad[7]) / 4);
        // 发送输入事件
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        return { action, target };
      }
      case 'input':
      case 'search': {
        if (!target) throw new Error('缺少目标元素nodeid');
        const text = value || '';
        const backendNodeId = Number(target);
        if (!backendNodeId) throw new Error('目标nodeId无效');
        // 聚焦元素
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.focus', { backendNodeId });
        // 选中并清空
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control' });
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a' });
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a' });
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control' });
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.insertText', { text });
        if (action === 'search') {
          await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' });
          await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter' });
        }
        return { action, target, value: text };
      }
      case 'scroll_page_down':
      case 'scroll_page_up': {
        const key = action === 'scroll_page_down' ? 'PageDown' : 'PageUp';
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyDown', key });
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchKeyEvent', { type: 'keyUp', key });
        return { action };
      }
      case 'extract': {
        if (!target) throw new Error('缺少目标元素nodeid');
        const backendNodeId = Number(target);
        if (!backendNodeId) throw new Error('目标nodeId无效');
        const evalResult = await chrome.debugger.sendCommand({ tabId: tab.id }, 'DOM.resolveNode', { backendNodeId });
        const objectId = evalResult && evalResult.object && evalResult.object.objectId;
        if (!objectId) throw new Error('无法解析目标节点对象');
        const { result } = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: function() { return this && (this.value !== undefined ? this.value : this.textContent) || ''; }.toString(),
          returnByValue: true
        });
        return { action, target, data: (result && result.value) || '' };
      }
      default:
        throw new Error('不支持的动作: ' + action);
    }
  } finally {
    await chrome.debugger.detach({ tabId: tab.id });
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
