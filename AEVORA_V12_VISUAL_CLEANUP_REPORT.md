# AEVORA V12 VISUAL CLEANUP REPORT

## 1. Previous visual architecture identified
- **3D World / GameShell Engine:** The root application wrapper (`GameShell.tsx`) was loading an iframe to an external 3D engine/scene (`Aevora_Office_3D_v3.html`).
- **3D Renderers / Graphics:** Dependencies on `three`, `leaflet`, and `pixi.js` used to render 3D views, classic views, map views, and Pixi-based worlds.
- **World Views & Scenes:** Redundant legacy implementation folders (`world`, `world-classic`, `world-map`, `world-pixi`) in `apps/web/app`.
- **UI Components for 3D elements:** Assorted components specific to 3D and map rendering like `WorldMap.tsx`, `WorldMapInner.tsx`, `map-pins.ts`, `PixiOffice.tsx`, and `Building3D.tsx`.

## 2. Files removed
The following files and directories were permanently deleted:
- `apps/web/app/world/` (including `Building3D.tsx`, `PixiOffice.tsx`, `office-layout.ts`, `pixi-assets.ts`, `useLiveValues.ts`)
- `apps/web/app/world-classic/`
- `apps/web/app/world-map/`
- `apps/web/app/world-pixi/`
- `apps/web/app/components/WorldMap.tsx`
- `apps/web/app/components/WorldMapInner.tsx`
- `apps/web/app/components/map-pins.ts`
- `apps/web/public/office/` (including `Aevora_Office_3D_v3.html`, `.glb` models, JSON configurations, Three.js modules, and related assets)

## 3. Files retained
- `apps/web/app/components/GameShell.tsx` was retained but entirely rewritten to strip out the iframe and 3D interactions. It now serves as a clean pass-through layout shell wrapping `OfficeOS`.
- Core application structures in `apps/web/app/` (all V1-V11 modules like `activity`, `ceo`, `boardroom`, `departments`, `employees`, etc.) were kept completely intact.
- Global stylesheets and top-level layouts were retained.

## 4. Dependencies removed
Uninstalled obsolete dependencies from `apps/web/package.json`:
- `three`
- `leaflet`
- `@types/leaflet`
- `pixi.js`

## 5. Backend protection
- `apps/api` (the entire backend logic) was completely untouched. No business logic, APIs, or database schemas were altered.
- All non-visual modules under `apps/web/app` targeting V1–V11 logic were verified as untouched.

## 6. Tests
- **Build Checks:** Tested `npm run build` inside `apps/web` to ensure that removing the visual references and dependencies did not break the React/Next.js shell compilation.
- **Lint:** Ran `npm run lint` successfully (standard warnings expected but ignored).
- **Workspace:** Validated `npm i` successfully updated the dependency graphs globally.

## 7. Remaining visual code
- `OfficeOS.tsx` and remaining `app/components` were retained since they form the core dashboard / "2D" visual shell necessary for the application's non-3D functionality. They are required to authenticate users and manage non-world state.
- `globals.css` remains untouched to preserve styling for non-3D parts.

## 8. Risks
- Due to the deep integration of the 3D iframe in `GameShell.tsx`, some remaining frontend files might have vestigial references to the `aevora-office` event system. However, since the iframe itself is gone, these will act as harmless dead code paths until they are rewritten during the V12 phase.

## 9. V12 readiness
The repository is now fully prepared and clean for a fresh V12 visual implementation. The frontend is reduced to the minimal shell required to support the underlying V1-V11 features.
