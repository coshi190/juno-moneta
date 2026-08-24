FROM oven/bun:1.4.0

WORKDIR /app

COPY packages/sdk/package.json packages/sdk/bun.lock ./packages/sdk/
RUN cd packages/sdk && bun install --frozen-lockfile

COPY packages/sdk ./packages/sdk
RUN cd packages/sdk && bun run build

COPY indexer/package.json indexer/bun.lock ./indexer/
RUN cd indexer && bun install --frozen-lockfile
COPY indexer ./indexer

WORKDIR /app/indexer

EXPOSE 42069

CMD ["bun", "run", "start"]
