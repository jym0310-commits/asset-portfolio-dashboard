require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SqliteSessionStore = require('better-sqlite3-session-store')(session);
const { db, initSchema } = require('./db');
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
const financialGoalsRoutes = require('./routes/financialGoals');

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// 프로덕션인데 세션 비밀키가 안 정해져 있으면, 안전하지 않은 기본값으로 조용히 넘어가지 않고
// 서버 실행 자체를 막습니다 (실수로 기본값이 배포되는 걸 방지).
if (isProduction && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET 환경변수가 설정되지 않았습니다. 프로덕션에서는 반드시 설정해야 합니다.');
  process.exit(1);
}

// Northflank 등 프록시 뒤에서 실행될 때, https 여부를 정확히 인식하도록 설정
app.set('trust proxy', 1);

// 기본적인 보안 헤더 설정 (X-Powered-By 제거, XSS/MIME 스니핑 방지 등)
// 참고: CSP(콘텐츠 보안 정책)는 지금 화면 코드가 onclick 같은 인라인 이벤트를 많이 써서,
// 기본 CSP를 켜면 버튼이 다 깨져요. 그래서 CSP는 꺼두고 나머지 보안 헤더만 적용했어요.
// (다음 단계로 화면 코드를 addEventListener 방식으로 바꾸면 CSP도 켤 수 있어요)
app.use(helmet({ contentSecurityPolicy: false }));
app.disable('x-powered-by');

app.use(express.json());

// 프론트엔드와 백엔드가 같은 서버에서 서빙되기 때문에 CORS는 필요 없습니다.
// (외부 사이트에서 우리 API를 직접 호출할 필요가 없어서 열어둘 이유가 없음)

// 무차별 대입 공격 방지: 로그인/회원가입은 더 엄격하게 제한
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 20, // 15분에 20회까지만
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 전체 API에 대한 느슨한 기본 제한 (과도한 자동화된 요청 방지)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.use(
  session({
    store: new SqliteSessionStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: 15 * 60 * 1000, // 15분마다 만료된 세션 정리
      },
    }),
    secret: process.env.SESSION_SECRET || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // 개발(Codespaces)에서는 false, 배포(NODE_ENV=production)에서는 true로 https 쿠키만 허용
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
app.use('/api/financial-goals', financialGoalsRoutes);

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
