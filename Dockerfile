# Backend Dockerfile for deployment
FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy server source
COPY server/ ./server/

# Expose the port (Cloud Run will set PORT env var)
EXPOSE 8080

CMD ["node", "server/index.js"]
