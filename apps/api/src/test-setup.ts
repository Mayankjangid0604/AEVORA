process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.WEBHOOK_SECRET_PROD = 'test-webhook-prod';
process.env.WEBHOOK_SECRET_SIM = 'test-webhook-sim';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:e2e_local_only@localhost:5444/aevora_e2e?schema=public'; // disposable test DB — never the protected dev DB on 5433
// Tests must never reach a real mail transport. Prisma auto-loads the root .env but does not override keys that
// already exist, so pinning these here wins over OUTREACH_ENVIRONMENT=PRODUCTION / SMTP_HOST in a developer .env.
process.env.OUTREACH_ENVIRONMENT = 'SANDBOX';
process.env.ENABLE_REAL_PRODUCTION_SENDING = 'false';
process.env.SMTP_HOST = '';
process.env.SENDGRID_API_KEY = '';
process.env.REAL_PROVIDER_CALL = 'false'; // keep model calls on the local provider in tests
// Gate 3: unsubscribe links need a signing secret and a public base URL; publishing and the emergency stop are pinned
// so a developer .env cannot turn on external publishing (or silently stop everything) inside tests.
process.env.UNSUBSCRIBE_SECRET = 'test-unsubscribe-secret-0123456789abcdef';
process.env.PUBLIC_API_URL = 'http://localhost:4011';
process.env.DEMO_PUBLISHING_ENABLED = 'false';
delete process.env.AEVORA_EMERGENCY_STOP;
delete process.env.VERCEL_API_TOKEN;
