// Programmatic texture generation for PixiJS — no image files, everything drawn with PIXI.Graphics.

import * as PIXI from 'pixi.js';

export const COLORS = {
  // Building
  buildingBg: 0x02020a,
  floorSlab: 0x0d0d1a,
  wallDark: 0x080812,
  wallLight: 0x12121f,
  glass: 0x1a1a2e,
  glassEdge: 0x2a2a4a,
  // Department accents
  indigo: 0x6366f1,
  blue: 0x3b82f6,
  green: 0x10b981,
  emerald: 0x34d399,
  amber: 0xf59e0b,
  orange: 0xf97316,
  pink: 0xec4899,
  purple: 0x8b5cf6,
  violet: 0x7c3aed,
  cyan: 0x06b6d4,
  teal: 0x14b8a6,
  // People
  skin: 0xfbbf24,
  skinDark: 0xd97706,
  hair1: 0x1f2937,
  hair2: 0x7c2d12,
  hair3: 0x064e3b,
  // Furniture
  deskWood: 0x8b6914,
  deskWoodDark: 0x6b4f0e,
  chairGray: 0x374151,
  floorTile: 0x111120,
  carpet: 0x0f1025,
  // Plants
  plantGreen: 0x166534,
  plantLight: 0x15803d,
  potBrown: 0x4b3010,
};

/** Desk with monitor and chair, 36×33. */
export function createDesk(color: number): PIXI.Container {
  const container = new PIXI.Container();
  const g = new PIXI.Graphics();
  // Chair (behind the desk)
  g.beginFill(COLORS.chairGray);
  g.drawRoundedRect(10, 23, 16, 10, 2);
  g.endFill();
  g.beginFill(0x4b5563);
  g.drawRoundedRect(12, 23, 12, 7, 2);
  g.endFill();
  // Desk surface + front edge
  g.beginFill(COLORS.deskWood);
  g.drawRoundedRect(0, 14, 36, 8, 2);
  g.endFill();
  g.beginFill(COLORS.deskWoodDark);
  g.drawRoundedRect(0, 20, 36, 3, 1);
  g.endFill();
  // Monitor stand + screen
  g.beginFill(0x374151);
  g.drawRect(16, 6, 4, 9);
  g.endFill();
  g.lineStyle(1, color, 0.8);
  g.beginFill(0x050510);
  g.drawRoundedRect(8, 0, 20, 12, 2);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(color, 0.15);
  g.drawRoundedRect(9, 1, 18, 10, 1);
  g.endFill();
  g.lineStyle(0.5, color, 0.4);
  g.moveTo(10, 4); g.lineTo(26, 4);
  g.moveTo(10, 6); g.lineTo(22, 6);
  g.moveTo(10, 8); g.lineTo(24, 8);
  container.addChild(g);
  return container;
}

/** Wall display panel. The value text is exposed as `valueText` so it can be updated live. */
export function createWallScreen(w: number, h: number, color: number, icon: string, value?: string): PIXI.Container & { valueText: PIXI.Text } {
  const container = new PIXI.Container() as PIXI.Container & { valueText: PIXI.Text };
  const g = new PIXI.Graphics();
  g.lineStyle(1, color, 0.7);
  g.beginFill(0x030308);
  g.drawRoundedRect(0, 0, w, h, 3);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(color, 0.05);
  g.drawRoundedRect(1, 1, w - 2, h - 2, 2);
  g.endFill();
  g.lineStyle(0.5, color, 0.08);
  for (let y = 4; y < h - 2; y += 4) { g.moveTo(2, y); g.lineTo(w - 2, y); }
  g.lineStyle(0);
  g.beginFill(color, 0.2);
  g.drawRect(1, 1, w - 2, 3);
  g.endFill();
  container.addChild(g);

  const iconText = new PIXI.Text(icon, { fontSize: Math.round(h * 0.35), fill: color, fontFamily: 'monospace' });
  iconText.anchor.set(0.5, 0);
  iconText.position.set(w / 2, h * 0.14);
  container.addChild(iconText);

  const valText = new PIXI.Text(value ?? '', { fontSize: 8, fill: 0xe5e7eb, fontFamily: 'Inter, sans-serif', fontWeight: '600' });
  valText.anchor.set(0.5, 0);
  valText.position.set(w / 2, h - 13);
  container.addChild(valText);
  container.valueText = valText;
  return container;
}

