#!/usr/bin/env node
// Generates website/public/systembrett/systembrett-template.whiteboard.
// Path B layout: 15 Systembrett primitives as canvas elements on a left-edge
// tray, plus 5 category headers and a usage hint in the work area.
//
// Run: node scripts/systembrett-generate.mjs
// No external dependencies — Node 18+ builtins only.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ──────────────────────────────────────────────────────────────────────────────
// Colour palette
// ──────────────────────────────────────────────────────────────────────────────
const BRASS        = "#d7b06a";
const BRASS_2      = "#e8c884";
const SAGE         = "#9bc0a8";
const NEUTRAL      = "#cdd3d9";
const DARK         = "#0b111c";
const CONFLICT_RED = "#c46a5a";

// ──────────────────────────────────────────────────────────────────────────────
// ID / seed counters
// ──────────────────────────────────────────────────────────────────────────────
let _seed = 1_000;
let _id   = 0;
const nextSeed = () => ++_seed;
const nextId   = (prefix = "el") => `${prefix}-${(++_id).toString().padStart(3, "0")}`;
const now      = () => 1745492800000; // fixed timestamp keeps output deterministic

// ──────────────────────────────────────────────────────────────────────────────
// Base element — every shape merges this
// ──────────────────────────────────────────────────────────────────────────────
const base = (prefix = "el") => ({
  id:           nextId(prefix),
  angle:        0,
  strokeColor:  NEUTRAL,
  backgroundColor: "transparent",
  fillStyle:    "solid",
  strokeWidth:  2,
  strokeStyle:  "solid",
  roughness:    0,
  opacity:      100,
  groupIds:     [],
  frameId:      null,
  roundness:    null,
  seed:         nextSeed(),
  version:      1,
  versionNonce: nextSeed(),
  updated:      now(),
  locked:       false,
  link:         null,
  customData:   null,
  boundElements: null,
  isDeleted:    false,
});

// ──────────────────────────────────────────────────────────────────────────────
// Element helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Category header text (special customData role). */
function makeCategoryHeader(y, text) {
  return {
    ...base("hdr"),
    type:           "text",
    x:              20,
    y,
    width:          160,
    height:         18,
    text,
    fontSize:       11,
    fontFamily:     3,      // Cascadia / code font in Excalidraw
    textAlign:      "left",
    verticalAlign:  "top",
    strokeColor:    BRASS,
    customData:     { role: "category-header" },
    containerId:    null,
    originalText:   text,
    lineHeight:     1.25,
    baseline:       14,
  };
}

/** Ellipse centred at (cx, cy) with radius r. */
function makeCircle({ groupId, cx, cy, r,
  fill = "transparent", stroke, strokeWidth = 1.5,
  strokeStyle = "solid", opacity = 100 }) {
  return {
    ...base(),
    type:            "ellipse",
    x:               cx - r,
    y:               cy - r,
    width:           r * 2,
    height:          r * 2,
    strokeColor:     stroke ?? fill,
    backgroundColor: fill,
    fillStyle:       fill === "transparent" ? "hachure" : "solid",
    strokeWidth,
    strokeStyle,
    opacity,
    groupIds:        [groupId],
  };
}

/** Rectangle at (x, y) with width w and height h. */
function makeRect({ groupId, x, y, w, h,
  fill = "transparent", stroke, strokeWidth = 1.5,
  strokeStyle = "solid", rounded = false, opacity = 100 }) {
  return {
    ...base(),
    type:            "rectangle",
    x, y,
    width:           w,
    height:          h,
    strokeColor:     stroke ?? fill,
    backgroundColor: fill,
    fillStyle:       fill === "transparent" ? "hachure" : "solid",
    strokeWidth,
    strokeStyle,
    opacity,
    roundness:       rounded ? { type: 3 } : null,
    groupIds:        [groupId],
  };
}

/** Diamond centred at (cx, cy) with side size. */
function makeDiamond({ groupId, cx, cy, size, fill, stroke }) {
  return {
    ...base(),
    type:            "diamond",
    x:               cx - size / 2,
    y:               cy - size / 2,
    width:           size,
    height:          size,
    strokeColor:     stroke ?? fill,
    backgroundColor: fill,
    fillStyle:       "solid",
    groupIds:        [groupId],
  };
}

/** Straight line from (x1,y1) to (x2,y2). */
function makeLine({ groupId, x1, y1, x2, y2,
  stroke, strokeWidth, strokeStyle = "solid" }) {
  return {
    ...base(),
    type:               "line",
    x:                  x1,
    y:                  y1,
    width:              x2 - x1,
    height:             y2 - y1,
    strokeColor:        stroke,
    strokeWidth,
    strokeStyle,
    points:             [[0, 0], [x2 - x1, y2 - y1]],
    lastCommittedPoint: null,
    startBinding:       null,
    endBinding:         null,
    startArrowhead:     null,
    endArrowhead:       null,
    groupIds:           [groupId],
  };
}

