# AEVORA Development Guide

## Prerequisites
- Node.js >= 18
- npm >= 9
- Docker & Docker Compose
- Prisma CLI (installed via dependencies)

## Setup Environment
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies (from monorepo root):
   ```bash
   npm install
   ```

## Infrastructure
Start the local PostgreSQL and Redis databases using Docker:
```bash
cd infrastructure/docker
docker-compose up -d
```
To stop the infrastructure:
```bash
docker-compose down
```

## Database
We use Prisma for database ORM.
1. Generate the Prisma client:
   ```bash
   npm run generate -w @aevora/database
   ```
2. Run database migrations:
   ```bash
   npm run migrate:dev -w @aevora/database
   ```
3. Seed the database with initial testing data (Chairman, Company, Treasuries):
   ```bash
   npm run seed -w @aevora/database
   ```

## Running the Applications
From the root of the project, you can use Turborepo to run everything in parallel:
```bash
# Run all dev servers (Web, API, Simulation, Shared libs)
npm run dev
```

To run a specific app:
```bash
npm run dev -w @aevora/api
npm run dev -w @aevora/web
```

## Testing
Run all tests across the monorepo:
```bash
npm test
```
The financial logic uses strict integer arithmetic. Do not introduce floats for balances.
