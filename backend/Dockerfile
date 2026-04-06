# ---- Build stage ----
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files first for better layer caching
COPY go.mod go.sum* ./
RUN if [ -f go.sum ]; then go mod download; fi

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

# ---- Runtime stage ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy binary from builder
COPY --from=builder /app/server .

# Copy .env.example as default config (actual config via env vars or docker secret)
COPY cmd/server/.env.example .env 2>/dev/null || true

# Switch to non-root user
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost:8080/auth/me || exit 1

ENTRYPOINT ["./server"]