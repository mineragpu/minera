FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @minera/web --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
# The docs are rendered at build time, with contract parameters from the deploy config.
COPY packages/contracts/deploy packages/contracts/deploy
COPY docs/*.md docs/
COPY apps/web apps/web
# Vite inlines VITE_* values at build time, and the platform passes service
# variables to a build only when they are declared here.
ARG VITE_NETWORK
ARG VITE_API_BASE
ENV VITE_NETWORK=$VITE_NETWORK \
    VITE_API_BASE=$VITE_API_BASE
RUN npm run build --workspace @minera/web

FROM caddy:2-alpine@sha256:881bbc60f9986d5ab8e7cfd6cf7e4ef3c9c0439fef2429d035d065577882f028
COPY ops/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
