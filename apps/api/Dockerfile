# The API and the worker: one image, two commands. Node 24 runs the TypeScript sources directly (type stripping), so the
# image carries no compiler; only the runtime dependencies are installed. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t market-scope-api .
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace apps/api --workspace packages/shared

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
WORKDIR /app/apps/api
USER node
EXPOSE 4200
# The API; the worker is the same image with `node src/worker.ts`; migrations are `node src/db/migrate.ts` before a release.
CMD ["node", "src/server.ts"]
