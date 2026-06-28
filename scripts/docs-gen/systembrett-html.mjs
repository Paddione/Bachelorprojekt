// Helper module for systembrett element construction.
// Extracted from scripts/systembrett-generate.mjs.

export const BRASS        = "#d7b06a";
export const BRASS_2      = "#e8c884";
export const SAGE         = "#9bc0a8";
export const NEUTRAL      = "#cdd3d9";
export const DARK         = "#0b111c";
export const CONFLICT_RED = "#c46a5a";

let _seed = 1_000;
let _id   = 0;
export const nextSeed = () => ++_seed;
export const nextId   = (prefix = "el") => `${prefix}-${(++_id).toString().padStart(3, "0")}`;
export const now      = () => 1745492800000; // fixed timestamp keeps output deterministic

export const base = (prefix = "el") => ({
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

/** Category header text (special customData role). */
export function makeCategoryHeader(y, text) {
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
export function makeCircle({ groupId, cx, cy, r,
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
export function makeRect({ groupId, x, y, w, h,
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
export function makeDiamond({ groupId, cx, cy, size, fill, stroke }) {
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
export function makeLine({ groupId, x1, y1, x2, y2,
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
export function makeArrow({ groupId, x1, y1, x2, y2, stroke, strokeWidth }) {
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
export function makePolyline({ groupId, ox, oy, points, stroke, strokeWidth,
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
export function makeLabel({ groupId, x, y, text, fontSize = 16,
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
