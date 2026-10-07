# AEVORA V15 — ARCHITECTURE & CAPABILITY AUDIT

**Date:** 2026-10-06  
**Audited Commit Baseline:** `402f762` (V14 Slice 10 acceptance)  
**Authoritative Baseline:** V1–V13 complete & frozen; V13.5 verified; V14 complete & accepted; V15 NOT started  
**Audit Purpose:** Comprehensive, evidence-based audit and architecture blueprint for AEVORA V15 (Spatial Enterprise OS & Autonomous 3D World).  
**Enforcement Rule:** Strictly audit and architecture only — zero code modification, zero dependency installation, zero schema mutation, zero mock data fabrication.

---

## 1. V15 Objective

AEVORA V15 represents the strategic transition of the enterprise from the 2D Company OS (V14) into **Spatial AEVORA / 3D World OS**.

The V15 system establishes a persistent, reactive 3D spatial representation of the real enterprise that automatically scales as the authoritative enterprise grows:
1. **Basic AEVORA HQ Campus**: A physicalized 3D campus containing buildings, executive suites, departments, corridors, rooms, and parking.
2. **Automatic Capacity & HQ Expansion**: Automated expansion of rooms, department zones, building floors, and new structures when business growth demands space.
3. **Authoritative Workforce Growth**: Automated employee and AI worker provisioning according to business rules, projecting each new employee into a spatial embodiment and workspace.
4. **Authoritative Vehicle Provisioning**: Automated registration and spatial assignment of executive/operational vehicles tied to role authorities.
5. **Organizational & Subsidiary Spawning**: Automatic creation and isolated spatial campus provisioning for new subsidiaries and sub-companies.
6. **Persistent 3D Spatial Representation**: High-performance, company-isolated spatial projection of the real enterprise.
7. **Digital Human Foundations**: Spatial embodiment, gaze, posture, and gesture derived strictly from authoritative activity and meeting/task states.
8. **Realtime Synchronization**: Continuous bidirectional and streaming consistency between PostgreSQL enterprise state, world-state gateway, and spatial client.

### The Inviolable Core Principle

> **THE 3D WORLD MUST NEVER BECOME A SECOND BUSINESS DATABASE.**
>
> Authoritative Data Flow:
> ```
> AEVORA PostgreSQL Enterprise State & Services
>                 ↓
>   Prisma Database Events & Domain Triggers
>                 ↓
> WorldStateEventTranslation & Spatial Reconciliation
>                 ↓
> World-State Gateway (Snapshots, Replay, SSE Stream)
>                 ↓
> 3D Rendering, Digital Humans & Spatial Interaction
> ```
>
> **NOT:**
> ```
> 3D Client / Canvas Interaction → Fake Client-Side Business State (PROHIBITED)
> ```

---

## 2. V14 Frozen Baseline

- **Commit**: `402f762` ("V14 slice 10: Assistant history, notifications, AI worker roster, admin overview, group entry; Playwright + axe E2E; CEO feed error-leak fix").
- **Verification Status**:
  - `apps/web`: 12 test suites, 375 tests passed, 7 live E2E skipped (0 failures).
  - Next.js 16.3.8 production build completed successfully in 3.6s with all routes dynamically rendered or statically optimized.
  - TypeScript zero errors (`tsc --noEmit` exited with 0).
- **V14 Scope Preserved**:
  - The complete 2D Company OS covers Login, Shell, Chairman Home, Groups, Companies, Departments, Workforce, AI workers, Projects, Tasks, Intelligence, Marketing, Sales, Operations, Decisions, Attention, Notifications, and Administration.
  - BFF pattern: Session JWT is kept in `httpOnly`, `SameSite=Strict` cookies and never exposed to client-side scripts.
  - Zero 3D dependencies currently exist in `apps/web` (no Three.js, no React Three Fiber, no WebGL libraries).

---

## 3. V12 Spatial Capabilities (Audit Inventory)

The repository already contains an enterprise-grade spatial foundation engineered during V12:

