# AEVORA - Company Economics & Financial Operations (Phase 7)

This document describes the financial systems implemented in AEVORA.

## Accounting Principle
There are two separate ledgers:
1. **Real Money**: Explicit cash. Managed by `RealMoneyAccount` and `RealMoneyTransaction`.
2. **AC**: Internal accounting unit. 1,000 AC = ₹1. Not convertible directly to real cash unless explicitly mapped via specific operations like Payroll.

## Financial Domains
- **Revenue**: Lifecycle from `EXPECTED` to `RECEIVED`.
- **Project Economics**: Aggregates expected/realized revenue and internal/external costs to calculate margin and financial status.
- **Payroll**: `PayrollRun` calculates salaries (in AC). Approving and executing it transfers AC to employee wallets.
- **Expenses**: `CompanyExpense` records operational spending.
- **Budgets**: Hard spending bounds for projects, departments, and the company.
- **Financial Reporting**: Calculates Cash flow, P&L, and Runway based strictly on actual database records.

## Workflows
1. **Chairman Capital Injection**: Directly credits the Company Treasury via `EconomyService`.
2. **Client Payments**: Simulation moves `RevenueRecord` to `RECEIVED` and credits Company Treasury.
3. **Payroll**: Employee compensation is allocated internally in AC.
4. **Project Costs**: Employee time represents analytical cost, avoiding double-counting in the company P&L.

## Known Technical Debt
- Idempotency is implemented via `idempotencyKey` on financial operations.
- Postgres E2E tests require a live database on `localhost:5432`.
- Real-world APIs (Stripe) are deliberately deferred to future phases.
