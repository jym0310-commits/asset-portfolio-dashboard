require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { initSchema } = require('./db');
const { startDailyPriceScheduler } = require('./scheduler/dailyPriceCollector');
const { startExchangeRateRefresher } = require('./services/exchangeRateService');

const authRoutes = require('./routes/auth');
const sharesRoutes = require('./routes/shares');
const marketRoutes = require('./routes/market');
const economicCalendarRoutes = require('./routes/economicCalendar');
const summaryRoutes = require('./routes/summary');
const netWorthHistoryRoutes = require('./routes/netWorthHistory');
const cashRoutes = require('./routes/cash');
const realEstateRoutes = require('./routes/realEstate');
const holdingsRoutes = require('./routes/holdings');
const transactionsRoutes = require('./routes/transactions');

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Fly.io 등 프록시 뒤에서 실행될 때, https 여부를 정확히 인식하도록 설정
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // 개발(Codespaces)에서는 false, 배포(Fly.io, NODE_ENV=production)에서는 true로 https 쿠키만 허용
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
    },
  })
);

// DB 스키마 초기화 (테이블이 없으면 생성)
initSchema();

// 매일 자동 시세 수집 스케줄러 등록
startDailyPriceScheduler();

// 환율 자동 갱신 시작 (서버 시작시 1회 + 이후 1시간마다)
startExchangeRateRefresher();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '백엔드 서버 정상 동작 중' });
});

app.use('/api/auth', authRoutes);
app.use('/api/shares', sharesRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/economic-calendar', economicCalendarRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/net-worth-history', netWorthHistoryRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/real-estate', realEstateRoutes);
app.use('/api/holdings', holdingsRoutes);
app.use('/api/transactions', transactionsRoutes);

// 프론트엔드 정적 파일 서빙 (frontend/ 폴더)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));

if (isProduction) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`서버 실행 중 (production): 0.0.0.0:${PORT}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
  });
}