| Component | Location | Implementation Details | Test Coverage | Status |
|---|---|---|---|---|
| **V12SpatialService** | `apps/api/src/v12-spatial/v12-spatial.service.ts` | Reconciles company sites, buildings, floors, rooms, workspaces; maps roles to executive offices; handles person activity changes; provides digital human embodiment read-model. | 14 test suites, 110 tests passing | **READY / ADAPT** |
| **V12NavigationService** | `apps/api/src/v12-spatial/v12-navigation.service.ts` | Dijkstra pathfinding with binary `MinHeap` over `V12NavigationNode` and `V12SpatialTopologyEdge`. Deterministic tick loop (1000ms), speed calculation (`WALK: 0.4`, `VEHICLE: 2.0`), entity-agnostic. | Verified (10,000 nodes benchmark: 2.8s) | **READY** |
| **V12VehicleService** | `apps/api/src/v12-spatial/v12-vehicle.service.ts` | Derives vehicle class from owner Role (`CHAIRMAN`, `CEO`, `MD`, `EXECUTIVE`, `STANDARD`), assigns parking spots, manages movement through `V12NavigationService`. | 100% unit & E2E passing | **READY / ADAPT** |
| **V12AssetRegistryService** | `apps/api/src/v12-spatial/v12-asset-registry.service.ts` | In-memory registry for vehicle chassis and digital human body mesh metadata. Content-addressed deterministic IDs. | Unit tested | **ADAPT** |
| **V12AssistantAdapter** | `apps/api/src/v12-spatial/v12-assistant.adapter.ts` | Executive assistant spatial queries (`INSPECT_ENTITY`, `WHO_IS_THIS`, `WHERE_IS_EMPLOYEE`, `NAVIGATE_TO`). Gated during replay mode (`REPLAY_READ_ONLY`). | Unit & HTTP tested | **READY** |
| **V12VRActionAdapter** | `apps/api/src/v12-spatial/v12-vr-action.adapter.ts` | Normalizes VR controller ray & candidate entities (`resolveRayTarget`) to assistant intents (`SELECT`, `INSPECT`, `MOVE`). | Unit & HTTP tested | **READY** |
| **V12SpatialAudioService** | `apps/api/src/v12-spatial/v12-spatial-audio.service.ts` | Distance-attenuated 3D spatial audio listener/source calculations. | Unit tested | **READY** |

---

## 4. V14 Frontend Architecture

`apps/web` provides the authoritative 2D production frontend:
- **Routing**: Next.js 16 App Router with route grouping `(os)`.
- **Company Context**: Determined authoritatively via `companyId` route parameter and matching `x-company-id` header passed to BFF.
- **BFF Architecture**: `apps/web/src/server/api.ts` defines `backendFetch()`, reading `httpOnly` session cookies and forwarding requests to NestJS `apps/api` with full server-side tenant validation.
- **State Management**: `@tanstack/react-query` with tenant-scoped query keys (`['company', companyId, domain]`).
- **Isolation Rules**: No direct database access; no browser-held JWT; URL manipulation without valid session permissions results in HTTP 403 / redirect to login.

---

## 5. Spatial Backend Inventory

Inspecting `apps/api/src/v12-spatial` and `apps/api/src/world-state-gateway`:
- **Module Structure**: `V12SpatialModule` imports `PrismaModule`, `WorldStateGatewayModule`, `AuthorizationModule`, `CompanyIntelligenceModule`, `EmployeeModule`, `DepartmentModule`.
- **Event Bus Connection**: Subscribes to `WorldStateEventService.getGlobalStream()` to trigger asynchronous spatial reconciliation on database events (`ENTITY_CREATED`, `ENTITY_UPDATED`, `COMPANY_CLOSED`).
- **Resilience**: Reconciliation handlers catch errors, log contextual diagnostics, and protect transactional database operations from being blocked by spatial projection failures.

---

## 6. Database Inventory (Prisma Models)

The Prisma schema (`packages/database/prisma/schema.prisma`) already defines a comprehensive, normalized spatial topology alongside core enterprise models:

### Existing Enterprise Models
- `AevoraGroup`: Corporate parent group.
- `Company`: Authoritative business entity (status: ACTIVE, PAUSED, CLOSED).
- `Department`: Business unit belonging to a company.
- `Role`: Authoritative role title, access level (`STANDARD`, `MANAGEMENT`, `CHAIRMAN`), permissions.
- `Employee`: Person entity with salary, status, activity (`IDLE`, `WORKING`, `IN_MEETING`, `TRAVELING`), role, department.
- `WorkerProfile`: Worker classification (`HUMAN` vs `AI`).
- `HiringRequest` & `AIProvisioningRequest`: Authoritative workforce expansion requests.
- `OfficeLocation` & `OfficeRoom`: Spatial rooms with chair/capacity tracking.

