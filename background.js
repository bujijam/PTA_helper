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
            "HTTP-Referer": "https://github.com/bujijam/PTA_helper",
            "X-Title": "DS Tutor Extension"
          },
          body: JSON.stringify({
            "model": data.model || "deepseek/deepseek-r1-0528:free",
            "messages": [
              {
                "role": "system",
                "content": `你是一位计算机数据结构教授。请分析题目并给出答案。
                
                必须严格按照以下 JSON 格式返回，不要包含 Markdown 标记：
                {
                  "type": "choice" | "true_false" | "fill_in_the_blank",
                  "answer": "...", 
                  //如果是选择题：返回选项字母 (A, B, C, D)
                  //如果是判断题：返回 "T" (正确) 或 "F" (错误)
                  //如果是填空题：必须返回字符串数组 ["第一空答案", "第二空答案", ...]
                  
                  "explanation": "尽可能简短的解析内容..."
                }`
              },
              {
                "role": "user",
                "content": request.prompt
              }
            ],
            "response_format": { "type": "json_object" } 
          })
        });

        const result = await response.json();
        
        if (result.choices && result.choices.length > 0) {
          let aiContent = result.choices[0].message.content;
          try {
            const parsedData = JSON.parse(aiContent);
            sendResponse({ success: true, data: parsedData });
          } catch (e) {
            // 容错处理：如果 AI 没返回完美 JSON，返回原始文本
            sendResponse({ success: true, data: { answer: "解析格式异常", explanation: aiContent } });
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