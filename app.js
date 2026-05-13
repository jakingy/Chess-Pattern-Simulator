"use strict";

const DEFAULT_COLORS = [
  "#b54334",
  "#2f6f8f",
  "#3f7d45",
  "#d19a2e",
  "#7b5ab6",
  "#c65b86",
  "#52715c",
  "#1f2937",
  "#e07a38",
  "#4b8f8c",
  "#8a6f3d",
  "#7077a1",
  "#ad4e3c",
  "#658d3d",
  "#8f4f77",
  "#46617d",
];

const MAX_TURNS = 10000000;
const TURN_SLIDER_STEPS = 10000;
const MAX_RAY_DIRECTIONS = 4096;
const COORD_KEY_OFFSET = 10000000;
const COORD_KEY_STRIDE = 20000001;

const DEFAULT_SHAPES = {
  King: [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ],
  Queen: [
    [-1, 0, "infinite"],
    [1, 0, "infinite"],
    [0, -1, "infinite"],
    [0, 1, "infinite"],
    [-1, -1, "infinite"],
    [1, 1, "infinite"],
    [-1, 1, "infinite"],
    [1, -1, "infinite"],
  ],
  Rook: [
    [-1, 0, "infinite"],
    [1, 0, "infinite"],
    [0, -1, "infinite"],
    [0, 1, "infinite"],
  ],
  Bishop: [
    [-1, -1, "infinite"],
    [1, 1, "infinite"],
    [-1, 1, "infinite"],
    [1, -1, "infinite"],
  ],
  Knight: [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ],
  "Alfil - Elephant": [
    [-2, -2],
    [-2, 2],
    [2, -2],
    [2, 2],
  ],
  "Leaper - Dromedary": [
    [-3, 0],
    [3, 0],
    [0, -3],
    [0, 3],
  ],
  Antelope: [
    [-3, 4],
    [-4, 3],
    [3, 4],
    [4, 3],
    [-3, -4],
    [-4, -3],
    [3, -4],
    [4, -3],
  ],
  Dabbaba: [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ],
  Wazir: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  Zebra: [
    [-2, 3],
    [-3, 2],
    [2, 3],
    [3, 2],
    [-2, -3],
    [-3, -2],
    [2, -3],
    [3, -2],
  ],
  Ferz: [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ],
  PawnUp: [
    [-1, 1],
    [1, 1],
  ],
  PawnDown: [
    [-1, -1],
    [1, -1],
  ],
};

const els = {
  turnSlider: document.getElementById("turnSlider"),
  turnInput: document.getElementById("turnInput"),
  simulateButton: document.getElementById("simulateButton"),
  exportSettingsButton: document.getElementById("exportSettingsButton"),
  importSettingsFile: document.getElementById("importSettingsFile"),
  settingsMessage: document.getElementById("settingsMessage"),
  typeCount: document.getElementById("typeCount"),
  typeCountLabel: document.getElementById("typeCountLabel"),
  pieceTypeControls: document.getElementById("pieceTypeControls"),
  attackMatrix: document.getElementById("attackMatrix"),
  matrixDefaultButton: document.getElementById("matrixDefaultButton"),
  matrixAllButton: document.getElementById("matrixAllButton"),
  matrixClearButton: document.getElementById("matrixClearButton"),
  summaryLine: document.getElementById("summaryLine"),
  boardCanvas: document.getElementById("boardCanvas"),
  cellSize: document.getElementById("cellSize"),
  fitToSizeButton: document.getElementById("fitToSizeButton"),
  showLabels: document.getElementById("showLabels"),
  showAttacks: document.getElementById("showAttacks"),
  attackPreviewType: document.getElementById("attackPreviewType"),
  loadShapeSelect: document.getElementById("loadShapeSelect"),
  loadShapeButton: document.getElementById("loadShapeButton"),
  shapeName: document.getElementById("shapeName"),
  finiteMode: document.getElementById("finiteMode"),
  infiniteMode: document.getElementById("infiniteMode"),
  saveShapeButton: document.getElementById("saveShapeButton"),
  clearShapeButton: document.getElementById("clearShapeButton"),
  shapeCanvas: document.getElementById("shapeCanvas"),
  shapeJson: document.getElementById("shapeJson"),
  shapeMessage: document.getElementById("shapeMessage"),
};

const state = {
  shapes: loadShapes(),
  typeCount: 2,
  pieces: [],
  attackedBy: [],
  simulation: null,
  lastSimulationMs: 0,
  lastRenderMs: 0,
  lastSimulatorMode: "JS rays",
  wasmSimulator: null,
  wasmStatus: "unavailable",
  panX: 0,
  panY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panOriginX: 0,
  panOriginY: 0,
  editorMode: "finite",
  editorShape: structuredClone(DEFAULT_SHAPES.Knight),
};

function loadShapes() {
  try {
    const saved = JSON.parse(localStorage.getItem("spiralCustomShapes") || "{}");
    return { ...DEFAULT_SHAPES, ...saved };
  } catch {
    return { ...DEFAULT_SHAPES };
  }
}

function saveCustomShapes() {
  const custom = {};
  for (const [name, tuples] of Object.entries(state.shapes)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SHAPES, name)) {
      custom[name] = tuples;
    }
  }
  localStorage.setItem("spiralCustomShapes", JSON.stringify(custom));
}

function createSettingsSnapshot() {
  return {
    schema: "chess-pattern-visualiser-settings",
    version: 1,
    exportedAt: new Date().toISOString(),
    turns: clamp(Number(els.turnInput.value) || 0, 0, MAX_TURNS),
    typeCount: state.typeCount,
    pieces: structuredClone(state.pieces),
    attackedBy: structuredClone(state.attackedBy),
    shapes: Object.fromEntries(
      Object.entries(state.shapes).map(([name, shape]) => [name, structuredClone(shape)]),
    ),
    customShapes: Object.fromEntries(
      Object.entries(state.shapes)
        .filter(([name]) => !Object.prototype.hasOwnProperty.call(DEFAULT_SHAPES, name))
        .map(([name, shape]) => [name, structuredClone(shape)]),
    ),
    view: {
      zoomScale: Number(els.cellSize.value),
      panX: state.panX,
      panY: state.panY,
      showLabels: els.showLabels.checked,
      showAttacks: els.showAttacks.checked,
      attackPreviewType: Number(els.attackPreviewType.value) || 0,
    },
    editor: {
      mode: state.editorMode,
      shapeName: els.shapeName.value,
      shape: structuredClone(state.editorShape),
    },
  };
}

