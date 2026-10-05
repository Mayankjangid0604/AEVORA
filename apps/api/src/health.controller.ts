import { Controller, Get } from '@nestjs/common';
import { LocalProvider } from '@aevora/model-gateway';
import { Public } from './authorization/jwt-auth.guard';

@Public()
@Controller('health')
export class HealthController {
  private readonly local = new LocalProvider();
  private cached: { at: number; result: { status: 'ok' | 'error'; message: string } } | null = null;

  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Read-only: is the local model gateway (Ollama + required models) up? Cached 15 s. Used by the office for "absent" desks. */
  @Get('models')
  async models() {
    if (!this.cached || Date.now() - this.cached.at > 15_000) this.cached = { at: Date.now(), result: await this.local.checkHealth() };
    return { ...this.cached.result, checkedAt: new Date(this.cached.at).toISOString() };
  }
}
