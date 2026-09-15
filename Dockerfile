# syntax=docker/dockerfile:1.19

# ---------------------------------------------------------------------------
# OmniBot — production image
#
# Stages: base → deps (dev+prod) → build → prod-deps → migrator / runtime
# Build:  docker build -t omnibot .
# ---------------------------------------------------------------------------

# Alpine keeps the runtime small; Prisma detects `linux-musl-openssl-3.0.x` and
# generates the matching query engine inside this very image, so musl/glibc can
# not drift between the build and the runtime stage.
ARG NODE_IMAGE=node:24.21.0-alpine

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

# --- deps: full dependency graph (dev included), used to build -------------
FROM base AS deps

# The store cache is keyed per target platform: a multi-arch build runs this
# stage once per platform, and they must not share a store holding native
# binaries built for the other one.
ARG TARGETPLATFORM
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --filter omni-bot

# --- build: consolidate schema, generate the client, compile TypeScript ----
FROM deps AS build

COPY tsconfig.json prisma.config.ts ./
COPY scripts ./scripts
COPY src ./src

# `pnpm build` = consolidate *.prisma → src/prisma/schema.prisma,
#               prisma generate → src/generated/prisma,
#               tsc            → dist/
RUN pnpm build

# tsc only emits the .ts files it compiles, so the runtime assets have to be
# placed next to the JavaScript by hand:
#   - i18n bundles (*.json) live next to their module sources,
#   - the generated Prisma client is imported relatively from dist/lib.
# Type declarations are dropped (useless at runtime); .js.map files are kept so
# that production stack traces stay readable.
RUN set -eux; \
    find dist \( -name '*.d.ts' -o -name '*.d.ts.map' \) -delete; \
    cd src; \
    find . -name '*.json' -not -path './prisma/*' -not -path './generated/*' \
      -exec sh -c 'mkdir -p "/app/dist/$(dirname "$1")" && cp "$1" "/app/dist/$1"' _ {} \; ; \
    mkdir -p /app/dist/generated; \
    cp -R /app/src/generated/prisma /app/dist/generated/prisma; \
    find /app/dist/generated/prisma -name '*.d.ts' -delete

# --- prod-deps: runtime dependency tree only ------------------------------
FROM base AS prod-deps

ARG TARGETPLATFORM
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod --filter omni-bot

# `prisma` is an *optional peer* of @prisma/client, so `auto-install-peers`
# (enabled in pnpm-lock.yaml) drags the whole CLI — and its typescript/effect/
# @prisma/engines dependencies — into a production install. Those are build-time
# tools only: at runtime the bot talks to the client generated in
# dist/generated/prisma, which embeds its own query engine. Dropping them here
# removes ~140 MB from the final image.
RUN rm -rf \
      node_modules/prisma \
      node_modules/.pnpm/prisma@* \
      node_modules/.pnpm/@prisma+engines@* \
      node_modules/.pnpm/typescript@* \
      node_modules/.pnpm/effect@*

# --- migrator: short-lived image that applies the Prisma migrations -------
# It carries the pnpm-pinned Prisma CLI plus the consolidated schema and the
# migration history. `--schema` points at the folder: Prisma merges every
# *.prisma file in it (dbinfo.prisma holds the datasource) and reads
# ./migrations from the same place.
FROM deps AS migrator

COPY --from=build /app/src/prisma ./prisma

USER node

# The Prisma binary is invoked directly rather than through `pnpm exec`: this
# container runs on an egress-less network, and corepack would try to re-fetch
# pnpm for the unprivileged user.
CMD ["/app/node_modules/.bin/prisma", "migrate", "deploy", "--schema", "/app/prisma"]

# --- runtime: minimal production image ------------------------------------
FROM ${NODE_IMAGE} AS runtime

# openssl: required by the Prisma query engine.
# tini:    real init as PID 1 — forwards SIGTERM to node (the bot closes the
#          Discord client and the Prisma pool on SIGTERM) and reaps zombies.
RUN apk add --no-cache openssl tini \
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
CMD ["sh", "-c", "node ./bootstrap/validate-env-vars.mjs && exec node ./dist/index.js"]
