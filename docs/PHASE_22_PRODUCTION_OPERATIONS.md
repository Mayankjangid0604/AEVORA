# Phase 22: Production Operations & Real-World Integration

## Overview
Phase 22 bridges the gap between simulated enterprise operations and real-world execution. The system now enforces a strict `ExecutionEnvironment` boundary, ensuring simulated agents cannot accidentally trigger production side-effects (e.g., real emails, payments, or client notifications).

## 1. Execution Environments

AEVORA now categorizes every side-effect into one of three environments:
1. **SIMULATION**: Internal testing, AI agent sandboxing, abstract operations. Zero external side effects.
2. **SANDBOX**: Real network requests sent to external provider test/sandbox endpoints (e.g., Stripe Test Mode, SendGrid Sandbox).
3. **PRODUCTION**: Real-world execution affecting real clients and real money.

## 2. Integration Framework

The new `IntegrationModule` routes external calls based on the active environment.
- Capabilities (`EMAIL`, `PAYMENTS`, `CRM`) are mapped via `ProviderIntegration`.
- Every operation is immutably recorded in `IntegrationAuditLog`.
- **Limitation**: Currently, `PRODUCTION` mode does not have real API adapters implemented. Any attempt to invoke a production capability will safely throw a `NOT_IMPLEMENTED` error to prevent untracked ghost actions.

## 3. Persistent Background Jobs

Real-world operations require reliability that memory queues cannot provide.
- The `JobModule` implements a PostgreSQL-backed job queue via the `BackgroundJob` table.
- Features exponential backoff, worker locking (`workerId`), and idempotency guarantees (`idempotencyKey`).
- Replaces unreliable in-memory `setTimeout` loops for critical business logic.

## 4. Chairman Approval Gates

To safely deploy autonomous agents, high-risk actions are guarded by the `ApprovalModule`.
- A transaction with `RiskLevel.HIGH` or `CRITICAL` will automatically pause and generate an `ApprovalRequest`.
- The system awaits explicit authorization from an authorized Chairman/Manager before proceeding.
- Low-risk sandbox operations are auto-approved per policy.

## 5. Economy Linkage & Invoicing

The `InvoiceModule` acts as the bridge between abstract AC (Aevora Credits) and Real Money.
- Introduces `Invoice` and `InvoiceLineItem` entities tied to `Client` and `Project`.
- Enforces strict taxation and currency boundaries.
