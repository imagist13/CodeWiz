# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies for Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---- Runtime stage ----
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

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

ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Use PYTHONPATH to ensure 'app' module is found
CMD ["sh", "-c", "cd /app && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]