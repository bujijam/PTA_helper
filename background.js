// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchAI") {
    chrome.storage.local.get(['apiKey', 'model'], async (data) => {
      if (!data.apiKey) {
        sendResponse({ error: "请先配置 API Key" });
        return;
      }

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${data.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/dstutor",
            "X-Title": "DS Tutor Extension"
          },
          body: JSON.stringify({
            "model": data.model || "google/gemini-3-pro-preview",
            "messages": [
              {
                "role": "system",
                "content": `你是一位计算机数据结构教授。请分析题目并给出答案。
                必须严格按照以下 JSON 格式返回，不要包含 Markdown 标记：
                {
                  "type": "choice", // 或者是 "fill" (填空)
                  "answer": "A", // 选择题填选项字母，填空题填具体内容
                  "explanation": "尽可能简短的解析内容..."
                }`
              },
              {
                "role": "user",
                "content": request.prompt
              }
            ],
            "response_format": { "type": "json_object" } // 强制 JSON 模式（部分模型支持）
          })
        });

        const result = await response.json();
        
        if (result.choices && result.choices.length > 0) {
          // 尝试解析 JSON
          let aiContent = result.choices[0].message.content;
          try {
            const parsedData = JSON.parse(aiContent);
            sendResponse({ success: true, data: parsedData });
          } catch (e) {
            // 如果模型没返回标准JSON，尝试手动修复或仅返回文本
            sendResponse({ success: true, data: { answer: "解析失败", explanation: aiContent } });
          }
        } else {
          sendResponse({ error: "API 返回异常", raw: result });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
    });
    return true;
  }
});