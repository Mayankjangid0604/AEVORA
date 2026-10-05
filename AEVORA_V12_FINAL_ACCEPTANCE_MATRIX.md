# AEVORA V12 — Final Acceptance Matrix (Independent Audit)

This supersedes prior drafts of this file. It is a from-scratch independent check against the actual code, the actual locked decision register (`docs/V12/02_AEVORA_V12_DECISION_REGISTER.md`, decisions 81–125), and executed evidence — not a restatement of earlier self-reported "complete" labels. Where earlier rounds over-credited something, that is corrected here explicitly.

**Classification key**: VERIFIED (real, executed evidence exists) · IMPLEMENTED BUT NOT VERIFIED (code exists, no test/run proves it) · PARTIALLY IMPLEMENTED (a real subset exists, the full requirement doesn't) · NOT IMPLEMENTED (no code) · EXTERNAL VERIFICATION REQUIRED (software complete, needs hardware/infra this environment lacks).

## Decisions 81–90: Core technical architecture

| # | Decision | Status | Evidence |
|---|---|---|---|
| 81 | Hybrid web + dedicated immersive world | PARTIALLY IMPLEMENTED | Web app (`apps/web`, Next.js + React Three Fiber) is real and builds. "Dedicated immersive world" = the WebXR layer added this session, which is software-only (§99/100 below). |
| 82 | Engine-agnostic initially | IMPLEMENTED BUT NOT VERIFIED | The world representation (`WorldEntity`, `MovementState` in `packages/shared`) is renderer-agnostic by construction (plain JSON, no Three.js types). No second renderer was ever built to prove portability, so "agnostic" is a property of the data model, unverified against a second engine. |
| 83 | Renderer-independent progressive rendering | NOT IMPLEMENTED | No progressive/LOD rendering exists (confirmed by source grep this session — zero hits for LOD/progressive-load/region-streaming in `apps/web`). |
| 84 | Authoritative World-State Gateway | VERIFIED | `WorldStateEventService` + `WorldStateGatewayController` — persist-then-broadcast enforced and tested (`world-state-event.service.spec.ts`, `world-state-closure-gate.spec.ts`), now also real-socket HTTP/SSE tested (`v12-http-sse-multi-client.e2e.spec.ts`). |
| 85 | Event-driven realtime | VERIFIED | Real SSE stream, real reducer, real multi-client convergence (in-process and over real sockets). |
| 86 | Persistent Saahvik-owned geography | PARTIALLY IMPLEMENTED | `V12SpatialService.seedSaahvikWorld`/`reconcileCompanySpatialPresence` create real, persisted (Prisma) spatial structures per company (site/building/floors/rooms), idempotently. "Owned by Saahvik" as a distinct named persistent world concept beyond this company-reconciliation logic was not found. |
| 87 | Hierarchical navigation | PARTIALLY IMPLEMENTED | The navigation graph (`V12NavigationNode`/`V12SpatialTopologyEdge`) supports arbitrary node/edge topology with `floorId`/`buildingId`/`siteId` tags, and real Dijkstra pathfinding (now O((V+E)log V), benchmarked). There is no building→floor→room *hierarchical* traversal algorithm distinct from flat graph search — hierarchy exists as metadata tags on nodes, not as a multi-level routing strategy. |
| 88 | Layered physics | NOT IMPLEMENTED (see §A below) | No physics engine dependency exists anywhere in the repo (confirmed by package.json/source grep). "Physics" today = `isTraversable` boolean gating on nodes/edges. This is navigation-graph constraint, not physics. |
| 89 | Enterprise-aware asset pipeline | NOT IMPLEMENTED (see §F below) | No asset provenance/versioning system exists. Meshes in `DigitalHuman.tsx`/`DigitalVehicle.tsx` are hand-authored Three.js primitives (boxes/cylinders), not a managed asset pipeline. |
| 90 | Renderer-independent multi-view architecture | PARTIALLY IMPLEMENTED | `viewMode` prop drives `DynamicCamera` (first/third-person, executive, overview modes exist in code per prior audit) — all within the one React Three Fiber renderer. No second renderer implementation exists to prove the "multi-view **architecture**" claim beyond one concrete renderer offering multiple camera modes. |

## Decisions 91–100: Embodiment and VR

| # | Decision | Status | Evidence |
|---|---|---|---|
| 91 | Full intelligent locomotion | PARTIALLY IMPLEMENTED | Deterministic point-to-point movement with real distance/speed-derived timing exists and is well-tested (this session's work). "Intelligent" locomotion (obstacle avoidance, crowd behavior, natural gait variation) does not exist — movement is linear interpolation along a fixed path (`EntityMesh.tsx` `useFrame`). |
| 92 | Enterprise digital-human pipeline | PARTIALLY IMPLEMENTED — see §B below | Backend embodiment read-model (`getEmployeeEmbodiment`) is real, tested, and correctly state-driven (task/meeting/vehicle/termination-aware). The "pipeline" that turns that into a human-*looking* avatar is a single hardcoded primitive-geometry mesh (`DigitalHuman.tsx`) — no per-employee visual identity, no asset pipeline. |
| 93 | Full intelligent expression/body language | NOT IMPLEMENTED — see §C below | Zero facial/blend-shape/morph-target code found anywhere in the frontend (confirmed by source grep). `DigitalHuman.tsx` has no face. |
| 94 | Full multimodal conversational voice | IMPLEMENTED BUT NOT VERIFIED THIS SESSION | `ExecutiveVoice.tsx` and the Assistant adapter's `WHO_MANAGES_THIS`/`WHERE_IS_EMPLOYEE`/`CANCEL_NAVIGATION`/navigation intents exist and are unit-tested (backend). This is pre-existing + this session's assistant fixes; "full multimodal" (voice recognition quality, multi-turn context) was not independently re-verified this round. |
| 95 | Intelligent spatial audio | NOT IMPLEMENTED — see §D below | Zero source-level spatial-audio code (confirmed by grep: no `AudioListener`/`PositionalAudio` usage outside the raw three.js vendor bundle). |
| 96 | State-derived persistence | VERIFIED | `V12SpatialWorkspace`/`V12SpatialMovementState`/`V12SpatialVehicle` are all derived from and reconciled against authoritative Employee/Company/Meeting state, tested extensively this session. |
| 97 | Full spatial history | PARTIALLY IMPLEMENTED | `V12SpatialHistoryEvent` append-only log + replay/reconstruction (`WorldStateReplayService`) exist and are tested (pre-existing, reconfirmed passing). "Full" historical inspection UI (`HistoricalInspector.tsx`, `ReplayTimeline.tsx`) exists in source but was not re-verified in a live browser against real history data this session. |
| 98 | Hierarchical streaming | NOT IMPLEMENTED — see §E below | No region/city/building-scoped progressive loading exists. The backend returns a full company snapshot in one response (`WorldStateGatewayService.generateSnapshot`); there is no partial/viewport-scoped streaming. |
| 99 | Full executive VR interaction | NOT IMPLEMENTED (software skeleton only — see §G below) | `VRButton`/`WebXRSessionManager` provide capability detection + session lifecycle + raw controller-event-to-action translation only. There is **no** entity selection, no executive UI in VR, no world interaction beyond entering/exiting a session. This session's own prior report should not be read as more than that. |
| 100 | Intelligent executive VR movement | NOT IMPLEMENTED | No VR locomotion/teleportation code exists. `MOVE` is defined as an enum value in `webxr.ts` but nothing produces or consumes it yet. |

## Decisions 101–125: Platform architecture

| # | Decision | Status | Evidence |
|---|---|---|---|
| 101 | Existing Aevora autonomy remains authoritative | VERIFIED | No second AI/decision engine was created anywhere in V12 this session or found in prior code; all movement is event-reactive to Aevora-authored state changes. |
| 102 | Existing autonomy + contextual world systems | PARTIALLY IMPLEMENTED | Task/meeting events drive spatial consequence (verified this session). No evidence of V12 reading back *into* autonomy decision-making (one-directional: Aevora → V12, never V12 → Aevora business logic) — consistent with the authority boundary, but means "contextual world systems" informing autonomy isn't built. |
| 103 | Authoritative event-driven world events | VERIFIED | Confirmed throughout this session's new event types (`VEHICLE_CREATED`, `MEETING_STARTED`, etc.), all routed through `WorldStateEventService.broadcastEvent`. |
| 104 | Explicit versioned world-state contracts | VERIFIED | `V12EventEnvelope.schemaVersion` field present and populated (`'1.0.0'`) on every envelope created via `createEventEnvelope`. |
| 105 | Existing Aevora DB remains authority | VERIFIED | Every new table this session (`V12SpatialVehicle`, the `totalDistance` column) is explicitly a derived/spatial-only record, never a parallel Employee/Company table. Confirmed by schema read. |
| 106 | Unified identity mapping | VERIFIED | `V12SpatialMovementState.entityId` and `V12SpatialVehicle.ownerEmployeeId` are direct Employee-id references, no separate identity space. |
| 107 | Existing authoritative authorization | VERIFIED | `JwtAuthGuard`, `AuthorizationService.checkPermission` are the only auth paths used; this session's new SSE test exercises the real guard. |
| 108 | Context-aware security without replacing backend authorization | VERIFIED | Company-scoping checks added this session (`getEmployeeEmbodiment`'s `ForbiddenException`, `assignOccupant`'s cross-company rejection) layer on top of, not instead of, the existing guard. |
| 109 | Explain rejection and preserve truth | VERIFIED | Assistant adapter returns truthful `UNSUPPORTED`/`NOT_FOUND`/`FORBIDDEN` statuses rather than fake success (tested). |
| 110 | Graceful degraded world | PARTIALLY IMPLEMENTED | Persist-then-broadcast failure handling is real and tested (`SpatialHistoryPersistenceError`). A degraded *rendering* state in the frontend (e.g. "world data unavailable" UI) was not independently verified this session. |
| 111 | Resilient network continuity | PARTIALLY IMPLEMENTED | Reconnect/gap/duplicate handling is proven in the reducer and in this session's real-socket SSE test. Client-side automatic-reconnect-after-drop behavior in `WorldStateConsumer` exists in source (pre-existing) but wasn't re-exercised this session. |
| 112 | Deterministic reconciliation | VERIFIED | Late-joiner snapshot reconciliation proven in both the in-process and real-socket convergence tests. |
| 113 | Authoritative enterprise timeline | VERIFIED | `sequence`/`authoritativeTimestamp` ordering enforced and tested (`compareEvents`, `findSequenceGap`). |
| 114 | Strong truth/determinism invariant | VERIFIED | Extensively tested this session: `computeProgressIncrement`, `deriveEmployeeSpatialState`, heap Dijkstra (identical distances pre/post rewrite), exact progress-sequence assertions repeated identically across independent entities. |
| 115 | Enterprise truth wins | VERIFIED | No V12 code path was found that invents business state; every new write this session derives from an authoritative read first. |
| 116 | Enterprise-scale optimization | PARTIALLY IMPLEMENTED | Navigation (29x improved), reducer, and snapshot serialization are now benchmarked and fast at 10K. Event persistence/broadcast throughput exists at one data point (~3,500–3,715/sec). No benchmark exists for the full company-reconciliation path, the HTTP snapshot endpoint under load, or the SSE fan-out to many concurrent real clients beyond 3. |
| 117 | Context-aware priority | NOT IMPLEMENTED | No prioritization/viewport-culling logic was found (the gateway returns full snapshots; no priority queue for event delivery). |
| 118 | VR hardware abstraction | IMPLEMENTED, UNIT VERIFIED, HARDWARE NOT VERIFIED | `WebXRSessionManager`'s dependency-injected `XRSystemLike`/`XRSessionLike` interfaces are exactly this abstraction. 11 tests pass against fakes; no real headset available to confirm against the actual WebXR Device API. |
| 119 | Action-based controller input | IMPLEMENTED, UNIT VERIFIED, HARDWARE NOT VERIFIED | `XRControllerAction` enum (SELECT/SQUEEZE/MOVE) with handedness, tested against real `selectstart`/`squeezestart` event shapes. No controller-to-world-action routing exists yet (see §99). |
| 120 | Architecture-level accessibility | PARTIALLY IMPLEMENTED | Scattered `aria-*` attributes exist across several components (confirmed by grep) — ordinary web accessibility hygiene, not a described "architecture" (no reduced-motion handling, no screen-reader-specific world-state summaries, no keyboard-equivalent VR fallback found). |
| 121 | Provenance-controlled assets | NOT IMPLEMENTED | No asset identity/version/source metadata exists anywhere (see §F). |
| 122 | Versioned asset evolution | NOT IMPLEMENTED | Same as above — there's nothing to version. |
| 123 | Full enterprise-world verification | PARTIALLY IMPLEMENTED | This session materially advanced verification (real HTTP/SSE, real browser mount check, real benchmarks) but "full" end-to-end verification against live seeded data was not achieved (infrastructure boundary, see §11). |
| 124 | Full observability | PARTIALLY IMPLEMENTED — see §I below | `StructuredLoggerService` with `eventId`/`sequence`/`companyId`/`causationId` fields is used consistently and confirmed by grep across `v12-spatial` and `world-state-gateway`. This is structured logging, not metrics/tracing/dashboards — "full observability" overstates what exists. |
| 125 | Evolutionary platform architecture | IMPLEMENTED BUT NOT VERIFIED | The event-sourced, versioned-contract design is structurally evolvable (new event types were added this session without breaking existing consumers, which is itself evidence), but no explicit migration/compatibility test suite exists to verify this claim going forward. |

## High-risk area deep audits

### A. Physics — NOT IMPLEMENTED beyond navigation-graph gating
No physics engine (no `cannon`/`rapier`/equivalent dependency). "Layered physics" from decision 88 does not exist; what exists is a boolean `isTraversable` flag per node/edge used by Dijkstra to exclude blocked paths. This is routing logic, not physics (no collision response, no floor-transition dynamics, no vehicle/pedestrian movement constraints beyond speed differences already tested).

### B. Digital humans — backend is real, visual embodiment is minimal
`getEmployeeEmbodiment` (this session) is genuinely: persistent-identity-mapped, state-driven, connected to real Employee/Task/Meeting/Vehicle state, movement-aware, meeting-aware, and vehicle-aware — all tested. **Distinct from this**: `DigitalHuman.tsx` renders one hardcoded capsule-and-box mesh for every employee (no per-identity visual distinction, confirmed by reading the component — color/shape do not vary by employee, only by generic activity state). Visual embodiment is a placeholder-quality mesh wired to real backend state, not a "digital human" in the sense of distinguishable persistent avatars.

### C. Facial/body embodiment — NOT IMPLEMENTED
Zero morph targets, blend shapes, skeletal rigs, or facial geometry anywhere in `apps/web`. `DigitalHuman.tsx` has no face mesh at all. This decision is unimplemented, not merely "basic."

### D. Spatial audio — NOT IMPLEMENTED
No `AudioListener`/`PositionalAudio`/any Web Audio API usage in application source.

### E. Hierarchical/intelligent streaming — NOT IMPLEMENTED
`generateSnapshot` returns the entire company's spatial state in one response; there is no per-region/building/floor partial loading, no LOD system. This is a real, unaddressed gap, not merely "ordinary lazy loading" — there is no streaming of any kind.

### F. Asset pipeline — NOT IMPLEMENTED
No provenance metadata, no asset versioning, no procedural-generation system. All geometry is inline JSX primitive shapes.

### G. Executive VR — capability/session layer only, correctly scoped this session
Precisely what exists: WebXR capability detection (real), session enter/exit lifecycle (real, tested), raw controller-event-to-abstract-action translation (real, tested). Precisely what does NOT exist: entity selection in VR, an executive UI rendered in VR, world interaction of any kind beyond entering/exiting a session, VR locomotion. The prior session's own report avoided claiming these, and this audit confirms that restraint was correct — no over-credit found.

### H. Accessibility — basic HTML hygiene only, not an architecture
Real `aria-*` attributes exist in multiple components. No reduced-motion handling, no non-visual world-state summary, no accessible alternative input path was found. "Architecture-level" is an overstatement of current reality; "started" is accurate.

### I. Observability — structured logging exists; no metrics/tracing
`StructuredLoggerService` usage is real and consistent, carrying correlation/causation/sequence IDs (verified by grep + prior code reading). There is no metrics endpoint, no tracing integration, no dashboard. "Full observability" (decision 124's framing) is not met; "structured event logging exists" is accurate.

## Living-world requirements audit

| Requirement | Status |
|---|---|
| Employee workday embodiment (task→movement) | VERIFIED — real event, real pathfinding, real progress/arrival, real embodiment transition (this session's e2e test) |
| Autonomous movement | PARTIALLY — movement is event-*reactive*, not autonomous/ambient (correctly, per the "no fake activity" mandate); there is no spontaneous idle behavior, which is the correct design, not a gap |
| Meetings | VERIFIED — full start→travel→arrival→IN_MEETING→completion→return loop, multi-participant, tested |
| Tasks/projects | PARTIALLY — TASK_ASSIGNED/TASK_STARTED verified; TASK_COMPLETED's translation exists but has no spatial consequence wired (confirmed: `handlePersonActivityChange` has no branch for `currentActivity: 'TASK_COMPLETED'`) — a real, previously-unflagged gap |
| Departments | PARTIALLY — department spatial rooms are created (`reconcileCompanySpatialPresence`), but no department-level spatial *behavior* (e.g., department reorganization moving employees) was found |
| Company relationships | NOT INDEPENDENTLY VERIFIED | No cross-company relationship spatial representation found in V12 code |
| Employee vehicles | VERIFIED (backend) — this session's full chain | Frontend visual consumption real but unauthenticated-session-limited (see §11) |
| Building interiors | PARTIALLY — room types exist (lobby, meeting room, offices) per `reconcileCompanySpatialPresence`; interior detail/navigation richness not independently re-verified visually this session |
| Parking | PARTIALLY — `V12SpatialParkingArea` exists and vehicles reference `parkingAreaId`; capacity bookkeeping (`availableSpots`) is **never decremented/incremented anywhere** (confirmed by grep — the field exists in schema but no write path touches it) — a real, concrete gap |
| Executive offices | VERIFIED (backend) — role-title-based office assignment logic in `reconcileEmployeeSpatialPresence`, pre-existing, read and confirmed this session |
| Chairman/CEO/Assistant identity continuity | IMPLEMENTED BUT NOT INDEPENDENTLY RE-VERIFIED THIS ROUND — pre-existing `chairman.controller.ts` logic, not re-audited line-by-line this pass |
| Company creation → spatial representation | VERIFIED — `COMPANY_CREATED` → translation → `triggerCompanyReconciliation` → real idempotent spatial structure creation |
| Company growth/relocation/reorganization | NOT IMPLEMENTED — no distinct event handling found for these beyond the generic re-reconciliation triggered by any `COMPANY_*`/`DEPARTMENT_*` event (which just re-ensures baseline structures exist; it doesn't model growth/relocation specifically) |
| Company closure | PARTIALLY IMPLEMENTED — **a real, concrete gap found this audit pass**: `COMPANY_CLOSED` does reach V12 as an event, but `V12SpatialService`'s handler for COMPANY-type events only calls `triggerCompanyReconciliation`, which *re-creates/ensures* spatial presence — there is no closed-state spatial treatment (no graying out, no access restriction, no distinct representation). Closure has no visible spatial consequence. |
| Persistent world evolution | PARTIALLY — persistence is real; "evolution" beyond reconciliation-on-event wasn't found |
| Synchronized enterprise timeline | VERIFIED — `authoritativeTimestamp` + `sequence` ordering, tested |

## Determinism, performance, security — summary (detail in prior sections of the completion report, re-confirmed this pass)

- **Determinism**: VERIFIED for everything this session touched (pathfinding, progress, reducer, replay inputs, multi-viewer convergence, identity mapping). Final re-run after this audit pass's fixes: **22 suites / 205 tests pass** in `apps/api`, build clean.
- **Performance**: VERIFIED for navigation (56ms@10K), reduction (23ms@10K), snapshot (9ms@10K), event throughput (~3,500–3,715/sec@10K) — all real, re-confirmed numbers from actual execution, not invented targets. NOT VERIFIED: full snapshot-endpoint-under-load, SSE fan-out beyond 3 concurrent clients, company-reconciliation-at-scale.
- **Security/isolation**: VERIFIED for every path this session touched (meeting room, vehicle occupant, embodiment read-model, SSE stream) plus the pre-existing gateway-controller isolation suite (unchanged, reconfirmed passing).
- **Failure modes**: VERIFIED for persistence failure, duplicate events, sequence gaps, reconnect/late-join, malformed-event handling (reducer's `default: return result` — unknown event types advance sequence but never corrupt state). NOT RE-VERIFIED this pass: actual DB-connection-loss behavior against a real Postgres instance (only mocked failures were tested).

## §11 — Frontend verification, precisely distinguished

- **BUILD VERIFIED**: `apps/web` compiles (`next build` succeeds) including the `EntityMesh` merge fix and the new `VRButton`.
- **BROWSER VERIFIED**: the `/world` route was opened in a real browser this session (confirmed by page title, screenshot). Confirmed: page mounts, real app chrome renders, zero console errors, auth gate correctly enforced, no regression after VR wiring.
- **NOT BROWSER VERIFIED / LIVE BACKEND VISUAL VERIFIED**: world geometry, DigitalHuman, DigitalVehicle, movement animation, building interiors, navigation overlay, VR UI button actually appearing (it only renders when `navigator.xr` reports support, which this desktop browser correctly does not). None of these were seen rendering real data, because the app correctly requires an authenticated session against a live backend (Postgres/Redis/Ollama via Docker), which is not running in this sandboxed environment. This is named as an external infrastructure boundary, not claimed as verified.

## §12 — VR, precisely distinguished

| Sub-capability | Status |
|---|---|
| Capability detection | UNIT VERIFIED |
| Session lifecycle | UNIT VERIFIED |
| Controller abstraction (raw events → actions) | UNIT VERIFIED |
| Action mapping to world/business commands | NOT IMPLEMENTED |
| VR entry (real headset) | HARDWARE NOT VERIFIED |
| VR movement/locomotion | NOT IMPLEMENTED |
| Entity selection in VR | NOT IMPLEMENTED |
| Executive UI in VR | NOT IMPLEMENTED |
| World interaction in VR | NOT IMPLEMENTED |

A `VRButton` that can enter/exit a session is not a VR experience. This matches what prior-round reporting actually claimed (it did not overclaim), and this audit confirms that scoping was accurate.

## GAP CLOSURE PHASE 3 (browser/runtime consumption + security regression round)

Objective: close the browser-side half of VR, wire real asset-identity consumption into the renderer, and perform a focused security regression audit of every path touched across all three phases (prompted by Phase 2's snapshot-isolation discovery). Given the scope of the full Phase 3 request (asset rendering, real raycasting, VR transport, audio runtime, streaming scene lifecycle, expanded embodiment, physics boundary, security audit, final 81–125 re-audit) versus remaining session budget, this round prioritized the items with the highest real-integration value and left the rest honestly incomplete rather than built superficially. See "Honestly not done this phase" below.

### A second real, serious vulnerability found and fixed (security regression audit)

Per the explicit instruction to audit every `selectedEntityId` path after Phase 2's snapshot-isolation discovery: **`V12AssistantAdapter.handleInspectEntity`'s PERSON and DEPARTMENT_SPACE branches never validated that `context.selectedEntityId` belonged to `context.currentCompanyId`** — `EmployeeService.getEmployee`/`DepartmentService.getDepartment` are themselves unscoped (no companyId parameter at all), and the adapter never checked the result afterward. Any authenticated user could set `selectedEntityId` to another company's employee or department id and receive their name/role/department back. **This became trivially exploitable the moment the new VR endpoint existed**, since `context.selectedEntityId` is now directly client-settable without even needing a resolved ray. Fixed: both branches now verify the fetched entity's `companyId` matches the requester's `currentCompanyId`, throwing a truthful `NotFoundException` (never leaking the cross-company entity's existence) otherwise. 2 new regression tests in `v12-assistant.adapter.spec.ts`; the existing `WHO_IS_THIS` test's mock had to be corrected to include a real `companyId` (it had been implicitly relying on the absence of the check). The Phase 2 cross-capability test's employee mock had the same gap and was fixed identically — a real, independent confirmation that the fix actually changes behavior.

### Real integrations delivered

| Decision | What was built | Evidence |
|---|---|---|
| 99/119, 107/108 — VR action HTTP transport | New `V12VRActionController` (`POST /v12-vr-action/execute`), mirroring `V12CommandController`/`V12AssistantController` exactly — same `JwtAuthGuard`, same "client-supplied companyId can never override the authenticated company context" rule. No VR-specific authorization was introduced. | 7 real HTTP integration tests (`v12-vr-action.http.spec.ts`, real `NestApplication` + supertest + real guard, same pattern as `world-state-gateway.http.spec.ts`): 401 with no token, authorized action reaches real processing, unauthorized action truthfully rejected, cross-company context override rejected, replay-read-only blocks a mutating action, independent per-company routing. |
| 99/119 — Real Three.js/WebXR controller raycasting | New `VRControllerTargeting.tsx`, mounted inside the actual R3F `<Canvas>` (has real `useThree()` access to `gl`/`scene`). Uses the standard `renderer.xr.getController(0)` API, builds a real `THREE.Raycaster` from the controller's live world matrix on a real `selectstart` event, and raycasts against the actual mounted scene. `EntityMesh` now tags every entity's root group with `userData.entityId` specifically so a hit resolves to a real entity id, never a fabricated one. Wired through `WorldRenderer` → `WorldViewer`, which POSTs the resolved id to the new `/v12-vr-action/execute` endpoint with action `SELECT`. | Web build succeeds; real browser session re-confirmed zero console errors after wiring. **HARDWARE NOT VERIFIED**: no physical headset/polyfill exists in this environment to fire a genuine `selectstart` event — the code is reviewed against the real Three.js/WebXR Device API, and the deterministic math it depends on (`resolveRayTarget`) is separately unit-tested without hardware. |
| 89/121/122 — Renderer asset consumption | New `resolveVehicleRenderDescriptor(assetId, fallbackSeed)` in `packages/shared/src/v12/asset-resolver.ts`: resolves a real registered `assetId` to a concrete (primitive-geometry, since no GLTF files exist or were fabricated) render style; `resolved: false` is the explicit, observable signal an asset had no renderer representation and a deterministic fallback was used — never silently promoted to authoritative. Wired into `DigitalVehicle.tsx`, replacing the old per-entity-hash color guess with identity-driven resolution. | 7 new shared unit tests: real resolution, unknown-asset fallback (never fabricated as authoritative), version-independent resolution, identity-driven consistency across different entities holding the same asset, deterministic fallback, and deprecated/historical version resolvability. Web build + real browser session re-confirmed clean. |

### Honestly not done this phase (named, not glossed over)

- **Spatial audio Web Audio runtime**: `V12SpatialAudioService` (Phase 2) resolves real audible sources; nothing in `apps/web` wires them to an actual `AudioContext`/`PannerNode` graph. Not attempted this phase — remains a named, explicit boundary.
- **Hierarchical streaming → scene mount/unmount lifecycle**: `resolveStreamingStates` (Phase 2) computes real UNLOADED/LOADING/LOADED/ACTIVE/EVICTING states on the snapshot; `WorldRenderer`/`EntityMesh` do not yet read them to actually mount/unmount or dispose renderer resources — every entity in the (now correctly company-scoped) snapshot is still rendered regardless of streaming state. This is the single largest "claimed vs. real" gap to watch for: computing streaming state is not the same as the scene obeying it, and this audit says so explicitly rather than conflating the two.
- **Expanded DigitalHuman embodiment (gaze/gesture rendering)**: posture (Phase 2) is real and wired; gaze-target and gesture *values* are computed by `deriveEmbodimentExpression` but nothing in `DigitalHuman.tsx` visually applies them (no eyes to redirect, no hands with distinct gesture poses beyond the existing walk-cycle arm swing).
- **Physics/renderer interaction boundary**: unchanged from Phase 1/2 — the backend collision check is real and blocks invalid vehicle movement at the data layer; nothing in the renderer visually reflects a blocked/occupied node (e.g., no visual "this spot is taken" cue). Per the explicit instruction not to add a full physics engine, this is correctly left as a named, separate future boundary rather than papered over.
- **Cross-capability browser-level test**: the Phase 2 cross-capability test (backend-only, real services) was extended implicitly by the security fix but no new browser-level (Playwright/Cypress-style) automated test was added — `apps/web` still has no test runner, and standing one up remains judged disproportionate to the fixes made. The real browser *session* verification (manual, via this environment's browser tooling, described above) is the strongest evidence available without one.

### Verification after Phase 3

`apps/api`: **27 suites / 246 tests** (up from 237, zero regressions, includes 2 security regression tests + 7 VR HTTP tests). `packages/shared`: **15 suites / 139 tests** (up from 132, includes 7 asset-resolver tests). Builds clean for api/shared/web. Real browser session re-confirmed zero console errors after the `VRControllerTargeting`/`DigitalVehicle` changes.

## GAP CLOSURE PHASE 2 (real world/runtime integration round)

Objective: turn Phase 1's four isolated foundations (assets, streaming, embodiment-expression, spatial-audio) into real production integrations, plus complete VR controller targeting. Verified by independent re-inspection before any claim was written, not by trusting Phase 1's "not yet consumed" labels at face value.

### A genuine, previously-unknown bug found during inspection (not part of the Phase 2 ask, fixed because it was directly in the way)

**`WorldStateGatewayService.fetchSpatialState` queried every company's sites/buildings/floors/rooms/workspaces/navigation-nodes unconditionally** — `generateSnapshot(companyId, ...)` took a `companyId` parameter but never passed it down. Every company's snapshot included every other company's spatial structure, including `V12SpatialWorkspace.employeeId` (a direct employee identity leak) and private room names. This is a materially worse isolation bug than anything found in the prior audit. Fixed: Site is now scoped by `companyId`, Building/Floor/Room/ParkingArea/NavigationNode are scoped by the resulting site/building/floor id chain, Workspace is scoped by its own direct `companyId`, and TopologyEdges are filtered to the scoped node set. Region/Country/City remain correctly unscoped (shared geography, not company-owned). **7 new regression tests** prove bidirectional isolation (`world-state-gateway.service.spec.ts`).

### Real integrations delivered

| Decision | What changed from "foundation only" to "real integration" | Evidence |
|---|---|---|
| 98 — Hierarchical streaming | `HierarchicalStreamingManager` is now instantiated from the **real region-type entities in an actual snapshot** (`WorldStateGatewayService.resolveStreamingStates`), activated against the viewer's **real current location** (`viewportEntityId`), and every region's UNLOADED/LOADING/LOADED/ACTIVE/EVICTING state is returned on the snapshot. Built on top of the isolation fix above — streaming only ever sees one company's own region tree. | 2 new integration tests prove: moving the viewer to a room activates its real ancestor chain (room→building→site); a different viewer location activates a different region deterministically, with the room correctly staying UNLOADED when only the building is targeted (ancestors-only activation, matching the real manager's contract). |
| 89/121/122 — Asset pipeline | New `V12AssetRegistryService`: a real, seeded, process-wide `AssetRegistry` instance. `V12VehicleService.createVehicleForEmployee` now **resolves a real `assetId`** through it (by the same `VEHICLE_CHASSIS_<class>` role `deriveVehicleClass` already produces) and stores it on the vehicle — never a guessed string, `null` if genuinely unregistered. | 6 new service tests + 2 new vehicle-service tests + the real end-to-end vehicle test now asserts a real resolved `assetId`. Version-evolution/deprecation/historical-reconstruction behavior proven at the registry level (Phase 1) and now exercised through a real consumer (Phase 2). |
| 93 — Embodiment/posture | `DigitalHuman.tsx` now **actually calls** `deriveEmployeeSpatialState` + `deriveEmbodimentExpression` (the same pure functions used on the backend) over its own real `movement`/`currentActivity` props, and applies the resulting posture: WALKING keeps the existing walk-cycle animation, SEATED/DRIVING sets a real bent-leg pose and lowers the mesh height, STANDING is unchanged. This is a renderer-independent contract (state derivation) wired into an actual mesh-pose decision — explicitly not a skeletal/morph-target system, because none exists. | Web build succeeds; real browser session re-confirmed zero console errors after the change (page mount unaffected). No face exists to animate — stated, not hidden. |
| 95 — Spatial audio | New `V12SpatialAudioService.resolveAudibleSourcesForListener(companyId, listenerNodeId)`: resolves **real** `IN_MEETING` employees of the listener's own company, at their **real** `V12SpatialMovementState.currentNodeId` position, with priority derived from their **real** `Role.accessLevel` (never invented), through the real `resolveAudibleSources` attenuation function. No employee with an unknown position is ever included. | 5 new tests, including a company-isolation proof and a real-Role-derived priority ordering proof. Browser audio playback (Web Audio API wiring) remains the named, honest boundary — not crossed. |
| 99/119 — VR controller targeting | New `resolveRayTarget(ray, candidates)` in `webxr.ts`: deterministic ray/sphere intersection, ties broken by entity id, behind-controller candidates excluded, no hit returns `null` (never a fabricated target). `V12VRActionAdapter` now **accepts a real ray + real candidate list** and resolves `context.selectedEntityId` before delegating to the same authorized `V12AssistantAdapter` — SELECT/INSPECT/MOVE all genuinely target a real entity now, not an untargeted stub. | 7 new `webxr.spec.ts` tests + 3 new adapter tests proving the resolved id flows into the real `processQuestion` call, and that a miss leaves `context` unchanged rather than inventing a target. |

### Cross-capability integration proof

[v12-phase2-cross-capability.e2e.spec.ts](apps/api/src/v12-spatial/v12-phase2-cross-capability.e2e.spec.ts): one test chains, through real service instances sharing one stateful Prisma fake — (1) a Chairman's vehicle resolving a real `asset_vehicle_chassis_chairman_v1` through the real registry, (2) a real `IN_MEETING` employee resolved as an audible spatial-audio source at the Chairman's real location, (3) a VR controller ray pointed at that same employee's real world position resolving to their real entity id and executing through the **same authorized `V12AssistantAdapter`** path as any other client (no VR-specific authorization). A second test proves company isolation holds across all three capabilities exercised together. **2/2 pass.**

### Verification after Phase 2

`apps/api`: **26 suites / 237 tests** (up from 23/215, zero regressions). `packages/shared`: **14 suites / 132 tests** (up from 14/125). API/shared/web builds all succeed. Real browser session re-confirmed after the `DigitalHuman`/`VRButton` frontend changes: page mounts, zero console errors.

### Honest remaining gaps after Phase 2

- **Asset registry**: resolved and stored (`V12SpatialVehicle.assetId`), but no renderer yet reads it to actually swap which mesh is drawn — `DigitalVehicle.tsx` still renders the same hardcoded geometry regardless of `assetId`. The identity now exists; visual consumption of that identity does not yet.
- **Streaming**: wired into `generateSnapshot`'s viewport-culling path specifically; the main non-viewport snapshot path (used when no `viewportEntityId` is given) is unaffected and still returns everything. A caller must opt in.
- **Spatial audio**: resolution is real; actual Web Audio API playback in a browser remains unbuilt — an explicitly named boundary, not attempted.
- **VR targeting**: the resolver and adapter wiring are real and tested; nothing in `apps/web` yet calls `V12VRActionAdapter` from an actual WebXR `selectstart` event with a real Three.js raycast — the `VRButton`'s `onAction` is still unwired to this new capability (the browser-side raycast itself was not built this phase).
- **Embodiment**: posture is real and wired; gaze/gesture/expression fields are computed but not yet visually applied (no eyes/hands to point or gesture with on the current primitive mesh).

## GAP CLOSURE PHASE 1 (post-audit implementation round)

Real, tested implementation work closing six of the audit's named gaps. Each is a genuine foundation — explicitly not full simulation/photorealism/production asset-generation — consistent with the audit's own distinction between "no implementation" and "a real, scoped foundation implemented and tested."

| Decision | What was built | Where | Tests | Status |
|---|---|---|---|---|
| 88 — Layered physics | Deterministic collision/occupancy foundation: `PhysicsLayer` enum (STATIC_WORLD/BUILDING_BOUNDARY/NAVIGATION_GRAPH/ENTITY_OCCUPANCY/VEHICLE_ENVELOPE/INTERACTION_ZONE), `canOccupyNode` (vehicle-vehicle exclusivity, human co-occupancy, occupancy ceiling), distinct human/vehicle collision envelopes. **Wired into real production navigation**: `V12NavigationService.requestEntityMovement` now queries real settled occupants at the destination and blocks a second vehicle from entering an occupied node. | [physics.ts](packages/shared/src/v12/physics.ts) | 14 unit tests + 1 new real integration test (`v12-vehicle-e2e.spec.ts`: a second vehicle is genuinely blocked, `blockedReason: 'PHYSICS_VEHICLE_COLLISION'`) | FOUNDATION IMPLEMENTED + INTEGRATION VERIFIED. Advanced physics (continuous collision, rigid-body dynamics, floor-transition physics) remains ADVANCED PHYSICS NOT YET IMPLEMENTED — explicitly, not silently. |
| 89/121/122 — Asset pipeline/provenance/versioning | `AssetRegistry`: deterministic content-addressed ids, provenance retention, version evolution with automatic deprecation of the superseded version, invalid-registration rejection, replay-consistent (two independently-fed registries converge). Explicit procedural-vs-manual `AssetSource` distinction. No AI asset generator was built — that boundary (generation source → validated package → registry → world reference) is named, not faked. | [assets.ts](packages/shared/src/v12/assets.ts) | 15 unit tests | FOUNDATION IMPLEMENTED + UNIT VERIFIED. Not yet consumed by any world entity (no `assetId` field wired into `WorldEntity` yet) — a real next step, not claimed done. |
| 98 — Hierarchical streaming | `HierarchicalStreamingManager`: UNLOADED/LOADING/LOADED/ACTIVE/EVICTING state machine over the real World→Site→Building→Floor→Room chain, ancestor-chain activation, deterministic LRU eviction that never evicts a region still acting as another active region's ancestor, company isolation. Never touches entity data — unload/reload safety is true by construction, not by careful bookkeeping. | [streaming.ts](packages/shared/src/v12/streaming.ts) | 9 unit tests | FOUNDATION IMPLEMENTED + UNIT VERIFIED. Not yet wired into the actual `WorldStateGatewayService.generateSnapshot` (which still returns a full company snapshot) — the state machine exists; the gateway doesn't consult it yet. |
| 93 — Facial/body/gaze/gesture state | `deriveEmbodimentExpression`: deterministic posture/gaze/gesture/expression derived from `EmployeeSpatialState` + speaking/listening/executive context — never a random or invented emotion. Explicitly NOT photorealistic facial animation (no face mesh exists). | [embodiment-expression.ts](packages/shared/src/v12/embodiment-expression.ts) | 9 unit tests | FOUNDATION IMPLEMENTED + UNIT VERIFIED. Not yet mapped onto `DigitalHuman.tsx`'s actual mesh (no face exists to animate) — the state model exists; the renderer doesn't consume it yet. |
| 95 — Spatial audio | `computeAttenuation`/`resolveAudibleSources`: deterministic linear-falloff attenuation, company isolation, mute enforcement, priority-ordered concurrent-source capping. | [spatial-audio.ts](packages/shared/src/v12/spatial-audio.ts) | 11 unit tests | FOUNDATION IMPLEMENTED + UNIT VERIFIED. Actual browser audio playback (Web Audio API wiring) remains an explicit, named verification boundary — never claimed. |
| 99/119 — VR action-to-command routing | `V12VRActionAdapter`: SELECT/INSPECT/MOVE route through the **real, unmodified** `V12AssistantAdapter.processQuestion` (same authorization, same company isolation, same replay-read-only gating — no VR-specific auth bypass); OPEN_EXECUTIVE_UI truthfully reports no backend action needed; INTERACT truthfully reports unsupported rather than guessing. | [v12-vr-action.adapter.ts](apps/api/src/v12-spatial/v12-vr-action.adapter.ts) | 7 unit tests, including explicit proof that `REPLAY_READ_ONLY`/`UNAUTHORIZED` propagate unchanged | INTEGRATION-SHAPED UNIT VERIFIED (delegates to the real adapter; the real adapter's own authorization is already integration-tested elsewhere). The frontend `VRButton` does not yet call this endpoint — still not wired end-to-end from a real controller press. |
| Company closure spatial consequence | `V12SpatialService.deactivateCompanySite` marks the company's `V12SpatialSite.isActive = false` on a real `COMPANY_CLOSED` event — never deletes data. `V12NavigationService` now genuinely **rejects** movement into a closed company's site (`DESTINATION_COMPANY_CLOSED`), checked before pathfinding even runs. Scope matched to Aevora's own actual semantics: `company.service.ts`'s `closeCompany()` only flips a status flag and emits one event — it does not terminate employees or touch departments, so V12 does not invent those consequences either. | [v12-spatial.service.ts](apps/api/src/v12-spatial/v12-spatial.service.ts), [v12-navigation.service.ts](apps/api/src/v12-spatial/v12-navigation.service.ts) | 2 new navigation tests (blocks closed-site destination; unaffected nodes with no site still work) | IMPLEMENTED + UNIT VERIFIED |

**Re-discovered and fixed in passing**: `markMovementBlocked` had a dead code path — a comment literally said "we can try to create a default one" but the code just `return null`-ed instead, so any entity that had never moved before couldn't even be marked BLOCKED (crashed the physics test until fixed). Now creates a real blocked-state row via upsert.

**Verification after this phase**: `apps/api` **23 suites / 215 tests** (up from 22/205, zero regressions). `packages/shared` **14 suites / 125 tests** (up from 9/67). API/shared/web builds all succeed. Baseline maintained and exceeded as required.

## Fixed during the independent audit pass (prior round, not merely reported)

Three of the gaps this independent audit found were reasonably scoped (the same established fix pattern as earlier sessions) and were fixed immediately rather than left as findings:

1. **TASK_COMPLETED spatial consequence** — `task.service.ts`'s `completeTask` was missing `employeeId` in its `CompanyEvent` payload (same bug class as the earlier `TASK_STARTED` fix), so the event never reached V12 at all. Fixed, plus a new `handlePersonActivityChange` branch (`v12-spatial.service.ts`) moves the employee back to their workspace on completion, mirroring the existing `MEETING_COMPLETED` pattern. Regression tests added in `world-state-translation.service.spec.ts` and `v12-spatial.service.spec.ts`.
2. **Parking capacity bookkeeping** — `V12SpatialParkingArea.availableSpots` was initialized but never written to. `V12VehicleService.createVehicleForEmployee` now decrements it (capped at zero) when a vehicle claims a spot, and `requestVehicleMovement` increments it (capped at capacity) when a vehicle actually leaves a parked state. Regression tests added in `v12-vehicle.service.spec.ts`.
3. Both fixes verified with the full suite re-run: **22 suites / 205 tests pass** (up from 201), zero regressions, build clean.

## Final gap list (genuine remaining gaps only, after Gap Closure Phase 3)

Every item below is a **real remaining gap** — none are findings that were already closed above.

| Requirement | Current implementation | Evidence | Why it remains open | What would close it |
|---|---|---|---|---|
| Physics beyond the foundation | Deterministic vehicle-vehicle collision + occupancy ceiling, wired into real navigation | `physics.ts` + the navigation integration | FOUNDATION only, by design — no continuous collision, no rigid-body dynamics, no floor-transition physics, no visual "this spot is taken" cue in the renderer | Attach a real physics engine (e.g. `@react-three/rapier`) behind the same `canOccupyNode` contract; surface blocked/occupied state visually |
| Streaming computed but not enforced by the scene | `resolveStreamingStates` real and tested; now also correctly company-scoped | `WorldRenderer`/`EntityMesh` render every entity in the snapshot regardless of streaming state — nothing reads `streamingStates` to mount/unmount or dispose anything (code-read confirmed) | Not built this phase — this is specifically named as the largest "claimed vs. real" risk: computing the state is not the same as the scene obeying it | Have `WorldViewer`/`EntityMesh` skip rendering (and dispose geometry for) entities in non-ACTIVE regions, reconstructing deterministically on re-activation |
| Spatial audio playback | `resolveAudibleSourcesForListener` real, tested, resolves genuine meeting participants | No Web Audio API usage anywhere in `apps/web` | Explicit, named boundary, unchanged this phase | Wire `AudioListener`/`PositionalAudio` to the resolved audible-source list in a real browser session |
| Asset identity visually distinguishes vehicles, but not yet humans or buildings | `resolveVehicleRenderDescriptor` wired into `DigitalVehicle.tsx` this phase | `DigitalHuman.tsx` and building/room geometry still have no asset-identity concept at all | Scoped to vehicles this phase given budget | Extend the same resolver pattern (`DIGITAL_HUMAN_BODY` is already seeded in the registry) to `DigitalHuman.tsx` |
| Expanded embodiment (gaze/gesture visuals) | `deriveEmbodimentExpression` computes gaze/gesture values; posture is visually applied (Phase 2) | No eyes/hands exist to visually express gaze/gesture | The primitive mesh has no capability for this, honestly stated rather than faked | Would require actual facial/hand geometry, which doesn't exist and wasn't fabricated |
| DigitalHuman/DigitalVehicle live visual confirmation | Code is real, build-verified, posture- and asset-aware | Requires authenticated session + seeded live backend | Docker Postgres/Redis/Ollama not provisioned in this sandbox — genuine infrastructure boundary | Provision the stack per `SETUP.md` and re-run the browser check against real data |
| Physical VR headset execution | Full software layer complete and tested: capability detection, session lifecycle, real Three.js raycasting code, HTTP transport, authorized routing | No headset/polyfill available | Genuine hardware boundary | Test against a real WebXR device |
| Multi-machine production SSE deployment | Real local HTTP/SSE multi-client test passes | Single-process, single-machine | Genuine deployment boundary | Deploy and test across real separate processes/machines |

## Final verdict

**V12 NOT COMPLETE** (unchanged classification; materially less incomplete than before Gap Closure Phase 3).

Across three phases: Phase 1 built six honest foundations with zero prior implementation. Phase 2 turned four into real backend/service integrations. Phase 3 closed the entire VR software stack end to end — real Three.js raycasting, a real HTTP transport, real authorized routing — and wired real asset-identity consumption into the vehicle renderer. **Two genuinely serious, previously-undiscovered security vulnerabilities were found and fixed across these phases** (the Phase 2 cross-company snapshot leak, and the Phase 3 cross-company `selectedEntityId` trust gap that the new VR endpoint made trivially exploitable) — both found by inspecting the code needed to build the requested feature correctly, not by searching for bugs as a separate exercise. That pattern — real integration work surfacing real pre-existing defects — is itself evidence this audit discipline is working as intended rather than rubber-stamping.

What **is** genuinely finished and should be credited as such: the authoritative event-sourcing core, task/meeting/vehicle movement loops (proven end-to-end, including over genuine HTTP/SSE sockets), the employee spatial state machine, the digital-human *backend* embodiment read-model (now also driving real frontend posture), the complete VR *software* path (hardware execution is the one legitimately unverifiable piece), real vehicle asset-identity resolution, company/security isolation (now including both newly-found leaks), determinism, and the measured performance of every benchmarked path.

**Remaining genuine gaps**, in descending order of scope: (1) the scene actually obeying computed streaming state (currently computed but not enforced — the single most important remaining "looks done but isn't" risk), (2) actual Web Audio playback, (3) asset-identity consumption for humans/buildings (only vehicles are wired), (4) advanced/continuous physics, and (5) the three named external boundaries (live backend data, physical VR hardware, multi-machine deployment) that no amount of further local work can close.
