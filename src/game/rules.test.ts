import test from 'node:test';
import assert from 'node:assert/strict';
import { POC_STAGES } from './stages';
import {
  evaluateGateBoolean,
  placeOrMoveCell,
  removeCellById,
  simulateFloorplan,
} from './rules';

test('boolean gate logic truthiness matches CMOS standard cells', () => {
  assert.equal(evaluateGateBoolean('NOT', [0]), 1);
  assert.equal(evaluateGateBoolean('NOT', [1]), 0);
  assert.equal(evaluateGateBoolean('NAND2', [1, 1]), 0);
  assert.equal(evaluateGateBoolean('NAND2', [1, 0]), 1);
  assert.equal(evaluateGateBoolean('AND2', [1, 1]), 1);
  assert.equal(evaluateGateBoolean('AND2', [0, 1]), 0);
  assert.equal(evaluateGateBoolean('XOR2', [1, 0]), 1);
  assert.equal(evaluateGateBoolean('XOR2', [1, 1]), 0);
});

test('Stage 1 CMOS Inverter passes signoff when centered and fails timing when placed in far corner', () => {
  const stage1 = POC_STAGES[0];

  // Centered NOT at (3, 2) between IN_A (-1, 2) and OUT_Y (6, 2)
  const centeredReport = simulateFloorplan(stage1, [
    { id: 'c1', type: 'NOT', col: 3, row: 2 },
  ]);
  assert.equal(centeredReport.allVectorsPassed, true);
  assert.equal(centeredReport.timingMet, true);
  assert.equal(centeredReport.signoffReady, true);
  assert.ok(centeredReport.criticalPathPs <= stage1.targetDelayPs);

  // Far corner NOT at (0, 5) creates a long 9-unit wire to OUT_Y (6, 2) -> quadratic RC timing violation
  const cornerReport = simulateFloorplan(stage1, [
    { id: 'c1', type: 'NOT', col: 0, row: 5 },
  ]);
  assert.equal(cornerReport.allVectorsPassed, true);
  assert.equal(cornerReport.timingMet, false);
  assert.equal(cornerReport.signoffReady, false);
  assert.ok(cornerReport.criticalPathPs > stage1.targetDelayPs);
});

test('Stage 2 NAND2 + NOT synthesis passes all 4 AND truth vectors and timing', () => {
  const stage2 = POC_STAGES[1];

  const report = simulateFloorplan(stage2, [
    { id: 'g-nand', type: 'NAND2', col: 2, row: 2 },
    { id: 'g-not', type: 'NOT', col: 4, row: 2 },
  ]);

  assert.equal(report.passedCount, 4);
  assert.equal(report.allVectorsPassed, true);
  assert.equal(report.timingMet, true);
  assert.equal(report.powerMet, true);
  assert.equal(report.signoffReady, true);
});

test('Stage 3 1-Bit Half-Adder passes signoff with aligned XOR2 and AND2 placement, and fails if rows are swapped', () => {
  const stage3 = POC_STAGES[2];

  const validReport = simulateFloorplan(stage3, [
    { id: 'g-xor', type: 'XOR2', col: 3, row: 1 },
    { id: 'g-and', type: 'AND2', col: 3, row: 4 },
  ]);
  assert.equal(validReport.passedCount, 4);
  assert.equal(validReport.allVectorsPassed, true);
  assert.equal(validReport.timingMet, true);
  assert.equal(validReport.powerMet, true);
  assert.equal(validReport.signoffReady, true);
  assert.ok(validReport.ppaScore >= 75);

  // Swapped rows: AND2 near SUM (row 1) and XOR2 near CARRY (row 4) fails truth table
  const swappedReport = simulateFloorplan(stage3, [
    { id: 'g-and', type: 'AND2', col: 3, row: 1 },
    { id: 'g-xor', type: 'XOR2', col: 3, row: 4 },
  ]);
  assert.equal(swappedReport.allVectorsPassed, false);
  assert.equal(swappedReport.signoffReady, false);
});

test('placeOrMoveCell swaps occupied tiles and removeCellById deletes cleanly', () => {
  let cells = placeOrMoveCell([], { id: 'a', type: 'NOT', col: 1, row: 1 });
  cells = placeOrMoveCell(cells, { id: 'b', type: 'BUF', col: 3, row: 2 });
  assert.equal(cells.length, 2);

  // Move 'a' onto 'b' at (3, 2) -> swaps 'b' to (1, 1)
  cells = placeOrMoveCell(cells, { id: 'a', type: 'NOT', col: 3, row: 2 });
  const cellA = cells.find((c) => c.id === 'a');
  const cellB = cells.find((c) => c.id === 'b');
  assert.deepEqual({ col: cellA?.col, row: cellA?.row }, { col: 3, row: 2 });
  assert.deepEqual({ col: cellB?.col, row: cellB?.row }, { col: 1, row: 1 });

  cells = removeCellById(cells, 'a');
  assert.equal(cells.length, 1);
  assert.equal(cells[0].id, 'b');
});
