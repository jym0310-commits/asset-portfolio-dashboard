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

## CodeSpace -> Git -> 서버에 배포하기
A) 일반적인 코드 수정 (스키마 변경 없음)
Codespaces에서 평소처럼 코드 수정
Codespaces에서 npm run dev로 먼저 테스트해서 잘 되는지 확인
터미널에서:

git push
git commit -m "수정 내용 작성하기"
git push
Northflank가 push를 감지해서 자동으로 새 버전을 빌드하고 배포해줘요 (보통 1~3분 걸려요)
Northflank 대시보드의 Builds 탭에서 성공 여부 확인 → 실제 서비스 주소로 접속해서 확인

B) 새로운 API 키/환경변수가 필요할 때
Codespaces의 .env 파일에만 넣으면 안 되고, Northflank에도 똑같이 등록해야 해요.

Northflank → Services → portfolionote 1 → Environment 메뉴 → 새 변수 추가 → 저장하면 자동 재배포돼요

C) ⚠️ DB 스키마 변경(테이블/컬럼 추가)이 필요할 때 — 주의!
지금까지 Codespaces에서는 스키마 바뀌면 "data.sqlite 삭제 후 재시딩"하는 방식으로 해왔는데, 실제 서비스에 진짜 가입자가 생기면 이 방법을 그대로 쓰면 안 돼요 (그 사람들 데이터가 다 날아가요).
이 경우엔 저한테 "스키마를 바꿔야 하는데 실제 서비스에 이미 데이터가 있어"라고 말씀해주시면, 데이터를 안 지우고 **컬럼만 추가하는 안전한 방식(마이그레이션)**으로 만들어드릴게요. 아직 실사용자가 없는 지금 단계라면 이전처럼 편하게 진행하셔도 괜찮아요