function exportSettings() {
  const snapshot = createSettingsSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  link.href = url;
  link.download = `chess-pattern-settings-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  els.settingsMessage.textContent = "Exported current settings as JSON.";
}

function importSettings(settings) {
  if (!settings || settings.schema !== "chess-pattern-visualiser-settings") {
    throw new Error("This does not look like a Chess Pattern Visualiser settings file.");
  }

  const sourceShapes = settings.shapes || settings.customShapes || {};
  const importedShapes = {};
  for (const [name, shape] of Object.entries(sourceShapes)) {
    const cleaned = normaliseShape(shape);
    if (name.trim() && cleaned.length > 0) importedShapes[name] = cleaned;
  }
  state.shapes = { ...DEFAULT_SHAPES, ...importedShapes };
  saveCustomShapes();

  const nextCount = clamp(Number(settings.typeCount) || 1, 1, 16);
  state.typeCount = nextCount;
  state.pieces = Array.from({ length: nextCount }, (_, index) => {
    const imported = settings.pieces?.[index] || {};
    const shapeName = state.shapes[imported.shapeName] ? imported.shapeName : Object.keys(state.shapes)[0];
    return {
      color: /^#[0-9a-f]{6}$/i.test(imported.color || "") ? imported.color : DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      shapeName,
    };
  });
  state.attackedBy = Array.from({ length: nextCount }, (_, row) =>
    Array.from({ length: nextCount }, (_, col) => Boolean(settings.attackedBy?.[row]?.[col] ?? (row !== col))),
  );

  els.turnInput.value = String(clamp(Number(settings.turns) || 0, 0, MAX_TURNS));
  els.typeCount.value = String(nextCount);
  els.cellSize.value = String(clamp(Number(settings.view?.zoomScale ?? settings.view?.cellSize) || 100, 10, 6400));
  state.panX = Number(settings.view?.panX) || 0;
  state.panY = Number(settings.view?.panY) || 0;
  els.showLabels.checked = settings.view?.showLabels ?? true;
  els.showAttacks.checked = settings.view?.showAttacks ?? false;
  els.attackPreviewType.value = String(clamp(Number(settings.view?.attackPreviewType) || 0, 0, nextCount - 1));

  state.editorMode = settings.editor?.mode === "infinite" ? "infinite" : "finite";
  state.editorShape = normaliseShape(settings.editor?.shape || DEFAULT_SHAPES.Knight);
  els.shapeName.value = settings.editor?.shapeName || "";
  setEditorMode(state.editorMode);
  syncShapeText();
  renderAllControls();
  runSimulation();
  els.settingsMessage.textContent = "Imported settings successfully.";
}

function initialiseState() {
  state.pieces = Array.from({ length: state.typeCount }, (_, index) => ({
    color: ["#111111", "#d7352a"][index] || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    shapeName: "Knight",
  }));
  state.attackedBy = makeDefaultAttackMatrix(state.typeCount);
  syncShapeText();
  renderAllControls();
  initialiseWasmSimulator();
  runSimulation();
}

function initialiseWasmSimulator() {
  if (!window.WasmSimulator) {
    state.wasmStatus = "loader missing";
    els.settingsMessage.textContent = "WASM loader script was not found. Using JS simulator.";
    return;
  }
  if (location.protocol === "file:") {
    state.wasmStatus = "blocked on file://";
    els.settingsMessage.textContent =
      "WASM is built, but file:// pages cannot reliably fetch wasm_sim.wasm. Serve with python -m http.server 8765 and open http://127.0.0.1:8765/.";
    return;
  }
  state.wasmStatus = "loading";
  els.settingsMessage.textContent = "Loading WASM simulator...";
  window.WasmSimulator.load()
    .then((simulator) => {
      state.wasmSimulator = simulator;
      state.wasmStatus = "ready";
      els.settingsMessage.textContent = "WASM simulator loaded. Re-running current simulation with WASM.";
      runSimulation();
    })
    .catch((error) => {
      state.wasmStatus = "unavailable";
      els.settingsMessage.textContent = `WASM simulator unavailable: ${error.message}. Using JS simulator.`;
      updateSummaryLine();
    });
}

function makeDefaultAttackMatrix(size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => row !== col),
  );
}

function spiralToCoord(n) {
  if (n === 0) return { x: 0, y: 0 };
  const ring = Math.ceil((Math.sqrt(n + 1) - 1) / 2);
  const side = ring * 2;
  const max = (side + 1) * (side + 1) - 1;
  const offset = max - n;

  if (offset < side) return { x: ring - offset, y: -ring };
  if (offset < side * 2) return { x: -ring, y: -ring + (offset - side) };
  if (offset < side * 3) return { x: -ring + (offset - side * 2), y: ring };
  return { x: ring, y: ring - (offset - side * 3) };
}

function coordToSpiral(x, y) {
  if (x === 0 && y === 0) return 0;
  const ring = Math.max(Math.abs(x), Math.abs(y));
  const side = ring * 2;
  const max = (side + 1) * (side + 1) - 1;
  if (y === -ring) return max - (ring - x);
  if (x === -ring) return max - side - (y + ring);
  if (y === ring) return max - side * 2 - (x + ring);
  return max - side * 3 - (ring - y);
}

function coordKey(x, y) {
  if (
    x >= -COORD_KEY_OFFSET &&
    x <= COORD_KEY_OFFSET &&
    y >= -COORD_KEY_OFFSET &&
    y <= COORD_KEY_OFFSET
  ) {
    return (x + COORD_KEY_OFFSET) * COORD_KEY_STRIDE + y + COORD_KEY_OFFSET;
  }
  return `${x},${y}`;
}

function turnsToSliderValue(turns) {
  const clampedTurns = clamp(turns, 0, MAX_TURNS);
  const ratio = Math.log(clampedTurns + 1) / Math.log(MAX_TURNS + 1);
  return Math.round(ratio * TURN_SLIDER_STEPS);
}

function sliderValueToTurns(value) {
  const ratio = clamp(Number(value) || 0, 0, TURN_SLIDER_STEPS) / TURN_SLIDER_STEPS;
  return Math.round(Math.exp(Math.log(MAX_TURNS + 1) * ratio) - 1);
}

function hexToRgb(hex) {
  const value = Number.parseInt(String(hex).replace("#", ""), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function typeBit(typeIndex) {
  return 1 << typeIndex;
}

function maskFromMatrixRow(row) {
  let mask = 0;
  for (let index = 0; index < row.length; index += 1) {
    if (row[index]) mask |= typeBit(index);
  }
  return mask;
}

function normaliseTuple(tuple) {
  if (!Array.isArray(tuple) || tuple.length < 2) return null;
  const dx = Number(tuple[0]);
  const dy = Number(tuple[1]);
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || (dx === 0 && dy === 0)) {
    return null;
  }
  return tuple[2] === "infinite" ? [dx, dy, "infinite"] : [dx, dy];
}

function normaliseShape(shape) {
  const seen = new Set();
  const output = [];
  if (!Array.isArray(shape)) return output;
  for (const tuple of shape) {
    const normalised = normaliseTuple(tuple);
    if (!normalised) continue;
    const key = normalised.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalised);
  }
  return output;
}

function selectedShapesHaveInfiniteRays(pieces, shapes) {
  for (const piece of pieces) {
    const shape = shapes[piece.shapeName] || [];
    for (const tuple of shape) {
      if (tuple[2] === "infinite") return true;
    }
  }
  return false;
}

class SpiralSimulator {
  constructor(config) {
    this.turns = config.turns;
    this.pieces = config.pieces;
    this.shapes = config.shapes;
    this.attackMasks = config.attackedBy.map(maskFromMatrixRow);
    this.occupiedLabels = new Uint8Array(1024);
    this.occupiedCoords = new Map();
    this.pieceXs = new Int32Array(1024);
    this.pieceYs = new Int32Array(1024);
    this.pieceTypes = new Uint8Array(1024);
    this.attackedMasks = new Uint32Array(1024);
    this.pendingRayFronts = [];
    this.raySeenMasks = [];
    this.directionIds = new Map();
    this.directionCount = 0;
    this.cursors = Array.from({ length: this.pieces.length }, () => 0);
    this.placementCount = 0;
    this.maxKnownLabel = 0;
    this.maxPlacedLabel = 0;
    this.maxAbsCoord = 0;
    this.searchSteps = 0;
    this.warning = "";
    this.registerRayDirections();
  }

  run() {
    for (let turn = 0; turn < this.turns; turn += 1) {
      const type = turn % this.pieces.length;
      const label = this.findPlacement(type);
      if (label === null) {
        this.warning = `Stopped after ${turn} turns: search safety limit reached.`;
        break;
      }
      this.place(label, type, turn);
    }
    return {
      occupiedLabels: this.occupiedLabels,
      occupiedCoords: this.occupiedCoords,
      pieceXs: this.pieceXs,
      pieceYs: this.pieceYs,
      pieceTypes: this.pieceTypes,
      attackedMasks: this.attackedMasks,
      placementCount: this.placementCount,
      maxKnownLabel: this.maxKnownLabel,
      maxPlacedLabel: this.maxPlacedLabel,
      maxAbsCoord: this.maxAbsCoord,
      searchSteps: this.searchSteps,
      warning: this.warning,
    };
  }

  findPlacement(type) {
    const blockers = this.attackMasks[type];
    let label = this.cursors[type];
    const safetyLimit = Math.max(200000, this.turns * this.pieces.length * 600);

    while (label <= safetyLimit) {
      this.ensureKnown(label);
      const occupied = this.occupiedLabels[label] !== 0;
      const attacked = this.attackedMasks[label] & blockers;
      this.searchSteps += 1;
      if (!occupied && attacked === 0) {
        this.cursors[type] = label + 1;
        return label;
      }
      label += 1;
    }
    return null;
  }

  place(label, type, turn) {
    const coord = spiralToCoord(label);
    this.ensureStorage(label);
    this.ensurePieceStorage(this.placementCount);
    this.occupiedLabels[label] = type + 1;
    this.pieceXs[this.placementCount] = coord.x;
    this.pieceYs[this.placementCount] = coord.y;
    this.pieceTypes[this.placementCount] = type;
    this.occupiedCoords.set(coordKey(coord.x, coord.y), this.placementCount);
    this.placementCount += 1;
    this.maxPlacedLabel = Math.max(this.maxPlacedLabel, label);
    this.maxAbsCoord = Math.max(this.maxAbsCoord, Math.abs(coord.x), Math.abs(coord.y));

    const shape = this.shapes[this.pieces[type].shapeName] || [];
    const mask = typeBit(type);
    for (const tuple of shape) {
      const [dx, dy, infinite] = tuple;
      if (infinite === "infinite") {
        this.propagateRayToLimit(
          { x: coord.x + dx, y: coord.y + dy, dx, dy, mask, directionId: this.getDirectionId(dx, dy) },
          this.maxKnownLabel,
        );
      } else {
        this.markAttacked(coord.x + dx, coord.y + dy, mask);
      }
    }
  }

  ensureKnown(label) {
    if (label <= this.maxKnownLabel) return;
    this.ensureStorage(label);
    while (this.maxKnownLabel < label) {
      this.maxKnownLabel += 1;
      const fronts = this.pendingRayFronts[this.maxKnownLabel];
      if (!fronts) continue;
      this.pendingRayFronts[this.maxKnownLabel] = undefined;
      for (const front of fronts.values()) {
        this.propagateRayToLimit(front, this.maxKnownLabel);
      }
    }
  }

  propagateRayToLimit(front, limit) {
    let { x, y, dx, dy, mask, directionId } = front;
    let label = coordToSpiral(x, y);
    let guard = 0;

    while (label <= limit && guard < 1000000) {
      const newMask = this.markRaySeen(label, directionId, mask);
      if (newMask === 0) return;
      this.markLabelAttacked(label, newMask);
      mask = newMask;
      x += dx;
      y += dy;
      label = coordToSpiral(x, y);
      guard += 1;
    }

    this.scheduleRayFront(label, { x, y, dx, dy, mask, directionId });
  }

  markRaySeen(label, directionId, mask) {
    this.ensureRaySeenStorage(directionId, label);
    const seenByLabel = this.raySeenMasks[directionId];
    const seen = seenByLabel[label];
    const newMask = mask & ~seen;
    if (newMask !== 0) seenByLabel[label] = seen | newMask;
    return newMask;
  }

  ensureRaySeenStorage(directionId, label) {
    let seenByLabel = this.raySeenMasks[directionId];
    if (!seenByLabel) {
      let length = 1024;
      while (length <= label) length *= 2;
      this.raySeenMasks[directionId] = new Uint32Array(length);
      return;
    }
    if (label < seenByLabel.length) return;
    let nextLength = seenByLabel.length;
    while (nextLength <= label) nextLength *= 2;
    const nextSeen = new Uint32Array(nextLength);
    nextSeen.set(seenByLabel);
    this.raySeenMasks[directionId] = nextSeen;
  }

  scheduleRayFront(label, front) {
    let byFront = this.pendingRayFronts[label];
    if (!byFront) {
      byFront = new Map();
      this.pendingRayFronts[label] = byFront;
    }
    const key = `${front.x},${front.y},${front.directionId}`;
    const existing = byFront.get(key);
    if (existing) {
      existing.mask |= front.mask;
    } else {
      byFront.set(key, front);
    }
  }

  markAttacked(x, y, mask) {
    this.markLabelAttacked(coordToSpiral(x, y), mask);
  }

  markLabelAttacked(label, mask) {
    this.ensureStorage(label);
    this.attackedMasks[label] |= mask;
  }

  registerRayDirections() {
    for (const piece of this.pieces) {
      const shape = this.shapes[piece.shapeName] || [];
      for (const [dx, dy, infinite] of shape) {
        if (infinite === "infinite") this.getDirectionId(dx, dy);
      }
    }
  }

  getDirectionId(dx, dy) {
    const key = `${dx},${dy}`;
    let directionId = this.directionIds.get(key);
    if (directionId !== undefined) return directionId;
    directionId = this.directionCount;
    if (directionId >= MAX_RAY_DIRECTIONS) {
      throw new Error(`Too many unique infinite ray directions; maximum is ${MAX_RAY_DIRECTIONS}.`);
    }
    this.directionIds.set(key, directionId);
    this.directionCount += 1;
    return directionId;
  }

  ensureStorage(label) {
    if (label < this.attackedMasks.length) return;
    let nextLength = this.attackedMasks.length;
    while (nextLength <= label) nextLength *= 2;

    const nextAttacked = new Uint32Array(nextLength);
    nextAttacked.set(this.attackedMasks);
    this.attackedMasks = nextAttacked;

    const nextOccupied = new Uint8Array(nextLength);
    nextOccupied.set(this.occupiedLabels);
    this.occupiedLabels = nextOccupied;
  }

  ensurePieceStorage(index) {
    if (index < this.pieceXs.length) return;
    let nextLength = this.pieceXs.length;
    while (nextLength <= index) nextLength *= 2;

    const nextXs = new Int32Array(nextLength);
    nextXs.set(this.pieceXs);
    this.pieceXs = nextXs;

    const nextYs = new Int32Array(nextLength);
    nextYs.set(this.pieceYs);
    this.pieceYs = nextYs;

    const nextTypes = new Uint8Array(nextLength);
    nextTypes.set(this.pieceTypes);
    this.pieceTypes = nextTypes;
  }
}

class FiniteOnlySimulator {
  constructor(config) {
    this.turns = config.turns;
    this.pieces = config.pieces;
    this.shapes = config.shapes;
    this.attackMasks = config.attackedBy.map(maskFromMatrixRow);
    this.occupiedLabels = new Uint8Array(1024);
    this.occupiedCoords = new Map();
    this.pieceXs = new Int32Array(1024);
    this.pieceYs = new Int32Array(1024);
    this.pieceTypes = new Uint8Array(1024);
    this.attackedMasks = new Uint32Array(1024);
    this.cursors = Array.from({ length: this.pieces.length }, () => 0);
    this.placementCount = 0;
    this.maxKnownLabel = 0;
    this.maxPlacedLabel = 0;
    this.maxAbsCoord = 0;
    this.searchSteps = 0;
    this.warning = "";
    this.finiteOffsets = this.pieces.map((piece) => {
      const offsets = [];
      const shape = this.shapes[piece.shapeName] || [];
      for (const [dx, dy, infinite] of shape) {
        if (infinite !== "infinite") offsets.push(dx, dy);
      }
      return offsets;
    });
  }

  run() {
    for (let turn = 0; turn < this.turns; turn += 1) {
      const type = turn % this.pieces.length;
      const label = this.findPlacement(type);
      if (label === null) {
        this.warning = `Stopped after ${turn} turns: search safety limit reached.`;
        break;
      }
      this.place(label, type);
    }
    return {
      occupiedLabels: this.occupiedLabels,
      occupiedCoords: this.occupiedCoords,
      pieceXs: this.pieceXs,
      pieceYs: this.pieceYs,
      pieceTypes: this.pieceTypes,
      attackedMasks: this.attackedMasks,
      placementCount: this.placementCount,
      maxKnownLabel: this.maxKnownLabel,
      maxPlacedLabel: this.maxPlacedLabel,
      maxAbsCoord: this.maxAbsCoord,
      searchSteps: this.searchSteps,
      warning: this.warning,
    };
  }

  findPlacement(type) {
    const blockers = this.attackMasks[type];
    let label = this.cursors[type];
    const safetyLimit = Math.max(200000, this.turns * this.pieces.length * 600);

    while (label <= safetyLimit) {
      if (label >= this.attackedMasks.length) this.ensureStorage(label);
      const occupied = this.occupiedLabels[label] !== 0;
      const attacked = this.attackedMasks[label] & blockers;
      this.searchSteps += 1;
      if (!occupied && attacked === 0) {
        this.cursors[type] = label + 1;
        this.maxKnownLabel = Math.max(this.maxKnownLabel, label);
        return label;
      }
      label += 1;
    }
    return null;
  }

  place(label, type) {
    const coord = spiralToCoord(label);
    this.ensureStorage(label);
    this.ensurePieceStorage(this.placementCount);
    this.occupiedLabels[label] = type + 1;
    this.pieceXs[this.placementCount] = coord.x;
    this.pieceYs[this.placementCount] = coord.y;
    this.pieceTypes[this.placementCount] = type;
    this.occupiedCoords.set(coordKey(coord.x, coord.y), this.placementCount);
    this.placementCount += 1;
    this.maxPlacedLabel = Math.max(this.maxPlacedLabel, label);
    this.maxAbsCoord = Math.max(this.maxAbsCoord, Math.abs(coord.x), Math.abs(coord.y));

    const mask = typeBit(type);
    const offsets = this.finiteOffsets[type];
    for (let index = 0; index < offsets.length; index += 2) {
      this.markLabelAttacked(coordToSpiral(coord.x + offsets[index], coord.y + offsets[index + 1]), mask);
    }
  }

  markLabelAttacked(label, mask) {
    this.ensureStorage(label);
    this.attackedMasks[label] |= mask;
  }

  ensureStorage(label) {
    if (label < this.attackedMasks.length) return;
    let nextLength = this.attackedMasks.length;
    while (nextLength <= label) nextLength *= 2;

    const nextAttacked = new Uint32Array(nextLength);
    nextAttacked.set(this.attackedMasks);
    this.attackedMasks = nextAttacked;

    const nextOccupied = new Uint8Array(nextLength);
    nextOccupied.set(this.occupiedLabels);
    this.occupiedLabels = nextOccupied;
  }

  ensurePieceStorage(index) {
    if (index < this.pieceXs.length) return;
    let nextLength = this.pieceXs.length;
    while (nextLength <= index) nextLength *= 2;

    const nextXs = new Int32Array(nextLength);
    nextXs.set(this.pieceXs);
    this.pieceXs = nextXs;

    const nextYs = new Int32Array(nextLength);
    nextYs.set(this.pieceYs);
    this.pieceYs = nextYs;

    const nextTypes = new Uint8Array(nextLength);
    nextTypes.set(this.pieceTypes);
    this.pieceTypes = nextTypes;
  }
}

function renderAllControls() {
  renderPieceControls();
  renderMatrix();
  renderPreviewTypeSelect();
  renderLoadShapeSelect();
}

function renderPieceControls() {
  els.typeCount.value = String(state.typeCount);
  els.typeCountLabel.textContent = `${state.typeCount} ${state.typeCount === 1 ? "type" : "types"}`;
  els.pieceTypeControls.innerHTML = "";
  const shapeOptions = Object.keys(state.shapes)
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");

  state.pieces.forEach((piece, index) => {
    const card = document.createElement("div");
    card.className = "piece-card";
    card.innerHTML = `
      <div class="piece-token" style="background: ${piece.color}">${index}</div>
      <div class="piece-fields">
        <div>
          <label for="pieceColor${index}">Colour</label>
          <input id="pieceColor${index}" type="color" value="${piece.color}" data-piece-color="${index}" />
        </div>
        <div>
          <label for="pieceShape${index}">Attack shape</label>
          <select id="pieceShape${index}" data-piece-shape="${index}">
            ${shapeOptions}
          </select>
        </div>
      </div>
    `;
    els.pieceTypeControls.appendChild(card);
    card.querySelector("select").value = piece.shapeName;
  });
}

function renderMatrix() {
  const table = document.createElement("table");
  table.className = "attack-matrix";
  const headCells = state.pieces
    .map((_, index) => `<th title="Attacker type ${index}">A${index}</th>`)
    .join("");
  table.innerHTML = `<thead><tr><th></th>${headCells}</tr></thead>`;
  const tbody = document.createElement("tbody");
  state.attackedBy.forEach((row, target) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th title="Placed target type ${target}">T${target}</th>`;
    row.forEach((enabled, attacker) => {
      const td = document.createElement("td");
      td.innerHTML = `<input type="checkbox" ${enabled ? "checked" : ""} data-target="${target}" data-attacker="${attacker}" />`;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  els.attackMatrix.innerHTML = "";
  els.attackMatrix.appendChild(table);
}

function renderPreviewTypeSelect() {
  const value = els.attackPreviewType.value || "0";
  els.attackPreviewType.innerHTML = state.pieces
    .map((_, index) => `<option value="${index}">Type ${index}</option>`)
    .join("");
  els.attackPreviewType.value = Number(value) < state.typeCount ? value : "0";
}

function renderLoadShapeSelect() {
  const current = els.loadShapeSelect.value;
  const names = Object.keys(state.shapes);
  els.loadShapeSelect.innerHTML = names
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  els.loadShapeSelect.value = names.includes(current) ? current : names[0] || "";
}

function resizeTypeCount(nextCount) {
  const oldPieces = state.pieces;
  state.typeCount = nextCount;
  state.pieces = Array.from({ length: nextCount }, (_, index) =>
    oldPieces[index] || {
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      shapeName: Object.keys(state.shapes)[index % Object.keys(state.shapes).length],
    },
  );

  const oldMatrix = state.attackedBy;
  state.attackedBy = Array.from({ length: nextCount }, (_, row) =>
    Array.from({ length: nextCount }, (_, col) => oldMatrix[row]?.[col] ?? (row !== col)),
  );
  renderAllControls();
  runSimulation();
}

function runSimulation() {
  const turns = clamp(Number(els.turnInput.value) || 0, 0, MAX_TURNS);
  els.turnInput.value = String(turns);
  els.turnSlider.value = String(turnsToSliderValue(turns));
  const startedAt = performance.now();
  const config = {
    turns,
    pieces: state.pieces,
    attackedBy: state.attackedBy,
    shapes: state.shapes,
  };
  try {
    if (state.wasmSimulator) {
      state.simulation = state.wasmSimulator.run(config);
      state.lastSimulatorMode = "WASM";
    } else {
      state.simulation = runJavaScriptSimulation(config);
    }
  } catch (error) {
    const wasmHint =
      location.protocol === "file:"
        ? " Open the app through http://127.0.0.1:8765/ so WASM can run."
        : "";
    const wasmPrefix = state.wasmSimulator ? "WASM failed: " : "Simulation failed: ";
    if (state.wasmSimulator) {
      state.wasmSimulator = null;
      state.wasmStatus = "failed";
    }
    state.lastSimulationMs = performance.now() - startedAt;
    state.simulation =
      state.simulation ||
      createEmptySimulation(`${wasmPrefix}${error.message}.${wasmHint}`);
    state.simulation.warning = `${wasmPrefix}${error.message}.${wasmHint}`;
    els.settingsMessage.textContent = state.simulation.warning;
    drawBoard();
    updateSummaryLine();
    return;
  }
  state.lastSimulationMs = performance.now() - startedAt;
  drawBoard();
  updateSummaryLine();
}

function createEmptySimulation(warning = "") {
  return {
    occupiedLabels: new Uint8Array(0),
    occupiedCoords: new Map(),
    pieceXs: new Int32Array(0),
    pieceYs: new Int32Array(0),
    pieceTypes: new Uint8Array(0),
    attackedMasks: new Uint32Array(0),
    placementCount: 0,
    maxKnownLabel: 0,
    maxPlacedLabel: 0,
    maxAbsCoord: 0,
    searchSteps: 0,
    warning,
  };
}

function runJavaScriptSimulation(config) {
  const hasInfiniteRays = selectedShapesHaveInfiniteRays(config.pieces, config.shapes);
  const Simulator = hasInfiniteRays ? SpiralSimulator : FiniteOnlySimulator;
  state.lastSimulatorMode = hasInfiniteRays ? "JS rays" : "JS finite fast path";
  return new Simulator(config).run();
}

function updateSummaryLine() {
  if (!state.simulation) return;
  const placed = state.simulation.placementCount;
  const maxLabel = state.simulation.maxPlacedLabel;
  const searchSteps = state.simulation.searchSteps.toLocaleString();
  const extent = state.simulation.maxAbsCoord.toLocaleString();
  const simTime = formatDuration(state.lastSimulationMs);
  const renderTime = formatDuration(state.lastRenderMs);
  const wasmNote = state.wasmSimulator ? "" : ` WASM: ${state.wasmStatus}.`;
  els.summaryLine.textContent = state.simulation.warning
    ? state.simulation.warning
    : `${placed.toLocaleString()} pieces placed. Highest occupied spiral label: ${maxLabel.toLocaleString()}. Extent: +/-${extent}. Search checks: ${searchSteps}. ${state.lastSimulatorMode}.${wasmNote} Sim: ${simTime}. Render: ${renderTime}.`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function drawBoard() {
  const startedAt = performance.now();
  const canvas = els.boardCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = setCanvasResolution(canvas);
  ctx.clearRect(0, 0, width, height);

  const simulation = state.simulation;
  const maxCoord = Math.max(4, simulation?.maxAbsCoord || 4);
  const zoomScale = Number(els.cellSize.value) / 100;
  const fitCell = Math.max(0.15, Math.min(64, Math.min(width, height) / (maxCoord * 2 + 5)));
  const cell = fitCell * zoomScale;
  const originX = width / 2 + state.panX;
  const originY = height / 2 + state.panY;
  const bounds = visibleBoardBounds(width, height, cell, originX, originY);
  const showLabels = els.showLabels.checked && cell >= 18;
  const previewType = Number(els.attackPreviewType.value) || 0;
  const attackMask = typeBit(previewType);

  ctx.fillStyle = "#fff9e9";
  ctx.fillRect(0, 0, width, height);

  if (cell >= 4) {
    drawBoardGrid(ctx, { cell, bounds, originX, originY, showLabels, attackMask });
    drawVisiblePieces(ctx, { cell, bounds, originX, originY });
  } else {
    drawExtentAxes(ctx, { width, height, originX, originY });
    drawAllPiecesAsPixels(ctx, { width, height, cell, bounds, originX, originY });
  }
  state.lastRenderMs = performance.now() - startedAt;
  updateSummaryLine();
}

function visibleBoardBounds(width, height, cell, originX, originY) {
  return {
    minX: Math.floor((0 - originX) / cell) - 1,
    maxX: Math.ceil((width - originX) / cell) + 1,
    minY: Math.floor((originY - height) / cell) - 1,
    maxY: Math.ceil(originY / cell) + 1,
  };
}

function drawBoardGrid(ctx, view) {
  const { cell, bounds, originX, originY, showLabels, attackMask } = view;
  const simulation = state.simulation;
  for (let y = bounds.maxY; y >= bounds.minY; y -= 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const px = originX + x * cell;
      const py = originY - y * cell;
      const label = coordToSpiral(x, y);
      const isOrigin = x === 0 && y === 0;
      const attacked =
        els.showAttacks.checked && (((simulation?.attackedMasks[label] || 0) & attackMask) !== 0);
      ctx.fillStyle = isOrigin ? "#f2d390" : attacked ? "rgba(180, 95, 67, 0.16)" : "#fffdf4";
      ctx.fillRect(px - cell / 2, py - cell / 2, cell, cell);
      ctx.strokeStyle = "rgba(23, 32, 27, 0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px - cell / 2, py - cell / 2, cell, cell);

      if (showLabels) {
        ctx.fillStyle = "rgba(23, 32, 27, 0.46)";
        ctx.font = `${Math.max(9, cell * 0.22)}px Trebuchet MS`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(label), px - cell / 2 + 4, py - cell / 2 + 4);
      }
    }
  }
}

function drawVisiblePieces(ctx, view) {
  const { cell, bounds, originX, originY } = view;
  const simulation = state.simulation;
  const occupiedCoords = simulation?.occupiedCoords || new Map();
  for (let y = bounds.maxY; y >= bounds.minY; y -= 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const index = occupiedCoords.get(coordKey(x, y));
      if (index === undefined) continue;
      drawPieceType(ctx, simulation.pieceTypes[index], originX + x * cell, originY - y * cell, cell);
    }
  }
}

