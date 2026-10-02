'use client';

// Building3D — CSS 3D dollhouse of the company: four open-fronted floors viewed from slightly above.
// Pure HTML/CSS transforms (no canvas, no WebGL); see Building3D.module.css for the geometry.

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  DEPARTMENTS, FLOOR_NAMES, getEmployeeColor, groupByRoom, isCeo, roomsOnFloor, type Department, type WorldEmployee,
} from './office-layout';
import { useLiveValues } from './useLiveValues';
import styles from './Building3D.module.css';

type Vars = CSSProperties & Record<`--${string}`, string | number>;
type Mode = 'normal' | 'expanded' | 'collapsed';

const LEVELS_TOP_DOWN = [3, 2, 1, 0];
/** Upper floors are set back: wider at the bottom, narrower at the top. */
const FLOOR_WIDTH = ['100%', '95%', '87%', '78%'];
const ROOM_HEIGHT: Record<Mode, number> = { normal: 150, expanded: 250, collapsed: 104 };
const FIGURE_SCALE: Record<Mode, number> = { normal: 1, expanded: 1.15, collapsed: 0.8 };
const MAX_SHOWN: Record<Mode, number> = { normal: 4, expanded: 6, collapsed: 2 };
/** Depth (px, negative = away from the viewer) of each row of desks, by number of rows. */
const ROW_DEPTHS: Record<number, number[]> = { 1: [-60], 2: [-84, -44], 3: [-100, -70, -40] };
const BUBBLE_MAX = 60;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

function activityClass(a: string): string {
  if (a === 'WORKING') return styles.working;
  if (a === 'WALKING') return styles.walking;
  if (a === 'IN_MEETING' || a === 'MEETING') return styles.meeting;
  return styles.idle;
}

/** Two desk columns to the right of the wall screen (x in % of room width), front-to-back rows. */
function seats(count: number): { x: number; z: number }[] {
  const cols = Math.min(2, count);
  const rows = Math.ceil(count / 2);
  const depths = ROW_DEPTHS[rows] ?? ROW_DEPTHS[3];
  return Array.from({ length: count }, (_, i) => ({
    x: cols === 1 ? 72 : i % 2 === 0 ? 62 : 84,
    z: depths[Math.floor(i / 2)],
  }));
}

function Person({ emp, x, z, selected, showName, bubble, onSelect }: {
  emp: WorldEmployee; x: number; z: number; selected: boolean; showName: boolean; bubble?: string;
  onSelect: () => void;
}) {
  const seated = emp.activity !== 'WALKING';
  return (
    <>
      <button
        type="button"
        className={cx(styles.person, activityClass(emp.activity), selected && styles.selected)}
        style={{ left: `${x}%`, '--z': `${z}px`, '--c': getEmployeeColor(emp.departmentName) } as Vars}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        aria-label={`${emp.name}, ${emp.role ?? 'Employee'}, ${emp.activity.toLowerCase().replace('_', ' ')}`}
        aria-pressed={selected}
      >
        <span className={styles.body}>
          <span className={cx(styles.leg, styles.legL)} />
          <span className={cx(styles.leg, styles.legR)} />
          <span className={cx(styles.arm, styles.armL)} />
          <span className={cx(styles.arm, styles.armR)} />
          <span className={styles.torso} />
          <span className={styles.head} />
          <span className={styles.hair} />
        </span>
        {(showName || selected) && <span className={styles.nameTag}>{emp.name}</span>}
        {bubble && <span className={styles.bubble}>{bubble.length > BUBBLE_MAX ? `${bubble.slice(0, BUBBLE_MAX)}…` : bubble}</span>}
      </button>
      {seated && (
        <span className={styles.desk} style={{ left: `${x}%`, '--z': `${z + 16}px`, '--c': getEmployeeColor(emp.departmentName) } as Vars}>
          <span className={styles.deskTop} />
          <span className={styles.monitor} />
        </span>
      )}
    </>
  );
}

function Globe() {
  return (
    <span className={styles.globe} aria-hidden="true">
      <span className={styles.sphere}>
        <span className={styles.lat} style={{ top: '30%' }} />
        <span className={styles.lat} style={{ top: '50%' }} />
        <span className={styles.lat} style={{ top: '70%' }} />
        <span className={styles.meridian} />
      </span>
      <span className={styles.pedestal} />
    </span>
  );
}

