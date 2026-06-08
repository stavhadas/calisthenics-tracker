FROM node:20-alpine AS builder
WORKDIR /app

# Install root workspace dependencies
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- Runtime image ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Only install production server deps
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000
VOLUME ["/data"]

ENV NODE_ENV=production
ENV DB_PATH=/data/db.sqlite

CMD ["node", "server/server.js"]
