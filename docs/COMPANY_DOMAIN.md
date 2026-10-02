# AEVORA Company & Employee Domain

The organizational domain provides the persistent foundation for all structural entity logic within AEVORA. It is strictly separated from the Economy layer and the AI behavior layer.

## Company Lifecycle
A Company acts as the top-level container for all resources.
- **ACTIVE**: Fully functional, generates revenue, pays salaries.
- **PAUSED**: Operations halt, simulation clock stops applying logic, but can be resumed.
- **SUSPENDED**: Forced halt due to violations or bankruptcy.
- **CLOSED**: Terminal state. Historical records and ledgers are preserved immutably.

## Employee Lifecycle
Employees map to AI Agents (implemented in later phases) but their lifecycle and employment records exist independently as persistent records.
- **ACTIVE**: Actively working and drawing salary.
- **ON_HOLD**: Temporarily not working (e.g. out of funds to pay them).
- **SUSPENDED**: Disciplinary hold.
- **TERMINATED**: Fired. Employee retains identity and history, and can theoretically be rehired.

## Employment History
Every lifecycle change (Hiring, Role Change, Transfer, Termination) explicitly creates an `EmploymentHistory` record via an atomic database transaction. History records are immutable and track the actor responsible for the change (e.g., SYSTEM, CHAIRMAN, HR_AGENT).

## Authorization Model
A simple, extensible roles and permissions system limits controller-driven mutations.
- The `Chairman` role inherently possesses root-level authorization.
- Employees can only mutate the domain if their `Role` encompasses specific string-based permissions (e.g., `HIRE_EMPLOYEE`).

## Relationship Rules
- **Cross-Boundary Checks**: An employee assigned to a department must guarantee the department's `companyId` matches the employee's `companyId`. This is enforced at the service level during `hireEmployee` and `transferEmployee`.
- **Wallets**: Creating an employee implicitly provisions an empty `ACWallet` within the same transaction to guarantee readiness for the `EconomyService`.
