# syntax=docker/dockerfile:1
# TapeShelf backend: one build, two runtime images.
#   docker build --target api    -t tapeshelf-api    backend
#   docker build --target worker -t tapeshelf-worker backend   # + ffmpeg, fontconfig, pg_dump

ARG NODE_IMAGE=node:22-trixie-slim

FROM ${NODE_IMAGE} AS base
# Prisma's schema engine needs OpenSSL; the lockfile and "allowScripts" are npm 12's.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g npm@12.2.0 \
 && npm cache clean --force
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate \
 && npx nest build \
 && npm prune --omit=dev \
 && npm cache clean --force

FROM base AS runtime
# glibc's per-thread malloc arenas fragment a long-lived Node with libvips and grow its RSS.
ENV NODE_ENV=production MALLOC_ARENA_MAX=2
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
# The commit of this build (CI: first 12 characters of the SHA): X-Tapeshelf-Api, /api/health.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

FROM runtime AS api
USER node
EXPOSE 3000
# A minute between checks once up (each starts a Node process: 1.5–3 % of a CPU at 15 s);
# every 5 s while starting, so a new container is seen healthy as quickly as before.
HEALTHCHECK --interval=60s --timeout=5s --start-period=40s --start-interval=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM runtime AS worker
# ffmpeg/ffprobe for processing, fontconfig for the contact-sheet fonts, pg_dump for backups.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /work \
 && chown node:node /work
COPY --chown=node:node assets ./assets
ENV WORKER_TMP_DIR=/work WORKER_HEALTH_PORT=3001
USER node
# A minute between checks once up (each starts a Node process: 1.5–3 % of a CPU at 15 s);
# every 5 s while starting, so a new container is seen healthy as quickly as before.
HEALTHCHECK --interval=60s --timeout=5s --start-period=40s --start-interval=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.WORKER_HEALTH_PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/worker.js"]
