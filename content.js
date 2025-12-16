// content.js

// === 核心修复：强力模拟用户输入（兼容 React/Vue/原生） ===
function triggerInputEvent(element, value) {
  // 1. 聚焦元素
  element.focus();

  // 2. 设置值：绕过 React 的 setter 拦截
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // 3. 触发一系列事件，确保网页感知到变化
  const eventOptions = { bubbles: true, cancelable: true, composed: true };
  element.dispatchEvent(new Event('input', eventOptions));
  element.dispatchEvent(new Event('change', eventOptions)); // 很多网站是在 change 或 blur 时保存
  
  // 4. 失焦（有时触发保存逻辑）
  element.blur(); 
}

// 获取有效题目容器
function getQuestionContainers() {
  // 过滤掉没有 ID 的容器
  return Array.from(document.querySelectorAll('.pc-x')).filter(div => div.id && div.id.length > 5);
}

function addAIButtons() {
  const questions = getQuestionContainers();

  questions.forEach((qDiv) => {
    if (qDiv.querySelector('.ds-ai-btn')) return;

    // 尝试找到题目顶部的操作栏
    const headerRow = qDiv.querySelector('.flex.flex-wrap.gap-2');
    
    if (headerRow) {
      const btn = document.createElement('button');
      btn.className = 'ds-ai-btn';
      btn.innerText = '🤖 AI 解题';
      btn.style.marginLeft = '10px';
      // 防止点击按钮触发布局内的其他事件
      btn.onclick = (e) => {
        e.stopPropagation(); 
        handleExplanation(e, qDiv);
      };
      headerRow.appendChild(btn);
    }

    // 创建答案显示区
    if (!qDiv.querySelector('.ds-ai-answer-box')) {
      const answerDiv = document.createElement('div');
      answerDiv.className = 'ds-ai-answer-box';
      answerDiv.style.display = 'none';
      qDiv.appendChild(answerDiv);
    }
  });
}

async function handleExplanation(e, qDiv) {
  const btn = e.target;
  const outputDiv = qDiv.querySelector('.ds-ai-answer-box');
  
  // === 1. 修复选择器 ===
  // 你的 HTML 中 input 没有 type="text"，所以原来的 selector 会失效
  // 我们改用 [data-blank="true"] 来精确定位
  const textInputs = qDiv.querySelectorAll('input[data-blank="true"]');
  const radioInputs = qDiv.querySelectorAll('input[type="radio"]');
  
  let questionType = 'unknown';
  if (textInputs.length > 0) questionType = 'fill';
  else if (radioInputs.length > 0) questionType = 'choice';

  // === 2. 智能提取题目文本 ===
  const markdownBlock = qDiv.querySelector('.rendered-markdown');
  let cleanQuestionText = "";

  if (markdownBlock) {
    if (questionType === 'fill') {
      // 克隆节点处理，把输入框替换为占位符
      const clone = markdownBlock.cloneNode(true);
      // 查找 clone 里的输入框对应的 wrapper 或 input 本身
      const inputs = clone.querySelectorAll('input, span[data-blank="true"]');
      inputs.forEach(input => {
        // 创建一个显眼的占位符，帮助 AI 识别
        const placeholder = document.createTextNode(" 【此处填空】 ");
        if(input.parentNode) {
            input.parentNode.replaceChild(placeholder, input);
        }
      });
      cleanQuestionText = clone.innerText;
    } else {
      cleanQuestionText = markdownBlock.innerText;
    }
  } else {
    cleanQuestionText = "未找到题目内容";
  }

  // === 3. 获取选项 ===
  let optionsText = "";
  if (questionType === 'choice') {
    const labels = qDiv.querySelectorAll('label');
    labels.forEach(label => {
      let optText = label.innerText.trim().replace(/\n+/g, ' '); 
      optionsText += `${optText}\n`;
    });
  }

  // === 4. 构造 Prompt ===
  let promptSuffix = "";
  if (questionType === 'fill') {
    promptSuffix = `这是一个填空题，共有 ${textInputs.length} 个空。请在 JSON 的 answer 字段中返回一个字符串数组，数组长度必须为 ${textInputs.length}，严格按顺序对应每个空的答案。不要包含多余解释。`;
  } else {
    promptSuffix = "如果是判断题，answer 返回 'T' 或 'F'。如果是选择题，返回选项字母。";
  }

  const fullPrompt = `题目：\n${cleanQuestionText}\n\n选项/补充：\n${optionsText}\n\n要求：\n${promptSuffix}`;

  // === UI 更新 ===
  btn.innerText = '🧠 思考中...';
  btn.disabled = true;
  outputDiv.style.display = 'block';
  outputDiv.innerHTML = '<div class="loading-spinner">正在分析...</div>';

  // === 5. 发送请求 ===
  chrome.runtime.sendMessage({
    action: "fetchAI",
    prompt: fullPrompt
  }, (response) => {
    btn.innerText = '🤖 AI 解题';
    btn.disabled = false;

    if (response && response.success) {
      const result = response.data;
      
      let answerDisplay = "";
      if (Array.isArray(result.answer)) {
        answerDisplay = result.answer.join("，");
      } else {
        answerDisplay = result.answer;
      }

      outputDiv.innerHTML = `
        <div class="ai-result-header">
          <strong>AI 答案：</strong> <span class="ai-answer-tag">${answerDisplay}</span>
        </div>
        <div class="ai-explanation">
          ${result.explanation ? result.explanation.replace(/\n/g, '<br>') : "AI 未提供详细解析，请参考答案。"}
        </div>
      `;

      // === 6. 执行自动填充 ===
      if (questionType === 'fill' && Array.isArray(result.answer)) {
        textInputs.forEach((input, index) => {
          if (result.answer[index]) {
            // 清理答案中的引号或空格
            const cleanVal = String(result.answer[index]).trim();
            
            // 调用强力填充函数
            triggerInputEvent(input, cleanVal);
            
            // 视觉反馈：变为浅绿色
            input.style.backgroundColor = "#d9f7be"; 
            input.style.transition = "background-color 0.5s";
          }
        });
      } else if (questionType === 'choice') {
        autoSelectOption(qDiv, result.answer);
      }

    } else {
      outputDiv.innerHTML = `<span style="color:red">出错: ${response.error || '解析结果格式异常'}</span>`;
    }
  });
}

function autoSelectOption(qDiv, answer) {
  if (!answer) return;
  
  let target = answer.toString().trim().toUpperCase();
  // 简单的模糊匹配处理
  if (target.includes("TRUE") || target === "√") target = "T";
  if (target.includes("FALSE") || target === "×") target = "F";
  if (target.length > 1 && !['TRUE','FALSE'].includes(target)) target = target[0];

  const labels = qDiv.querySelectorAll('label');
  labels.forEach(label => {
    const text = label.innerText.toUpperCase().trim();
    // 匹配 "A." 或 "A " 或 完全等于 "T"/"F"
    if (text === target || text.startsWith(target + ".") || text.startsWith(target + " ")) {
      label.click();
      label.style.outline = "2px solid #28a745";
      setTimeout(() => label.style.outline = "", 1500);
    }
  });
}

// 监控页面动态加载
const observer = new MutationObserver((mutations) => {
  addAIButtons();
});
observer.observe(document.body, { childList: true, subtree: true });

// 初始运行
setTimeout(addAIButtons, 1000);