FROM node:20-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY scripts ./scripts
COPY public ./public
RUN node scripts/fetch-snapshot.mjs
EXPOSE 4173
CMD ["node", "server.mjs"]
