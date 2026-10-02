# Project Rules & Engineering Principles

To maintain a robust, scalable, and secure simulation, all development must adhere to the following principles:

## 1. Source of Truth
*   The repository is the ultimate source of truth for the codebase.
*   The PostgreSQL database is the ultimate source of truth for simulation state and economy.

## 2. Architecture & Modularity
*   **Modular Architecture:** Keep domains isolated (e.g., Economy, Agent Memory, Pathfinding, Projects).
*   **UI/Logic Separation:** Keep business logic completely separate from the UI. The UI is a view into the state.
*   **Visualization Separation:** Simulation state (coordinates, active tasks) is separate from visualization details.

## 3. Financial & State Security
*   **Atomic Transactions:** Financial transactions (AC or Real Money) must be atomic, consistent, and auditable. Use immutable ledgers where possible.
*   **No Direct AI Mutation:** AI agents must **never** directly mutate core financial or company state.
*   **Proposal System:** Agents propose actions. Domain services validate and execute them based on rules.
*   **Explicit Permissions:** Every action requires explicit permissions checked against the Company Constitution.
*   **Real-Money Guardrails:** External real-money actions (API usage, real purchases) must have strict approval controls and limits.
*   **Immutability of Constitution:** The company constitution cannot be modified by ordinary agents.

## 4. Simulation Mechanics
*   **Deterministic Simulation:** Design the system to be as deterministic as practical.
*   **Time Independence:** Simulation time (tick rate, in-simulation days) must be independent from real wall-clock time.

## 5. Development Quality
*   **Testing:** Everything should eventually be testable. Write unit tests for core domain logic (especially economy and permission rules).
*   **Model Agnosticism:** Never hardcode logic for a specific LLM. Always use the Model Gateway.
