require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// 4단계(DB 스키마)에서 db 연결과 라우트가 여기에 추가될 예정입니다.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '백엔드 서버 정상 동작 중' });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
