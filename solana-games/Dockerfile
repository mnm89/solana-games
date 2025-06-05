# ---- Base Node Image ----
FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies (with cache)
COPY solana-games/package*.json ./
RUN npm install --frozen-lockfile

# ---- Build Image ----
FROM base AS builder
WORKDIR /app

COPY solana-games ./

# Build with standalone output (reduces runtime dependencies)
RUN npm run build

# ---- Production Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only essential files for standalone output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["node", ".next/standalone/server.js"]