/** Arrow from (x1,y1) to (x2,y2). */
function makeArrow({ groupId, x1, y1, x2, y2, stroke, strokeWidth }) {
  return {
    ...base(),
    type:               "arrow",
    x:                  x1,
    y:                  y1,
    width:              x2 - x1,
    height:             y2 - y1,
    strokeColor:        stroke,
    strokeWidth,
    points:             [[0, 0], [x2 - x1, y2 - y1]],
    lastCommittedPoint: null,
    startBinding:       null,
    endBinding:         null,
    startArrowhead:     null,
    endArrowhead:       "arrow",
    groupIds:           [groupId],
  };
}

/**
 * Polyline (multi-point line) placed with top-left at (ox, oy).
 * points: [[dx,dy], ...] relative to (ox, oy).
 */
function makePolyline({ groupId, ox, oy, points, stroke, strokeWidth,
  strokeStyle = "solid", fill = "transparent" }) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const w  = Math.max(...xs) - Math.min(...xs);
  const h  = Math.max(...ys) - Math.min(...ys);
  return {
    ...base(),
    type:               "line",
    x:                  ox,
    y:                  oy,
    width:              w,
    height:             h,
    strokeColor:        stroke,
    backgroundColor:    fill,
    fillStyle:          fill === "transparent" ? "hachure" : "solid",
    strokeWidth,
    strokeStyle,
    points,
    lastCommittedPoint: null,
    startBinding:       null,
    endBinding:         null,
    startArrowhead:     null,
    endArrowhead:       null,
    groupIds:           [groupId],
  };
}

