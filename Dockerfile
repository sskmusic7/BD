# Backend Dockerfile for deployment
FROM node:18-alpine

WORKDIR /app

# Copy backend package files
COPY package*.json ./
RUN npm install --only=production

# Copy backend source
COPY server/ ./server/

EXPOSE 5002

CMD ["node", "server/index.js"]
