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

## 서버에 배포 하는 방법
실제 서비스(Fly.io)에 반영하고 싶을 때만, Codespaces 터미널에서 fly deploy 라는 명령어 한 줄을 치면 돼요
Codespaces = 개발실습실 / GitHub = 코드 저장 / Fly.io = 실제 서비스가 돌아가는 곳이고, "배포한다"는 건 그냥 fly deploy 한 줄 치는 거예요.
