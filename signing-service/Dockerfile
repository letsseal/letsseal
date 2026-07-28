FROM python:3.11-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies from the lock file
COPY requirements.lock requirements.txt ./
RUN pip install --no-cache-dir -r requirements.lock

# Copy the rest of the application
COPY . .

EXPOSE 8081

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8081"]
