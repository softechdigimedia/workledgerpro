FROM node:20-bookworm-slim

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install dependencies with legacy peer deps support
RUN npm install --legacy-peer-deps

# Copy frontend source code
COPY . .

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=development

CMD ["npm", "run", "dev"]