/** Potted plant, about 16×22 at size 1. */
export function createPlant(size = 1): PIXI.Container {
  const container = new PIXI.Container();
  const g = new PIXI.Graphics();
  const s = size;
  g.beginFill(COLORS.plantGreen, 0.9);
  g.drawEllipse(s * 8, s * 10, s * 6, s * 8);
  g.endFill();
  g.beginFill(COLORS.plantLight, 0.85);
  g.drawEllipse(s * 5, s * 8, s * 4, s * 6);
  g.drawEllipse(s * 11, s * 9, s * 4, s * 5);
  g.endFill();
  g.beginFill(0x22c55e, 0.2);
  g.drawEllipse(s * 7, s * 7, s * 2, s * 3);
  g.endFill();
  g.beginFill(COLORS.potBrown);
  g.drawRoundedRect(s * 3, s * 14, s * 10, s * 8, 2);
  g.endFill();
  g.beginFill(0x3b1f0a);
  g.drawEllipse(s * 8, s * 14, s * 5, s * 2);
  g.endFill();
  container.addChild(g);
  return container;
}

/** Person, 16×34 with feet at y≈32. */
export function createPerson(bodyColor: number, skinTone: number = COLORS.skin, hairColor: number = COLORS.hair1): PIXI.Container {
  const container = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(0x000000, 0.25);
  g.drawEllipse(8, 32, 7, 2);
  g.endFill();
  g.beginFill(0x1f2937);
  g.drawRoundedRect(4, 22, 4, 10, 1);
  g.drawRoundedRect(10, 22, 4, 10, 1);
  g.endFill();
  g.beginFill(bodyColor, 0.95);
  g.drawRoundedRect(3, 12, 10, 12, 2);
  g.endFill();
  g.beginFill(bodyColor, 0.85);
  g.drawRoundedRect(0, 13, 3, 8, 1);
  g.drawRoundedRect(13, 13, 3, 8, 1);
  g.endFill();
  g.beginFill(skinTone);
  g.drawRoundedRect(7, 9, 4, 4, 1);
  g.drawRoundedRect(4, 2, 10, 10, 4);
  g.endFill();
  g.beginFill(hairColor);
  g.drawRoundedRect(4, 2, 10, 4, 4);
  g.endFill();
  g.beginFill(0x1f2937);
  g.drawCircle(7, 8, 1);
  g.drawCircle(11, 8, 1);
  g.endFill();
  container.addChild(g);
  return container;
}

/** Atrium globe centred on (0,0). The rotating meridian is exposed as `meridian`. */
export function createGlobe(radius: number): PIXI.Container & { meridian: PIXI.Graphics } {
  const container = new PIXI.Container() as PIXI.Container & { meridian: PIXI.Graphics };
  const g = new PIXI.Graphics();
  for (let i = 3; i >= 1; i--) {
    g.lineStyle(i, COLORS.indigo, 0.05 * i);
    g.drawCircle(0, 0, radius + i * 4);
  }
  g.lineStyle(1, COLORS.indigo, 0.4);
  g.beginFill(0x0a0a1f, 0.9);
  g.drawCircle(0, 0, radius);
  g.endFill();
  g.lineStyle(0.5, COLORS.indigo, 0.25);
  for (const oy of [-radius * 0.5, -radius * 0.2, 0, radius * 0.2, radius * 0.5]) {
    const r = Math.sqrt(radius * radius - oy * oy);
    g.drawEllipse(0, oy, r, r * 0.25);
  }
  g.lineStyle(0);
  g.beginFill(COLORS.indigo, 0.8);
  g.drawCircle(0, 0, 3);
  g.endFill();
  container.addChild(g);

  const meridian = new PIXI.Graphics();
  meridian.lineStyle(1, 0x818cf8, 0.6);
  meridian.drawEllipse(0, 0, radius, radius);
  container.addChild(meridian);
  container.meridian = meridian;
  return container;
}
