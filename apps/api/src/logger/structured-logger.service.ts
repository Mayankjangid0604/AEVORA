import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

export interface LogContext {
  companyId?: string;
  actorId?: string;
  correlationId?: string;
  environment?: string;
  [key: string]: any;
}

@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLoggerService extends ConsoleLogger {
  private baseContext: LogContext = {};

  setContext(context: string) {
    super.setContext(context);
  }

  setBaseContext(context: LogContext) {
    this.baseContext = { ...this.baseContext, ...context };
  }

  protected formatMessage(message: any, trace?: string, context?: string, meta?: any): string {
    const output = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context: context || this.context,
      message,
      trace,
      ...this.baseContext,
      ...(meta || {})
    };
    return JSON.stringify(output);
  }

  log(message: any, context?: string, meta?: any) {
    console.log(this.formatMessage(message, undefined, context, meta).replace('"level":"INFO"', '"level":"INFO"'));
  }

  error(message: any, trace?: string, context?: string, meta?: any) {
    console.error(this.formatMessage(message, trace, context, meta).replace('"level":"INFO"', '"level":"ERROR"'));
  }

  warn(message: any, context?: string, meta?: any) {
    console.warn(this.formatMessage(message, undefined, context, meta).replace('"level":"INFO"', '"level":"WARN"'));
  }

  logProductionAction(action: string, meta?: any) {
    console.log(this.formatMessage(`[PRODUCTION_ACTION] ${action}`, undefined, this.context, { ...meta, isProductionAction: true }).replace('"level":"INFO"', '"level":"INFO"'));
  }
}
