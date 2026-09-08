# Image unique : l'API Fastify sert aussi le front compilé, ce qui évite un
# second service, la configuration CORS et un nom de domaine supplémentaire.

FROM node:22-alpine AS build-web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS build-api
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build-api /app/server/dist ./dist
COPY server/migrations ./migrations
COPY server/donnees ./donnees
COPY --from=build-web /app/web/dist ./public

# Azure App Service injecte PORT ; 8080 est la valeur par défaut hors Azure.
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "dist/index.js"]
