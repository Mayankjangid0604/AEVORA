# Company Knowledge & Institutional Memory (Phase 11)

The Company Knowledge system provides durable organizational memory for AEVORA, ensuring that information persists correctly and provenance is maintained across simulated time.

## Architecture

The Knowledge system acts as an integration layer across existing services:
- **KnowledgeModule**: Organizes domain logic.
- **KnowledgeService**: Core service for retrieving and managing `KnowledgeRecord`s.
- **KnowledgeExtractionService**: Hooked into project delivery and task completion to generate knowledge automatically. 
- **KnowledgeValidationService**: Manages the approval and rejection lifecycle of knowledge candidates.
- **KnowledgeProvenanceService**: Manages and returns the history and source of how knowledge was acquired, maintaining the link between a `KnowledgeRecord` and its `KnowledgeSource`.

## Models

- **KnowledgeRecord**: Represents a discrete unit of institutional knowledge.
- **KnowledgeSource**: Links a `KnowledgeRecord` to its origin (e.g., an employee, a task, or manual entry).
- **KnowledgeValidation**: Records the decision matrix for a knowledge candidate.

## Validation Process
Knowledge starts in a `CANDIDATE` state.
The Chairman or a designated validator must approve the knowledge.
The validation payload requires:
```json
{
  "result": "SUPPORTED" | "UNSUPPORTED",
  "reason": "String reason for approval/rejection"
}
```
If `SUPPORTED`, the knowledge record state transitions to `CANONICAL`. If `UNSUPPORTED`, it transitions to `REJECTED`.

## API

The Chairman Control Center integrates with the following endpoints:
- `GET /chairman/knowledge`: Fetch candidates or all knowledge.
- `GET /chairman/knowledge/:id`: Get a specific knowledge record.
- `GET /chairman/knowledge/:id/provenance`: Returns an object `{ sources: [...], validations: [...] }`.
- `POST /chairman/knowledge/:id/validate`: Validates a candidate.
- `POST /chairman/knowledge/:id/archive`: Archives knowledge.
