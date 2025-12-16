// content.js

// 1. 查找所有题目容器 (根据提供的HTML，容器有 pc-x 类且通常有数字ID)
// 我们过滤掉没有 ID 的无关容器
function getQuestionContainers() {
  return Array.from(document.querySelectorAll('.pc-x')).filter(div => div.id && div.id.length > 5);
}

function addAIButtons() {
  const questions = getQuestionContainers();

  questions.forEach((qDiv) => {
    // 防止重复添加
    if (qDiv.querySelector('.ds-ai-btn')) return;

    // 找到题目头部的操作栏 (通常是第一行 flex 布局的位置)
    const headerRow = qDiv.querySelector('.flex.flex-wrap.gap-2');
    
    if (headerRow) {
      const btn = document.createElement('button');
      btn.className = 'ds-ai-btn';
      btn.innerText = '🤖 AI 解题';
      // 样式调整以匹配原生风格
      btn.style.marginLeft = '10px';
      btn.style.padding = '2px 10px';
      btn.style.fontSize = '12px';
      
      btn.onclick = (e) => handleExplanation(e, qDiv);
      headerRow.appendChild(btn);
    }

    // 创建解析显示框
    const answerDiv = document.createElement('div');
    answerDiv.className = 'ds-ai-answer-box';
    answerDiv.style.display = 'none';
    qDiv.appendChild(answerDiv);
  });
}

async function handleExplanation(e, qDiv) {
  const btn = e.target;
  const outputDiv = qDiv.querySelector('.ds-ai-answer-box');

  // === 1. 获取题目文本 ===
  // 题目描述通常在第一个 markdown 块中
  const questionContentBlock = qDiv.querySelector('.markdownBlock_tErSz .rendered-markdown');
  const questionText = questionContentBlock ? questionContentBlock.innerText : "无法获取题目内容";

  // === 2. 获取选项内容 (如果有) ===
  const labels = qDiv.querySelectorAll('label');
  let optionsText = "";
  let isChoiceQuestion = labels.length > 0;

  if (isChoiceQuestion) {
    labels.forEach(label => {
      // 提取选项字母 (A.) 和 内容
      // 你的HTML结构中，字母在 label -> div -> span 中
      const letterSpan = label.querySelector('span'); 
      const letter = letterSpan ? letterSpan.innerText.trim() : "";
      const contentDiv = label.querySelector('.markdownBlock_tErSz');
      const content = contentDiv ? contentDiv.innerText.trim() : "";
      optionsText += `${letter} ${content}\n`;
    });
  }

  // === 3. 构造 Prompt ===
  const fullPrompt = `题目：\n${questionText}\n\n选项：\n${optionsText}\n\n如果是填空题，请直接给出填空结果。如果是选择题，请判断正确选项。`;

  // === UI 更新 ===
  btn.innerText = '分析中...';
  btn.disabled = true;
  outputDiv.style.display = 'block';
  outputDiv.innerHTML = '<div class="loading-spinner">正在请求 AI 教授进行分析...</div>';

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
      outputDiv.innerHTML = `
        <div class="ai-result-header">
          <strong>建议答案：</strong> <span class="ai-answer-tag">${result.answer}</span>
        </div>
        <div class="ai-explanation">
          <strong>解析：</strong><br>
          ${result.explanation.replace(/\n/g, '<br>')}
        </div>
      `;

      // === 5. 自动完成 (Auto-fill) ===
      if (isChoiceQuestion && result.answer) {
        autoSelectOption(qDiv, result.answer);
      } else {
        // 如果是填空题，尝试自动填写 (需要您提供填空题的HTML才能精确匹配)
        // 这里做一个简单的尝试：查找 text input
        const textInput = qDiv.querySelector('input[type="text"]');
        if (textInput) {
            textInput.value = result.answer;
            textInput.dispatchEvent(new Event('input', { bubbles: true })); // 触发React/Vue的数据绑定
        }
      }

    } else {
      outputDiv.innerHTML = `<span style="color:red">出错: ${response.error || '未知错误'}</span>`;
    }
  });
}

// 自动勾选单选框逻辑
function autoSelectOption(qDiv, answerLetter) {
  // 清洗答案，比如 AI 返回 "A" 或 "A." 或 "选项 A"，只提取 A/B/C/D
  const cleanAnswer = answerLetter.match(/[A-D]/i);
  if (!cleanAnswer) return;
  
  const targetLetter = cleanAnswer[0].toUpperCase() + "."; // 构造 "A." 这种格式来匹配
  
  const labels = qDiv.querySelectorAll('label');
  labels.forEach(label => {
    const letterSpan = label.querySelector('span');
    if (letterSpan && letterSpan.innerText.trim() === targetLetter) {
      // 模拟点击 label
      label.click();
      
      // 添加视觉反馈
      label.style.border = "2px solid #28a745";
      setTimeout(() => label.style.border = "", 2000);
    }
  });
}

// 监控页面变化（应对动态加载）
const observer = new MutationObserver((mutations) => {
  addAIButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 初始加载
setTimeout(addAIButtons, 1500);