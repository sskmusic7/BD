# Backend Dockerfile for deployment
FROM node:18-alpine

# Used to remux finished recordings into a proper container. This is a
# stream copy (-c copy), NOT a re-encode — seconds of CPU, which matters on
# a 1-core droplet that also runs the call server and the TURN relay.
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy server source
COPY server/ ./server/

# Expose the port (Cloud Run will set PORT env var)
EXPOSE 8080

CMD ["node", "server/index.js"]
