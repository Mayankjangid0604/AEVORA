const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const {
  isWeakSecret,
  auditEnvironment,
  auditComposeFile,
} = require('./preflight-check');

describe('Preflight Tooling — Secret & Environment Validation', () => {
  it('correctly classifies weak vs strong secrets', () => {
    // Missing / empty
    assert.strictEqual(isWeakSecret('', 16).weak, true);
    assert.strictEqual(isWeakSecret(null, 16).weak, true);

    // Too short
    assert.strictEqual(isWeakSecret('short', 16).weak, true);

    // Known insecure placeholder
    assert.strictEqual(isWeakSecret('dev-secret', 10).weak, true);
    assert.strictEqual(isWeakSecret('super_secure_jwt_secret_placeholder_replace_me', 32).weak, true);
    assert.strictEqual(isWeakSecret('replace_with_at_least_32_random_hex_characters', 32).weak, true);

    // Substring markers
    assert.strictEqual(isWeakSecret('my_key_replace_with_something', 16).weak, true);

    // Strong valid secrets
    assert.strictEqual(isWeakSecret('d8f93a1e2b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0', 32).weak, false);
    assert.strictEqual(isWeakSecret('9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d', 16).weak, false);
  });

  it('fails closed when required staging variables are missing', () => {
    const results = auditEnvironment({}, 'staging');
    const fails = results.filter((r) => r.status === 'FAIL');
    assert.ok(fails.length >= 8, `Expected at least 8 failures for empty env, got ${fails.length}`);
    const names = fails.map((r) => r.name);
    assert.ok(names.includes('DATABASE_URL'));
    assert.ok(names.includes('JWT_SECRET'));
    assert.ok(names.includes('WEBHOOK_SECRET_PROD'));
    assert.ok(names.includes('WEBHOOK_SECRET_SIM'));
  });

  it('fails closed when placeholder or weak secrets are supplied', () => {
    const weakEnv = {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://aevora:password@postgres:5432/aevoradb',
      JWT_SECRET: 'dev-secret-xyz-token',
      POSTGRES_USER: 'aevora',
      POSTGRES_PASSWORD: 'short_pg',
      POSTGRES_DB: 'aevoradb',
      REDIS_PASSWORD: 'short_redis',
      REDIS_URL: 'redis://:short_redis@redis:6379/0',
      WEBHOOK_SECRET_PROD: 'test_token_xyz',
      WEBHOOK_SECRET_SIM: 'short_wh_xyz',
    };
    const results = auditEnvironment(weakEnv, 'staging');
    const fails = results.filter((r) => r.status === 'FAIL');
    const failedNames = fails.map((r) => r.name);
    assert.ok(failedNames.includes('JWT_SECRET'), 'JWT_SECRET should fail');
    assert.ok(failedNames.includes('DATABASE_URL'), 'DATABASE_URL should fail');
    assert.ok(failedNames.includes('POSTGRES_PASSWORD'), 'POSTGRES_PASSWORD should fail');
    assert.ok(failedNames.includes('REDIS_PASSWORD'), 'REDIS_PASSWORD should fail');
    assert.ok(failedNames.includes('WEBHOOK_SECRET_PROD'), 'WEBHOOK_SECRET_PROD should fail');
    assert.ok(failedNames.includes('WEBHOOK_SECRET_SIM'), 'WEBHOOK_SECRET_SIM should fail');

    // Verify ZERO raw secret tokens are present in messages
    for (const r of results) {
      assert.strictEqual(r.message.includes('password@'), false);
      assert.strictEqual(r.message.includes('dev-secret-xyz-token'), false);
      assert.strictEqual(r.message.includes('short_pg'), false);
      assert.strictEqual(r.message.includes('short_redis'), false);
      assert.strictEqual(r.message.includes('test_token_xyz'), false);
      assert.strictEqual(r.message.includes('short_wh_xyz'), false);
    }
  });

  it('passes all environment checks with strong staging configuration', () => {
    const validEnv = {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://aevora_staging:strong_staging_db_password_12345@postgres:5432/aevoradb_staging',
      JWT_SECRET: 'd8f93a1e2b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
      POSTGRES_USER: 'aevora_staging',
      POSTGRES_PASSWORD: 'strong_staging_db_password_12345',
      POSTGRES_DB: 'aevoradb_staging',
      REDIS_PASSWORD: 'strong_staging_redis_password_12345',
      REDIS_URL: 'redis://:strong_staging_redis_password_12345@redis:6379/0',
      WEBHOOK_SECRET_PROD: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
      WEBHOOK_SECRET_SIM: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      STAGING_DOMAIN: 'staging.aevora.local',
    };
    const results = auditEnvironment(validEnv, 'staging');
    const fails = results.filter((r) => r.status === 'FAIL');
    assert.strictEqual(fails.length, 0, `Expected 0 fails, got: ${JSON.stringify(fails)}`);
  });
});

describe('Preflight Tooling — Compose Architecture & Port Isolation', () => {
  const stagingComposePath = path.resolve(__dirname, '../docker/docker-compose.staging.yml');
  const prodComposePath = path.resolve(__dirname, '../docker/docker-compose.prod.yml');

  it('verifies staging compose enforces loopback port isolation', () => {
    const results = auditComposeFile(stagingComposePath, 'staging');
    const fails = results.filter((r) => r.status === 'FAIL');
    assert.strictEqual(fails.length, 0, `Staging compose failed checks: ${JSON.stringify(fails)}`);

    const pgIsolation = results.find((r) => r.check === 'postgres_port_isolation');
    assert.ok(pgIsolation && pgIsolation.status === 'PASS');
    assert.ok(pgIsolation.message.includes('127.0.0.1'));

    const redisIsolation = results.find((r) => r.check === 'redis_port_isolation');
    assert.ok(redisIsolation && redisIsolation.status === 'PASS');
    assert.ok(redisIsolation.message.includes('127.0.0.1'));

    const startup = results.find((r) => r.check === 'startup_order');
    assert.ok(startup && startup.status === 'PASS');
  });

  it('verifies production compose completely isolates database & redis (zero published ports)', () => {
    const results = auditComposeFile(prodComposePath, 'production');
    const fails = results.filter((r) => r.status === 'FAIL');
    assert.strictEqual(fails.length, 0, `Production compose failed checks: ${JSON.stringify(fails)}`);

    const pgIsolation = results.find((r) => r.check === 'postgres_port_isolation');
    assert.ok(pgIsolation && pgIsolation.status === 'PASS');
    assert.ok(pgIsolation.message.includes('no host ports'));

    const redisIsolation = results.find((r) => r.check === 'redis_port_isolation');
    assert.ok(redisIsolation && redisIsolation.status === 'PASS');
    assert.ok(redisIsolation.message.includes('no host ports'));
  });
});
