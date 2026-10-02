# AEVORA Roadmap

This roadmap outlines the phased development approach for AEVORA.

## Phase 1: Foundation (Current)
- [x] Initial repository inspection and documentation.
- [ ] Scaffold the monorepo structure (Nx or Turborepo, or standard npm workspaces).
- [ ] Initialize Next.js web app, Node.js API, and Simulation worker.
- [ ] Setup Docker infrastructure (PostgreSQL, Redis).

## Phase 2: Core Domain & Economy
- [ ] Design and implement the PostgreSQL database schema.
- [ ] Implement the `ACLedger` and `RealWorldLedger` services.
- [ ] Implement the Company Constitution and Permissions engine.
- [ ] Build basic Chairman authentication and dashboard.

## Phase 3: Model Gateway & Personal Assistant
- [ ] Implement the Model Gateway abstraction layer.
- [ ] Integrate local model support or mock providers for dev.
- [ ] Develop the Personal AI Assistant agent for the Chairman.
- [ ] Implement communication channels between Chairman and Assistant.

## Phase 4: Basic Simulation & Employees
- [ ] Implement the Simulation Time Engine (tick system).
- [ ] Create the AI Employee instantiation engine (Identity, Skills, Memory).
- [ ] Implement basic daily loops (Attendance, Tasks, Salary payouts).
- [ ] Build the AI Receptionist.

## Phase 5: 2D Visualization
- [ ] Develop the 2D map engine in the Next.js frontend.
- [ ] Render departments, rooms, and static assets.
- [ ] Connect frontend to simulation state to render employee movement and live status.

## Phase 6: Advanced Operations & Expansion
- [ ] Implement complex project planning and task decomposition by AI Executives.
- [ ] Implement R&D and Internal Academy mechanics.
- [ ] Multi-company expansion capabilities and AI city infrastructure.
