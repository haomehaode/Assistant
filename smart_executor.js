// 智能执行器：整合页面分析、AI交互和执行引擎
class SmartExecutor {
  constructor() {
    this.pageAnalyzer = new PageAnalyzer();
    this.executionEngine = new ExecutionEngine();
    this.isRunning = false;
    this.currentTask = null;
    this.executionResults = [];
    this.maxIterations = 20; // 最大迭代次数
  }

  // 初始化
  async init() {
    await aiService.init();
    console.log('智能执行器初始化完成');
  }

  // 执行智能任务
  async executeSmartTask(taskOutline, options = {}, originalTaskPlan = null) {
    if (this.isRunning) {
      throw new Error('任务正在执行中，请等待完成');
    }

    this.isRunning = true;
    this.currentTask = taskOutline;
    this.executionResults = [];
    
    try {
      console.log('开始执行智能任务:', taskOutline);
      
      // AI配置已修复，直接使用AI执行
      
      // 获取初始页面信息（此时页面已经打开）
      console.log('🔍 获取页面信息用于智能执行...');
      const pageInfo = await this.pageAnalyzer.getPageInfo();
      console.log('✅ 页面信息获取完成:', pageInfo);

      let iteration = 0;
      let currentPageInfo = pageInfo;
      let completed = false;

      while (iteration < this.maxIterations && !completed) {
        const stepStartTime = performance.now();
        const stepLog = `=== 执行第 ${iteration + 1} 次迭代 ===`;
        console.log(`\n${stepLog}`);
        this.sendLog(stepLog);
        
        try {
          // 获取AI指令
          const instructionLog = '🤖 正在获取AI指令...';
          console.log(instructionLog);
          this.sendLog(instructionLog);
          
          const instructionStartTime = performance.now();
          const instruction = await aiService.getExecutionInstructions(
            currentPageInfo, 
            taskOutline, 
            this.executionResults,
            originalTaskPlan
          );
          const instructionTime = performance.now() - instructionStartTime;
          
          // 检查是否所有任务已完成
          if (instruction.action === 'completed' || instruction.completed) {
            // 检查是否还有失败的任务
            const hasFailedTasks = this.executionResults.some(result => !result.success);
            if (hasFailedTasks) {
              const retryLog = '🔄 检测到失败的任务，继续重试...';
              console.log(retryLog);
              this.sendLog(retryLog);
              // 不设置completed = true，继续循环
            } else {
              completed = true;
              const completeLog = '🎉 所有任务已完成！';
              console.log(completeLog);
              this.sendLog(completeLog);
              break;
            }
          }
          
            const instructionResultLog = `✅ AI指令获取完成 (${instructionTime.toFixed(0)}ms): ${instruction.action}`;
            console.log(instructionResultLog);
            this.sendLog(instructionResultLog);
            
            const detailLog = `📝 指令详情: ${instruction.description || instruction.action}`;
            console.log(detailLog);
            this.sendLog(detailLog);
            
            // 打印完整的AI指令供调试
            console.log('🤖 AI生成的完整指令:', JSON.stringify(instruction, null, 2));
          
          if (instruction.step) {
            const stepInfoLog = `📋 任务进度: ${instruction.step}/${instruction.totalSteps}`;
            console.log(stepInfoLog);
            this.sendLog(stepInfoLog);
          }
          
          if (instruction.target) {
            const targetLog = `🎯 目标元素: ${instruction.target}`;
            console.log(targetLog);
            this.sendLog(targetLog);
          }
          if (instruction.value) {
            const valueLog = `📝 输入值: ${instruction.value}`;
            console.log(valueLog);
            this.sendLog(valueLog);
          }

          // 执行指令
          const executeLog = '⚡ 正在执行指令...';
          console.log(executeLog);
          this.sendLog(executeLog);
          
          const executeStartTime = performance.now();
          const result = await this.executionEngine.executeInstruction(instruction);
          const executeTime = performance.now() - executeStartTime;
          
          this.executionResults.push(result);
          
          const resultLog = `✅ 指令执行完成 (${executeTime.toFixed(0)}ms): ${result.success ? '成功' : '失败'}`;
          console.log(resultLog);
          this.sendLog(resultLog);
          
          if (result.error) {
            const errorLog = `❌ 错误: ${result.error}`;
            console.log(errorLog);
            this.sendLog(errorLog);
          }
          if (result.data) {
            const dataLog = `📊 结果数据: ${JSON.stringify(result.data).substring(0, 100)}...`;
            console.log(dataLog);
            this.sendLog(dataLog);
          }

          // 检查是否完成
          if (instruction.completed) {
            completed = true;
            const completeLog = '🎉 任务完成！';
            console.log(completeLog);
            this.sendLog(completeLog);
            break;
          }

          // 获取更新后的页面信息
          const pageLog = '🔍 正在更新页面信息...';
          console.log(pageLog);
          this.sendLog(pageLog);
          
          const pageStartTime = performance.now();
          currentPageInfo = await this.pageAnalyzer.getPageInfo();
          const pageTime = performance.now() - pageStartTime;
          
          const pageResultLog = `✅ 页面信息更新完成 (${pageTime.toFixed(0)}ms)`;
          console.log(pageResultLog);
          this.sendLog(pageResultLog);
          
          // 减少等待时间
          await this.wait(500);
          
          const stepTime = performance.now() - stepStartTime;
          const stepTimeLog = `⏱️ 第 ${iteration + 1} 次迭代总用时: ${stepTime.toFixed(0)}ms`;
          console.log(stepTimeLog);
          this.sendLog(stepTimeLog);
          
          iteration++;
          
        } catch (error) {
          const errorLog = `❌ 第 ${iteration + 1} 次迭代失败: ${error.message}`;
          console.error(errorLog);
          this.sendLog(errorLog);
          
          // 记录错误结果
          this.executionResults.push({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            iteration: iteration + 1
          });
          
          // 重新分析页面状态，让AI重新规划
          const retryLog = `🔄 重新分析页面状态，让AI重新规划执行策略...`;
          console.log(retryLog);
          this.sendLog(retryLog);
          
          // 获取更新后的页面信息
          const pageLog = '🔍 正在重新获取页面信息...';
          console.log(pageLog);
          this.sendLog(pageLog);
          
          const pageStartTime = performance.now();
          currentPageInfo = await this.pageAnalyzer.getPageInfo();
          const pageTime = performance.now() - pageStartTime;
          
          const pageResultLog = `✅ 页面信息重新获取完成 (${pageTime.toFixed(0)}ms)`;
          console.log(pageResultLog);
          this.sendLog(pageResultLog);
          
          // 等待页面稳定
          await this.wait(1000);
          
          // 如果连续失败次数过多，停止执行
          if (iteration > 10) {
            throw new Error(`连续执行失败过多，停止任务: ${error.message}`);
          }
          
          // 继续下一次迭代，让AI基于新的页面状态重新规划
          iteration++;
          continue; // 跳过当前迭代的后续处理，直接进入下一次迭代
        }
      }

      if (!completed && iteration >= this.maxIterations) {
        console.warn('达到最大迭代次数，任务可能未完成');
      }

      return {
        success: completed,
        results: this.executionResults,
        iterations: iteration,
        stats: this.executionEngine.getExecutionStats()
      };

    } catch (error) {
      console.error('智能任务执行失败:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentTask = null;
    }
  }


  // 获取当前状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentTask: this.currentTask,
      resultsCount: this.executionResults.length,
      stats: this.executionEngine.getExecutionStats()
    };
  }

  // 停止执行
  stop() {
    if (this.isRunning) {
      this.isRunning = false;
      this.currentTask = null;
      console.log('任务已停止');
    }
  }

  // 重置
  reset() {
    this.stop();
    this.executionResults = [];
    this.executionEngine.clearHistory();
    console.log('执行器已重置');
  }

  // 获取执行历史
  getHistory() {
    return {
      results: this.executionResults,
      engineHistory: this.executionEngine.getExecutionHistory()
    };
  }

  // 等待
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

  // 分析页面
  async analyzePage() {
    return await this.pageAnalyzer.getPageInfo();
  }

  // 检查AI是否可用
  async checkAIAvailability() {
    try {
      return await configManager.isConfigComplete();
    } catch (error) {
      console.error('检查AI可用性失败:', error);
      return false;
    }
  }

}

// 导出智能执行器
window.SmartExecutor = SmartExecutor;
