export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class SecurityError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class SignatureMismatchError extends SecurityError {
  constructor(message: string = 'Invalid signature for incoming webhook') {
    super('WEBHOOK_SIGNATURE_MISMATCH', message);
  }
}

export class ExecutionGateError extends SecurityError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class PaymentError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class RevenueError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class ProfitabilityError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class StateTransitionError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}
