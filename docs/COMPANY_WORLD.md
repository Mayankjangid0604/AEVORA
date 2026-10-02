# AEVORA Company World (Phase 9)

## Architecture
The 2D Company World is a lightweight, read-only visualization of the AEVORA simulation running on the NestJS backend.
It strictly adheres to the principle: **The Simulation is the Brain. The Database is the source of truth. The 2D World is the visual body.**

### World Read Model & Security Boundary
The `ChairmanController` exposes `GET /chairman/world`.
This endpoint aggregates SimulationState, departments, mapped employees, active projects, and alerts into a safe visual DTO.
**Security Boundary:** The API intentionally redacts sensitive data. The `employees` DTO strictly excludes `salary`, `identitySeed`, passwords, internal memory state, and the ledger/treasury financials. Only visualization-safe read-model data is transmitted.

### Frontend Renderer & Performance
The renderer (`WorldRenderer.tsx`) is built using **pure HTML5 Canvas**, encapsulated inside a React component. 
Performance Approach: 
- React is not responsible for rendering hundreds of DOM nodes per employee.
- The `requestAnimationFrame` loop efficiently redraws state. 
- The canvas comfortably supports ~50 employees and architecture scales well toward 500.

## Visualization Mechanics

### Room Configuration
The `MAP_ROOMS` array statically defines the physical layout (Reception, Management, Engineering, Research, Finance, HR, Sales, Meeting Area, Training, Cafeteria). Rooms are data-driven.

### Employee Visualization States
Employee avatars change color and location based on their backend `activity`:
- `WORKING`: Blue (moved to department room, dot indicator if active task)
- `IDLE`: Slate (moves to Cafeteria)
- `IN_MEETING`: Purple (moves to Meeting Area)
- `TRAINING`: Yellow (moves to Training room)
- `ON_BREAK`: Orange (moves to Cafeteria)
- `BLOCKED`: Red
- `OFFLINE`: Dark slate

### Project Visualization
Active projects are aggregated in the world DTO and summarized in the Sidebar. Employees assigned to active tasks on those projects display a working indicator dot on their avatar.

### Selection and Inspector
Clicking an employee's avatar identifies the real employee ID and opens the inspector in the Sidebar. The inspector safely shows name, role, department, status, and current task, without exposing financial info.

### Camera Controls
- **Pan:** Click and drag the canvas to pan.
- **Zoom:** Use the mouse wheel to zoom in and out around the cursor.

## Simulation Integration
The browser is purely a visualization layer.
The polling mechanism simply redraws the latest simulation snapshot.
The existing Phase 8 Simulation Controls (Play, Pause, Speed) are mapped to the real `SimulationController` endpoints.

### Intentionally NOT Implemented
- **No Heavy Game Engine:** No Unity, PixiJS, or WebGL libraries were used.
- **No Frontend Simulation:** The browser **does NOT** run employee AI, create tasks, mutate state, implement its own simulation clock, or fake employee behavior. It is purely a visual client.
