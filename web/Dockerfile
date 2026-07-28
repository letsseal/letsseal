FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source
COPY . .

# Generate Prisma client and build Next.js app
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# On startup, run migrations and start the Next.js server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