function drawAllPiecesAsPixels(ctx, view) {
  const { width, cell, bounds, originX, originY } = view;
  const pixelRatio = ctx.canvas.width / width;
  const pixelWidth = ctx.canvas.width;
  const pixelHeight = ctx.canvas.height;
  const image = ctx.getImageData(0, 0, pixelWidth, pixelHeight);
  const data = image.data;
  const size = Math.max(1, Math.round(cell * pixelRatio));
  const half = Math.floor(size / 2);
  const colors = state.pieces.map((piece) => hexToRgb(piece.color));
  const simulation = state.simulation;
  if (!simulation) return;
  for (let piece = 0; piece < simulation.placementCount; piece += 1) {
    const xCoord = simulation.pieceXs[piece];
    const yCoord = simulation.pieceYs[piece];
    if (
      xCoord < bounds.minX ||
      xCoord > bounds.maxX ||
      yCoord < bounds.minY ||
      yCoord > bounds.maxY
    ) {
      continue;
    }
    const px = Math.round((originX + xCoord * cell) * pixelRatio);
    const py = Math.round((originY - yCoord * cell) * pixelRatio);
    const color = colors[simulation.pieceTypes[piece]];
    for (let y = py - half; y < py - half + size; y += 1) {
      if (y < 0 || y >= pixelHeight) continue;
      for (let x = px - half; x < px - half + size; x += 1) {
        if (x < 0 || x >= pixelWidth) continue;
        const index = (y * pixelWidth + x) * 4;
        data[index] = color.r;
        data[index + 1] = color.g;
        data[index + 2] = color.b;
        data[index + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function drawExtentAxes(ctx, view) {
  const { width, height, originX, originY } = view;
  ctx.strokeStyle = "rgba(23, 32, 27, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, originY);
  ctx.lineTo(width, originY);
  ctx.moveTo(originX, 0);
  ctx.lineTo(originX, height);
  ctx.stroke();
}

function drawPieceType(ctx, type, px, py, cell) {
  const color = state.pieces[type].color;
  const radius = cell * 0.49;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = cell >= 18 ? "rgba(0, 0, 0, 0.2)" : "transparent";
  ctx.shadowBlur = cell >= 18 ? 5 : 0;
  ctx.shadowOffsetY = cell >= 18 ? 2 : 0;
  ctx.fill();
  ctx.shadowColor = "transparent";
  if (cell >= 16) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = Math.max(1, cell * 0.035);
    ctx.stroke();
    ctx.fillStyle = "#fffaf0";
    ctx.font = `900 ${Math.max(10, cell * 0.3)}px Trebuchet MS`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(type), px, py + 0.5);
  }
}

function boardCellMetrics() {
  const rect = els.boardCanvas.getBoundingClientRect();
  const simulation = state.simulation;
  const maxCoord = Math.max(4, simulation?.maxAbsCoord || 4);
  const zoomScale = Number(els.cellSize.value) / 100;
  const fitCell = Math.max(0.15, Math.min(64, Math.min(rect.width, rect.height) / (maxCoord * 2 + 5)));
  return { rect, cell: fitCell * zoomScale };
}

function zoomBoardAt(clientX, clientY, nextZoom) {
  const { rect, cell: oldCell } = boardCellMetrics();
  const oldZoom = Number(els.cellSize.value);
  const clampedZoom = clamp(nextZoom, Number(els.cellSize.min), Number(els.cellSize.max));
  if (clampedZoom === oldZoom) return;

  const boardX = clientX - rect.left;
  const boardY = clientY - rect.top;
  const oldOriginX = rect.width / 2 + state.panX;
  const oldOriginY = rect.height / 2 + state.panY;
  const worldX = (boardX - oldOriginX) / oldCell;
  const worldY = (oldOriginY - boardY) / oldCell;

  els.cellSize.value = String(Math.round(clampedZoom));
  const { cell: newCell } = boardCellMetrics();
  state.panX = boardX - rect.width / 2 - worldX * newCell;
  state.panY = boardY - rect.height / 2 + worldY * newCell;
  drawBoard();
}

function drawShapeEditor() {
  const canvas = els.shapeCanvas;
  const ctx = canvas.getContext("2d");
  const { width, height } = setCanvasResolution(canvas);
  const radius = 5;
  const cell = Math.floor(Math.min(width, height) / (radius * 2 + 1));
  const originX = width / 2;
  const originY = height / 2;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff9e9";
  ctx.fillRect(0, 0, width, height);

  for (let y = radius; y >= -radius; y -= 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const px = originX + x * cell;
      const py = originY - y * cell;
      ctx.fillStyle = x === 0 && y === 0 ? "#f2d390" : "#fffdf4";
      ctx.fillRect(px - cell / 2, py - cell / 2, cell, cell);
      ctx.strokeStyle = "rgba(23, 32, 27, 0.18)";
      ctx.strokeRect(px - cell / 2, py - cell / 2, cell, cell);
    }
  }

  for (const [dx, dy, infinite] of state.editorShape) {
    if (infinite === "infinite") {
      ctx.strokeStyle = "rgba(180, 95, 67, 0.72)";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      const scale = radius / Math.max(Math.abs(dx), Math.abs(dy), 1);
      ctx.lineTo(originX + dx * scale * cell, originY - dy * scale * cell);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const [dx, dy, infinite] of state.editorShape) {
    if (infinite !== "infinite") continue;
    for (let multiplier = 1; ; multiplier += 1) {
      const x = dx * multiplier;
      const y = dy * multiplier;
      if (Math.abs(x) > radius || Math.abs(y) > radius) break;
      const px = originX + x * cell;
      const py = originY - y * cell;
      ctx.fillStyle = multiplier === 1 ? "rgba(180, 95, 67, 0.82)" : "rgba(180, 95, 67, 0.26)";
      ctx.fillRect(px - cell * 0.42, py - cell * 0.42, cell * 0.84, cell * 0.84);
      ctx.strokeStyle = multiplier === 1 ? "#b45f43" : "rgba(180, 95, 67, 0.5)";
      ctx.lineWidth = multiplier === 1 ? 2 : 1;
      ctx.strokeRect(px - cell * 0.42, py - cell * 0.42, cell * 0.84, cell * 0.84);
    }
  }

  for (const [dx, dy, infinite] of state.editorShape) {
    if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
    const px = originX + dx * cell;
    const py = originY - dy * cell;
    ctx.beginPath();
    if (infinite === "infinite") {
      ctx.rect(px - cell * 0.28, py - cell * 0.28, cell * 0.56, cell * 0.56);
      ctx.fillStyle = "#b45f43";
    } else {
      ctx.arc(px, py, cell * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = "#334f3c";
    }
    ctx.fill();
  }

  ctx.fillStyle = "#17201b";
  ctx.font = "900 15px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("piece", originX, originY);
}

function syncShapeText() {
  els.shapeJson.value = JSON.stringify(state.editorShape, null, 2);
  drawShapeEditor();
}

function parseShapeText() {
  try {
    const parsed = normaliseShape(JSON.parse(els.shapeJson.value));
    state.editorShape = parsed;
    els.shapeMessage.textContent = `${parsed.length} attack offsets in editor.`;
    drawShapeEditor();
    return parsed;
  } catch (error) {
    els.shapeMessage.textContent = `Invalid shape JSON: ${error.message}`;
    return null;
  }
}

function toggleEditorOffset(dx, dy) {
  if (dx === 0 && dy === 0) return;
  const tuple = state.editorMode === "infinite" ? [dx, dy, "infinite"] : [dx, dy];
  const key = tuple.join(",");
  const index = state.editorShape.findIndex((item) => item.join(",") === key);
  if (index >= 0) {
    state.editorShape.splice(index, 1);
  } else {
    state.editorShape.push(tuple);
  }
  state.editorShape = normaliseShape(state.editorShape);
  syncShapeText();
}

function shapeCanvasOffset(event) {
  const rect = els.shapeCanvas.getBoundingClientRect();
  const radius = 5;
  const cell = Math.min(rect.width, rect.height) / (radius * 2 + 1);
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const dx = Math.round((event.clientX - originX) / cell);
  const dy = Math.round((originY - event.clientY) / cell);
  if (Math.abs(dx) > radius || Math.abs(dy) > radius) return null;
  return { dx, dy };
}

function setCanvasResolution(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const logicalWidth = Math.max(1, Math.floor(rect.width));
  const logicalHeight = Math.max(1, Math.floor(rect.height));
  const pixelWidth = Math.max(1, Math.floor(logicalWidth * ratio));
  const pixelHeight = Math.max(1, Math.floor(logicalHeight * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx =
    canvas === els.boardCanvas
      ? canvas.getContext("2d", { willReadFrequently: true })
      : canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: logicalWidth, height: logicalHeight };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setEditorMode(mode) {
  state.editorMode = mode;
  els.finiteMode.classList.toggle("active", mode === "finite");
  els.infiniteMode.classList.toggle("active", mode === "infinite");
}

function bindEvents() {
  els.turnSlider.addEventListener("input", () => {
    els.turnInput.value = String(sliderValueToTurns(els.turnSlider.value));
  });
  els.turnSlider.addEventListener("change", runSimulation);
  els.turnInput.addEventListener("change", runSimulation);
  els.simulateButton.addEventListener("click", runSimulation);
  els.exportSettingsButton.addEventListener("click", exportSettings);
  els.importSettingsFile.addEventListener("change", async () => {
    const file = els.importSettingsFile.files?.[0];
    if (!file) return;
    try {
      importSettings(JSON.parse(await file.text()));
    } catch (error) {
      els.settingsMessage.textContent = `Import failed: ${error.message}`;
    } finally {
      els.importSettingsFile.value = "";
    }
  });
  els.typeCount.addEventListener("input", () => resizeTypeCount(Number(els.typeCount.value)));
  els.cellSize.addEventListener("input", drawBoard);
  els.fitToSizeButton.addEventListener("click", () => {
    els.cellSize.value = "100";
    state.panX = 0;
    state.panY = 0;
    drawBoard();
  });
  els.showLabels.addEventListener("change", drawBoard);
  els.showAttacks.addEventListener("change", drawBoard);
  els.attackPreviewType.addEventListener("change", drawBoard);
  els.boardCanvas.addEventListener("pointerdown", (event) => {
    state.isPanning = true;
    state.panStartX = event.clientX;
    state.panStartY = event.clientY;
    state.panOriginX = state.panX;
    state.panOriginY = state.panY;
    els.boardCanvas.setPointerCapture(event.pointerId);
    els.boardCanvas.classList.add("is-panning");
  });
  els.boardCanvas.addEventListener("pointermove", (event) => {
    if (!state.isPanning) return;
    state.panX = state.panOriginX + event.clientX - state.panStartX;
    state.panY = state.panOriginY + event.clientY - state.panStartY;
    drawBoard();
  });
  els.boardCanvas.addEventListener("pointerup", (event) => {
    state.isPanning = false;
    els.boardCanvas.releasePointerCapture(event.pointerId);
    els.boardCanvas.classList.remove("is-panning");
  });
  els.boardCanvas.addEventListener("pointercancel", () => {
    state.isPanning = false;
    els.boardCanvas.classList.remove("is-panning");
  });
  els.boardCanvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const currentZoom = Number(els.cellSize.value);
      const factor = Math.exp(-event.deltaY * 0.0015);
      zoomBoardAt(event.clientX, event.clientY, currentZoom * factor);
    },
    { passive: false },
  );

  els.pieceTypeControls.addEventListener("input", (event) => {
    const colorIndex = event.target.dataset.pieceColor;
    const shapeIndex = event.target.dataset.pieceShape;
    if (colorIndex !== undefined) {
      state.pieces[Number(colorIndex)].color = event.target.value;
      event.target.closest(".piece-card").querySelector(".piece-token").style.background = event.target.value;
      drawBoard();
    }
    if (shapeIndex !== undefined) {
      state.pieces[Number(shapeIndex)].shapeName = event.target.value;
      runSimulation();
    }
  });

  els.attackMatrix.addEventListener("change", (event) => {
    if (!event.target.matches("input[type='checkbox']")) return;
    const target = Number(event.target.dataset.target);
    const attacker = Number(event.target.dataset.attacker);
    state.attackedBy[target][attacker] = event.target.checked;
    runSimulation();
  });

  els.matrixDefaultButton.addEventListener("click", () => {
    state.attackedBy = makeDefaultAttackMatrix(state.typeCount);
    renderMatrix();
    runSimulation();
  });

  els.matrixAllButton.addEventListener("click", () => {
    state.attackedBy = state.attackedBy.map((row) => row.map(() => true));
    renderMatrix();
    runSimulation();
  });

  els.matrixClearButton.addEventListener("click", () => {
    state.attackedBy = state.attackedBy.map((row) => row.map(() => false));
    renderMatrix();
    runSimulation();
  });

  els.finiteMode.addEventListener("click", () => setEditorMode("finite"));
  els.infiniteMode.addEventListener("click", () => setEditorMode("infinite"));
  els.clearShapeButton.addEventListener("click", () => {
    state.editorShape = [];
    els.shapeName.value = "";
    syncShapeText();
  });
  els.loadShapeButton.addEventListener("click", () => {
    const name = els.loadShapeSelect.value;
    const shape = state.shapes[name];
    if (!shape) {
      els.shapeMessage.textContent = "Choose a shape to load first.";
      return;
    }
    state.editorShape = structuredClone(shape);
    els.shapeName.value = name;
    syncShapeText();
    els.shapeMessage.textContent = `Loaded "${name}" into the editor.`;
  });
  els.shapeCanvas.addEventListener("click", (event) => {
    const offset = shapeCanvasOffset(event);
    if (!offset) return;
    toggleEditorOffset(offset.dx, offset.dy);
  });
  els.shapeJson.addEventListener("input", parseShapeText);
  els.saveShapeButton.addEventListener("click", () => {
    const shape = parseShapeText();
    if (!shape) return;
    const name = els.shapeName.value.trim();
    if (!name) {
      els.shapeMessage.textContent = "Add a name before saving this shape.";
      return;
    }
    state.shapes[name] = shape;
    saveCustomShapes();
    for (const piece of state.pieces) {
      if (!state.shapes[piece.shapeName]) piece.shapeName = name;
    }
    renderAllControls();
    els.shapeMessage.textContent = `Saved "${name}" and added it to the attack-shape dropdowns.`;
    runSimulation();
  });

  window.addEventListener("resize", () => {
    drawBoard();
    drawShapeEditor();
  });
}

bindEvents();
initialiseState();
