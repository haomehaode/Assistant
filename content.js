// 内容脚本：执行智能页面任务

// 全局nodeId计数器
let globalNodeIdCounter = 0;

// 生成CDP nodeid
function generateNodeId(element) {
  return globalNodeIdCounter++;
}

// 获取CDP格式的DOM树
function getCDPDOMTree() {
  const rootNode = {
    nodeId: generateNodeId(document.documentElement),
    nodeType: 1, // ELEMENT_NODE
    nodeName: document.documentElement.tagName ? document.documentElement.tagName.toLowerCase() : 'html',
    nodeValue: null,
    attributes: getAllAttributes(document.documentElement),
    children: getCDPChildren(document.documentElement)
  };
  
  return rootNode;
}

// 获取CDP格式的子节点
function getCDPChildren(element) {
  const children = [];
  const childNodes = Array.from(element.childNodes);
  
  childNodes.forEach((child) => {
    try {
      if (child.nodeType === 1) { // ELEMENT_NODE
        const rect = child.getBoundingClientRect();
        const style = window.getComputedStyle(child);
        
        // 只包含可见元素
        if (rect.width > 0 && rect.height > 0 && 
            style.display !== 'none' && 
            style.visibility !== 'hidden' &&
            style.opacity !== '0') {
          
          const nodeId = generateNodeId(child);
          child.setAttribute('data-node-id', nodeId);
          
          children.push({
            nodeId: nodeId,
            nodeType: child.nodeType,
            nodeName: child.tagName ? child.tagName.toLowerCase() : 'unknown',
            nodeValue: null,
            attributes: getAllAttributes(child),
            children: getCDPChildren(child)
          });
        }
      } else if (child.nodeType === 3) { // TEXT_NODE
        const text = child.textContent?.trim();
        if (text && text.length > 0) {
          children.push({
            nodeId: generateNodeId(child),
            nodeType: child.nodeType,
            nodeName: '#text',
            nodeValue: text,
            attributes: {},
            children: []
          });
        }
      }
    } catch (childError) {
      console.warn('处理子节点时出错:', childError);
    }
  });
  
  return children;
}

// 获取所有元素属性
function getAllAttributes(element) {
  const attrs = {};
  if (element.attributes) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attrs[attr.name] = attr.value;
    }
  }
  return attrs;
}

// 加载智能执行器相关脚本
const scripts = [
  'config.js',
  'ai_service.js',
  'page_analyzer.js',
  'execution_engine.js',
  'smart_executor.js'
];

scripts.forEach(src => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(src);
  document.head.appendChild(script);
});

// 全局执行器实例
let globalExecutor = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG' });
    return true;
  }
  
  if (msg?.type === 'GET_PAGE_INFO') {
    // 获取CDP格式的页面信息
    try {
      const pageInfo = {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        // CDP格式的DOM树
        dom: getCDPDOMTree()
      };
      
      console.log('CDP格式页面信息:', JSON.stringify(pageInfo, null, 2));
      sendResponse({ pageInfo });
    } catch (error) {
      sendResponse({ error: error.message });
    }
    return true;
  }
  
  if (msg?.type === 'EXEC_SMART_TASK') {
    executeSmartTask(msg.taskOutline, msg.options, msg.originalTaskPlan, msg.originalTaskDescription).then(r => sendResponse({ ok: true, data: r })).catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  
  if (msg?.type === 'STOP_EXECUTION') {
    console.log('收到停止执行信号');
    if (globalExecutor) {
      globalExecutor.stop();
      console.log('执行器已停止');
    }
    sendResponse({ ok: true, message: '停止信号已处理' });
    return true;
  }
});


// 执行智能任务
async function executeSmartTask(taskOutline, options = {}, originalTaskPlan = null, originalTaskDescription = null) {
  console.log('开始执行智能任务:', taskOutline);
  
  // 等待智能执行器加载完成
  await new Promise((resolve) => {
    const checkExecutor = () => {
      if (window.SmartExecutor) {
        resolve();
      } else {
        setTimeout(checkExecutor, 100);
      }
    };
    checkExecutor();
  });
  
  const executor = new window.SmartExecutor();
  globalExecutor = executor; // 保存全局引用
  await executor.init();
  return await executor.executeSmartTask(taskOutline, options, originalTaskPlan, originalTaskDescription);
}
