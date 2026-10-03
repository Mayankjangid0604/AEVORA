# AEVORA V12 — Security & Identity

## Core rule
**Physical presence never equals authorization.**

Every visual person maps to an authoritative Aevora identity: Chairman, CEO, Chairman Assistant, MD, employee, or authorized external participant.

## Authorization
V12 may interpret context and request an action. Existing Aevora authorization decides whether it is allowed.

Context may include company, building, room, meeting, selected person, role, task and current world position. Context cannot override authority.

## Rejection
A rejected action must:
1. cause no unauthorized business mutation;
2. preserve truthful world state;
3. explain the rejection appropriately;
4. avoid unnecessary disclosure of protected information.

## Company isolation
V8 company isolation remains mandatory. Spatial co-location must never create cross-company authority.
