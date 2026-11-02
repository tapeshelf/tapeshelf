# syntax=docker/dockerfile:1
# TapeShelf web: the Angular build served by Caddy, which also terminates TLS and proxies
# /api and /ws to the api container. Build context is the repository root (the API client is
# generated from backend/openapi.json):
# from the repository root: docker build -f frontend/Dockerfile -t tapeshelf-web.

ARG NODE_IMAGE=node:22-trixie-slim

FROM ${NODE_IMAGE} AS build
RUN npm install -g npm@12.2.0 && npm cache clean --force
WORKDIR /repo/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY backend/openapi.json /repo/backend/openapi.json
COPY frontend ./
# The commit of this build (CI: first 12 characters of the SHA): the browser console shows it on
# start, Caddy sends it as X-Tapeshelf-Web.
ARG APP_VERSION=dev
RUN npm run api:gen && npm run build -- --define "APP_VERSION='${APP_VERSION}'" \
  && node scripts/precompress.mjs dist/frontend/browser

# 2.11: Caddy 2.10 answers its precompressed files (.br/.gz) with 206 Partial Content even without a
# Range request, and browsers do not cache that, so every visit downloaded the bundles again.
FROM caddy:2.11-alpine
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/frontend/dist/frontend/browser /srv
