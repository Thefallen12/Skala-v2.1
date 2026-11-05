# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY .npmrc ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG DEPLOYMENT_VERSION
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN export MONGODB_URL="mongodb://127.0.0.1:27017/skala_build" \
    AUTH_SECRET="build-only-placeholder" \
    DEPLOYMENT_VERSION="${DEPLOYMENT_VERSION:-$(date -u +%Y%m%d%H%M%S)}" \
    && npm run build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV CHROME_PATH=/usr/bin/chromium
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation gosu \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/.private-data \
    && chown -R node:node /app/.private-data
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
