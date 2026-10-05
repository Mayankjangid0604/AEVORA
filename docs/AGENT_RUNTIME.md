# AEVORA AI Agent Runtime

The AEVORA Agent Runtime provides the secure orchestration layer for evaluating AI actions inside a company context.

## Architecture

1. **Agent Model**: Represents the persistent identity of the AI, linked to an `Employee`.
2. **Context Builder**: Assembles identity, skills, role permissions, and company events into a controlled system prompt.
3. **Model Gateway**: Abstraction over underlying LLM providers (e.g. Local Stub, Gemini). Forces structured JSON outputs containing `actions`.
4. **Action Registry**: A strict allowlist of known actions and their required permissions (`AgentActionRegistry`).
5. **Policy Engine**: Evaluates every proposed action against the Employee's permissions and company boundaries. Cross-company access is strictly denied.
6. **Execution Record**: Every invocation records its proposals, accepted actions, and rejections persistently via `AgentExecution`.

## Security Boundaries

The AI model NEVER connects directly to the database. It only emits intent (actions).
The Policy Engine is authoritative and cannot be overridden by prompt injection.
Malformed actions or unknown types are securely rejected with recorded audits.

## API Execution

Trigger an agent execution manually:
`POST /agents/:id/run`

This performs exactly one loop. It does not spawn infinite tasks.
