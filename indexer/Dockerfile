# Build context is the REPO ROOT, not indexer/ — the indexer resolves @coshi190/juno-moneta-sdk through
# the bun workspace. On Railway: root directory "/", Dockerfile path "indexer/Dockerfile".
#
#   docker build -f indexer/Dockerfile .
FROM oven/bun:1

WORKDIR /app

# Manifests first so a source-only change doesn't bust the install layer.
COPY package.json bun.lock ./
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/cli/package.json ./packages/cli/
COPY indexer/package.json ./indexer/
RUN bun install --frozen-lockfile

COPY packages/sdk ./packages/sdk
COPY indexer ./indexer

# The indexer imports @coshi190/juno-moneta-sdk's build output, not its source.
RUN bun run --filter @coshi190/juno-moneta-sdk build

WORKDIR /app/indexer

EXPOSE 42069

CMD ["bun", "run", "start"]
