FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./server.js
COPY backend ./backend
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server.js"]
