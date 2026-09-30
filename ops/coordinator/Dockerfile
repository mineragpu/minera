FROM node:24-alpine
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
