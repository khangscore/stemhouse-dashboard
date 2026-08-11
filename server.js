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

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [
            { role: 'user', parts: [{ text: userText }] }
          ],
          generationConfig: { maxOutputTokens: 1000 }
        })
      }
    );

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || `Lỗi từ Gemini API (${upstream.status})`;
      return res.status(upstream.status).json({ error: msg });
    }

    // Chuyển định dạng trả về của Gemini sang định dạng { content: [{ type: 'text', text: ... }] }
    // để khớp với phần code cũ trong 153.html (không cần sửa gì thêm ở HTML).
    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map(p => p.text || '').join('')
      : '';

    if (!text) {
      return res.status(502).json({ error: 'Gemini không trả về nội dung. Có thể nội dung bị chặn bởi bộ lọc an toàn.' });
    }

    return res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error('Lỗi khi gọi Gemini API:', err);
    return res.status(502).json({ error: 'Không kết nối được tới Gemini API từ server.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
  console.log(API_KEY ? '✅ GEMINI_API_KEY đã được nạp.' : '⚠️  CHƯA có GEMINI_API_KEY');
});
