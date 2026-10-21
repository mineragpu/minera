FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build
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

FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f
COPY ops/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
