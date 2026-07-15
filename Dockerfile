# syntax=docker/dockerfile:1

FROM node:22-alpine
WORKDIR /app

# Use npm install (not ci) so optional platform deps resolve on Alpine
# even when the lockfile was generated on macOS.
COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "--tsconfig", "server/tsconfig.json", "server/index.ts"]
