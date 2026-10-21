FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
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