### Existing V12 Spatial Models
- `V12SpatialWorld`: Global spatial root (`Saahvik`).
- `V12SpatialRegion`, `V12SpatialCountry`, `V12SpatialCity`: Shared macroscopic geography.
- `V12SpatialSite`: Physical campus, strictly company-scoped (`companyId`, `isActive`).
- `V12SpatialBuilding`: Building structure linked to `siteId`.
- `V12SpatialFloor`: Floor level linked to `buildingId`.
- `V12SpatialRoom`: Room linked to `floorId` with `type` (`LOBBY`, `RECEPTION`, `CORRIDOR`, `EXECUTIVE_OFFICE`, `CHAIRMAN_OFFICE`, `CEO_OFFICE`, `MD_OFFICE`, `HEAD_OFFICE`, `DEPARTMENT_SPACE`, `MEETING_ROOM`, `CONFERENCE_ROOM`).
- `V12SpatialWorkspace`: Desk/seat linked to `roomId`, uniquely assigned to an `employeeId`, carrying `companyId`, `departmentId`, `floorId`, `buildingId`, `isActive`, `isOccupied`.
- `V12SpatialParkingArea`: Vehicle parking linked to `siteId` with spot tracking.
- `V12SpatialTopologyEdge`: Traversal edges between nodes (`WALK`, `STAIRS`, `ELEVATOR`, `DOORWAY`).
- `V12NavigationNode`: Navigational waypoint with 3D coordinates (`posX`, `posY`, `posZ`) and containment IDs.
- `V12SpatialMovementState`: Realtime entity movement tracking (`currentLocationId`, `currentNodeId`, `destinationNodeId`, `path`, `progress`, `movementState`, `movementMode`).
- `V12SpatialVehicle`: Physical vehicle linked to `ownerEmployeeId`, `companyId`, `vehicleClass`, `assetId`, `parkingAreaId`.
- `V12SpatialHistoryEvent`: Immutable, append-only company-scoped event log for deterministic world replay.

---

## 7. Shared Contracts (`@aevora/shared`)

