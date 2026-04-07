# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies with npm mirror
RUN npm config set registry https://registry.npmmirror.com && \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code
COPY . .

# Baked into client bundle at build time (must match nginx same-origin paths)
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_AI_SERVICE_URL=/ai
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_AI_SERVICE_URL=${NEXT_PUBLIC_AI_SERVICE_URL}

# Build the Next.js application
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application from builder
RUN if [ -d /app/public ]; then \
    mkdir -p ./public && \
    cp -r /app/public/* ./public/; \
    fi
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Set proper permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]