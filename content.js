// 加载智能执行器相关脚本
const scripts = [
  'config.js',
  'ai_service.js',
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
