// content.js

// 辅助函数：触发 React/Vue 的输入事件（非常重要，否则填入的值可能提交不上）
function triggerInputEvent(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeInputValueSetter.call(element, value);
  const ev2 = new Event('input', { bubbles: true });
  element.dispatchEvent(ev2);
}

// 1. 获取所有题目容器
function getQuestionContainers() {
  return Array.from(document.querySelectorAll('.pc-x')).filter(div => div.id && div.id.length > 5);
}

function addAIButtons() {
  const questions = getQuestionContainers();

  questions.forEach((qDiv) => {
    if (qDiv.querySelector('.ds-ai-btn')) return;

    const headerRow = qDiv.querySelector('.flex.flex-wrap.gap-2');
    
    if (headerRow) {
      const btn = document.createElement('button');
      btn.className = 'ds-ai-btn';
      btn.innerText = '🤖 AI 解题';
      btn.style.marginLeft = '10px';
      
      btn.onclick = (e) => handleExplanation(e, qDiv);
      headerRow.appendChild(btn);
    }

    const answerDiv = document.createElement('div');
    answerDiv.className = 'ds-ai-answer-box';
    answerDiv.style.display = 'none';
    qDiv.appendChild(answerDiv);
  });
}

async function handleExplanation(e, qDiv) {
  const btn = e.target;
  const outputDiv = qDiv.querySelector('.ds-ai-answer-box');
  
  // === 识别题型 ===
  const textInputs = qDiv.querySelectorAll('input[type="text"][data-blank="true"]');
  const radioInputs = qDiv.querySelectorAll('input[type="radio"]');
  
  let questionType = 'unknown';
  if (textInputs.length > 0) questionType = 'fill';
  else if (radioInputs.length > 0) questionType = 'choice';

  // === 1. 智能提取题目文本 ===
  // 核心逻辑：为了让AI知道哪里是空，我们需要把 HTML 里的 input 标签临时替换成 "______"
  const markdownBlock = qDiv.querySelector('.rendered-markdown');
  let cleanQuestionText = "";

  if (markdownBlock) {
    if (questionType === 'fill') {
      // 克隆节点以免破坏页面显示
      const clone = markdownBlock.cloneNode(true);
      const inputs = clone.querySelectorAll('input, span[data-blank="true"]'); // 覆盖 input 或 包裹 input 的 span
      inputs.forEach(input => {
        const placeholder = document.createTextNode(" ______ ");
        input.parentNode.replaceChild(placeholder, input);
      });
      cleanQuestionText = clone.innerText;
    } else {
      cleanQuestionText = markdownBlock.innerText;
    }
  } else {
    cleanQuestionText = "未找到题目内容";
  }

  // === 2. 获取选项（仅针对选择/判断）===
  let optionsText = "";
  if (questionType === 'choice') {
    const labels = qDiv.querySelectorAll('label');
    labels.forEach(label => {
      // 适配判断题的直接文本 (T/F) 和选择题的嵌套结构
      let optText = label.innerText.trim(); 
      // 简单的清洗：去掉多余换行
      optText = optText.replace(/\n+/g, ' '); 
      optionsText += `${optText}\n`;
    });
  }

  // === 3. 构造 Prompt ===
  let promptSuffix = "";
  if (questionType === 'fill') {
    promptSuffix = "这是一个填空题，请在 JSON 的 answer 字段中返回一个数组，包含每个空的准确答案。";
  } else {
    promptSuffix = "如果是判断题，answer 返回 'T' 或 'F'。如果是选择题，返回选项字母。";
  }

  const fullPrompt = `题目：\n${cleanQuestionText}\n\n选项：\n${optionsText}\n\n要求：\n${promptSuffix}`;

  // === UI 更新 ===
  btn.innerText = '🧠 思考中...';
  btn.disabled = true;
  outputDiv.style.display = 'block';
  outputDiv.innerHTML = '<div class="loading-spinner">AI 教授正在分析题目逻辑...</div>';

  // === 4. 发送请求 ===
  chrome.runtime.sendMessage({
    action: "fetchAI",
    prompt: fullPrompt
  }, (response) => {
    btn.innerText = '🤖 AI 解题';
    btn.disabled = false;

    if (response && response.success) {
      const result = response.data;
      
      // 显示解析
      let answerDisplay = "";
      if (Array.isArray(result.answer)) {
        answerDisplay = result.answer.join("，"); // 填空题数组展示
      } else {
        answerDisplay = result.answer; // 选择题单字符展示
      }

      outputDiv.innerHTML = `
        <div class="ai-result-header">
          <strong>答案：</strong> <span class="ai-answer-tag">${answerDisplay}</span>
        </div>
        <div class="ai-explanation">
          ${result.explanation.replace(/\n/g, '<br>')}
        </div>
      `;

      // === 5. 自动完成逻辑 ===
      if (questionType === 'fill' && Array.isArray(result.answer)) {
        // 自动填空
        textInputs.forEach((input, index) => {
          if (result.answer[index]) {
            // 使用 triggerInputEvent 确保 React 能检测到变动
            triggerInputEvent(input, result.answer[index]);
            input.style.backgroundColor = "#f6ffed"; // 视觉反馈
          }
        });
      } else if (questionType === 'choice') {
        // 自动勾选 (兼容 T/F 和 A-D)
        autoSelectOption(qDiv, result.answer);
      }

    } else {
      outputDiv.innerHTML = `<span style="color:red">出错: ${response.error || '未知错误'}</span>`;
    }
  });
}

function autoSelectOption(qDiv, answer) {
  if (!answer) return;
  
  // 归一化答案：如果是 "True" 转成 "T"，"False" 转成 "F"，否则取第一个字母
  let target = answer.toString().trim().toUpperCase();
  if (target.includes("TRUE")) target = "T";
  if (target.includes("FALSE")) target = "F";
  if (target.length > 1) target = target[0]; // "Option A" -> "A"

  const labels = qDiv.querySelectorAll('label');
  let found = false;

  labels.forEach(label => {
    const text = label.innerText.toUpperCase();
    
    // 匹配逻辑：
    // 1. 判断题：label 文本完全等于 "T" 或 "F"
    // 2. 选择题：label 包含 "A." 或 "A " 这种模式
    const isTF = (target === 'T' || target === 'F') && text.trim() === target;
    const isChoice = text.startsWith(target + ".") || text.startsWith(target + " ");

    if (isTF || isChoice) {
      label.click();
      label.style.border = "2px solid #28a745";
      setTimeout(() => label.style.border = "", 2000);
      found = true;
    }
  });
}

// 监控页面变化
const observer = new MutationObserver((mutations) => {
  addAIButtons();
});

observer.observe(document.body, { childList: true, subtree: true });

// 初始加载
setTimeout(addAIButtons, 1500);