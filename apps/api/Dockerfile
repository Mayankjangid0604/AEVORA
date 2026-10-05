FROM node:20-alpine
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN npm ci
RUN npm run generate --workspace=@aevora/database
RUN turbo run build --filter=@aevora/api...
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start:prod", "--workspace=apps/api"]
