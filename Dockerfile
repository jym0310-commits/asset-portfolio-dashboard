# 포트폴리오노트 배포용 Dockerfile
FROM node:20-slim

# better-sqlite3는 네이티브 모듈이라 빌드 도구가 필요합니다.
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 설치 (캐시 효율을 위해 package.json만 먼저 복사)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# 소스 전체 복사 (백엔드 + 프론트엔드)
COPY backend ./backend
COPY frontend ./frontend

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "backend/src/server.js"]