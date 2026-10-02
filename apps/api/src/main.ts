import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import { parseEnv } from 'util';
import { validateEnv } from './config/validate-env';
import { AppExceptionFilter } from './config/prisma-exception.filter';
import { installSafeModeNetworkGuard, safeMode } from './common/safe-mode';

async function bootstrap() {
  // The root .env is the single source of truth and WINS over anything loaded earlier
  // (Prisma auto-loads packages/database/.env on import, and process.loadEnvFile never overrides).
  try {
    const parsed = parseEnv(fs.readFileSync(path.join(process.cwd(), '../../.env'), 'utf8'));
    for (const [k, v] of Object.entries(parsed)) process.env[k] = v as string;
  } catch (e) {
    console.warn('Could not load .env file from root', e.message);
  }
  // Optional overrides on top of .env (e.g. scripts/safe-local.env: no real outreach, no lead-gen API, no inbox polling).
  const override = process.env.AEVORA_ENV_OVERRIDE;
  if (override) {
    const parsed = parseEnv(fs.readFileSync(path.resolve(process.cwd(), override), 'utf8'));
    for (const [k, v] of Object.entries(parsed)) process.env[k] = v as string;
    console.warn(`[config] overrides applied from ${override}: ${Object.keys(parsed).join(', ')}`);
  }

  for (const warning of validateEnv()) console.warn(`[config] ${warning}`);
  if (safeMode()) installSafeModeNetworkGuard(); // #49: before any module can make a call

  const app = await NestFactory.create(AppModule, { rawBody: true });
  
  app.use(helmet());
  app.useGlobalFilters(new AppExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // ALLOWED_ORIGINS (comma-separated, e.g. https://aevora-web-ashy.vercel.app) is honoured in every mode;
  // local dev origins are added outside production.
  const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? extraOrigins
      : ['http://localhost:3001', 'http://localhost:3000', ...extraOrigins],
    credentials: true,
  });
  
  const port = process.env.PORT || process.env.PORT_API || 13000;
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();

