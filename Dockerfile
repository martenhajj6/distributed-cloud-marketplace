
FROM node:22-alpine

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./

RUN npm ci --omit=dev

COPY backend/ ./

COPY frontend/ /app/frontend/

CMD ["npm", "start"]