function Room({ dept, mode, index, isFirst, isLast, people, liveValue, active, selectedId, ceoBubble, onSelectRoom, onSelectPerson }: {
  dept: Department; mode: Mode; index: number; isFirst: boolean; isLast: boolean;
  people: WorldEmployee[]; liveValue?: string; active: boolean; selectedId: string | null;
  ceoBubble?: { empId: string; text: string };
  onSelectRoom: () => void; onSelectPerson: (id: string) => void;
}) {
  const shown = people.slice(0, MAX_SHOWN[mode]);
  const positions = seats(shown.length);
  const working = people.filter((p) => p.activity === 'WORKING').length;
  const screenValue = liveValue ?? (people.length > 0 ? `${working}/${people.length} working` : undefined);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // keys on a person button are theirs
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRoom(); }
  }

  return (
    <div
      className={cx(styles.room, active && styles.roomActive, dept.id === 'ceo' && styles.ceo)}
      style={{ '--c': dept.color, flexGrow: dept.position === 'center' ? 1.45 : 1 } as Vars}
      role="button"
      tabIndex={0}
      aria-label={`${dept.name}: ${people.length} employee${people.length === 1 ? '' : 's'}`}
      aria-pressed={active}
      onClick={onSelectRoom}
      onKeyDown={onKeyDown}
    >
      <div className={styles.back}>
        <div className={styles.screen} style={{ animationDelay: `${(index * 0.37) % 2.4}s` }}>
          <span className={styles.screenIcon}>{dept.icon}</span>
          {screenValue && <span className={styles.screenValue}>{screenValue}</span>}
        </div>
        {dept.id === 'reception' && <div className={styles.wallBrand}>AEVORA<small>People · Ideas · Impact</small></div>}
        {mode === 'expanded' && <div className={styles.wallText}>{dept.subtitle}</div>}
      </div>
      <div className={styles.floorPlane} />
      <div className={cx(styles.wall, styles.wallLeft, isFirst && styles.wallOuter)} />
      {isLast && <div className={cx(styles.wall, styles.wallRight, styles.wallOuter)} />}

      <span className={styles.plant} aria-hidden="true" />
      {dept.id === 'reception' && <Globe />}

      {shown.map((emp, i) => (
        <Person
          key={emp.id}
          emp={emp}
          x={positions[i].x}
          z={positions[i].z}
          selected={selectedId === emp.id}
          showName={mode === 'expanded'}
          bubble={ceoBubble?.empId === emp.id ? ceoBubble.text : undefined}
          onSelect={() => onSelectPerson(emp.id)}
        />
      ))}

      <div className={styles.sign}>
        <span className={styles.signName}>{dept.name}</span>
        {people.length > shown.length && <span className={styles.more}>+{people.length - shown.length}</span>}
      </div>
    </div>
  );
}

