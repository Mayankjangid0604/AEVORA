'use client';

// PixiOffice — WebGL (PixiJS 7) cutaway of AEVORA HQ. Option C; /world still renders Building3D.

import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { COLORS, createDesk, createGlobe, createPerson, createPlant, createWallScreen } from './pixi-assets';
import {
  FLOOR_NAMES, getEmployeeColor, groupByRoom, isCeo, roomsOnFloor, type Department, type WorldEmployee,
} from './office-layout';
import { useLiveValues } from './useLiveValues';

const W = 1100;
const H = 720;
const LEFT = 110;              // room for floor labels
const BUILDING_W = W - LEFT - 30;
/** Floors top → bottom: [level, y, height, width fraction (setback)]. */
const FLOORS: { level: number; y: number; h: number; widthFrac: number }[] = [
  { level: 3, y: 48, h: 138, widthFrac: 0.78 },
  { level: 2, y: 198, h: 150, widthFrac: 0.88 },
  { level: 1, y: 360, h: 150, widthFrac: 0.95 },
  { level: 0, y: 522, h: 150, widthFrac: 1 },
];
const SLAB = 10;
const INSET = 12;              // back wall inset → perspective depth
const HAIR = [COLORS.hair1, COLORS.hair2, COLORS.hair3, 0x1e3a5f, 0x4a1942];
const SKIN = [0xe8c39e, 0xd4a574, 0xc68b5a, 0xf1c9a5, 0x8d5a3b];
const MAX_PEOPLE = 4;

const hex = (c: string) => parseInt(c.replace('#', ''), 16);
const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

type Selection = { kind: 'room'; dept: Department } | { kind: 'person'; emp: WorldEmployee } | null;
type Anim = (t: number) => void;

