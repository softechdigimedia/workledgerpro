FROM node:20-bookworm-slim

# Install OpenSSL (required by Prisma engine) and build tools for native addons
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy application source code
COPY . .

EXPOSE 5000

# Apply migrations, seed admin user, and start backend service
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run dev"]

