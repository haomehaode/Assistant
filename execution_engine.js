// 执行引擎：执行大模型返回的指令
class ExecutionEngine {
  constructor() {
    this.executionHistory = [];
    this.maxHistorySize = 100;
  }

  // 执行AI指令
  async executeInstruction(instruction) {
    const startLog = `🔧 开始执行 ${instruction.action} 指令`;
    console.log(startLog);
    this.sendLog(startLog);
    
    const startTime = performance.now();
    let result = {
      action: instruction.action,
      description: instruction.description,
      timestamp: new Date().toISOString(),
      duration: 0,
      error: null,
      data: null
    };

    try {
      // 统一经 background + CDP 执行动作
      const action = instruction.action;
      const execLog = `🚀 通过CDP执行动作: ${action}`;
      console.log(execLog);
      this.sendLog(execLog);
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'EXECUTE_ACTION', ...instruction }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res || !res.ok) return reject(new Error(res?.error || '执行失败'));
          resolve(res.data);
        });
      });
      result.data = response;

      const successLog = `✅ ${instruction.action} 指令执行成功`;
      console.log(successLog);
      this.sendLog(successLog);
    } catch (error) {
      result.error = error.message;
      const errorLog = `❌ ${instruction.action} 指令执行失败: ${error.message}`;
      console.error(errorLog);
      this.sendLog(errorLog);
    }

    const endTime = performance.now();
    result.duration = Math.round(endTime - startTime);

    // 记录执行历史
    this.recordExecution(instruction, result);

    return result;
  }


  // 发送日志到侧边栏
  sendLog(message) {
    try {
      chrome.runtime.sendMessage({
        type: 'EXECUTION_LOG',
        log: message
      });
    } catch (error) {
      // 忽略发送失败的错误
    }
  }

  // 记录执行历史
  recordExecution(instruction, result) {
    this.executionHistory.push({
      instruction: instruction,
      result: result,
      timestamp: new Date().toISOString()
    });

    // 限制历史记录大小
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  // 获取执行历史
  getExecutionHistory() {
    return this.executionHistory;
  }

  // 清空执行历史
  clearHistory() {
    this.executionHistory = [];
  }

  // 获取执行统计
  getExecutionStats() {
    const total = this.executionHistory.length;
    const withErrors = this.executionHistory.filter(r => r.result.error).length;
    const withoutErrors = total - withErrors;
    
    return {
      total: total,
      withoutErrors: withoutErrors,
      withErrors: withErrors,
      errorRate: total > 0 ? Math.round((withErrors / total) * 100) : 0
    };
  }

  // 通过CDP nodeid查找元素
  findElementByNodeId(nodeId) {
    try {
      console.log(`🔍 查找nodeid: ${nodeId}`);
      
      // 使用CDP的nodeid来查找元素
      const element = document.querySelector(`[data-node-id="${nodeId}"]`);
      
      if (element) {
        console.log(`✅ 找到元素: ${element.tagName}#${element.id || element.className || 'unnamed'}`);
        
        if (this.isElementVisible(element)) {
          console.log(`✅ 元素可见，可以操作`);
          return element;
        } else {
          console.log(`❌ 元素不可见`);
          return null;
        }
      } else {
        console.log(`❌ 未找到nodeid对应的元素: ${nodeId}`);
        return null;
      }
    } catch (e) {
      console.error(`❌ CDP nodeid查找失败: ${nodeId}`, e);
    }
    return null;
  }

  // 检查元素是否可见
  isElementVisible(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return rect.width > 0 && 
           rect.height > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }
}

// 导出执行引擎
window.ExecutionEngine = ExecutionEngine;
