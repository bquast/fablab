import { DIE_COLS, DIE_ROWS, GATE_SPECS } from './stages';
import {
  ChipStage,
  GateType,
  PlacedCell,
  SimulationReport,
  TruthVectorResult,
  WireSegment,
} from './types';

interface DriverNode {
  id: string;
  col: number;
  row: number;
  kind: 'pad' | 'cell';
}

export function manhattanDistance(c1: number, r1: number, c2: number, r2: number): number {
  return Math.abs(c1 - c2) + Math.abs(r1 - r2);
}

/**
 * Elmore RC interconnect wire delay in picoseconds for a single unbuffered wire segment.
 * Includes a linear driver-resistance term plus a quadratic distributed RC wire term.
 */
export function computeWireDelayPs(manhattanUnits: number): number {
  return Math.round(2.6 * manhattanUnits + 0.95 * manhattanUnits * manhattanUnits);
}

export function evaluateGateBoolean(type: GateType, inValues: Array<0 | 1>): 0 | 1 {
  const a = inValues[0] ?? 0;
  const b = inValues[1] ?? 0;
  switch (type) {
    case 'NOT':
      return a === 1 ? 0 : 1;
    case 'BUF':
      return a;
    case 'NAND2':
      return a === 1 && b === 1 ? 0 : 1;
    case 'AND2':
      return a === 1 && b === 1 ? 1 : 0;
    case 'OR2':
      return a === 1 || b === 1 ? 1 : 0;
    case 'XOR2':
      return a !== b ? 1 : 0;
  }
}

export function isValidGridCoord(col: number, row: number): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    col < DIE_COLS &&
    row >= 0 &&
    row < DIE_ROWS
  );
}

/**
 * Places or moves a cell onto `(col, row)`. If another cell already occupies `(col, row)`,
 * swaps or replaces cleanly depending on whether `existingId` was already on the board.
 */
export function placeOrMoveCell(
  cells: PlacedCell[],
  cell: PlacedCell,
): PlacedCell[] {
  if (!isValidGridCoord(cell.col, cell.row)) {
    return cells;
  }
  const previousSelf = cells.find((c) => c.id === cell.id);
  const occupant = cells.find(
    (c) => c.col === cell.col && c.row === cell.row && c.id !== cell.id,
  );

  const next = cells.filter(
    (c) => c.id !== cell.id && !(c.col === cell.col && c.row === cell.row),
  );

  if (occupant && previousSelf) {
    // Swap positions when dragging an existing cell onto another occupied tile
    next.push({ ...occupant, col: previousSelf.col, row: previousSelf.row });
  }

  next.push({ ...cell });
  return next;
}

export function removeCellById(cells: PlacedCell[], id: string): PlacedCell[] {
  return cells.filter((c) => c.id !== id);
}

interface BuiltNetlist {
  sortedCells: PlacedCell[];
  cellUpstreamIds: Map<string, string[]>;
  outputDriverId: Map<string, string | null>;
  drcWarnings: string[];
}

function buildSpatialNetlist(stage: ChipStage, cells: PlacedCell[]): BuiltNetlist {
  const sortedCells = [...cells].sort((a, b) =>
    a.col !== b.col ? a.col - b.col : a.row - b.row,
  );

  const allPads: DriverNode[] = stage.inputPads.map((p) => ({
    id: p.id,
    col: p.col,
    row: p.row,
    kind: 'pad',
  }));

  const cellUpstreamIds = new Map<string, string[]>();
  const drcWarnings: string[] = [];
  const drivenConsumers = new Set<string>();

  for (const cell of sortedCells) {
    const spec = GATE_SPECS[cell.type];
    const candidates: DriverNode[] = [
      ...allPads,
      ...sortedCells
        .filter((other) => other.col < cell.col)
        .map((other) => ({
          id: other.id,
          col: other.col,
          row: other.row,
          kind: 'cell' as const,
        })),
    ];

    candidates.sort((u, v) => {
      const du = manhattanDistance(u.col, u.row, cell.col, cell.row);
      const dv = manhattanDistance(v.col, v.row, cell.col, cell.row);
      if (du !== dv) return du - dv;
      const rowDiffU = Math.abs(u.row - cell.row);
      const rowDiffV = Math.abs(v.row - cell.row);
      if (rowDiffU !== rowDiffV) return rowDiffU - rowDiffV;
      // Prefer closer column (more immediate upstream stage)
      if (u.col !== v.col) return v.col - u.col;
      return u.id.localeCompare(v.id);
    });

    const chosen = candidates.slice(0, spec.inputs).map((c) => c.id);
    if (chosen.length < spec.inputs) {
      drcWarnings.push(
        `${cell.type} at (${cell.col}, ${cell.row}) has Floating Input (${chosen.length}/${spec.inputs} upstream drivers to its West).`,
      );
    }
    chosen.forEach((id) => drivenConsumers.add(id));
    cellUpstreamIds.set(cell.id, chosen);
  }

  const outputDriverId = new Map<string, string | null>();
  for (const outPad of stage.outputPads) {
    if (sortedCells.length === 0) {
      outputDriverId.set(outPad.id, null);
      continue;
    }
    const ranked = [...sortedCells].sort((a, b) => {
      const da = manhattanDistance(a.col, a.row, outPad.col, outPad.row);
      const db = manhattanDistance(b.col, b.row, outPad.col, outPad.row);
      if (da !== db) return da - db;
      if (a.col !== b.col) return b.col - a.col; // Prefer right-most stage
      return a.row - b.row;
    });
    const winner = ranked[0];
    outputDriverId.set(outPad.id, winner.id);
    drivenConsumers.add(winner.id);
  }

  for (const cell of sortedCells) {
    if (!drivenConsumers.has(cell.id)) {
      drcWarnings.push(
        `Unconnected Output: ${cell.type} at (${cell.col}, ${cell.row}) does not drive any downstream gate or output pad.`,
      );
    }
  }

  return { sortedCells, cellUpstreamIds, outputDriverId, drcWarnings };
}

