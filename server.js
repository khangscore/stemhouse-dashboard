// server.js — Backend trung gian để gọi Google Gemini API an toàn (MIỄN PHÍ)
// Chạy: node server.js
// Cần biến môi trường GEMINI_API_KEY (lấy tại https://aistudio.google.com/apikey)

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

app.use(express.json({ limit: '10mb' }));

// Phục vụ file HTML tĩnh
app.use(express.static(path.join(__dirname)));

// Mở link gốc ("/") sẽ tự động vào thẳng trang index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/baobai', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: 'Server chưa được cấu hình GEMINI_API_KEY. Hãy thêm biến môi trường GEMINI_API_KEY rồi khởi động lại server.'
    });
  }

  const { system, messages } = req.body || {};
  if (!messages || !messages[0] || !messages[0].content) {
    return res.status(400).json({ error: 'Thiếu nội dung tin nhắn trong request.' });
  }

  const userText = messages[0].content;

  // Danh sách model thử lần lượt — nếu Google ngừng hỗ trợ 1 model (lỗi 404),
  // server sẽ tự động thử model kế tiếp mà không cần sửa code.
  const MODELS_TO_TRY = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash'
  ];

  let lastError = null;

  for (const model of MODELS_TO_TRY) {
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: system ? { parts: [{ text: system }] } : undefined,
            contents: [
              { role: 'user', parts: [{ text: userText }] }
            ],
            generationConfig: { maxOutputTokens: 2000 }
          })
        }
      );

      const data = await upstream.json();

      if (!upstream.ok) {
        lastError = (data && data.error && data.error.message) || `Lỗi từ Gemini API (${upstream.status})`;
        // Nếu model này không còn tồn tại (404) hoặc bị chặn (403) -> thử model kế tiếp.
        // Nếu là lỗi khác (VD 429 hết quota) -> vẫn thử model khác vì mỗi model có quota riêng.
        continue;
      }

      const candidate = data.candidates && data.candidates[0];
      const text = candidate && candidate.content && candidate.content.parts
        ? candidate.content.parts.map(p => p.text || '').join('')
        : '';

      if (!text) {
        lastError = 'Gemini không trả về nội dung. Có thể nội dung bị chặn bởi bộ lọc an toàn.';
        continue;
      }

      // Thành công — trả kết quả về, dùng đúng định dạng cũ để khớp với 153.html
      return res.json({ content: [{ type: 'text', text }] });
    } catch (err) {
      lastError = 'Không kết nối được tới Gemini API từ server.';
      console.error(`Lỗi khi gọi model ${model}:`, err);
    }
  }

  // Nếu tất cả model đều thất bại
  return res.status(502).json({ error: lastError || 'Tất cả các model AI đều không phản hồi được.' });
});

app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
  console.log(API_KEY ? '✅ GEMINI_API_KEY đã được nạp.' : '⚠️  CHƯA có GEMINI_API_KEY');
});
