# Agent Architecture

The AI Agents in AEVORA are the active participants in the simulation. They operate under a strict architecture to ensure safety, modularity, and model-agnosticism.

## The Model Gateway
All AI agents must communicate with Large Language Models (LLMs) through the **Model Gateway**.
*   **Purpose:** Decouple agent logic from specific providers (OpenAI, Anthropic, Google, Local).
*   **Functionality:** Routes requests, handles rate limiting, manages real-money cost tracking, and standardizes input/output formats (e.g., JSON schemas for tool use).

## Agent Types

1.  **Personal AI Assistant**
    *   *Role:* Direct interface to the Chairman.
    *   *Functions:* Briefings, scheduling, summarizing company events, filtering noise.
2.  **AI Receptionist**
    *   *Role:* Gatekeeper for external requests.
    *   *Functions:* Evaluates incoming client work, creates initial project drafts.
3.  **AI Executives (CEO, COO, CTO, CFO)**
    *   *Role:* High-level planners and managers.
    *   *Functions:* Task decomposition, budget allocation, hiring/firing proposals.
4.  **AI Employees**
    *   *Role:* The workforce.
    *   *Functions:* Executing tasks, communicating with peers, spending AC, moving in the 2D world.

## Agent Lifecycle (The Simulation Loop)
Agents operate on a "Tick" or "Event" basis rather than a continuous while-loop to save resources.
1.  **Observe:** Agent receives state updates (messages, task assignments, environment changes).
2.  **Think:** Agent queries the Model Gateway with its context, memory, and persona to decide the next action.
3.  **Propose:** Agent submits an `Intent` (e.g., `MoveTo(x,y)`, `WriteCode(file)`, `BuyCoffee(AC)`) to the Domain API.
4.  **Execute (by System):** The Domain API validates the Intent against permissions. If valid, the state is updated and an Event is emitted.

## Memory & Persistence
*   **Short-term Context:** Recent chat history, current task context.
*   **Long-term Memory:** Vector database or summarized semantic memory of past events, skills learned, and relationships formed.
