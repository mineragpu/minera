FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80
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
