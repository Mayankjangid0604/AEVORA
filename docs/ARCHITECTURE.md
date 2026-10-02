# AEVORA Architecture

This document outlines the architectural foundations for AEVORA.

## High-Level System Architecture

The system is composed of several distinct layers, prioritizing separation of concerns:

1.  **Frontend (Web UI)**
    *   **Dashboard:** Interfaces for the Chairman to view reports, manage real-world funds, and approve critical actions.
    *   **2D World Viewer:** A visualization layer that subscribes to the simulation state and renders the office, rooms, and employee avatars.
    *   *Rule:* The UI only reads state and submits user commands; it contains no simulation logic.

2.  **Backend API (Domain Services)**
    *   The core source of truth. Handles business logic, economy, transactions, permissions, and the company constitution.
    *   Exposes internal APIs for the Simulation Layer and external APIs for the Frontend.
    *   Manages the PostgreSQL database.

3.  **Simulation & Agent Layer**
    *   Manages the simulation loop (time progression independent of wall-clock time).
    *   Hosts the AI Agents (Employees, Executives, Receptionist, Assistant).
    *   Agents process their context, make decisions, and *propose* actions to the Backend API.

4.  **Model Gateway**
    *   A dedicated module/service that abstracts all interactions with Large Language Models.
    *   Provides a uniform interface regardless of the underlying provider (Local, Gemini, Claude, etc.).

## Key Design Decisions

*   **TypeScript Everywhere (Where Appropriate):** Using TS across the stack allows sharing types between the API, Agent layer, and Frontend, reducing friction.
*   **PostgreSQL for State:** The economy and employee data require strict consistency and ACID transactions.
*   **Redis for Events/Queues:** The simulation will generate many events (movement, talking, tasks). Redis Pub/Sub will route these to the UI, and Redis queues will manage asynchronous agent thinking.
*   **Action Proposal Pattern:** AI agents do not have direct database access. They submit intents (e.g., `ProposePurchase`, `TransferAC`) to the Domain API, which validates them against the Constitution before executing.

## Database Schema (High Level)
*   **Entities:** User (Chairman), Company, Employee, Department, Room, Project, Task.
*   **Ledgers:** RealWorldLedger, ACLedger (Immutable append-only tables for financial integrity).
*   **Audit Log:** An event store capturing all significant state changes.