export default function PixiOffice({ employees: allEmployees }: { employees: WorldEmployee[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const animsRef = useRef<Anim[]>([]);
  const screensRef = useRef<Map<string, PIXI.Text>>(new Map());
  const ringsRef = useRef<{ id: string; ring: PIXI.Graphics }[]>([]);
  const selectRef = useRef<(s: Selection) => void>(() => {});
  const [selected, setSelected] = useState<Selection>(null);
  const liveValues = useLiveValues();
  selectRef.current = setSelected;

  const employees = allEmployees.filter((e) => e.status !== 'TERMINATED');
  // Rebuild the scene only when something visible about the people changes.
  const peopleKey = employees.map((e) => `${e.id}:${e.activity}:${e.role}:${e.departmentName}:${e.currentTaskTitle ?? ''}`).join('|');

  // Create the WebGL app once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new PIXI.Application({
      width: W, height: H, backgroundColor: COLORS.buildingBg, antialias: true,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    const canvas = app.view as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(0, 0, W, H);
    app.stage.on('pointerdown', () => selectRef.current(null));
    let t = 0;
    app.ticker.add((delta) => {
      t += delta;
      for (const a of animsRef.current) a(t);
    });
    appRef.current = app;
    return () => {
      animsRef.current = [];
      app.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  // (Re)build the scene graph.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    for (const child of app.stage.removeChildren()) child.destroy({ children: true });
    const anims: Anim[] = [];
    screensRef.current = new Map();
    ringsRef.current = [];
    const { byRoom } = groupByRoom(employees);
    const ceo = employees.find(isCeo);

    const text = (s: string, style: Partial<PIXI.ITextStyle>) => new PIXI.Text(s, { fontFamily: 'Inter, sans-serif', ...style });

    // Header
    const title = text('AEVORA HQ', { fontSize: 14, fill: COLORS.indigo, fontFamily: 'DM Sans, sans-serif', fontWeight: '700', letterSpacing: 4 });
    title.position.set(LEFT, 14);
    app.stage.addChild(title);

    for (const floor of FLOORS) {
      const fw = BUILDING_W * floor.widthFrac;
      const fx = LEFT + (BUILDING_W - fw) / 2;
      const rooms = roomsOnFloor(floor.level);
      const roomH = floor.h - SLAB;

      // Floor shell: roof/ceiling slab above, glass edge
      const shell = new PIXI.Graphics();
      shell.beginFill(COLORS.floorSlab);
      shell.drawRect(fx - 4, floor.y + roomH, fw + 8, SLAB);
      shell.endFill();
      shell.lineStyle(1, COLORS.glassEdge, 0.9);
      shell.moveTo(fx - 4, floor.y + roomH).lineTo(fx + fw + 4, floor.y + roomH);
      app.stage.addChild(shell);

      // Floor label (left edge)
      const lvl = text(floor.level === 0 ? 'G' : `L${floor.level}`, { fontSize: 18, fill: 0x9ca3af, fontFamily: 'DM Sans, sans-serif', fontWeight: '700' });
      const nm = text(FLOOR_NAMES[floor.level].toUpperCase().replace(' ', '\n'), { fontSize: 8, fill: 0x6b7280, letterSpacing: 1.5, align: 'right', lineHeight: 11 });
      lvl.anchor.set(1, 0); nm.anchor.set(1, 0);
      lvl.position.set(LEFT - 16, floor.y + roomH / 2 - 22);
      nm.position.set(LEFT - 16, floor.y + roomH / 2);
      app.stage.addChild(lvl, nm);

      const weights = rooms.map((d) => (d.position === 'center' ? 1.45 : 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let x = fx;
      rooms.forEach((dept, i) => {
        const rw = (fw * weights[i]) / total;
        const room = buildRoom(dept, x, floor.y, rw, roomH, byRoom.get(dept.id) ?? [], ceo, anims, text);
        app.stage.addChild(room);
        x += rw;
      });
    }

    // Base
    const base = new PIXI.Graphics();
    base.beginFill(0x0d0d1a);
    base.drawRect(LEFT - 16, H - 40, BUILDING_W + 32, 28);
    base.endFill();
    base.lineStyle(1, COLORS.indigo, 0.3);
    base.moveTo(LEFT - 16, H - 40).lineTo(LEFT + BUILDING_W + 16, H - 40);
    const baseText = text('SAAHVIK TECH  ·  SIKAR, RAJASTHAN', { fontSize: 10, fill: 0x9ca3af, fontFamily: 'DM Sans, sans-serif', fontWeight: '700', letterSpacing: 5 });
    baseText.anchor.set(0.5);
    baseText.position.set(LEFT + BUILDING_W / 2, H - 26);
    app.stage.addChild(base, baseText);

    animsRef.current = anims;

    function buildRoom(
      dept: Department, rx: number, ry: number, rw: number, rh: number,
      people: WorldEmployee[], ceoEmp: WorldEmployee | undefined, animList: Anim[],
      mk: typeof text,
    ): PIXI.Container {
      const accent = hex(dept.color);
      const c = new PIXI.Container();
      c.position.set(rx, ry);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.hitArea = new PIXI.Rectangle(0, 0, rw, rh);
      c.on('pointerdown', (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); selectRef.current({ kind: 'room', dept }); });

      const top = 22; // sign band
      const bx0 = INSET, bx1 = rw - INSET, by0 = top + 8, by1 = rh - 22;
      const g = new PIXI.Graphics();
      // Ceiling, side walls, floor as trapezoids around the back wall
      g.beginFill(COLORS.wallDark).drawPolygon([0, top, rw, top, bx1, by0, bx0, by0]).endFill();
      g.beginFill(COLORS.wallLight).drawPolygon([0, top, bx0, by0, bx0, by1, 0, rh]).endFill();
      g.beginFill(COLORS.wallLight).drawPolygon([rw, top, bx1, by0, bx1, by1, rw, rh]).endFill();
      g.beginFill(COLORS.carpet).drawPolygon([bx0, by1, bx1, by1, rw, rh, 0, rh]).endFill();
      g.lineStyle(0.5, 0xffffff, 0.05);
      for (let k = 1; k < 6; k++) { const fx2 = bx0 + ((bx1 - bx0) * k) / 6; g.moveTo(fx2, by1).lineTo((rw * k) / 6, rh); }
      g.lineStyle(0);
      // Back wall, tinted by department
      g.beginFill(accent, 0.1).drawRect(bx0, by0, bx1 - bx0, by1 - by0).endFill();
      g.beginFill(COLORS.glass, 0.55).drawRect(bx0, by0, bx1 - bx0, by1 - by0).endFill();
      // Warm ceiling light + cone
      g.beginFill(0xffe8b0, 0.7).drawRect(rw * 0.3, by0 + 1, rw * 0.4, 2).endFill();
      g.beginFill(0xffd28a, 0.05).drawPolygon([rw * 0.3, by0 + 3, rw * 0.7, by0 + 3, rw * 0.92, rh, rw * 0.08, rh]).endFill();
      g.beginFill(accent, 0.05).drawPolygon([bx0, by1, bx1, by1, rw, rh, 0, rh]).endFill();
      // Glass frame
      g.lineStyle(1, accent, dept.id === 'ceo' ? 0.9 : 0.35).drawRect(0, 0, rw, rh);
      c.addChild(g);

      if (dept.id === 'ceo') {
        const glow = new PIXI.Graphics();
        glow.lineStyle(4, COLORS.indigo, 0.25).drawRect(-2, -2, rw + 4, rh + 4);
        c.addChild(glow);
        animList.push((t) => { glow.alpha = 0.6 + Math.sin(t * 0.05) * 0.4; });
      }

      // Sign band
      const sign = new PIXI.Graphics();
      sign.beginFill(0x09090f, 0.95).drawRect(0, 0, rw, top).endFill();
      sign.beginFill(accent).drawRect(0, top - 2, rw, 2).endFill();
      c.addChild(sign);
      const name = mk(dept.name.toUpperCase(), { fontSize: 9, fill: accent, fontFamily: 'DM Sans, sans-serif', fontWeight: '700', letterSpacing: 1 });
      name.anchor.set(0.5);
      name.position.set(rw / 2, top / 2);
      if (name.width > rw - 8) name.scale.set((rw - 8) / name.width);
      c.addChild(name);

      // Wall screen (blinks; value updated live)
      const sw = Math.min(90, (bx1 - bx0) * 0.42), sh = Math.min(36, (by1 - by0) * 0.45);
      const screen = createWallScreen(sw, sh, accent, dept.icon);
      screen.position.set(bx0 + 6, by0 + 8);
      c.addChild(screen);
      screensRef.current.set(dept.id, screen.valueText);
      const phase = hash(dept.id) % 120;
      animList.push((t) => { screen.alpha = (t + phase) % 150 < 12 ? 0.55 : 1; });

      // Plant
      if (rw > 90) {
        const plant = createPlant(0.9);
        plant.position.set(bx1 - 18, by1 - 16);
        c.addChild(plant);
      }

      // Reception: AEVORA sign + atrium globe
      if (dept.id === 'reception') {
        const brand = mk('AEVORA', { fontSize: 13, fill: 0x818cf8, fontFamily: 'DM Sans, sans-serif', fontWeight: '700', letterSpacing: 4 });
        const tag = mk('PEOPLE · IDEAS · IMPACT', { fontSize: 6, fill: COLORS.indigo, letterSpacing: 1.5 });
        brand.anchor.set(1, 0); tag.anchor.set(1, 0);
        brand.position.set(bx1 - 6, by0 + 8); tag.position.set(bx1 - 6, by0 + 26);
        c.addChild(brand, tag);
        const globe = createGlobe(18);
        globe.position.set(rw * 0.62, rh - 36);
        c.addChild(globe);
        animList.push((t) => { globe.meridian.scale.x = Math.cos(t * 0.03); });
      }

      // Desks + people, right of the screen
      // One row of desks along the floor under the screen, across the whole back wall.
      const zoneX0 = bx0 + 2, zoneX1 = bx1 - (rw > 90 ? 20 : 2);
      const shown = people.slice(0, Math.min(MAX_PEOPLE, Math.max(1, Math.floor((zoneX1 - zoneX0) / 36))));
      const cols = Math.max(1, shown.length);
      shown.forEach((emp, i) => {
        const slotW = (zoneX1 - zoneX0) / cols;
        const dx = zoneX0 + slotW * i + slotW / 2 - 18;
        const dy = by1 - 22;
        const color = hex(getEmployeeColor(emp.departmentName));
        const h = hash(emp.id);
        const person = createPerson(color, SKIN[h % SKIN.length], HAIR[(h >> 3) % HAIR.length]);
        const walking = emp.activity === 'WALKING';
        const baseX = dx + 10, baseY = dy - 18;
        person.position.set(baseX, baseY);
        person.eventMode = 'static';
        person.cursor = 'pointer';
        person.hitArea = new PIXI.Rectangle(-2, 0, 20, 34);
        person.on('pointerdown', (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); selectRef.current({ kind: 'person', emp }); });

        const ring = new PIXI.Graphics();
        ring.lineStyle(1.5, 0xffffff, 0.9).drawEllipse(8, 32, 11, 4);
        ring.visible = false;
        person.addChildAt(ring, 0);
        ringsRef.current.push({ id: emp.id, ring });

        c.addChild(person);
        if (!walking) {
          const desk = createDesk(color);
          desk.position.set(dx, dy);
          desk.eventMode = 'none';
          c.addChild(desk);
        }
        const tag = mk(emp.name.split(' ')[0], { fontSize: 7, fill: 0xd1d5db });
        tag.anchor.set(0.5, 1);
        tag.eventMode = 'none';
        c.addChild(tag);

        const off = h % 100;
        animList.push((t) => {
          if (walking) {
            person.x = baseX + Math.sin((t + off) * 0.015) * Math.min(40, slotW);
            person.y = baseY + 6 + Math.abs(Math.sin((t + off) * 0.2)) * -1.5;
          } else if (emp.activity === 'WORKING') {
            person.y = baseY + Math.sin((t + off) * 0.25) * 0.8;
          } else {
            person.x = baseX + Math.sin((t + off) * 0.03) * 1.2;
          }
          tag.position.set(person.x + 8, person.y - 1);
        });

        if (ceoEmp?.id === emp.id && emp.currentTaskTitle) {
          const txt = emp.currentTaskTitle.length > 40 ? `${emp.currentTaskTitle.slice(0, 40)}…` : emp.currentTaskTitle;
          const bt = mk(txt, { fontSize: 8, fill: 0xf3f4f6 });
          const bubble = new PIXI.Container();
          const bg = new PIXI.Graphics();
          bg.lineStyle(1, COLORS.indigo, 0.9).beginFill(0x1e1e2e).drawRoundedRect(0, 0, bt.width + 12, 18, 4).endFill();
          bg.beginFill(0x1e1e2e).lineStyle(1, COLORS.indigo, 0.9).drawPolygon([bt.width / 2 + 2, 18, bt.width / 2 + 10, 18, bt.width / 2 + 6, 23]).endFill();
          bt.position.set(6, 4);
          bubble.addChild(bg, bt);
          bubble.eventMode = 'none';
          c.addChild(bubble);
          animList.push((t) => {
            bubble.position.set(person.x + 8 - (bt.width + 12) / 2, person.y - 36 + Math.sin(t * 0.05) * 1.5);
          });
        }
      });
      if (people.length > shown.length) {
        const more = mk(`+${people.length - shown.length}`, { fontSize: 8, fill: 0x09090f, fontWeight: '700' });
        const pill = new PIXI.Graphics().beginFill(accent).drawRoundedRect(0, 0, more.width + 8, 12, 3).endFill();
        pill.position.set(rw - more.width - 12, top + 4);
        more.position.set(pill.x + 4, pill.y + 1);
        c.addChild(pill, more);
      }
      return c;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  // Live screen values update in place.
  useEffect(() => {
    for (const [id, t] of screensRef.current) t.text = liveValues[id] ?? '';
  }, [liveValues, peopleKey]);

  // Selection ring
  useEffect(() => {
    const id = selected?.kind === 'person' ? selected.emp.id : null;
    for (const r of ringsRef.current) r.ring.visible = r.id === id;
  }, [selected, peopleKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { byRoom } = groupByRoom(employees);
  const working = employees.filter((e) => e.activity === 'WORKING').length;
  const panelStyle = { position: 'absolute' as const, top: 12, right: 12, width: 240, padding: 'var(--space-4)', zIndex: 2 };
  const label = { fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 2 };
  const value = { fontSize: 'var(--text-sm)', color: 'var(--text-2)', marginBottom: 'var(--space-3)' };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={hostRef} style={{ borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', background: css(COLORS.buildingBg), lineHeight: 0 }} />
      <div style={{ position: 'absolute', top: 14, right: 16, fontSize: 11, color: '#9ca3af', letterSpacing: '0.08em', pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>
        {employees.length} EMPLOYEES · {working} WORKING
      </div>

      {selected?.kind === 'person' && (
        <aside className="card" style={panelStyle} aria-label={`${selected.emp.name} details`}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>{selected.emp.name}</div>
          <div style={{ ...label, marginBottom: 'var(--space-3)' }}>{selected.emp.role ?? 'Employee'}</div>
          <div style={label}>Department</div>
          <div style={value}>{selected.emp.departmentName ?? '—'}</div>
          {selected.emp.currentTaskTitle && (<><div style={label}>Current task</div><div style={value}>{selected.emp.currentTaskTitle}</div></>)}
          <span className={`badge ${selected.emp.activity === 'WORKING' ? 'badge-success' : selected.emp.activity === 'IN_MEETING' ? 'badge-accent' : 'badge-neutral'}`}>
            {selected.emp.activity.toLowerCase().replace('_', ' ')}
          </span>
          <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={() => setSelected(null)}>Dismiss</button>
        </aside>
      )}

      {selected?.kind === 'room' && (
        <aside className="card" style={panelStyle} aria-label={`${selected.dept.name} details`}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: selected.dept.color }}>{selected.dept.name}</div>
          <div style={{ ...label, marginBottom: 'var(--space-3)' }}>{selected.dept.subtitle}</div>
          <div style={label}>Floor</div>
          <div style={value}>{FLOOR_NAMES[selected.dept.floorLevel]}</div>
          {liveValues[selected.dept.id] && (<><div style={label}>Live</div><div style={value}>{liveValues[selected.dept.id]}</div></>)}
          <div style={label}>Employees</div>
          {(byRoom.get(selected.dept.id) ?? []).length === 0
            ? <div style={value}>Nobody assigned yet</div>
            : (byRoom.get(selected.dept.id) ?? []).map((e) => (
              <button key={e.id} type="button" onClick={() => setSelected({ kind: 'person', emp: e })}
                style={{ display: 'block', padding: '2px 0', border: 0, background: 'none', color: 'var(--text-2)', fontSize: 'var(--text-xs)', cursor: 'pointer', textAlign: 'left' }}>
                {e.name} · {e.role ?? 'Employee'}
              </button>
            ))}
          <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={() => setSelected(null)}>Dismiss</button>
        </aside>
      )}
    </div>
  );
}
