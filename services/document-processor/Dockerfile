# Build from the repository root:
#   docker build -f services/document-processor/Dockerfile -t document-processor .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# pnpm checks the patched dependencies listed in pnpm-workspace.yaml against these files
COPY patches patches
COPY apps apps
COPY packages/shared/package.json packages/shared/
COPY packages/ai/package.json packages/ai/
COPY services/document-processor/package.json services/document-processor/
RUN pnpm install --frozen-lockfile --filter @studexa/document-processor...
COPY packages/shared packages/shared
COPY packages/ai packages/ai
COPY services/document-processor services/document-processor
RUN pnpm --filter @studexa/document-processor build \
  && pnpm --filter @studexa/document-processor deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/services/document-processor/dist ./dist
COPY --from=build /repo/services/document-processor/package.json ./
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/main.js"]
