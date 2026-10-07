# AEVORA V15 — FINAL AUTHORITATIVE SPATIAL RULES

## 1. Single Source of Truth Architecture

```
AUTHORITATIVE ENTERPRISE STATE (PostgreSQL / Prisma)
                   ↓
SPATIAL RECONCILIATION & PROJECTION (NestJS Services)
                   ↓
REALTIME WORLD STATE (SSE / Monotonic Event Sequence)
                   ↓
3D VISUALIZATION & VIEWPORT (Three.js / React Three Fiber)
```

1. **Database Authority**: PostgreSQL via Prisma is the sole source of truth for all business and spatial records.
2. **Deterministic Projection**: Spatial models (sites, buildings, floors, rooms, workspaces, parking, navigation nodes, movement states) are authoritative records generated and maintained by backend services (`HqCapacityService`, `V12VehicleService`, `V12NavigationService`, `WorldStateGatewayService`).
3. **Client Subordination**: The 3D renderer (`SpatialViewport`, `SpatialScene`, `Three.js`) is strictly a read-only projection with interaction reporting. It never mutates state locally without authoritative backend validation.

---

## 2. Core Spatial Enterprise Entity Hierarchy

### 2.1 Geographic Hierarchy
1. **Global Region (`V12SpatialRegion`)**: Top-level geographic continental coordinate anchor.
2. **Country (`V12SpatialCountry`)**: Sovereign jurisdiction anchor within a region.
3. **City (`V12SpatialCity`)**: Metropolitan coordinate hub containing enterprise sites.

### 2.2 Enterprise Hierarchy
1. **Company (`Company`)**: Exactly one isolated enterprise organization.
2. **Campus / Site (`V12SpatialSite`)**: Dedicated campus footprint bound to exactly one company (`companyId`).
3. **HQ Building (`V12SpatialBuilding`)**: Primary operational structure situated within the campus. Additional wings are dynamically added upon capacity threshold breach.
4. **Floor (`V12SpatialFloor`)**: Vertical building levels. Operational floors house departments; top floor is reserved for Executive suite.
5. **Department Area & Rooms (`V12SpatialRoom`)**: Spatial rooms assigned to specific authoritative departments (`Engineering`, `Operations`, `Executive`, etc.).
6. **Workspace (`V12SpatialWorkspace`)**: Physical desk/station within a room assigned deterministically to active employees.
7. **Parking Area (`V12SpatialParkingArea`)**: Structured vehicular lots within the campus footprint.
8. **Vehicle (`V12SpatialVehicle`)**: Enterprise fleet units assigned to specific parking slots.
9. **Navigation Nodes & Edges (`V12SpatialNavNode`, `V12SpatialTopologyEdge`)**: Authoritative graph for pathfinding between campus, buildings, floors, rooms, and parking.
10. **Movement State (`V12SpatialMovementState`)**: Live position, velocity, and state for workers and vehicles.

---

## 3. Authoritative Spatial Enterprise Rules

### 3.1 Company Rule
- Every company possesses **exactly one isolated enterprise spatial world**.
- Multi-tenant data leakage is strictly forbidden: snapshot generation, event streams, and spatial queries MUST filter by `companyId`.

### 3.2 Campus & HQ Rule
- Every company has a dedicated campus footprint.
- Initial campus provisioning creates:
  - 1 Site (`V12SpatialSite`)
  - 1 HQ Building (`V12SpatialBuilding`)
  - Operational and Executive Floors (`V12SpatialFloor`)
  - Department Rooms (`V12SpatialRoom`)
  - Initial Workspaces (`V12SpatialWorkspace`)
  - Navigation Waypoint Mesh (`V12SpatialNavNode`, `V12SpatialTopologyEdge`)
  - Initial Parking Area (`V12SpatialParkingArea`)

### 3.3 Subsidiary Rule
- A subsidiary is an **independent company** in authoritative business state (`Company.parentCompanyId`).
- A subsidiary receives:
  - An independent spatial campus (`V12SpatialSite`).
  - Independent HQ building, floors, rooms, and workspaces.
  - Independent workforce and vehicle allocations.
  - Independent navigation mesh and event stream.
  - Complete multi-tenant isolation from parent and sibling enterprises.

### 3.4 Department Rule
- Every department projected into 3D corresponds 1:1 with an authoritative `Department` record.
- Department rooms maintain a designated color scheme, spatial perimeter, and workspace density policy.

### 3.5 Employee & Workspace Rule
- Active employees are assigned deterministically to an available workspace within their department room.
- If department room workspaces are exhausted, company-wide operational workspaces are assigned.
- Inactive / terminated employees release their workspace immediately (`isOccupied = false`, `employeeId = null`).
- Terminated employees trigger a `SPATIAL_WORKER_DEACTIVATED` event, removing them from the 3D scene.

### 3.6 Workforce Growth & Capacity Expansion Rule
- Capacity threshold is defined by `HqCapacityPolicy.targetOccupancyThreshold` (default: 80%).
- When workforce additions exceed capacity:
  1. **Room Expansion**: New rooms are provisioned on available floor space.
  2. **Floor Expansion**: When floor room capacity is reached, new floors are added.
  3. **Wing Expansion**: When vertical building floor limits are reached, a new building wing is provisioned on the campus site.
  4. Realtime `HQ_CAPACITY_EXPANDED` event is broadcasted to update the 3D world instantly.

### 3.7 Vehicle & Parking Rule
- Every fleet vehicle corresponds to an authoritative `V12SpatialVehicle` record with an assigned vehicle class (`STANDARD`, `EXECUTIVE`, `HEAVY`, `ELECTRIC`).
- Vehicles are deterministically allocated to an open parking slot (`slotIndex`) in a campus parking area.
- When parking capacity reaches maximum occupancy, a new parking area is automatically provisioned.
- Decommissioning a vehicle immediately frees the parking spot and deactivates the vehicle's movement state.

### 3.8 Navigation Rule
- Waypoint nodes and topology edges are generated strictly from authoritative physical entities.
- Node types include `CAMPUS_PERIMETER`, `BUILDING_ENTRANCE`, `FLOOR_LOBBY`, `ROOM_CENTER`, `WORKSPACE_ACCESS`, and `PARKING_SLOT`.
- Dynamic spatial additions (new rooms, floors, wings, parking areas) automatically insert new navigable waypoints and edges connected to the existing topological network.

---

## 4. Anti-Entropy & Idempotency Guarantee
- **Repeated Provisioning**: Running `autoProvisionCompany`, `provisionInitialCampus`, or `reconcileCompanyCapacity` multiple times on an already converged company yields zero duplicate entities (`created.buildings = 0`, `created.floors = 0`, `created.rooms = 0`).
- **Concurrent Safety**: Reconciliations utilize atomic transactions and existing entity checks to prevent race condition duplications.
- **Failure Recovery**: Spatial reconciliation failures are isolated; authoritative business state transactions (company creation, hiring, role assignment) remain uncorrupted.
