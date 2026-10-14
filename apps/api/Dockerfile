FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
RUN npm install -g turbo
COPY . .
RUN npm ci
RUN npm run generate --workspace=@aevora/database
RUN rm -f apps/api/tsconfig.tsbuildinfo
RUN turbo run build --filter=@aevora/api...
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start:prod", "--workspace=@aevora/api"]
