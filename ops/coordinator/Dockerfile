FROM node:26-alpine@sha256:143494b1da2945f061539253adc65e4f1569ddf07da2d384c022c791a9d90a4a
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/coordinator/package.json apps/coordinator/
RUN npm ci --workspace @minera/coordinator --include-workspace-root=false --omit=dev \
  && npm cache clean --force

COPY packages/shared/src packages/shared/src
COPY apps/coordinator/src apps/coordinator/src

USER node
EXPOSE 8080
CMD ["node", "apps/coordinator/src/server.ts"]
