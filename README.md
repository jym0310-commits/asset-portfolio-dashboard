# 자산 포트폴리오 대시보드

개인 자산(현금/부동산/코인/주식/보험)을 한눈에 관리하는 웹 대시보드.

## 스택
- 백엔드: Node.js (Express)
- DB: SQLite
- 프론트엔드: HTML/CSS/JS
- 국내+해외 주식 시세: 한국투자증권(KIS) Open API
- 코인 시세: Upbit API

## 폴더 구조
```
backend/    Node.js 서버, DB, 외부 API 연동, 스케줄러
frontend/   정적 대시보드 (HTML/CSS/JS)
```

## 실행 방법
```
cd backend
npm install
npm run dev
```
