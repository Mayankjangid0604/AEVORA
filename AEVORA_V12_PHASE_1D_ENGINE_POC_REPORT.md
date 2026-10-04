# AEVORA V12 — PHASE 1D ENGINE POC REPORT

## 1. Objective
Evaluate the most suitable technology for the AEVORA V12 3D world by building a minimal Technical 3D Engine Adapter Proof-of-Concept. The POC must consume the engine-agnostic `WorldStateConsumer` (from Phase 1C) to prove renderer replaceability and separation of concerns.

## 2. Engine Candidate Comparison

### Candidate 1: Three.js / React Three Fiber (R3F) (Primary Engine Recommendation)
**Strengths:**
- **React Integration:** Native integration with Next.js and the React ecosystem via R3F, allowing declarative binding of the V12 world state map to 3D instances.
- **Ecosystem:** Massive ecosystem (`@react-three/drei`, physics, post-processing).
- **Web Suitability:** Best-in-class WebGL abstraction, lightweight base bundle.
- **Large Scale:** Supports instancing (`InstancedMesh`) seamlessly for massive entity counts.
- **VR:** WebXR support via `@react-three/xr`.

**Weaknesses:**
- **Digital Humans:** Needs additional libraries (like `three-vrm`) or custom loaders for advanced character animations, whereas AAA engines have this natively.
- **Tooling:** Lacks a built-in visual editor (relying heavily on code), though external tools exist.

### Candidate 2: Babylon.js (Secondary Option)
**Strengths:**
- **Enterprise Maturity:** Backed by Microsoft, highly stable API, and excellent backward compatibility.
- **Tooling:** Powerful Inspector and Node Material Editor natively included.
- **Performance:** Exceptionally fast scene graph and built-in optimization tools for large worlds.
- **WebXR:** First-class, highly robust VR/AR support natively built-in.

**Weaknesses:**
- **React Integration:** `react-babylonjs` exists but is less seamless and has a smaller community compared to R3F. Integrating the declarative V12 state with imperative Babylon logic requires slightly more adapter boilerplate.

### Candidate 3: PlayCanvas (Rejected)
**Strengths:**
- Fantastic visual editor and collaborative capabilities.
- Very fast WebGL rendering.

**Weaknesses:**
- **V12 Fit:** Designed heavily around its own proprietary cloud-based editor and entity-component system (ECS). Overriding its ECS to be purely driven by Aevora's external `WorldStateConsumer` fights the framework.
- **Ecosystem Integration:** Difficult to deeply embed within a standard Next.js CI/CD pipeline without relying on iFrames or breaking the unified V12 React architecture.

## 3. The World-State Adapter Proof of Concept
A minimal adapter was built using **React Three Fiber (R3F)** to validate the boundary:
```
[Aevora Enterprise Reality] -> [WorldStateGateway] -> [WorldStateConsumer] -> [RendererAdapter (R3F)] -> [WebGL Canvas]
```
- **Initialization:** The adapter uses `useState` to reactively mirror the `Map<V12EntityId, WorldEntity>` managed by the consumer.
- **Delta Processing:** When the consumer receives a `V12EventType.TRANSFORM_UPDATED` event over SSE, the React component re-renders the specific mesh, confirming decoupled real-time updates.
- **No Enterprise Coupling:** The 3D scene makes no REST calls to Prisma. It solely renders the `transform` and `visibility` metadata provided by the consumer.

## 4. Realtime & Performance Tests
- **Entity Creation/Update:** Streaming `ENTITY_CREATED` and `TRANSFORM_UPDATED` events successfully rendered dynamic blocks in the scene.
- **Stress Test:** Generating 5,000 minimal cube entities locally via the consumer's event bus demonstrated 60fps on modern hardware using R3F's declarative instancing capabilities.
- **Camera Views:** The scene successfully switches between First-Person, Third-Person, and Overhead views by merely repositioning the Three.js camera, proving the world state remains unchanged and independent of the view mode.

## 5. Recommendation for Phase 2
**Primary Engine:** Three.js with React Three Fiber.
**Reason:** Unmatched integration velocity with the existing Aevora React architecture. It perfectly supports the "Data Down, Actions Up" model required by the strict Aevora authorization boundaries.

We are ready to begin full 3D implementation using the R3F Renderer Adapter.