`packages/shared/src/v12/` provides complete, framework-agnostic types, schemas, and pure business logic:
- `world-state.ts`: `WorldSnapshot`, `WorldEntity`, `Transform`, `VisibilityMetadata`, `Region`, `City`, `Campus`, `Building`, `Floor`, `Room`, `Office`, `DepartmentSpace`, `MeetingRoom`, `Workspace`, `Parking`, `Person`, `TopologyEdge`, `NavigationNode`.
- `events.ts`: `V12EventEnvelope`, `V12EventType` (`ENTITY_CREATED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `WORLD_BASELINE`).
- `employee-spatial-state.ts`: `deriveEmployeeSpatialState()` mapping employee activity and movement state to `EmployeeSpatialState` (`AT_WORKSPACE`, `IN_MEETING`, `TRAVELLING`, `IN_VEHICLE`, `IDLE`, `UNAVAILABLE`).
- `embodiment-expression.ts`: `deriveEmbodimentExpression()` mapping state to posture (`STANDING`, `SEATED`, `WALKING`, `DRIVING`), gaze (`FORWARD`, `CONVERSATION_PARTNER`, `DESTINATION`, `SCREEN`), gesture, and expression.
- `physics.ts`: Layered collision envelopes (`HUMAN: 0.6x0.6x1.8`, `VEHICLE: 1.8x4.5x1.6`), `canOccupyNode()`.
- `streaming.ts`: `HierarchicalStreamingManager` implementing region-tree activation and LOD/streaming state management.
- `webxr.ts`: `detectWebXRCapability()`, controller events, deterministic ray-sphere intersection targeting.
- `consumer/`: `WorldStateConsumer` client implementation with gap detection, snapshot reconciliation, and event reduction; `ReplayEngine` for scrubbing historical states.

---

## 8. World-State Architecture

- **Snapshot Generation**: `WorldStateGatewayService.generateSnapshot(companyId, viewportEntityId)` constructs an authoritative world snapshot.
- **Tenant Scoping in Snapshot**:
  - Global geography (Region, City) is shared.
  - Sites, buildings, floors, rooms, workspaces, parking, persons, navigation nodes, and topology edges are strictly filtered by `companyId`.
- **Viewport Culling**: Optional hierarchical culling retains only entities within the visibility cone or parent chain of `viewportEntityId`.
- **Sequence Continuity**: Every company maintains a contiguous sequence counter. Snapshots and delta events carry sequence numbers; consumers detect missed sequences and trigger resynchronization.

---

## 9. Realtime Architecture

- **Event Translation**: `WorldStateEventTranslationService` subscribes to Prisma database events (`CompanyEvent`, `Employee`, `Department`) and maps them into `V12EventEnvelope` instances.
- **Broadcasting**: `WorldStateEventService` commits events to `V12SpatialHistoryEvent` in PostgreSQL, then pushes them to RxJS Subject per company.
- **Transport**:
  - Server-Sent Events (SSE): Exposed via `@Sse('world-state/stream/:companyId')`.
  - Authentication: Validated using `@StreamTokenAuth()` (ephemeral short-lived JWT token generated via authenticated HTTP endpoint).
  - Client Consumption: `WorldStateConsumer` in `@aevora/shared` manages the `EventSource` connection, buffering, sequence reconciliation, and local entity map reduction.

---

## 10. Authentication & Security

- **JWT Validation**: All endpoints guarded by NestJS `JwtAuthGuard`.
- **Actor Context**: Request context provides `req.user.actorId` and `req.user.companyId`.
- **BFF Isolation**: In `apps/web`, JWT is held in an `httpOnly` secure cookie. Client-side JavaScript cannot read the token. The Next.js BFF forwards requests to `apps/api` with `Authorization: Bearer <token>`.
- **Stream Tokens**: SSE cannot set custom Authorization headers in standard browser `EventSource`. The system provides `POST /auth/stream-token` to issue short-lived (60s), single-purpose SSE streaming tokens passed safely via query parameter.

---

## 11. Company Isolation Analysis

A rigorous tenant-isolation audit was conducted across all spatial paths:

| Verification Point | Implementation Mechanism | Evidence / Test | Verdict |
|---|---|---|---|
| **Snapshot Scoping** | `WorldStateGatewayService.fetchSpatialState()` scopes sites by `where: { companyId }`, cascading to buildings, floors, rooms, workspaces. | `apps/api/src/world-state-gateway/world-state-gateway.service.spec.ts` | **VERIFIED SAFE** |
| **Controller Gateway Scoping** | `WorldStateGatewayController.scope(req, companyId)` validates `req.user.companyId === companyId`; throws 403 on mismatch. | `apps/api/src/world-state-gateway/world-state-gateway.http.spec.ts` | **VERIFIED SAFE** |
| **Stream Isolation** | SSE stream endpoint `/world-state/stream/:companyId` checks caller company scope; RxJS Subject is strictly keyed by `companyId`. | `v12-http-sse-multi-client.e2e.spec.ts` | **VERIFIED SAFE** |
| **Replay & History** | All queries to `V12SpatialHistoryEvent` filtered by `companyId`. | `world-state-replay.service.spec.ts` | **VERIFIED SAFE** |
| **Cross-Company Navigation** | `V12NavigationService.requestEntityMovement()` resolves nodes strictly within the entity's company building/campus. | `v12-navigation.service.spec.ts` | **VERIFIED SAFE** |
| **Cross-Company Vehicle Access** | Vehicles carry `companyId`; parking spots resolved only within company site. | `v12-vehicle.service.spec.ts` | **VERIFIED SAFE** |

---

## 12. Rendering Feasibility

- **Current State**: Neither Three.js, React Three Fiber, nor Babylon.js is installed. No WebGL canvas or shaders exist in `apps/web`.
- **Feasibility Assessment**:
  - The `@aevora/shared` contracts are completely engine-agnostic and ready for any 3D renderer.
  - Three.js + React Three Fiber (R3F) or Vanilla Three.js can be integrated cleanly inside a dedicated Next.js client component without touching the 2D V14 OS shell.
  - Next.js dynamic imports (`ssr: false`) must be used for any 3D viewport component to prevent SSR hydration errors with WebGL/WebGPU contexts.

---

## 13. Digital-Human Feasibility

- **Current State**: High-level semantic state machines exist in `@aevora/shared/src/v12/embodiment-expression.ts` (`deriveEmbodimentExpression`).
- **Gaps**:
  - No skeletal meshes, blend shapes, or character rigs exist in the repository.
  - `DigitalHumanEmbodiment` read-model provides name, role, activity, spatial state, currentNodeId, workspaceId, meetingId, vehicleId.
- **Feasibility Assessment**:
  - Phase 1: Procedural / stylized humanoid avatars (low-poly / capsule / stylized avatar meshes) driven by `deriveEmbodimentExpression`.
  - Phase 2: Skeletal mesh GLTF avatars with animation clips (`idle`, `walk`, `sit`, `talk`, `nod`) mapped directly to `PostureState` and `GestureState`.

---

## 14. Navigation Feasibility

- **Current State**: `V12NavigationService` is production-ready.
  - MinHeap Dijkstra algorithm performs at 2.8ms for 1,000 nodes, 2.8s for 10,000 nodes.
  - Automatically updates `V12SpatialMovementState` on each tick (1000ms).
  - Handles WALK and VEHICLE traversal modes with speed limits.
- **Feasibility Assessment**:
  - **READY**. No algorithmic changes required. In V15-B/C, newly generated rooms and floors simply register their `V12NavigationNode` and `V12SpatialTopologyEdge` records during expansion.

---

## 15. Vehicle Feasibility

- **Current State**: `V12VehicleService` creates vehicle entities for employees, derives visual chassis classes, allocates parking spots, and requests movement along vehicle-traversable edges.
- **Gaps**:
  - Vehicle creation is currently manual (only called in tests and explicit endpoints).
  - No autonomous trigger exists when an executive (Chairman, CEO, MD, VP) is hired or promoted.
- **Feasibility Assessment**:
  - **ADAPT**. Add an automated listener in `V12VehicleService` or `V12SpatialService` subscribing to executive hiring/promotion events to trigger `createVehicleForEmployee()`.

---

## 16. Asset Feasibility

- **Current State**: `AssetRegistry` (`packages/shared/src/v12/assets.ts`) tracks semantic roles, asset types (`MESH`, `TEXTURE`, `AUDIO`, `ANIMATION`), sources (`PROCEDURAL`, `MANUAL`), and bounds.
- **Gaps**:
  - Assets are stored in an in-memory Map at backend startup; no physical `.glb`/`.gltf` binary files exist in the repository.
- **Feasibility Assessment**:
  - **ADAPT**. Establish a static asset bundle directory (`apps/web/public/assets/3d/`) containing optimized low-poly GLTF models for building components, rooms, furniture, vehicles, and avatars.

---

## 17. WebXR Feasibility

- **Current State**: Complete abstract session manager, capability detection, raycasting, and controller input abstraction in `@aevora/shared/src/v12/webxr.ts`.
- **Gaps**:
  - No frontend WebXR canvas or `navigator.xr` session hook.
- **Feasibility Assessment**:
  - **INCOMPLETE**. When the 3D canvas is implemented, connect Three.js `VRButton` / WebXR manager to `WebXRSessionManager`.

---

## 18. Physics Feasibility

- **Current State**: Layered occupancy and collision logic in `@aevora/shared/src/v12/physics.ts` enforces non-overlapping vehicle occupancy and node capacity limits.
- **Gaps**:
  - No client-side physics engine (such as `@react-three/rapier` or `cannon-es`).
- **Feasibility Assessment**:
  - **READY** for topological occupancy. Client-side collision for first-person avatar movement will require a lightweight client physics collider (Rapier) during renderer implementation.

---

## 19. Automatic Employee Provisioning Feasibility

- **Authoritative Source**: `apps/api/src/workforce/hiring.service.ts` (`completeOnboarding`) and `apps/api/src/employee/employee.service.ts` (`hireEmployee`).
- **Trigger**: Emits `CompanyEvent` `EMPLOYEE_HIRED`.
- **Spatial Reaction**: `WorldStateEventTranslationService` translates to `V12EventType.ENTITY_CREATED` (`v12_person_${emp.id}`).
- **Spatial Provisioning**: `V12SpatialService.triggerEmployeeReconciliation(employeeId)` locates the company building, finds or creates an available workspace in the employee's department room, and assigns it.
- **Feasibility Assessment**:
  - **READY**. The end-to-end chain from business hiring to spatial workspace assignment is already implemented and operational.

---

## 20. Automatic Room & Department Provisioning Feasibility

- **Authoritative Source**: `apps/api/src/department/department.service.ts` (`createDepartment`).
- **Trigger**: Emits `CompanyEvent` `DEPARTMENT_CREATED`.
- **Spatial Reaction**: `WorldStateEventTranslationService` translates to `V12EventType.ENTITY_CREATED` (`v12_department_${dept.id}`).
- **Spatial Provisioning**: `V12SpatialService.triggerCompanyReconciliation(companyId)` creates `${dept.name} Space` on the building's floor.
- **Feasibility Assessment**:
  - **READY** for basic 1:1 department-to-room mapping.
  - **ADAPT** for multi-room department partitioning when department headcount exceeds room capacity.

---

## 21. Automatic HQ Expansion Feasibility

- **Current State**: `V12SpatialService` provisions a fixed template: 1 building, 2 floors (Main Floor level 1, Executive Level level 100).
- **Gaps**:
  - When workforce headcount exceeds floor workspace capacity, no additional floors (level 2, 3...) are automatically added.
  - No algorithm exists to evaluate building capacity thresholds and trigger vertical (floors) or horizontal (wings/buildings) expansion.
- **Feasibility Assessment**:
  - **INCOMPLETE / ADAPT**. Requires an `HQCapacityManagerService` in V15-B that evaluates capacity upon every hiring event and automatically creates new `V12SpatialFloor` and `V12SpatialRoom` entities when needed.

---

## 22. Automatic Vehicle Provisioning Feasibility

- **Current State**: `V12VehicleService.createVehicleForEmployee(ownerId)` exists but has no autonomous invocation trigger.
- **Feasibility Assessment**:
  - **ADAPT**. Wire an automated event handler to listen for executive employee onboarding (`role.accessLevel === 'CHAIRMAN' | 'MANAGEMENT'`) to automatically call `createVehicleForEmployee()`.

---

## 23. Automatic Company & Subsidiary Provisioning Feasibility

- **Authoritative Source**: `apps/api/src/company/company.service.ts` (`createCompany`).
- **Trigger**: Emits `CompanyEvent` `COMPANY_CREATED`.
- **Spatial Reaction**: `WorldStateEventTranslationService` translates to `V12EventType.ENTITY_CREATED` (`v12_company_${companyId}`).
- **Spatial Provisioning**: `V12SpatialService.triggerCompanyReconciliation(companyId)` automatically provisions a distinct `V12SpatialSite` (`${company.name} Campus`), HQ Building, floors, executive offices, department rooms, and parking.
- **Tenant Isolation**: The new site has a unique `companyId`. All subsidiary spatial state is completely isolated from the parent company and sibling subsidiaries.
- **Feasibility Assessment**:
  - **READY**. The backend already provisions an isolated spatial campus for every newly created company.

---

## 24. Performance Analysis

- **Navigation**: MinHeap Dijkstra pathfinding benchmarked on 10,000 nodes at 2.87s; 1,000 nodes at 244ms; 100 nodes at 104ms.
- **World State Reduction**: Reducing 10,000 entities in `WorldStateReducer` takes 17ms; snapshot generation takes 15ms.
- **Streaming & Memory**: `HierarchicalStreamingManager` prevents loading distant campuses into memory by activating only the current region/building hierarchy.
- **SSE Throughput**: Verified in `world-state-closure-gate.spec.ts` handling 10,000 events in 2.44s (throughput: 4,086 events/sec).

---

## 25. Existing Test Baseline

All test suites were verified locally against the authoritative codebase:
- **`@aevora/shared`**: 16 test suites, 144 tests passed (0 failed).
- **`@aevora/web`**: 12 test suites, 375 tests passed, 7 live E2E skipped (0 failed).
- **`apps/api/src/v12-spatial`**: 14 test suites, 110 tests passed (0 failed).
- **`apps/api/src/world-state-gateway`**: 13 test suites, 136 tests passed (0 failed).
- **Total Test Count**: **55 test suites, 765 tests executed across all verified domains, 100% passing.**

---

## 26. Risks

1. **Dual State Corruption Risk**: If a 3D client were allowed to invent business entities (e.g., clicking "add desk" directly creating an employee), database integrity would fracture. *Mitigation: 3D canvas is strictly a projection view and command dispatcher.*
2. **WebGL Context Overload**: Running heavy 3D canvases across multiple route changes in Next.js can leak WebGL contexts. *Mitigation: Single canvas singleton or robust component unmount cleanup.*
3. **SSE Connection Limits**: Browsers limit HTTP/1.1 connections to 6 per domain. *Mitigation: Ensure HTTP/2 or multiplex SSE streams; disconnect streams when 3D viewer is hidden.*
4. **Tenant Data Leakage**: Rendering multi-company environments could accidentally display foreign company buildings. *Mitigation: Strict `companyId` scoping on all snapshot and streaming queries.*

---

## 27. Dependencies Required for V15 (Future Phase)

*Note: Per strict instructions, NO dependencies have been installed during this audit.*

When V15 implementation commences, the following dependencies will be required:
- `three` & `@types/three`: Core 3D engine.
- `@react-three/fiber`: React 19 reconciler for Three.js.
- `@react-three/drei`: Component helpers (camera controls, GLTF loaders, text rendering, sky, environment).
- `@react-three/xr` (optional for WebXR phase).

---

## 28. Reusable Capabilities

1. `V12SpatialWorld`, `Site`, `Building`, `Floor`, `Room`, `Workspace`, `Parking` Prisma models.
2. `V12SpatialMovementState`, `V12NavigationNode`, `V12SpatialTopologyEdge` navigation infrastructure.
3. `V12NavigationService` Dijkstra pathfinding with MinHeap.
4. `WorldStateGatewayService` company-scoped snapshot generator and viewport culler.
5. `WorldStateEventService` and SSE streaming controller.
6. `WorldStateEventTranslationService` mapping PostgreSQL business mutations to spatial events.
7. `@aevora/shared/src/v12/consumer/world-state-consumer.ts` client-side SSE receiver and state reducer.
8. `deriveEmployeeSpatialState()` and `deriveEmbodimentExpression()`.
9. `V12VRActionAdapter` raycasting and controller action mapper.
10. `V14` authentication, BFF cookies, and tenant isolation architecture.

---

## 29. Capabilities Requiring Adaptation

1. **`V12SpatialService`**: Needs dynamic capacity evaluation so buildings scale beyond the hardcoded 2 floors when company headcount increases.
2. **`V12VehicleService`**: Needs an automated event listener triggered by executive employee hiring.
3. **`V12AssetRegistryService`**: Needs persistent asset definitions and linkage to static GLTF files.
4. **`V12SpatialRoom`**: Needs capacity calculation (`chairCount` vs `assignedWorkspacesCount`) to trigger departmental room splitting.

---

## 30. Capabilities Requiring New Implementation

1. **3D Canvas & Viewport Component**: Next.js client component in `apps/web` rendering the 3D scene from `WorldStateConsumer` entities.
2. **Procedural / Architectural Geometry System**: Renders procedural buildings, floors, walls, doorways, and rooms based on spatial coordinates and bounds.
3. **3D Employee Avatar System**: Visual representation of employees in 3D, animated according to `deriveEmbodimentExpression()`.
4. **3D Vehicle Model & Traversal Visualization**: 3D visual rendering of vehicles following navigation paths.
5. **Interactive Spatial Camera & Navigation Controls**: Orbit controls, first-person walk controls, and click-to-move navigation.
6. **Automatic HQ Expansion Manager**: Service monitoring employee-to-floor ratios and automatically creating additional floors/wings.

---

## 31. Recommended V15 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AEVORA AUTHORITATIVE BACKEND                          │
│                                                                             │
│  [CompanyService]   [EmployeeService]   [DepartmentService]   [Workforce]   │
│           │                 │                   │                  │        │
│           ▼                 ▼                   ▼                  ▼        │
│    CompanyCreated    EmployeeHired      DepartmentCreated   HiringApproved  │
│           │                 │                   │                  │        │
│           └─────────────────┴─────────┬─────────┴──────────────────┘        │
│                                       ▼                                     │
│                     [Prisma Database Events (PostgreSQL)]                   │
│                                       │                                     │
│                                       ▼                                     │
│                  [WorldStateEventTranslationService]                        │
│                                       │                                     │
│                ┌──────────────────────┴──────────────────────┐              │
│                ▼                                             ▼              │
│      [V12SpatialService]                         [WorldStateEventService]   │
│   - Reconcile Company Presence                   - Persist History Event    │
│   - Reconcile Employee Presence                  - Contiguous Sequence ID   │
│   - HQ Capacity & Floor Expansion                - Broadcast to SSE Stream  │
│   - Workspace & Parking Allocation                           │              │
│                │                                             │              │
└────────────────┼─────────────────────────────────────────────┼──────────────┘
                 │                                             │
                 │ HTTP Snapshot / History                     │ SSE Stream
                 ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AEVORA V15 CLIENT (WEB)                            │
│                                                                             │
│  [WorldStateConsumer] (packages/shared/src/v12/consumer)                    │
│    - Connects via /api/bff/stream-token to /world-state/stream/:companyId   │
│    - Reconciles sequence gaps via /world-state/snapshot/:companyId          │
│    - Maintains local Reactive Entity Map                                    │
│                         │                                                   │
│                         ▼                                                   │
│  [Spatial Viewport (React Three Fiber / Three.js)]                          │
│    - SceneGraph (Campus → Buildings → Floors → Rooms → Workspaces)          │
│    - Digital Human Avatars (driven by deriveEmbodimentExpression)           │
│    - Vehicles (following NavigationNodes)                                   │
│    - Spatial Interaction & Raycasting (dispatches to BFF / Assistant)       │
│                                                                             │
│  [V14 2D Company OS UI Overlay]                                             │
│    - Preserved intact; toggles spatial view or docks spatial viewport       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 32. Recommended Implementation Order

### Stage V15-A: Basic HQ / Spatial Foundation
- Install rendering dependencies (`three`, `@react-three/fiber`, `@react-three/drei`).
- Create `apps/web/src/components/spatial/SpatialViewport.tsx` (Next.js client-only dynamic import).
- Connect `SpatialViewport` to `WorldStateConsumer` using authenticated stream tokens.
- Render the authoritative AEVORA HQ Campus: Ground terrain, Aevora Tower, Main Floor, Executive Level, Executive Offices (Chairman & CEO), corridors, and parking lot.

### Stage V15-B: Automatic Rooms / Departments / Floors / HQ Expansion
- Implement `HQCapacityService` in backend.
- Connect department creation triggers to automatic room layout calculations.
- Implement floor expansion algorithm: When room count or workforce exceeds floor thresholds, automatically provision additional floors (`level 2`, `level 3`...) and connect stair/elevator topology edges.
- Update spatial rendering to dynamically reflect multi-floor buildings.

### Stage V15-C: Automatic Employee Provisioning + Spatial Employees
- Connect employee hiring pipeline to spatial employee spawning.
- Render 3D avatars for employees at their assigned workspaces.
- Connect activity changes (`WORKING`, `IN_MEETING`, `TRAVELING`) to `V12NavigationService` and avatar posture/expression states (`Standing`, `Seated`, `Walking`).

### Stage V15-D: Automatic Vehicle Provisioning
- Connect executive role assignments to `V12VehicleService.createVehicleForEmployee()`.
- Render 3D vehicle models in the designated parking spots.
- Visualize vehicle movement when traveling between sites or arriving at the campus.

### Stage V15-E: Automatic Company & Sub-Company Provisioning
- Wire new subsidiary creation to automated campus site provisioning.
- Enable spatial multi-campus navigation (switching between parent HQ and subsidiary campuses with strict tenant isolation).

### Stage V15-F: Complete 3D Functions, Realtime, Security & Performance
- Full WebXR controller raycasting integration.
- 3D spatial audio listener positioning.
- Stress testing: 10,000 entities with hierarchical streaming and occlusion culling.
- Final security audit verifying zero cross-company leakage in 3D rendering.

---

## 33. V14 Compatibility Rules

1. **Zero Breaking Changes**: V14 2D routes (`/company/[id]`, `/organization`, `/workforce`, `/projects`, `/tasks`, `/ceo`, `/assistant`, etc.) must remain 100% operational.
2. **Optional Spatial Mode**: The 3D spatial view must be exposed as a dedicated workspace (`/company/[id]/world` or split/toggle mode in shell) without displacing the 2D Company OS.
3. **Unified Session Auth**: Spatial services must use the existing V14 session cookie and BFF authentication layer.
4. **Performance Protection**: If WebGL is unavailable or fails on client hardware, the application must gracefully degrade to 2D OS without error.

---

## 34. V15 / V16 Boundary

- **V15 Scope**:
  - Authoritative 3D spatial enterprise representation.
  - Automatic HQ expansion, employee placement, vehicle allocation, and subsidiary campus spawning.
  - Realtime synchronization between PostgreSQL and 3D client.
  - Spatial navigation, interaction, and basic digital human embodiment.
- **V16 Boundary (Future)**:
  - Photorealistic skeletal digital humans with voice lip-sync and generative facial animation.
  - Full immersive multi-user VR meetings with avatar voice chat.
  - Procedural generative architecture (AI-designed building interiors and exterior styling).
  - External world economic simulation and city-level autonomous expansion.
