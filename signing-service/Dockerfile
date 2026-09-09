FROM python:3.11-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies from the lock file
COPY signing-service/requirements.lock signing-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.lock \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/.venv/bin && ln -s /usr/local/bin/ots /app/.venv/bin/ots

# Copy the rest of the application
COPY signing-service/ .
COPY ca/ /ca/

EXPOSE 8081

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8081"]
