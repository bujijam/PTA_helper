document.addEventListener('DOMContentLoaded', () => {
  // 定义默认模型 ID (Gemini 1.5 Pro)
  // const DEFAULT_MODEL = "google/gemini-3-pro-preview";
  const DEFAULT_MODEL = "deepseek/deepseek-r1-0528:free";

  // 加载已保存的设置
  chrome.storage.local.get(['apiKey', 'model'], (result) => {
    if (result.apiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
    
    // 如果有保存的模型，就用保存的；如果没有，就用默认的 Gemini
    const modelToUse = result.model || DEFAULT_MODEL;
    document.getElementById('modelSelect').value = modelToUse;
  });

  // 保存设置
  document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('modelSelect').value;
    
    if (!apiKey) {
      alert("请输入 API Key！");
      return;
    }

    chrome.storage.local.set({ apiKey, model }, () => {
      const status = document.getElementById('status');
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 2000);
    });
  });
});