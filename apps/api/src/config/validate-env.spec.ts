import { validateEnv } from './validate-env';

describe('validateEnv — Production Secret Validation & Configuration Hardening', () => {
  const baseValidDevEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://aevora:secret@localhost:5433/aevoradb',
    JWT_SECRET: 'test-secret-key-for-jest',
    WEBHOOK_SECRET_PROD: 'webhook-prod-test',
    WEBHOOK_SECRET_SIM: 'webhook-sim-test',
  };

  const baseValidProdEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://aevora:secure_prod_pass@db.production:5432/aevoradb',
    JWT_SECRET: 'd8f93a1e2b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0', // 64 chars
    WEBHOOK_SECRET_PROD: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
    WEBHOOK_SECRET_SIM: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
  };

  describe('Non-Production Environments (development / test)', () => {
    it('accepts short or development secrets outside production', () => {
      expect(() => validateEnv(baseValidDevEnv)).not.toThrow();
    });

    it('throws when required variables are missing', () => {
      const missingEnv = { ...baseValidDevEnv };
      delete missingEnv.DATABASE_URL;
      expect(() => validateEnv(missingEnv)).toThrow(/Missing required environment variables: DATABASE_URL/);
    });
  });

  describe('Production Environment (NODE_ENV=production)', () => {
    it('accepts valid, strong non-default secrets', () => {
      expect(() => validateEnv(baseValidProdEnv)).not.toThrow();
    });

    it('rejects known development default JWT secret', () => {
      const badEnv = {
        ...baseValidProdEnv,
        JWT_SECRET: 'change-this-to-a-random-32-char-string',
      };
      expect(() => validateEnv(badEnv)).toThrow(
        /Production startup rejected: JWT_SECRET must be at least 32 characters and cannot use default\/development placeholder values/
      );
    });

    it('rejects short JWT secret (< 32 characters)', () => {
      const shortJwtEnv = {
        ...baseValidProdEnv,
        JWT_SECRET: 'too-short-jwt-secret-val',
      };
      expect(() => validateEnv(shortJwtEnv)).toThrow(
        /Production startup rejected: JWT_SECRET must be at least 32 characters/
      );
    });

    it('rejects weak or placeholder WEBHOOK_SECRET_PROD', () => {
      const weakWebhookEnv = {
        ...baseValidProdEnv,
        WEBHOOK_SECRET_PROD: 'weak-test-secret',
      };
      expect(() => validateEnv(weakWebhookEnv)).toThrow(
        /Production startup rejected: WEBHOOK_SECRET_PROD and WEBHOOK_SECRET_SIM must be at least 16 characters/
      );
    });

    it('rejects short WEBHOOK_SECRET_SIM (< 16 characters)', () => {
      const shortSimEnv = {
        ...baseValidProdEnv,
        WEBHOOK_SECRET_SIM: 'short-sim',
      };
      expect(() => validateEnv(shortSimEnv)).toThrow(
        /Production startup rejected: WEBHOOK_SECRET_PROD and WEBHOOK_SECRET_SIM must be at least 16 characters/
      );
    });

    it('accepts production startup when optional RAZORPAY_WEBHOOK_SECRET is unset', () => {
      const prodWithoutRzp = { ...baseValidProdEnv };
      delete prodWithoutRzp.RAZORPAY_WEBHOOK_SECRET;
      const warnings = validateEnv(prodWithoutRzp);
      expect(warnings.some((w) => w.includes('RAZORPAY_WEBHOOK_SECRET not set'))).toBe(true);
    });

    it('accepts production startup when RAZORPAY_WEBHOOK_SECRET is strong and valid', () => {
      const prodWithStrongRzp = {
        ...baseValidProdEnv,
        RAZORPAY_WEBHOOK_SECRET: 'rzp_sec_live_998877665544332211',
      };
      expect(() => validateEnv(prodWithStrongRzp)).not.toThrow();
    });

    it('rejects weak or placeholder RAZORPAY_WEBHOOK_SECRET in production', () => {
      const weakRzpEnv = {
        ...baseValidProdEnv,
        RAZORPAY_WEBHOOK_SECRET: 'test-secret-rzp',
      };
      expect(() => validateEnv(weakRzpEnv)).toThrow(
        /Production startup rejected: RAZORPAY_WEBHOOK_SECRET must be at least 16 characters/
      );
    });

    it('rejects short RAZORPAY_WEBHOOK_SECRET (< 16 characters) in production', () => {
      const shortRzpEnv = {
        ...baseValidProdEnv,
        RAZORPAY_WEBHOOK_SECRET: 'short_rzp_sec',
      };
      expect(() => validateEnv(shortRzpEnv)).toThrow(
        /Production startup rejected: RAZORPAY_WEBHOOK_SECRET must be at least 16 characters/
      );
    });

    it('allows weak RAZORPAY_WEBHOOK_SECRET in non-production environments', () => {
      const devWithWeakRzp = {
        ...baseValidDevEnv,
        RAZORPAY_WEBHOOK_SECRET: 'dev-rzp-sec',
      };
      expect(() => validateEnv(devWithWeakRzp)).not.toThrow();
    });

    it('rejects weak or placeholder REDIS_PASSWORD in production', () => {
      const weakRedisEnv = {
        ...baseValidProdEnv,
        REDIS_PASSWORD: 'secret',
      };
      expect(() => validateEnv(weakRedisEnv)).toThrow(
        /Production startup rejected: REDIS_PASSWORD must be at least 16 characters and cannot use weak\/default placeholders/
      );
    });

    it('rejects placeholder or secret REDIS_URL in production', () => {
      const badRedisUrlEnv = {
        ...baseValidProdEnv,
        REDIS_URL: 'redis://:secret@localhost:6379/0',
      };
      expect(() => validateEnv(badRedisUrlEnv)).toThrow(
        /Production startup rejected: REDIS_URL cannot use default\/development placeholder values or insecure defaults/
      );
    });

    it('accepts strong, non-default REDIS_PASSWORD and REDIS_URL in production', () => {
      const strongRedisEnv = {
        ...baseValidProdEnv,
        REDIS_PASSWORD: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c',
        REDIS_URL: 'redis://:9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c@redis.internal:6379/0',
      };
      expect(() => validateEnv(strongRedisEnv)).not.toThrow();
    });

    it('never prints raw secret values in exception messages', () => {
      const badEnv = {
        ...baseValidProdEnv,
        JWT_SECRET: 'short',
        RAZORPAY_WEBHOOK_SECRET: 'super-sensitive-secret-value-1234',
        REDIS_PASSWORD: 'weak-secret-redis-val',
      };
      try {
        validateEnv(badEnv);
        fail('Expected validateEnv to throw');
      } catch (err: any) {
        expect(err.message).not.toContain('short');
        expect(err.message).not.toContain('super-sensitive-secret-value-1234');
        expect(err.message).not.toContain('weak-secret-redis-val');
      }
    });
  });

  describe('Staging Environment (NODE_ENV=staging)', () => {
    const baseValidStagingEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://aevora:staging_pass_1234567@localhost:5434/aevoradb',
      JWT_SECRET: 'd8f93a1e2b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
      WEBHOOK_SECRET_PROD: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
      WEBHOOK_SECRET_SIM: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
    };

    it('accepts valid, strong secrets in staging', () => {
      expect(() => validateEnv(baseValidStagingEnv)).not.toThrow();
    });

    it('rejects placeholder JWT_SECRET in staging', () => {
      const badStaging = {
        ...baseValidStagingEnv,
        JWT_SECRET: 'dev-secret',
      };
      expect(() => validateEnv(badStaging)).toThrow(
        /Staging startup rejected: JWT_SECRET must be at least 32 characters/
      );
    });

    it('rejects weak WEBHOOK_SECRET_PROD in staging', () => {
      const weakWhStaging = {
        ...baseValidStagingEnv,
        WEBHOOK_SECRET_PROD: 'test',
      };
      expect(() => validateEnv(weakWhStaging)).toThrow(
        /Staging startup rejected: WEBHOOK_SECRET_PROD and WEBHOOK_SECRET_SIM must be at least 16 characters/
      );
    });
  });

  describe('Outbound Sending Safety Guard (ENABLE_REAL_PRODUCTION_SENDING=true)', () => {
    const validOutboundEnv: NodeJS.ProcessEnv = {
      ...baseValidDevEnv,
      ENABLE_REAL_PRODUCTION_SENDING: 'true',
      UNSUBSCRIBE_SECRET: 'super-secure-unsubscribe-secret-32-chars-long!',
      PUBLIC_API_URL: 'https://api.aevora.example.com',
    };

    it('accepts startup when UNSUBSCRIBE_SECRET and PUBLIC_API_URL are strong and valid', () => {
      expect(() => validateEnv(validOutboundEnv)).not.toThrow();
    });

    it('rejects startup if UNSUBSCRIBE_SECRET is missing or < 32 chars', () => {
      const bad = { ...validOutboundEnv, UNSUBSCRIBE_SECRET: 'too-short' };
      expect(() => validateEnv(bad)).toThrow(/UNSUBSCRIBE_SECRET must be at least 32 characters/);
    });

    it('rejects startup if UNSUBSCRIBE_SECRET uses a placeholder', () => {
      const bad = { ...validOutboundEnv, UNSUBSCRIBE_SECRET: 'secret' };
      expect(() => validateEnv(bad)).toThrow(/UNSUBSCRIBE_SECRET must be at least 32 characters/);
    });

    it('rejects startup if PUBLIC_API_URL is missing or not a valid URL', () => {
      const bad1 = { ...validOutboundEnv, PUBLIC_API_URL: '' };
      expect(() => validateEnv(bad1)).toThrow(/PUBLIC_API_URL must be a valid HTTP\(S\) URL/);

      const bad2 = { ...validOutboundEnv, PUBLIC_API_URL: 'invalid-url' };
      expect(() => validateEnv(bad2)).toThrow(/PUBLIC_API_URL must be a valid HTTP\(S\) URL/);
    });
  });
});
