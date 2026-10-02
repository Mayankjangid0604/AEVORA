# Domain Model

This document outlines the core entities and their relationships within AEVORA.

## Core Entities

### Chairman
*   **Description:** The human owner and ultimate authority.
*   **Properties:** ID, Name, Authentication Details.

### Company
*   **Description:** The primary organizational unit.
*   **Properties:** ID, Name, RealMoneyReserve, ACTreasury, Runway, ConstitutionID.

### Constitution & Permissions
*   **Description:** The rules governing the company.
*   **Properties:** Rules for attendance, bonuses, promotions, disciplinary actions. Role-based access control definitions.

### Employee (AI Agent)
*   **Description:** The autonomous workers in the simulation.
*   **Properties:** ID, Name, PersistentIdentity, Personality, MemoryStore, Skills (Array), RoleID, DepartmentID, Salary, EmploymentStatus (Active, Hold, Fired).

### Economy / Ledgers
*   **ACTransaction:**
    *   **Properties:** ID, Timestamp, FromEntity, ToEntity, Amount, Reason.
    *   *Note: 1,000 AC = ₹1 for accounting.*
*   **RealMoneyTransaction:**
    *   **Properties:** ID, Timestamp, Amount, Description, ApprovalStatus.

### Spatial / 2D World
*   **Map:** The overall grid or layout.
*   **Department:** Logical grouping of rooms.
*   **Room:** Specific areas (e.g., Office, Cafeteria, Meeting Room).
*   **Coordinates:** X, Y positions for employees.

### Projects & Work
*   **Project:** A high-level goal acquired by the Receptionist or Executives.
*   **Task:** Decomposed units of work assigned to Employees.
*   **Status:** Pending, InProgress, Review, Completed.
