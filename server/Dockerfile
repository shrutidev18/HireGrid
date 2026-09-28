# simple Dockerfile for the backend - install deps, build TS, run compiled JS
FROM node:20-slim

# prisma's query engine needs openssl to be present at runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# generate the prisma client (needs to happen before tsc build since routes import its types)
RUN npx prisma generate

RUN npm run build

EXPOSE 5000

# run any pending migrations against the production db, then start the server.
# safe to run every time the container starts - it only applies new migrations
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
