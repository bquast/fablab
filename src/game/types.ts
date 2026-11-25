export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type GateType = 'NOT' | 'BUF' | 'NAND2' | 'AND2' | 'OR2' | 'XOR2';

export interface GateSpec {
  type: GateType;
  label: string;
  roleHint: string;
  booleanExpr: string;
  inputs: 1 | 2;
  intrinsicDelayPs: number;
  switchingPowerMw: number;
  transistorCount: number;
  accentHex: string;
}

export interface PadDef {
  id: string;
  label: string;
  side: 'west' | 'east';
  col: number; // -1 for west inputs, 6 for east outputs
  row: number; // 0..5
}

export interface PlacedCell {
  id: string;
  type: GateType;
  col: number; // 0..5
  row: number; // 0..5
}

export interface WireSegment {
  id: string;
  fromId: string;
  fromCol: number;
  fromRow: number;
  toId: string;
  toCol: number;
  toRow: number;
  manhattanUnits: number;
  delayPs: number;
  signal: 0 | 1;
  layer: 'M1' | 'M2';
}

export interface TruthVector {
  inputs: Record<string, 0 | 1>;
  expected: Record<string, 0 | 1>;
}

export interface TruthVectorResult {
  inputs: Record<string, 0 | 1>;
  expected: Record<string, 0 | 1>;
  actual: Record<string, 0 | 1 | null>;
  passed: boolean;
}

export interface SimulationReport {
  vectors: TruthVectorResult[];
  allVectorsPassed: boolean;
  passedCount: number;
  totalVectors: number;
  criticalPathPs: number;
  targetDelayPs: number;
  timingMet: boolean;
  dynamicPowerMw: number;
  powerBudgetMw: number;
  powerMet: boolean;
  wirelengthUm: number;
  areaUtilizationPct: number;
  transistorCount: number;
  ppaScore: number;
  signoffReady: boolean;
  drcWarnings: string[];
  wires: WireSegment[];
  cellSignals: Record<string, 0 | 1>;
  padSignals: Record<string, 0 | 1>;
}

export interface ChipStage {
  id: string;
  index: number;
  code: string;
  title: string;
  subtitle: string;
  goalSummary: string;
  conceptCallout: string;
  availableGates: GateType[];
  inputPads: PadDef[];
  outputPads: PadDef[];
  truthTable: TruthVector[];
  targetDelayPs: number;
  powerBudgetMw: number;
  copilotPrompts: string[];
}

export interface SignoffSnapshot {
  outcome: 'victory' | 'violation';
  stageIndex: number;
  stageTitle: string;
  ppaScore: number;
  bestScore: number;
  criticalPathPs: number;
  targetDelayPs: number;
  dynamicPowerMw: number;
  powerBudgetMw: number;
  passedCount: number;
  totalVectors: number;
  clearTimeSec: number;
  failureReason?: string;
}
