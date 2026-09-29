FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @dayagpu/web --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @dayagpu/web

FROM caddy:2-alpine
COPY ops/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
