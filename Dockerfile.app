FROM node:24-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-slim
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY workflows /app/workflows
COPY --from=web /web/dist /app/web/dist
ENV NODE_ENV=production \
    WORKFLOWS_DIR=/app/workflows \
    WEB_DIR=/app/web/dist \
    DATA_DIR=/data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
