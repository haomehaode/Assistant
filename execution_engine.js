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
      success: false,
      action: instruction.action,
      description: instruction.description,
      timestamp: new Date().toISOString(),
      duration: 0,
      error: null,
      data: null
    };

    try {
      // 根据动作类型执行相应操作
      switch (instruction.action) {
        case 'search':
          const searchLog = `🔍 搜索: ${instruction.value} 到 ${instruction.target}`;
          console.log(searchLog);
          this.sendLog(searchLog);
          result.data = await this.executeSearch(instruction);
          break;
        case 'click':
          const clickLog = `🖱️ 点击元素: ${instruction.target}`;
          console.log(clickLog);
          this.sendLog(clickLog);
          result.data = await this.executeClick(instruction);
          break;
        case 'input':
          const inputLog = `⌨️ 输入文本: ${instruction.value} 到 ${instruction.target}`;
          console.log(inputLog);
          this.sendLog(inputLog);
          result.data = await this.executeInput(instruction);
          break;
        case 'wait':
          const waitLog = `⏳ 等待 ${instruction.wait}ms`;
          console.log(waitLog);
          this.sendLog(waitLog);
          result.data = await this.executeWait(instruction);
          break;
        case 'scroll_page_down':
          const scrollDownLog = `📜 向下滚动一页`;
          console.log(scrollDownLog);
          this.sendLog(scrollDownLog);
          result.data = await this.executeScrollPageDown(instruction);
          break;
        case 'scroll_page_up':
          const scrollUpLog = `📜 向上滚动一页`;
          console.log(scrollUpLog);
          this.sendLog(scrollUpLog);
          result.data = await this.executeScrollPageUp(instruction);
          break;
        case 'navigate':
          const navLog = `🌐 导航到: ${instruction.url}`;
          console.log(navLog);
          this.sendLog(navLog);
          result.data = await this.executeNavigate(instruction);
          break;
        case 'extract':
          const extractLog = `📤 提取信息: ${instruction.target}`;
          console.log(extractLog);
          this.sendLog(extractLog);
          result.data = await this.executeExtract(instruction);
          break;
        default:
          throw new Error(`不支持的动作类型: ${instruction.action}`);
      }

      result.success = true;
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

  // 执行搜索操作（输入+回车）
  async executeSearch(instruction) {
    const target = instruction.target;
    const value = instruction.value || instruction.text;
      
    if (!target) {
      throw new Error('缺少目标元素nodeid');
    }
    if (value === undefined) {
      throw new Error('缺少搜索值');
    }

    const element = this.findElementByNodeId(target);
      
    if (!element) {
      throw new Error(`找不到元素: ${target}`);
    }

    if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
      throw new Error(`元素不是输入框: ${target}`);
    }

    // 聚焦元素
    element.focus();
    await this.wait(50);

    // 清空现有内容
    element.value = '';
      
    // 输入搜索内容
    element.value = value;
      
    // 触发输入事件
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
      
    // 等待一下确保输入完成
    await this.wait(100);
      
    // 按回车键搜索
    element.dispatchEvent(new KeyboardEvent('keydown', { 
      key: 'Enter', 
      keyCode: 13, 
      bubbles: true 
    }));
    element.dispatchEvent(new KeyboardEvent('keyup', { 
      key: 'Enter', 
      keyCode: 13, 
      bubbles: true 
    }));
      
    return {
      target: target,
      value: value,
      element: element.tagName,
      type: element.type,
      searched: true
    };
  }

  // 执行点击操作
  async executeClick(instruction) {
    const target = instruction.target;
    if (!target) {
      throw new Error('缺少目标元素nodeid');
    }

    console.log(`🔍 通过CDP nodeid查找元素: ${target}`);
    
    const element = this.findElementByNodeId(target);
    
    if (!element) {
      throw new Error(`找不到元素: ${target}`);
    }

    if (!this.isElementVisible(element)) {
      throw new Error(`元素不可见: ${target}`);
    }

    // 滚动到元素位置
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.wait(300);

    // 执行点击
    element.click();
    
    return {
      target: target,
      element: element.tagName,
      text: element.textContent?.trim() || ''
    };
  }

  // 执行输入操作
  async executeInput(instruction) {
    const target = instruction.target;
    const value = instruction.value || instruction.text;
    
    if (!target) {
      throw new Error('缺少目标元素nodeid');
    }
    if (value === undefined) {
      throw new Error('缺少输入值');
    }

    const element = this.findElementByNodeId(target);
    
    if (!element) {
      throw new Error(`找不到元素: ${target}`);
    }

    if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
      throw new Error(`元素不是输入框: ${target}`);
    }

    // 聚焦元素
    element.focus();
    await this.wait(50);

    // 清空现有内容
    element.value = '';
    
    // 输入新内容
    element.value = value;
    
    // 触发事件
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return {
      target: target,
      value: value,
      element: element.tagName,
      type: element.type
    };
  }

  // 执行等待操作
  async executeWait(instruction) {
    const waitTime = instruction.wait || 1000;
    await this.wait(waitTime);
    
    return {
      waitTime: waitTime,
      timestamp: new Date().toISOString()
    };
  }

  // 执行向下滚动一页（使用Page Down键）
  async executeScrollPageDown(instruction) {
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    
    // 使用Page Down键滚动
    document.dispatchEvent(new KeyboardEvent('keydown', { 
      key: 'PageDown', 
      keyCode: 34, 
      bubbles: true 
    }));
    document.dispatchEvent(new KeyboardEvent('keyup', { 
      key: 'PageDown', 
      keyCode: 34, 
      bubbles: true 
    }));
    
    // 等待滚动完成
    await this.wait(300);
    
    const newScrollY = window.scrollY;
    
    return {
      from: currentScrollY,
      to: newScrollY,
      direction: 'down',
      pageHeight: viewportHeight,
      method: 'PageDown'
    };
  }

  // 执行向上滚动一页（使用Page Up键）
  async executeScrollPageUp(instruction) {
    const currentScrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    
    // 使用Page Up键滚动
    document.dispatchEvent(new KeyboardEvent('keydown', { 
      key: 'PageUp', 
      keyCode: 33, 
      bubbles: true 
    }));
    document.dispatchEvent(new KeyboardEvent('keyup', { 
      key: 'PageUp', 
      keyCode: 33, 
      bubbles: true 
    }));
    
    // 等待滚动完成
    await this.wait(300);
    
    const newScrollY = window.scrollY;
    
    return {
      from: currentScrollY,
      to: newScrollY,
      direction: 'up',
      pageHeight: viewportHeight,
      method: 'PageUp'
    };
  }

  // 执行导航操作
  async executeNavigate(instruction) {
    const url = instruction.url;
    if (!url) {
      throw new Error('缺少导航URL');
    }

    window.location.href = url;
    
    return {
      url: url,
      timestamp: new Date().toISOString()
    };
  }

  // 执行信息提取
  async executeExtract(instruction) {
    const target = instruction.target;
    
    if (!target) {
      throw new Error('缺少目标元素nodeid');
    }

    const element = this.findElementByNodeId(target);
    if (!element) {
      throw new Error(`未找到元素: ${target}`);
    }

    const result = element.textContent?.trim() || '';

    return {
      target: target,
      data: result
    };
  }


  // 等待指定时间
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    const successful = this.executionHistory.filter(r => r.result.success).length;
    const failed = total - successful;
    
    return {
      total: total,
      successful: successful,
      failed: failed,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0
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
