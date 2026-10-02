# AEVORA AI Receptionist

The AI Receptionist is the first point of contact for external clients.

## Architecture

The AI Receptionist uses the standard `AgentRuntimeService` and `AgentPolicyService`. When a new inquiry arrives, a context snapshot is provided to the agent, containing the client's message.

### Permitted Actions

The Receptionist agent is granted specific business intake permissions:
- `VIEW_COMPANY_CAPABILITIES`
- `CREATE_INQUIRY`
- `UPDATE_INQUIRY_SUMMARY`
- `QUALIFY_INQUIRY`
- `DISQUALIFY_INQUIRY`
- `CREATE_OPPORTUNITY`
- `DRAFT_PROPOSAL`
- `REQUEST_PROPOSAL_REVIEW`

### Execution

1. The `ReceptionistService` receives a raw text inquiry.
2. It looks up an available employee with an active AI Agent (e.g., Sales Executive).
3. A `ClientInquiry` record is created.
4. A `Task` is assigned to the agent to process the inquiry.
5. The `AgentRuntimeService` executes the agent, allowing it to qualify the lead and draft an opportunity.

This approach ensures the Receptionist operates within the exact same boundaries, memory constraints, and policy engine as all other AI employees in AEVORA.
