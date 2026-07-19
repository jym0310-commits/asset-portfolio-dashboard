-- 사용자 계정
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  terms_agreed_at TEXT,             -- 필수 약관(이용약관/개인정보 수집이용) 동의 시각
  reset_token_hash TEXT,            -- 비밀번호 재설정 토큰의 해시값 (원문은 저장 안 함)
  reset_token_expires TEXT,         -- 재설정 토큰 만료 시각
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 포트폴리오 공유 관계: owner_user_id(원 소유자)의 데이터를 shared_with_user_id가 보고 수정할 수 있게 허용
CREATE TABLE IF NOT EXISTS portfolio_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('edit', 'view')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_user_id, shared_with_user_id)
);

-- 현금 계좌
CREATE TABLE IF NOT EXISTS cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  institution TEXT,
  currency TEXT NOT NULL DEFAULT 'KRW',
  balance REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 부동산
CREATE TABLE IF NOT EXISTS real_estates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  balance REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 보험
CREATE TABLE IF NOT EXISTS insurances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  balance REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 보유 종목 (주식 + 코인)
CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('domestic_stock', 'overseas_stock', 'crypto')),
  sector TEXT,
  institution TEXT,
  exchange TEXT,
  purchase_date TEXT,
  purchase_fx_rate REAL,
  quantity REAL NOT NULL DEFAULT 0,
  avg_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KRW',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, symbol, asset_type, institution)
);

-- 일별 시세 히스토리 (시장 공통 정보라 사용자별로 나누지 않음)
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('domestic_stock', 'overseas_stock', 'crypto')),
  date TEXT NOT NULL,
  close_price REAL NOT NULL,
  volume REAL,
  UNIQUE(symbol, asset_type, date)
);

-- 매수/매도 거래내역 (실현손익 계산용)
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('domestic_stock', 'overseas_stock', 'crypto')),
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  realized_pnl REAL,
  trade_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 일별 총자산 스냅샷 (자산 성장 추이 차트용, 사용자별로 하루에 하나씩)
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  cash_total REAL NOT NULL DEFAULT 0,
  real_estate_total REAL NOT NULL DEFAULT 0,
  crypto_total REAL NOT NULL DEFAULT 0,
  stock_total REAL NOT NULL DEFAULT 0,
  insurance_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  UNIQUE(user_id, snapshot_date)
);

-- 연도별 재무 목표 (총자산 목표금액)
CREATE TABLE IF NOT EXISTS financial_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  target_amount REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_price_history_symbol_date ON price_history(symbol, date);
CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_cash_accounts_user ON cash_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_real_estates_user ON real_estates(user_id);
CREATE INDEX IF NOT EXISTS idx_insurances_user ON insurances(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user ON net_worth_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_shared_with ON portfolio_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_financial_goals_user ON financial_goals(user_id);