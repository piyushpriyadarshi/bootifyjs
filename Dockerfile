# BootifyJS Production Dockerfile
# Uses multi-stage build - bundles to JS and runs with Node.js

FROM oven/bun:1 AS build

WORKDIR /app

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock

RUN bun install --frozen-lockfile

# Copy source files
COPY ./src ./src
COPY tsconfig.json tsconfig.json

ENV NODE_ENV=production




# Bundle to JavaScript targeting Node.js
# Mark pino and thread-stream as external (they need native modules)
RUN bun build \
    --minify-whitespace \
    --minify-syntax \
    --target node \
    --external pino \
    --external pino-pretty \
    --external thread-stream \
    --outfile dist/server.js \
    src/examples/index.ts

# Production stage - using Node.js Alpine for small image size
FROM node:22-alpine

WORKDIR /app

# Copy the bundled JS from build stage
COPY --from=build /app/dist/server.js server.js

# Copy source files needed for pino transports (loaded dynamically at runtime)
COPY --from=build /app/src/logging/core/posthog-transport.js src/logging/core/posthog-transport.js

# Copy package files and install production dependencies only
COPY package.json package.json
RUN npm install --omit=dev --ignore-scripts

ENV NODE_ENV=production

# Use PORT env var for Railway/cloud platforms, fallback to 8080
ENV PORT=8080

CMD ["node", "server.js"]

EXPOSE 8080
