# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies for Python packages (with retry for bad network)
RUN for i in 1 2 3; do apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    xz-utils \
    && rm -rf /var/lib/apt/lists/* && break || sleep 2; done

# Download and extract Node.js 18.x LTS (static binary, no apt needed)
RUN curl -fsSL "https://nodejs.org/dist/v18.20.4/node-v18.20.4-linux-x64.tar.xz" -o node.tar.xz && \
    tar -xvf node.tar.xz -C /opt && \
    ln -s /opt/node-v18.20.4-linux-x64/bin/node /usr/local/bin/node && \
    ln -s /opt/node-v18.20.4-linux-x64/bin/npm /usr/local/bin/npm && \
    ln -s /opt/node-v18.20.4-linux-x64/bin/npx /usr/local/bin/npx && \
    node --version && npm --version

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---- Runtime stage ----
FROM python:3.11-slim

# Install remaining runtime packages (with retry)
RUN for i in 1 2 3; do apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/* && break || sleep 2; done

# Copy pre-installed Node.js 18.x (static, no apt needed)
COPY --from=builder /opt/node-v18.20.4-linux-x64 /opt/node-v18.20.4-linux-x64
RUN ln -s /opt/node-v18.20.4-linux-x64/bin/node /usr/local/bin/node && \
    ln -s /opt/node-v18.20.4-linux-x64/bin/npm /usr/local/bin/npm && \
    ln -s /opt/node-v18.20.4-linux-x64/bin/npx /usr/local/bin/npx && \
    node --version && npm --version

WORKDIR /app

# Create non-root user for security
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -r -s /bin/false appuser

# Copy Python packages from builder
COPY --from=builder /root/.local /home/appuser/.local
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Create uploads and sandbox directories
RUN mkdir -p /tmp/codewiz-sandbox ./uploads && \
    chown -R appuser:appgroup /tmp/codewiz-sandbox ./uploads

ENV PATH=/home/appuser/.local/bin:/usr/local/bin:/usr/bin:/opt/node-v18.20.4-linux-x64/bin:$PATH
ENV PYTHONUNBUFFERED=1

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Use PYTHONPATH to ensure 'app' module is found
CMD ["sh", "-c", "cd /app && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
