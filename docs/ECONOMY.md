# AEVORA Economy

The economy in AEVORA is governed strictly by the authoritative `EconomyService`. Financial records are immutable, atomic, and integer-safe.

## Dual Currency System
AEVORA uses a strict dual-currency system that must never be implicitly mixed:

1.  **Internal Currency (AC)**
    *   **Value:** 1,000 AC = ₹1 for accounting/display purposes.
    *   **Usage:** Employee salaries, internal rewards, cafeteria, R&D training.
    *   **Validation:** Integer only. Negative balances are explicitly rejected.
2.  **External Currency (Real Money)**
    *   **Value:** Stored in the smallest integer unit (e.g. Paise for INR).
    *   **Usage:** Paying external APIs (LLM providers), server hosting, actual real-world revenue.
    *   **Validation:** Integer only.

## Transaction Integrity Rules
1.  **Atomicity:** All transfers (both AC and Real Money) must be executed inside a Prisma `$transaction`. If the sender's balance update succeeds but the transaction log fails to create, the entire operation rolls back.
2.  **No Double Spending:** Balances are locked (or implicitly checked) inside the transaction block. Insufficient funds throw a `BadRequestException` and abort the process.
3.  **Idempotency:** API calls passing an `idempotencyKey` will check the database for an existing transaction with that key. If found, it safely returns the prior transaction without mutating state a second time.
4.  **No Implicit Conversions:** Displaying a value as INR does not create funds. The actual transfer is always bounded by the integer balance in the respective ledger.

## Authorized Actors
*   **AI Employees** cannot call `transferAC` to take money from the treasury directly. Their wallet acts as a receiving endpoint for Payroll.
*   **Chairman / System Engine** are the only entities authorized to perform treasury distributions.
