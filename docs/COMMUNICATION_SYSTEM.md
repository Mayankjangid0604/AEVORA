# Phase 10: Internal Communication & Collaboration System

## Mission Statement
Phase 10 provides the **coordination layer** for the AEVORA simulated company. It allows AI employees, managers, executives, departments, and projects to communicate, coordinate meetings, generate notifications, create action items, and preserve important communication as durable company history.

## Architecture & Integration

The Communication Module leverages the existing Phase 5/6 Simulation Engine and Agent Runtime architecture without duplicating them. 

### Key Capabilities
1. **Conversations & Messages:** Multi-participant threads, organized by `PROJECT`, `DEPARTMENT`, `GROUP`, or `DIRECT` scope.
2. **Meetings:** A structured meeting lifecycle (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`), featuring integrated notes, agenda items, and action items.
3. **Notifications:** Priority-based alerts informing employees of important events without forcing synchronous chat.
4. **Communication Memory:** Important messages and meeting insights can be persistently stored via the `CommunicationMemoryService`, converting ephemeral chat data into `AgentMemoryReference` objects for long-term agent reasoning.
5. **Relationship Tracking:** Employee interactions organically boost their `collaborationCount`, `messagesExchanged`, and `meetingsTogether` through the `RelationshipService`.

## Security Boundaries & Multi-Tenant Isolation
- **Domain Independence:** A chat message cannot alter the AC ledger, bypass payroll logic, or autonomously enact governance decisions. It serves strictly as communication. All financial or company policy mutations must flow through Phase 6 `AgentPolicyService` protocols.
- **Cross-Company Isolation:** Communication is strictly bounded by `companyId`. Endpoints, logic services, and the policy engine strictly assert that no target employee, conversation, or meeting belongs to an external company. Cross-tenant leakage is hard-blocked.

## Frontend UI Implementation
The Phase 10 UI sits inside the Chairman Control Center under the **Communication** tab, aligning with the Phase 8 visual standards (dark mode, minimalist). 
It leverages a master-detail pattern containing:
- **Active Threads:** Viewing messages, senders, and timestamps.
- **Meetings:** Displaying status, date, participants, notes, and action items.
- **Notifications:** A prioritized list of system events targeted at specific employees.

## Visual State Synchronization
When a meeting goes into the `IN_PROGRESS` state, the `MeetingService` automatically shifts the participating employees' activity to `IN_MEETING`. The Phase 9 `WorldRenderer` picks this up and renders their avatars within the 2D visualization's designated Meeting Room. When the meeting is `COMPLETED`, their state reverts to `IDLE` or their previous default.
