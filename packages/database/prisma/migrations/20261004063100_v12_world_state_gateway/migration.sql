CREATE TABLE "v12_world_checkpoint" (
  "company_id" TEXT PRIMARY KEY,
  "global_checkpoint" BIGINT NOT NULL DEFAULT 0,
  "stream_versions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "v12_world_stream_checkpoint" (
  "company_id" TEXT NOT NULL,
  "stream_key" TEXT NOT NULL,
  "stream_sequence" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("company_id","stream_key")
);
CREATE TABLE "v12_world_event" (
  "event_id" TEXT PRIMARY KEY,
  "source_event_id" TEXT NOT NULL UNIQUE,
  "company_id" TEXT NOT NULL,
  "stream_key" TEXT NOT NULL,
  "stream_sequence" BIGINT NOT NULL,
  "global_checkpoint" BIGINT NOT NULL,
  "event_type" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "correlation_id" TEXT NOT NULL,
  "causation_id" TEXT NOT NULL,
  "enterprise_type" TEXT,
  "enterprise_id" TEXT,
  "world_id" TEXT,
  "payload" JSONB NOT NULL,
  CONSTRAINT "v12_world_event_stream_seq_key" UNIQUE ("company_id","stream_key","stream_sequence")
);
CREATE INDEX "v12_world_event_company_checkpoint_idx" ON "v12_world_event" ("company_id","global_checkpoint");
CREATE TABLE "v12_world_identity_mapping" (
  "world_id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "enterprise_type" TEXT NOT NULL,
  "enterprise_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "mapping_version" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v12_world_identity_enterprise_key" UNIQUE ("enterprise_type","enterprise_id")
);
CREATE INDEX "v12_world_identity_company_idx" ON "v12_world_identity_mapping" ("company_id");
CREATE TABLE "v12_world_entity_state" (
  "world_id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "enterprise_type" TEXT NOT NULL,
  "enterprise_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "version" BIGINT NOT NULL,
  "stream_key" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "v12_world_entity_company_idx" ON "v12_world_entity_state" ("company_id","entity_type");
CREATE TABLE "v12_world_snapshot" (
  "snapshot_id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "global_checkpoint" BIGINT NOT NULL,
  "stream_versions" JSONB NOT NULL,
  "state" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "v12_world_snapshot_lookup_idx" ON "v12_world_snapshot" ("company_id","scope","scope_key","global_checkpoint");
CREATE TABLE "v12_world_ingest_cursor" (
  "company_id" TEXT PRIMARY KEY,
  "last_source_created_at" TIMESTAMP(3),
  "last_source_event_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "v12_world_reconciliation_state" (
  "company_id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'HEALTHY',
  "authoritative_checkpoint" BIGINT NOT NULL DEFAULT 0,
  "materialized_checkpoint" BIGINT NOT NULL DEFAULT 0,
  "last_audit_at" TIMESTAMP(3),
  "last_error" TEXT
);
CREATE TABLE "v12_gateway_command_request" (
  "request_id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target" JSONB,
  "parameters" JSONB NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "v12_gateway_command_company_idx" ON "v12_gateway_command_request" ("company_id","created_at");