export function simulateFloorplan(
  stage: ChipStage,
  cells: PlacedCell[],
  activeVectorIndex = 0,
): SimulationReport {
  const { sortedCells, cellUpstreamIds, outputDriverId, drcWarnings } =
    buildSpatialNetlist(stage, cells);

  const nodeMap = new Map<string, { col: number; row: number }>();
  stage.inputPads.forEach((p) => nodeMap.set(p.id, { col: p.col, row: p.row }));
  stage.outputPads.forEach((p) => nodeMap.set(p.id, { col: p.col, row: p.row }));
  sortedCells.forEach((c) => nodeMap.set(c.id, { col: c.col, row: c.row }));

  // Evaluate all truth vectors
  const vectorResults: TruthVectorResult[] = stage.truthTable.map((tv) => {
    const values = new Map<string, 0 | 1>();
    for (const pad of stage.inputPads) {
      values.set(pad.id, tv.inputs[pad.id] ?? 0);
    }

    for (const cell of sortedCells) {
      const upIds = cellUpstreamIds.get(cell.id) ?? [];
      const inVals = upIds.map((id) => values.get(id) ?? 0);
      values.set(cell.id, evaluateGateBoolean(cell.type, inVals));
    }

    const actual: Record<string, 0 | 1 | null> = {};
    let passed = true;
    for (const outPad of stage.outputPads) {
      const driver = outputDriverId.get(outPad.id) ?? null;
      const val = driver !== null ? (values.get(driver) ?? 0) : null;
      actual[outPad.id] = val;
      if (val !== tv.expected[outPad.id]) {
        passed = false;
      }
    }

    return {
      inputs: tv.inputs,
      expected: tv.expected,
      actual,
      passed,
    };
  });

  const passedCount = vectorResults.filter((v) => v.passed).length;
  const totalVectors = vectorResults.length;
  const allVectorsPassed = totalVectors > 0 && passedCount === totalVectors;

  // Active vector signals for 3D visualization
  const safeVecIdx =
    stage.truthTable.length > 0
      ? ((activeVectorIndex % stage.truthTable.length) + stage.truthTable.length) %
        stage.truthTable.length
      : 0;
  const activeTv = stage.truthTable[safeVecIdx];
  const cellSignals: Record<string, 0 | 1> = {};
  const padSignals: Record<string, 0 | 1> = {};

  if (activeTv) {
    for (const pad of stage.inputPads) {
      padSignals[pad.id] = activeTv.inputs[pad.id] ?? 0;
    }
    for (const cell of sortedCells) {
      const upIds = cellUpstreamIds.get(cell.id) ?? [];
      const inVals = upIds.map((id) =>
        id in padSignals ? padSignals[id] : (cellSignals[id] ?? 0),
      );
      cellSignals[cell.id] = evaluateGateBoolean(cell.type, inVals);
    }
    for (const outPad of stage.outputPads) {
      const driver = outputDriverId.get(outPad.id) ?? null;
      padSignals[outPad.id] = driver !== null ? (cellSignals[driver] ?? 0) : 0;
    }
  }

  // Build wire segments & compute arrival times (Static Timing Analysis)
  const arrivalPs = new Map<string, number>();
  stage.inputPads.forEach((p) => arrivalPs.set(p.id, 0));

  const wires: WireSegment[] = [];
  let totalManhattanUnits = 0;

  for (const cell of sortedCells) {
    const spec = GATE_SPECS[cell.type];
    const upIds = cellUpstreamIds.get(cell.id) ?? [];
    let maxInputArrival = 0;

    upIds.forEach((fromId, idx) => {
      const src = nodeMap.get(fromId);
      if (!src) return;
      const dist = manhattanDistance(src.col, src.row, cell.col, cell.row);
      const wDelay = computeWireDelayPs(dist);
      totalManhattanUnits += dist;

      const sig: 0 | 1 =
        fromId in padSignals ? padSignals[fromId] : (cellSignals[fromId] ?? 0);

      wires.push({
        id: `w-${fromId}-${cell.id}-${idx}`,
        fromId,
        fromCol: src.col,
        fromRow: src.row,
        toId: cell.id,
        toCol: cell.col,
        toRow: cell.row,
        manhattanUnits: dist,
        delayPs: wDelay,
        signal: sig,
        layer: idx === 0 ? 'M1' : 'M2',
      });

      const candidateArrival = (arrivalPs.get(fromId) ?? 0) + wDelay;
      if (candidateArrival > maxInputArrival) {
        maxInputArrival = candidateArrival;
      }
    });

    arrivalPs.set(cell.id, maxInputArrival + spec.intrinsicDelayPs);
  }

  let criticalPathPs = 0;
  for (const outPad of stage.outputPads) {
    const driver = outputDriverId.get(outPad.id) ?? null;
    if (!driver) continue;
    const src = nodeMap.get(driver);
    if (!src) continue;
    const dist = manhattanDistance(src.col, src.row, outPad.col, outPad.row);
    const wDelay = computeWireDelayPs(dist);
    totalManhattanUnits += dist;

    wires.push({
      id: `w-${driver}-${outPad.id}`,
      fromId: driver,
      fromCol: src.col,
      fromRow: src.row,
      toId: outPad.id,
      toCol: outPad.col,
      toRow: outPad.row,
      manhattanUnits: dist,
      delayPs: wDelay,
      signal: cellSignals[driver] ?? 0,
      layer: 'M1',
    });

    const padArrival = (arrivalPs.get(driver) ?? 0) + wDelay;
    if (padArrival > criticalPathPs) {
      criticalPathPs = padArrival;
    }
  }

  const timingMet = sortedCells.length > 0 && criticalPathPs <= stage.targetDelayPs;

  if (sortedCells.length > 0 && !timingMet) {
    drcWarnings.push(
      `Timing Slack Violation: Critical path is ${criticalPathPs} ps (target <= ${stage.targetDelayPs} ps). Shorten long traces or center cells closer to pad rows.`,
    );
  }

  // Power & Area calculation
  const cellPower = sortedCells.reduce(
    (sum, c) => sum + GATE_SPECS[c.type].switchingPowerMw,
    0,
  );
  const wirePower = totalManhattanUnits * 0.025;
  const dynamicPowerMw = Number((cellPower + wirePower).toFixed(2));
  const powerMet = dynamicPowerMw <= stage.powerBudgetMw;

  if (sortedCells.length > 0 && !powerMet) {
    drcWarnings.push(
      `Power Budget Exceeded: ${dynamicPowerMw.toFixed(2)} mW exceeds ${stage.powerBudgetMw.toFixed(2)} mW budget. Remove redundant cells or shorten interconnects.`,
    );
  }

  const wirelengthUm = totalManhattanUnits * 10;
  const areaUtilizationPct = Math.round((sortedCells.length / (DIE_COLS * DIE_ROWS)) * 100);
  const transistorCount = sortedCells.reduce(
    (sum, c) => sum + GATE_SPECS[c.type].transistorCount,
    0,
  );

  // PPA Score (0..100)
  const vectorRatio = totalVectors > 0 ? passedCount / totalVectors : 0;
  let ppaScore = Math.round(vectorRatio * 55);

  if (sortedCells.length > 0 && allVectorsPassed) {
    const delayMargin = Math.max(
      0,
      Math.min(1, (stage.targetDelayPs * 1.25 - criticalPathPs) / (stage.targetDelayPs * 0.5)),
    );
    const powerMargin = Math.max(
      0,
      Math.min(1, (stage.powerBudgetMw * 1.2 - dynamicPowerMw) / (stage.powerBudgetMw * 0.6)),
    );
    const drcPenalty = Math.min(15, drcWarnings.length * 5);
    ppaScore = Math.max(
      10,
      Math.min(
        100,
        Math.round(60 + delayMargin * 25 + powerMargin * 15 - drcPenalty),
      ),
    );
  }

  const signoffReady = allVectorsPassed && timingMet && powerMet;

  return {
    vectors: vectorResults,
    allVectorsPassed,
    passedCount,
    totalVectors,
    criticalPathPs,
    targetDelayPs: stage.targetDelayPs,
    timingMet,
    dynamicPowerMw,
    powerBudgetMw: stage.powerBudgetMw,
    powerMet,
    wirelengthUm,
    areaUtilizationPct,
    transistorCount,
    ppaScore,
    signoffReady,
    drcWarnings,
    wires,
    cellSignals,
    padSignals,
  };
}
