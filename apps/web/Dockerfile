FROM node:20-alpine
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN npm ci
RUN npm run generate --workspace=@aevora/database
RUN turbo run build --filter=@aevora/web...
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/web"]
