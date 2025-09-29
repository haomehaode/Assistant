// 智能执行器：整合页面分析、AI交互和执行引擎
class SmartExecutor {
  constructor() {
    this.executionEngine = new ExecutionEngine();
    this.isRunning = false;
    this.currentTask = null;
    this.executionResults = [];
    this.shouldStop = false; // 添加停止标志
  }

  // 初始化
  async init() {
    await aiService.init();
    console.log('智能执行器初始化完成');
  }

  // 执行智能任务
  async executeSmartTask(taskOutline, options = {}, originalTaskPlan = null, originalTaskDescription = null) {
    if (this.isRunning) {
      throw new Error('任务正在执行中，请等待完成');
    }

    this.isRunning = true;
    this.currentTask = taskOutline;
    this.executionResults = [];
    this.originalTaskDescription = originalTaskDescription; // 保存原始任务描述
    
    try {
      console.log('开始执行智能任务:', taskOutline);
      
      // 获取初始页面信息（此时页面已经打开）
      console.log('🔍 获取页面信息用于智能执行...');
      const pageInfo = await this.getPageInfoFromBackground();
      console.log('✅ 页面信息获取完成:', pageInfo);

      let iteration = 0;
      let currentPageInfo = pageInfo;
      let previousPageInfo = null; // 新增：上次操作前的页面状态
      let completed = false;
      let currentTaskPlan = originalTaskPlan; // 新增：当前任务规划

      // 移除迭代次数限制，让AI自己判断是否完成
      while (!completed && !this.shouldStop) {
        const stepStartTime = performance.now();
        const stepLog = `=== 执行第 ${iteration + 1} 次迭代 ===`;
        console.log(`\n${stepLog}`);
        this.sendLog(stepLog);
        
        try {
          // 检查是否需要停止
          if (this.shouldStop) {
            console.log('🛑 检测到停止信号，退出执行循环');
            this.sendLog('🛑 检测到停止信号，退出执行循环');
            break;
          }
          
          // 获取AI指令（AI自己判断进度）
          const instructionLog = '🤖 正在获取AI指令...';
          console.log(instructionLog);
          this.sendLog(instructionLog);
          
          const instructionStartTime = performance.now();
          const instruction = await aiService.getExecutionInstructions(
            currentPageInfo, 
            this.executionResults,
            currentTaskPlan,
            this.originalTaskDescription
          );
          const instructionTime = performance.now() - instructionStartTime;
          
          // 检查是否完成
          if (instruction.completed) {
            completed = true;
            const completeLog = '🎉 任务完成！';
            console.log(completeLog);
            this.sendLog(completeLog);
            break;
          }
          
          const instructionResultLog = `✅ AI指令获取完成 (${instructionTime.toFixed(0)}ms): ${instruction.action}`;
          console.log(instructionResultLog);
          this.sendLog(instructionResultLog);
          
          const detailLog = `📝 指令详情: ${instruction.description || instruction.action}`;
          console.log(detailLog);
          this.sendLog(detailLog);
          
          // 打印完整的AI指令供调试
          console.log('🤖 AI生成的完整指令:', JSON.stringify(instruction, null, 2));
          
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
          
          // 获取指令执行后的页面状态
          const pageInfoAfter = await this.getPageInfoFromBackground();
          
          // 构建执行历史记录
          const executionRecord = {
            pageInfoBefore: previousPageInfo,
            instruction: instruction
          };
          
          this.executionResults.push(executionRecord);
          
          const resultLog = `✅ 指令执行完成 (${executeTime.toFixed(0)}ms)`;
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

          // 监督智能体介入点 - 每次有错误都介入，无次数限制
          if (result.error) {
            break;
            const failureResult = await this.handleFailure(executionRecord, pageInfoAfter, currentTaskPlan);
            currentTaskPlan = failureResult.taskPlan;
            
            // 如果监督智能体提供了下一步指令，直接使用
            if (failureResult.nextInstruction) {
              console.log('🔄 监督智能体提供下一步指令，直接执行...');
              this.sendLog('🔄 监督智能体提供下一步指令，直接执行...');
              
              // 检查是否完成
              if (failureResult.nextInstruction.completed) {
                completed = true;
                const completeLog = '🎉 任务完成！';
                console.log(completeLog);
                this.sendLog(completeLog);
                break;
              }
              
              // 直接执行监督智能体提供的指令
              const executeLog = '⚡ 正在执行监督智能体提供的指令...';
              console.log(executeLog);
              this.sendLog(executeLog);
              
              const executeStartTime = performance.now();
              const supervisorResult = await this.executionEngine.executeInstruction(failureResult.nextInstruction);
              const executeTime = performance.now() - executeStartTime;
              
              // 获取指令执行后的页面状态
          const pageInfoAfterSupervisor = await this.getPageInfoFromBackground();
              
              // 构建执行历史记录
              const supervisorRecord = {
                pageInfoBefore: pageInfoAfter,
                instruction: failureResult.nextInstruction
              };
              
              this.executionResults.push(supervisorRecord);
              
              const resultLog = `✅ 监督智能体指令执行完成 (${executeTime.toFixed(0)}ms)`;
              console.log(resultLog);
              this.sendLog(resultLog);
              
              if (supervisorResult.error) {
                const errorLog = `❌ 错误: ${supervisorResult.error}`;
                console.log(errorLog);
                this.sendLog(errorLog);
              }
              if (supervisorResult.data) {
                const dataLog = `📊 结果数据: ${JSON.stringify(supervisorResult.data).substring(0, 100)}...`;
                console.log(dataLog);
                this.sendLog(dataLog);
              }

              // 保存当前页面状态作为下次操作前的状态
              previousPageInfo = pageInfoAfterSupervisor;
              
              // 更新当前页面信息
              currentPageInfo = pageInfoAfterSupervisor;
              
              // 如果监督智能体的指令也失败了，继续循环让监督智能体再次介入
              if (supervisorResult.error) {
                continue; // 继续循环，让监督智能体再次介入
              }
            }
          }

          // 保存当前页面状态作为下次操作前的状态
          previousPageInfo = pageInfoAfter;
          
          // 更新当前页面信息
          currentPageInfo = pageInfoAfter;
          
          const stepTime = performance.now() - stepStartTime;
          const stepTimeLog = `⏱️ 第 ${iteration + 1} 次迭代总用时: ${stepTime.toFixed(0)}ms`;
          console.log(stepTimeLog);
          this.sendLog(stepTimeLog);
          
          iteration++;
          
        } catch (error) {
          const errorLog = `❌ 第 ${iteration + 1} 次迭代失败: ${error.message}`;
          console.error(errorLog);
          this.sendLog(errorLog);
          
          // 获取异常发生后的页面状态
          const pageInfoAfterError = await this.getPageInfoFromBackground();
          
          // 记录错误结果
          const errorRecord = {
            pageInfoBefore: previousPageInfo,
            instruction: null  // 异常时没有指令
          };
          this.executionResults.push(errorRecord);
          
          // 监督智能体介入异常处理 - 每次异常都介入
          const failureResult = await this.handleFailure(errorRecord, pageInfoAfterError, currentTaskPlan);
          currentTaskPlan = failureResult.taskPlan;
          
          // 如果监督智能体提供了下一步指令，直接使用
          if (failureResult.nextInstruction) {
            console.log('🔄 监督智能体提供下一步指令，直接执行...');
            this.sendLog('🔄 监督智能体提供下一步指令，直接执行...');
            
            // 检查是否完成
            if (failureResult.nextInstruction.completed) {
              completed = true;
              const completeLog = '🎉 任务完成！';
              console.log(completeLog);
              this.sendLog(completeLog);
              break;
            }
            
            // 直接执行监督智能体提供的指令
            const executeLog = '⚡ 正在执行监督智能体提供的指令...';
            console.log(executeLog);
            this.sendLog(executeLog);
            
            const executeStartTime = performance.now();
            const supervisorResult = await this.executionEngine.executeInstruction(failureResult.nextInstruction);
            const executeTime = performance.now() - executeStartTime;
            
            // 获取指令执行后的页面状态
            const pageInfoAfterSupervisor = await this.getPageInfoFromBackground();
            
            // 构建执行历史记录
            const supervisorRecord = {
              pageInfoBefore: pageInfoAfterError,
              instruction: failureResult.nextInstruction
            };
            
            this.executionResults.push(supervisorRecord);
            
            const resultLog = `✅ 监督智能体指令执行完成 (${executeTime.toFixed(0)}ms)`;
            console.log(resultLog);
            this.sendLog(resultLog);
            
            if (supervisorResult.error) {
              const errorLog = `❌ 错误: ${supervisorResult.error}`;
              console.log(errorLog);
              this.sendLog(errorLog);
            }
            if (supervisorResult.data) {
              const dataLog = `📊 结果数据: ${JSON.stringify(supervisorResult.data).substring(0, 100)}...`;
              console.log(dataLog);
              this.sendLog(dataLog);
            }

            // 保存当前页面状态作为下次操作前的状态
            previousPageInfo = pageInfoAfterSupervisor;
            
            // 更新当前页面信息
            currentPageInfo = pageInfoAfterSupervisor;
            
            // 如果监督智能体的指令也失败了，继续循环让监督智能体再次介入
            if (supervisorResult.error) {
              continue; // 继续循环，让监督智能体再次介入
            }
          }
          
          // 保存当前页面状态作为下次操作前的状态
          previousPageInfo = pageInfoAfterError;
          
          // 更新当前页面信息
          currentPageInfo = pageInfoAfterError;

          iteration++;
        }
      }

      return {
        success: completed && !this.shouldStop,
        stopped: this.shouldStop,
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
      this.shouldStop = false; // 重置停止标志
    }
  }

  // 从 background 获取页面信息
  async getPageInfoFromBackground() {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_PAGE_INFO' }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.ok) {
            return reject(new Error(response?.error || '获取页面信息失败'));
          }
          resolve(response.pageInfo);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 停止执行
  stop() {
    if (this.isRunning) {
      this.shouldStop = true;
      this.isRunning = false;
      this.currentTask = null;
      console.log('任务停止请求已发送');
    }
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

  // 处理失败情况（统一方法）
  async handleFailure(result, currentPageInfo, currentTaskPlan) {
    console.log('🔍 执行失败，监督智能体介入分析...');
    this.sendLog('🔍 监督智能体介入分析失败原因...');
    
    // 分析失败原因并直接提供解决方案
    const analysisResult = await aiService.analyzeFailureAndProvideSolution(
      result, 
      currentPageInfo, 
      currentTaskPlan,
      this.executionResults,
      this.originalTaskDescription
    );
    
    console.log('📊 失败分析结果:', analysisResult);
    this.sendLog(`📊 失败原因: ${analysisResult.reason}`);
    this.sendLog(`💡 解决方案: ${analysisResult.solution}`);
    
    // 如果需要重新规划，使用分析结果中的修改后的规划
    if (analysisResult.needReplan && analysisResult.revisedPlan) {
      console.log('🔄 需要重新规划，修改任务指导...');
      this.sendLog('🔄 正在修改任务指导...');
      
      currentTaskPlan = analysisResult.revisedPlan;
      
      console.log('✅ 任务指导已修改');
      this.sendLog('✅ 任务指导已修改，继续执行');
    }
    
    // 返回分析结果，包含下一步指令
    return {
      taskPlan: currentTaskPlan,
      nextInstruction: analysisResult.action ? {
        action: analysisResult.action,
        description: analysisResult.description,
        target: analysisResult.target,
        value: analysisResult.value,
        wait: analysisResult.wait,
        url: analysisResult.url,
        completed: analysisResult.completed
      } : null
    };
  }

}

// 导出智能执行器
window.SmartExecutor = SmartExecutor;
