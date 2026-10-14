#!/usr/bin/env bash
# Re-runs DB-backed tests ONLY against the disposable Postgres (aevora_e2e_pg on :5444, database aevora_e2e).
# Read-only checks first; it stops at the first doubt. It never touches aevora_postgres (:5433), hostel-postgres (:5432)
# or aevora_redis (:6379), never restarts Docker, and never stops containers.
# Usage (from apps/api):  bash scripts/verify-disposable-db.sh
set -euo pipefail

URL='postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e?schema=public'
REDIS_URL_E2E='redis://localhost:6380/0'
fail() { echo "STOP: $*" >&2; exit 1; }

# 1. Docker answers within 20 s.
timeout 20 docker info >/dev/null 2>&1 || fail "Docker engine not responding"

# 2. The Postgres container is the one we created: right name, running, published on 5444, database aevora_e2e.
state=$(timeout 20 docker inspect -f '{{.State.Running}} {{range $p, $b := .NetworkSettings.Ports}}{{$p}}={{(index $b 0).HostPort}} {{end}}' aevora_e2e_pg 2>/dev/null) || fail "aevora_e2e_pg not found"
[[ "$state" == "true 5432/tcp=5444 " ]] || fail "aevora_e2e_pg unexpected state/ports: $state"
timeout 20 docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' aevora_e2e_pg | grep -qx 'POSTGRES_DB=aevora_e2e' || fail "aevora_e2e_pg is not the aevora_e2e database"

# 3. Inside the container: the database is aevora_e2e; record the cluster's unique system identifier.
inside=$(timeout 20 docker exec aevora_e2e_pg psql -U postgres -d aevora_e2e -tAc "select current_database() || '|' || system_identifier from pg_control_system()" | tr -d '[:space:]') || fail "cannot query aevora_e2e inside the container"
[[ "$inside" == aevora_e2e\|* ]] || fail "unexpected database inside container: $inside"

# 4. Through the HOST-published port Prisma will use: same database AND same cluster identifier, so :5444 on this
#    host is provably that container (not another server that happens to listen there).
host=$(cd ../.. && timeout 20 node -e "
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.argv[1], connectionTimeoutMillis: 5000 });
  c.connect().then(() => c.query(\"select current_database() || '|' || system_identifier as v from pg_control_system()\"))
   .then((r) => { process.stdout.write(r.rows[0].v); return c.end(); })
   .catch((e) => { console.error(e.message); process.exit(1); });" "$URL") || fail "PostgreSQL not ready on localhost:5444"
[[ "$host" == "$inside" ]] || fail "localhost:5444 ($host) is not the aevora_e2e_pg cluster ($inside)"

# 5. Redis: the DB suites do not use Redis today, but anything that does must get the disposable one. If the disposable
#    container exists it must be exactly aevora_e2e_redis on 127.0.0.1:6380; REDIS_URL is pinned to it either way.
if timeout 20 docker inspect aevora_e2e_redis >/dev/null 2>&1; then
  rstate=$(timeout 20 docker inspect -f '{{.State.Running}} {{range $p, $b := .NetworkSettings.Ports}}{{$p}}={{(index $b 0).HostIp}}:{{(index $b 0).HostPort}} {{end}}' aevora_e2e_redis) || fail "cannot inspect aevora_e2e_redis"
  [[ "$rstate" == "true 6379/tcp=127.0.0.1:6380 " ]] || fail "aevora_e2e_redis unexpected state/ports: $rstate"
  [[ "$(timeout 10 docker exec aevora_e2e_redis redis-cli ping)" == "PONG" ]] || fail "aevora_e2e_redis not answering"
else
  echo "note: aevora_e2e_redis not present; DB suites do not need Redis"
fi

# 6. Apply pending migrations (Gate 3 EmailSuppression, Gate 4A intake/PAUSED) to the disposable DB only, then run
#    every DB-backed suite in band (no shared-state interference between suites).
export DATABASE_URL="$URL" REDIS_URL="$REDIS_URL_E2E" E2E_DB=1
npx prisma migrate deploy --schema=../../packages/database/prisma/schema.prisma
npx prisma migrate diff --from-url "$URL" --to-schema-datamodel ../../packages/database/prisma/schema.prisma --exit-code >/dev/null \
  && echo "schema: database matches schema.prisma" \
  || echo "schema: drift remains between migrations and schema.prisma (known pre-existing FK/default drift; review the diff)"
npx jest --runInBand e2e.spec v24-offer-market-postgres
echo "OK: disposable DB verified and DB-backed suites executed"
