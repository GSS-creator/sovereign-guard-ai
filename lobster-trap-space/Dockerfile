# STEP 1: Build the static lobstertrap binary from upstream Go source
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git make

WORKDIR /app

RUN git clone https://github.com/veeainc/lobstertrap.git .

RUN make build-static

# STEP 2: Configure a clean, secure runtime container environment
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enforce Hugging Face non-root configuration standards (User ID 1000)
RUN useradd -m -u 1000 appuser

WORKDIR /home/appuser/app

# Pull the Go binary from the build stage
COPY --from=builder /app/lobstertrap /home/appuser/app/lobstertrap

# Copy Python application files
COPY --chown=appuser:appuser requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser app.py ./

# Copy policy config
RUN mkdir -p /home/appuser/app/configs
COPY --chown=appuser:appuser ./configs/policies.yaml /home/appuser/app/configs/policies.yaml

# Fix permissions
RUN chown -R appuser:appuser /home/appuser/app

USER appuser

# Expose the Hugging Face standard port
ENV PORT=7860
EXPOSE 7860

# Start the FastAPI DPI sidecar — it handles /inspect calls from the Cloudflare Worker
# The lobstertrap binary is available at ./lobstertrap for direct proxy use if needed
CMD ["python", "app.py"]