export default function Building3D({ employees: allEmployees }: { employees: WorldEmployee[] }) {
  const employees = allEmployees.filter((e) => e.status !== 'TERMINATED');
  const liveValues = useLiveValues();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') { setSelectedId(null); setSelectedDeptId(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { byRoom, unplaced } = groupByRoom(employees);
  const ceo = employees.find(isCeo);
  const ceoBubble = ceo?.currentTaskTitle ? { empId: ceo.id, text: ceo.currentTaskTitle } : undefined;
  const working = employees.filter((e) => e.activity === 'WORKING').length;
  const meeting = employees.filter((e) => e.activity === 'IN_MEETING' || e.activity === 'MEETING').length;

  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const selectedDept = DEPARTMENTS.find((d) => d.id === selectedDeptId) ?? null;
  const selectedRoomOfPerson = selected ? [...byRoom.entries()].find(([, list]) => list.some((e) => e.id === selected.id))?.[0] : undefined;

  const modeFor = (level: number): Mode => (expanded === null ? 'normal' : expanded === level ? 'expanded' : 'collapsed');
  const toggleFloor = (level: number) => setExpanded((cur) => (cur === level ? null : level));

  let roomIndex = 0;

  return (
    <div className={styles.scene}>
      <div className={styles.header}>
        <div>
          <div className={styles.brand}>AEVORA HQ</div>
          <div className={styles.brandSub}>SAAHVIK Tech · 4 floors · 18 departments</div>
        </div>
        <div className={styles.counts}>
          <span><strong>{employees.length}</strong> employee{employees.length === 1 ? '' : 's'}</span>
          <span><strong>{working}</strong> working</span>
          <span><strong>{meeting}</strong> in meetings</span>
          {unplaced.length > 0 && <span><strong>{unplaced.length}</strong> without a room</span>}
        </div>
      </div>

      <div className={styles.scroller}>
        <div className={styles.stage} role="group" aria-label="AEVORA HQ building">
          <div className={styles.building}>
            {LEVELS_TOP_DOWN.map((level) => {
              const mode = modeFor(level);
              const rooms = roomsOnFloor(level);
              return (
                <div key={level} className={styles.row}>
                  <button
                    type="button"
                    className={cx(styles.label, mode === 'expanded' && styles.labelActive)}
                    onClick={() => toggleFloor(level)}
                    aria-expanded={mode === 'expanded'}
                  >
                    <span className={styles.labelLevel}>{level === 0 ? 'G' : `L${level}`}</span>
                    <span className={styles.labelName}>{FLOOR_NAMES[level]}</span>
                  </button>
                  <div className={styles.floorArea}>
                    <div className={cx(styles.floor, styles[mode])} style={{ width: FLOOR_WIDTH[level], '--h': `${ROOM_HEIGHT[mode]}px`, '--fig': FIGURE_SCALE[mode] } as Vars}>
                      <div className={styles.rooms}>
                        <div className={styles.roof} />
                        {rooms.map((dept, i) => (
                          <Room
                            key={dept.id}
                            dept={dept}
                            mode={mode}
                            index={roomIndex++}
                            isFirst={i === 0}
                            isLast={i === rooms.length - 1}
                            people={byRoom.get(dept.id) ?? []}
                            liveValue={liveValues[dept.id]}
                            active={selectedDeptId === dept.id || selectedRoomOfPerson === dept.id}
                            selectedId={selectedId}
                            ceoBubble={dept.id === 'ceo' ? ceoBubble : undefined}
                            onSelectRoom={() => { setSelectedId(null); setSelectedDeptId(dept.id); setExpanded(level); }}
                            onSelectPerson={(id) => { setSelectedId(id); setSelectedDeptId(null); }}
                          />
                        ))}
                      </div>
                      <div className={cx(styles.slab, mode === 'expanded' && styles.slabActive)} onClick={() => toggleFloor(level)} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className={styles.row}>
              <div />
              <div className={styles.plinth}>
                <div className={styles.plinthTop} />
                SAAHVIK TECH
              </div>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <aside className={cx('card', styles.panel)} aria-label={`${selected.name} details`}>
          <div className={styles.panelTitle}>{selected.name}</div>
          <div className={styles.panelSub}>{selected.role ?? 'Employee'}</div>
          <hr className={styles.panelRule} />
          <div className={styles.panelLabel}>Department</div>
          <div className={styles.panelValue}>{selected.departmentName ?? '—'}</div>
          {selected.currentTaskTitle && (
            <>
              <div className={styles.panelLabel}>Current task</div>
              <div className={styles.panelValue}>{selected.currentTaskTitle}</div>
            </>
          )}
          <span className={`badge ${selected.activity === 'WORKING' ? 'badge-success' : selected.activity === 'IN_MEETING' ? 'badge-accent' : 'badge-neutral'}`}>
            {selected.activity.toLowerCase().replace('_', ' ')}
          </span>
          <button type="button" className={styles.dismiss} onClick={() => setSelectedId(null)}>Dismiss</button>
        </aside>
      )}

      {selectedDept && !selected && (
        <aside className={cx('card', styles.panel)} aria-label={`${selectedDept.name} details`}>
          <div className={styles.panelTitle} style={{ color: selectedDept.color }}>{selectedDept.name}</div>
          <div className={styles.panelSub}>{selectedDept.subtitle}</div>
          <hr className={styles.panelRule} />
          <div className={styles.panelLabel}>Floor</div>
          <div className={styles.panelValue}>{FLOOR_NAMES[selectedDept.floorLevel]}</div>
          {liveValues[selectedDept.id] && (
            <>
              <div className={styles.panelLabel}>Live</div>
              <div className={styles.panelValue}>{liveValues[selectedDept.id]}</div>
            </>
          )}
          <div className={styles.panelLabel}>Employees</div>
          <div className={styles.panelValue}>
            {(byRoom.get(selectedDept.id) ?? []).length === 0 ? 'Nobody assigned yet' : `${(byRoom.get(selectedDept.id) ?? []).length} in this room`}
          </div>
          {(byRoom.get(selectedDept.id) ?? []).map((e) => (
            <button key={e.id} type="button" className={styles.panelPerson} onClick={() => setSelectedId(e.id)}>
              <span className={styles.dot} style={{ background: getEmployeeColor(e.departmentName) }} />
              {e.name} · {e.role ?? 'Employee'}
            </button>
          ))}
          <button type="button" className={styles.dismiss} onClick={() => setSelectedDeptId(null)}>Dismiss</button>
        </aside>
      )}
    </div>
  );
}
