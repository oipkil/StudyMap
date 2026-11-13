# Ảnh chạy server SSG (API + Socket.IO + xử lý ảnh inline). Build context = thư mục gốc repo.
#   docker build -f deploy/Dockerfile -t ssg-server .
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@11 \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY scripts ./scripts
RUN pnpm exec prisma generate \
 && pnpm --filter @ssg/shared build \
 && pnpm --filter @ssg/server build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@11 \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app ./
# uploads (ảnh) nằm ở apps/server/uploads -> gắn volume ngoài
RUN mkdir -p apps/server/uploads/public apps/server/uploads/quarantine apps/server/uploads/frames
WORKDIR /app/apps/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
