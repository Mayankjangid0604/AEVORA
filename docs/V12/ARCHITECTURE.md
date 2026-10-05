# AEVORA V12 — WORLD-STATE GATEWAY ARCHITECTURE

## 1. Principles
The V12 World-State Gateway exists to translate the **authoritative Aevora Enterprise Reality** into a **Persistent V12 Spatial World State**.
- Aevora's backend is the single source of truth for business logic, identity, employment, and permissions.
- V12 is purely a visual/spatial projection and interaction layer. It has no independent authority to modify enterprise state without routing requests through standard Aevora validation and logic.
- The architecture is strictly renderer-agnostic, supporting 2D, 2.5D, 3D, and VR clients.

## 2. Gateway Responsibilities (Phase 1A)
The gateway acts as an abstraction/translation boundary:
1. **Reads authoritative Aevora state:** Queries models like `Company`, `Employee`, `Department` via Prisma.
2. **Translates to V12 entities:** Maps these into isolated spatial entities (`Person`, `CompanyEntity`, `Room`, `Vehicle`).
3. **Maintains Identity Mapping:** Every V12 entity maintains a reference to its enterprise counterpart (`aevoraId` / `aevoraType`), providing a stable identity link.
4. **Produces Snapshots:** Generates deterministic `WorldSnapshot` dictionary payloads for client initialization.

## 3. The V12 World-State Contract (v1.0.0)
The contract is defined in `packages/shared/src/v12/world-state.ts`.
- **Hierarchical Spaces:** `Region`, `City`, `Campus`, `Building`, `Floor`, `Room`, `Office`, `DepartmentSpace`, `Workspace`.
- **Dynamic Entities:** `Vehicle`, `Person`.
- **State Properties:** Each entity has a `Transform` (Position Vector3, Rotation Quaternion, Scale Vector3) and `VisibilityMetadata`.

## 4. The Event Model & Delta Streaming (Phase 1B)
The V12 events (`packages/shared/src/v12/events.ts`) form an envelope around standard enterprise events.
- **Translation:** `WorldStateEventTranslationService` intercepts authoritative business events (`CompanyEvent`, `Employee` changes) from Prisma and maps them to spatial events without inventing falsified data.
- **Envelopes:** An event includes `eventId`, `eventType`, `schemaVersion`, `entityId`, `aggregateId`, `sequence`, `authoritativeTimestamp`, and `causationId`.
- **Sequence Management:** `WorldStateEventService` manages monotonically increasing sequences scoped strictly by company.
- **Transport:** Server-Sent Events (SSE) via `@Sse` on `/world-state/stream/:companyId` provides a unidirectional, robust realtime transport for world deltas. Clients request a snapshot and apply deltas, falling back to a full snapshot if sequence gaps occur.

## 5. Engine-Agnostic Consumer (Phase 1C)
The V12 World-State Consumer resides in `@aevora/shared/v12/consumer`. 
- **Decoupled Architecture:** Operates entirely independently of any 3D rendering engine or DOM dependencies, running purely on standardized data (e.g. `EventSource` and `fetch`).
- **Snapshot Bootstrap:** Initial connection fetches a complete deterministic world snapshot and authoritative sequence.
- **Delta Processing:** Deterministically applies `V12EventEnvelope` updates over an SSE stream to build an accurate local projection.
- **Reconciliation:** Detects out-of-sequence events or duplicated sequence IDs and immediately forces a snapshot reconciliation, ensuring converging truth.

## 6. Known Limitations
- The spatial geography (campuses, buildings, road networks) is purely defined in interfaces right now and needs a persistence model.
- Default transforms place all initialized entities at `(0, 0, 0)`.

## 7. Next Recommended Development Phase
**Phase 1D:** Technical PoC for 3D Engine Adapter.
- Implement the Visual Renderer Adapter.
- Connect the `WorldStateConsumer` event listeners (`onEntityUpdated`, `onEntityRemoved`) to a 3D engine scene graph to prove bidirectional stability.
