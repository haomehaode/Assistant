const elApiUrl = document.getElementById('apiUrl');
const elApiKey = document.getElementById('apiKey');
const elModel = document.getElementById('model');
const elStatus = document.getElementById('status');

async function init() {
  const s = await configManager.getConfig();
  elApiUrl.value = s.apiUrl || '';
  elApiKey.value = s.apiKey || '';
  elModel.value = s.model || '';
}

document.getElementById('save').addEventListener('click', async () => {
  const data = {
    apiUrl: elApiUrl.value.trim(),
    apiKey: elApiKey.value.trim(),
    model: elModel.value.trim()
  };
  
  // 验证必要配置
  if (!data.apiUrl) {
    elStatus.textContent = '请设置API地址';
    elStatus.style.color = 'red';
    return;
  }
  
  if (!data.apiKey) {
    elStatus.textContent = '请设置API Key';
    elStatus.style.color = 'red';
    return;
  }
  
  if (!data.model) {
    elStatus.textContent = '请设置模型名称';
    elStatus.style.color = 'red';
    return;
  }
  
  await configManager.saveConfig(data);
  elStatus.textContent = '配置已保存';
  elStatus.style.color = 'green';
  setTimeout(() => {
    elStatus.textContent = '';
    elStatus.style.color = '';
  }, 1500);
});

init();
