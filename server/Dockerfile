FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATA_FILE=/data/messages.json
ENV UPLOAD_DIR=/data/uploads

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data/uploads
VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "server.js"]
