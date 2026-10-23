# syntax=docker/dockerfile:1.28@sha256:bb22d9815c728170f72750f4e5b0d672e06176142e1d602c7e66c050100b7e5b

# ---------------------------------------------------------------------------
# OmniBot — production image
#
# Stages: base → deps (dev+prod) → build → prod-deps → migrator / runtime
# Build:  docker build -t omnibot .
# ---------------------------------------------------------------------------

# Alpine keeps the runtime small. Prisma 7 has no native query engine any more
# (the client goes through node-postgres), so only the migrator carries a
# platform-specific binary: the schema engine, fetched for musl at install.
ARG NODE_IMAGE=node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

# --- base: pnpm through corepack, shared by every stage --------------------
FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=1

# `packageManager` in package.json pins the pnpm version corepack activates.
RUN corepack enable

WORKDIR /app

# Manifests first: dependency layers stay cached as long as they do not change.
# docs/site/package.json is only needed so that pnpm can validate the workspace
# against the lockfile — the docs site itself is never installed nor shipped.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docs/site/package.json ./docs/site/package.json

RUN corepack install

# --- deps: full dependency graph (dev included), used to build -------------
FROM base AS deps

# The store cache is keyed per target platform: a multi-arch build runs this
# stage once per platform, and they must not share a store holding native
# binaries built for the other one.
ARG TARGETPLATFORM
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --filter omni-bot

# --- build: generate the Prisma client, compile TypeScript ---------------
FROM deps AS build

COPY tsconfig.json prisma.config.ts ./
COPY src ./src

# `pnpm build` = prisma generate → src/generated/prisma (from every *.prisma
#                                  under src/),
#               tsc             → dist/
RUN pnpm build

# tsc only emits the .ts files it compiles, so the runtime assets have to be
# placed next to the JavaScript by hand:
#   - i18n bundles (*.json) live next to their module sources,
#   - image assets (fonts, pictures) live in each module's assets/ folder.
# The generated Prisma client is TypeScript under src/, so tsc already emitted
# it. Type declarations are dropped (useless at runtime); .js.map files are kept
# so that production stack traces stay readable.
RUN set -eux; \
    find dist \( -name '*.d.ts' -o -name '*.d.ts.map' \) -delete; \
    cd src; \
    find . -type f \( -name '*.json' -o -path '*/assets/*' \) \
      -not -path './prisma/*' -not -path './generated/*' \
      -exec sh -c 'mkdir -p "/app/dist/$(dirname "$1")" && cp "$1" "/app/dist/$1"' _ {} \;

# --- prod-deps: runtime dependency tree only ------------------------------
FROM base AS prod-deps

ARG TARGETPLATFORM
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod --filter omni-bot

# --- migrator: short-lived image that applies the Prisma migrations -------
# It carries the pnpm-pinned Prisma CLI, prisma.config.ts (schema location and
# connection URL from DATABASE_URL), dbinfo.prisma and the migration history.
# Applying migrations needs the datasource, not the models: src/prisma alone
# is a valid schema.
FROM deps AS migrator

COPY prisma.config.ts ./
COPY src/prisma ./src/prisma

USER node

# The Prisma binary is invoked directly rather than through `pnpm exec`: this
# container runs on an egress-less network, and corepack would try to re-fetch
# pnpm for the unprivileged user.
CMD ["/app/node_modules/.bin/prisma", "migrate", "deploy"]

# --- runtime: minimal production image ------------------------------------
FROM ${NODE_IMAGE} AS runtime

# tini: real init as PID 1 — forwards SIGTERM to node (the bot closes the
#       Discord client and the Prisma pool on SIGTERM) and reaps zombies.
RUN apk add --no-cache tini font-noto-emoji \
 && addgroup -S -g 10001 omnibot \
 && adduser -S -u 10001 -G omnibot -H -h /app omnibot

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# `#*` subpath imports resolve through package.json; the `development`
# condition is deliberately NOT enabled, so they map to ./dist/*.
COPY --chown=root:root package.json ./
COPY --chown=root:root bootstrap ./bootstrap
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist

# Everything is owned by root and read-only for the unprivileged runtime user.
USER omnibot

# No HEALTHCHECK on purpose: the bot exposes no HTTP/TCP endpoint, and any probe
# limited to "is the node process alive?" would be redundant with the container
# lifecycle (tini exits with the bot, so the container stops and the restart
# policy kicks in). A probe that lied about the Discord gateway state
# would be worse than none — see the Deployment section of README.md.

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node ./bootstrap/validate-env-vars.ts && exec node ./dist/index.js"]
