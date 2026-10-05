# AEVORA Business Operations

Phase 6A introduces the core business and project intake pipeline for AEVORA. This establishes how external client requests turn into active development projects.

## Core Flow

1. **Client Inquiry**: An external client submits a request or inquiry. The system creates a `ClientInquiry`.
2. **Reception & Qualification**: The AI Receptionist reads the inquiry, assesses the client's needs, and creates an `Opportunity`.
3. **Assessment**: The `OpportunityAssessmentService` evaluates the cost, duration, and profit margin for the requested work.
4. **Proposal**: A draft `Proposal` is generated based on the opportunity and assessment.
5. **Approval**: The Chairman MUST approve the proposal before it can be accepted. AI Agents do NOT have the `APPROVE_PROPOSAL` permission.
6. **Project Initialization**: Once accepted, a `Project` is created, linking the client, opportunity, and proposal together.

## Security & Constraints

- **Financial Integrity**: All financial amounts are stored as standard integers (e.g., $150.00 is stored as 15000 if using cents, or directly if using strict whole dollars as configured). No floating point logic is permitted for finances.
- **Agent Policy Guardrails**:
  - The `AgentPolicyService` strictly denies `APPROVE_PROPOSAL` to all AI agents. Only human users with the `Chairman` role can approve proposals.
  - Agents cannot skip the standard intake pipeline.
  
## Next Steps (Future Phases)

- Phase 6B: Automated proposal drafting and negotiation.
- Phase 6C: Project staffing and execution.
