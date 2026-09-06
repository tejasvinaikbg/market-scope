# The web app as a self-contained Next.js server (output: standalone). NEXT_PUBLIC_API_URL is read at build time, so it
# is a build argument: the API's public URL when the browser calls it directly, blank to proxy through this server.
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t market-scope-web .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace apps/web --workspace packages/shared
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
# Both are read when `next build` runs: NEXT_PUBLIC_API_URL is inlined into the browser bundle, and the /api rewrite's
# target (API_URL) is compiled into the server, so it cannot be changed at start-up. The default is the compose network.
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG API_URL=http://api:4200
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV API_URL=$API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace apps/web

FROM node:24-alpine
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3200
ENV PORT=3200
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