/** Small inline text (used for the "?" label inside Unbekannt). */
function makeLabel({ groupId, x, y, text, fontSize = 16,
  stroke = NEUTRAL, opacity = 100 }) {
  return {
    ...base("lbl"),
    type:          "text",
    x, y,
    width:         fontSize,
    height:        Math.round(fontSize * 1.2),
    text,
    fontSize,
    fontFamily:    2,    // normal / serif-ish
    textAlign:     "center",
    verticalAlign: "middle",
    strokeColor:   stroke,
    opacity,
    customData:    null,
    containerId:   null,
    originalText:  text,
    lineHeight:    1.25,
    baseline:      Math.round(fontSize * 0.85),
    groupIds:      [groupId],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tray composition
// ──────────────────────────────────────────────────────────────────────────────
const TX = 100; // tray horizontal centre
const elements = [];
const push = (...els) => elements.push(...els);

// ── PERSONEN ──────────────────────────────────────────────────────────────────
push(makeCategoryHeader(20, "PERSONEN"));

// Person groß: filled brass circle (r=20) + small dark notch on the right edge
{
  const g = "piece-person-gross";
  push(makeCircle({ groupId: g, cx: TX, cy: 60, r: 20, fill: BRASS, strokeWidth: 0 }));
  push(makeRect({   groupId: g, x: TX + 14, y: 57, w: 8, h: 6, fill: DARK, stroke: DARK, strokeWidth: 0 }));
}

// Person mittel: r=15
{
  const g = "piece-person-mittel";
  push(makeCircle({ groupId: g, cx: TX, cy: 108, r: 15, fill: BRASS, strokeWidth: 0 }));
  push(makeRect({   groupId: g, x: TX + 10, y: 106, w: 6, h: 4, fill: DARK, stroke: DARK, strokeWidth: 0 }));
}

// Person klein: r=11
{
  const g = "piece-person-klein";
  push(makeCircle({ groupId: g, cx: TX, cy: 144, r: 11, fill: BRASS, strokeWidth: 0 }));
  push(makeRect({   groupId: g, x: TX + 7, y: 142, w: 5, h: 3, fill: DARK, stroke: DARK, strokeWidth: 0 }));
}

// ── SELBST ────────────────────────────────────────────────────────────────────
push(makeCategoryHeader(175, "SELBST"));

// Ich: ring (stroke only, no fill) + solid centre dot
{
  const g = "piece-ich";
  push(makeCircle({ groupId: g, cx: TX, cy: 210, r: 15,
    fill: "transparent", stroke: BRASS, strokeWidth: 2.5 }));
  push(makeCircle({ groupId: g, cx: TX, cy: 210, r: 5,
    fill: BRASS, stroke: BRASS, strokeWidth: 0 }));
}

// Unbekannt: dashed ring + "?" centre label
{
  const g = "piece-unbekannt";
  push(makeCircle({ groupId: g, cx: TX, cy: 260, r: 15,
    fill: "transparent", stroke: NEUTRAL, strokeWidth: 1.5, strokeStyle: "dashed" }));
  push(makeLabel({ groupId: g, x: TX - 8, y: 252, text: "?",
    fontSize: 16, stroke: NEUTRAL }));
}

// ── THEMEN ────────────────────────────────────────────────────────────────────
push(makeCategoryHeader(305, "THEMEN"));

// Thema: rounded square
push(makeRect({ groupId: "piece-thema",
  x: TX - 15, y: 325, w: 30, h: 30,
  fill: SAGE, stroke: SAGE, strokeWidth: 1.5, rounded: true }));

// Ziel: diamond
push(makeDiamond({ groupId: "piece-ziel",
  cx: TX, cy: 400, size: 30,
  fill: BRASS, stroke: BRASS }));

// Gefühl: organic heart outline via freedraw (spec requires pen-like organic curves)
{
  const g = "piece-gefuehl";
  // Heart outline as freedraw points relative to element origin, ~22×20 px
  // freedraw element: x/y is the top-left anchor; points are relative offsets.
  const pts = [
    [11, 0], [14, -3], [19, -3], [22, 0], [22, 4],
    [11, 16], [0, 4], [0, 0], [3, -3], [8, -3], [11, 0],
  ];
  push({
    ...base(),
    type:               "freedraw",
    x:                  TX - 11,
    y:                  434,
    width:              22,
    height:             19,
    strokeColor:        BRASS_2,
    backgroundColor:    "transparent",
    fillStyle:          "hachure",
    strokeWidth:        2,
    strokeStyle:        "solid",
    roughness:          0,
    opacity:            100,
    groupIds:           [g],
    points:             pts,
    pressures:          pts.map(() => 0.5),
    simulatePressure:   false,
    lastCommittedPoint: null,
  });
}

// Hindernis: jagged polygon outline
{
  const g = "piece-hindernis";
  const pts = [
    [0, 4], [8, -10], [16, -4], [24, -8], [28, 2],
    [24, 12], [16, 8], [8, 14], [2, 8], [0, 4],
  ];
  push(makePolyline({ groupId: g, ox: TX - 14, oy: 480,
    points: pts, stroke: NEUTRAL, strokeWidth: 1.8 }));
}

// ── RAHMEN ────────────────────────────────────────────────────────────────────
push(makeCategoryHeader(515, "RAHMEN"));

// System: translucent filled rounded rect
push(makeRect({ groupId: "piece-system",
  x: TX - 30, y: 540, w: 60, h: 28,
  fill: SAGE, stroke: SAGE, strokeWidth: 1.5, rounded: true, opacity: 30 }));

// Kontext: dashed border rect (no fill)
push(makeRect({ groupId: "piece-kontext",
  x: TX - 30, y: 580, w: 60, h: 28,
  fill: "transparent", stroke: NEUTRAL, strokeWidth: 1.3, strokeStyle: "dashed" }));

// ── VERBINDUNGEN ──────────────────────────────────────────────────────────────
push(makeCategoryHeader(625, "VERBINDUNGEN"));

// Beziehung stark: solid line
push(makeLine({ groupId: "piece-stark",
  x1: TX - 40, y1: 660, x2: TX + 40, y2: 660,
  stroke: NEUTRAL, strokeWidth: 2.5 }));

// Beziehung schwach: dashed line
push(makeLine({ groupId: "piece-schwach",
  x1: TX - 40, y1: 690, x2: TX + 40, y2: 690,
  stroke: NEUTRAL, strokeWidth: 1.8, strokeStyle: "dashed" }));

// Einfluss: arrow
push(makeArrow({ groupId: "piece-einfluss",
  x1: TX - 40, y1: 720, x2: TX + 40, y2: 720,
  stroke: BRASS, strokeWidth: 2 }));

// Konflikt: zigzag polyline
{
  const g = "piece-konflikt";
  const pts = [[0, 0], [10, -8], [20, 8], [30, -8], [40, 8], [50, 0]];
  push(makePolyline({ groupId: g, ox: TX - 25, oy: 750,
    points: pts, stroke: CONFLICT_RED, strokeWidth: 2 }));
}

// ── Work-area usage hint ───────────────────────────────────────────────────────
push({
  ...base("hint"),
  type:         "text",
  x:            220,
  y:            20,
  width:        460,
  height:       22,
  text:         "Alt+ziehen = Kopie · rechts platzieren und benennen",
  fontSize:     14,
  fontFamily:   3,
  textAlign:    "left",
  verticalAlign: "top",
  strokeColor:  NEUTRAL,
  opacity:      55,
  customData:   null,
  containerId:  null,
  originalText: "Alt+ziehen = Kopie · rechts platzieren und benennen",
  lineHeight:   1.25,
  baseline:     18,
});

// ──────────────────────────────────────────────────────────────────────────────
// Scene wrapper
// ──────────────────────────────────────────────────────────────────────────────
const scene = {
  type:    "excalidraw",
  version: 2,
  source:  "mentolder-systembrett",
  elements,
  appState: {
    viewBackgroundColor: "#0b111c",
    gridSize:            null,
  },
  files:        {},
  libraryItems: [],
};

// ──────────────────────────────────────────────────────────────────────────────
// Write output
// ──────────────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath   = resolve(__dirname, "../website/public/systembrett/systembrett-template.whiteboard");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(scene, null, 2), "utf8");

// Count unique tray piece groups
const pieceGroups = new Set(
  elements
    .flatMap(el => el.groupIds ?? [])
    .filter(g => g.startsWith("piece-"))
);

console.log(`✓ generated ${outPath}`);
console.log(`  ${elements.length} elements total · ${pieceGroups.size} tray pieces · 5 category headers`);
