// 统一配置管理器
class ConfigManager {
  constructor() {
    this.defaultConfig = {
      apiUrl: '',
      apiKey: '',
      model: ''
    };
  }

  // 获取配置
  async getConfig() {
    return await this.loadFromStorage();
  }

  // 从存储中加载配置
  async loadFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.defaultConfig, resolve);
    });
  }

  // 保存配置
  async saveConfig(config) {
    // 验证配置
    if (!this.validateConfig(config)) {
      throw new Error('配置验证失败');
    }

    // 保存到存储
    await new Promise((resolve) => {
      chrome.storage.sync.set(config, resolve);
    });
  }

  // 验证配置
  validateConfig(config) {
    return !!(config.apiUrl && config.apiKey && config.model);
  }

  // 检查配置是否完整
  async isConfigComplete() {
    const config = await this.getConfig();
    return this.validateConfig(config);
  }

  // 获取API配置（用于AI调用）
  async getAPIConfig() {
    const config = await this.getConfig();
    return {
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      model: config.model
    };
  }
}

// 创建全局配置管理器实例
const configManager = new ConfigManager();

// 导出配置管理器
window.ConfigManager = ConfigManager;
window.configManager = configManager;
