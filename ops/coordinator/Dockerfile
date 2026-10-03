FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
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
