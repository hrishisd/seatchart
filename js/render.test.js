/**
 * Tests for expandSeats from render.js.
 * Run: node js/render.test.js
 *
 * We duplicate the pure function here to avoid DOM dependencies.
 */

// ── Copy of expandSeats from render.js ───────────────────────────────────────

function expandSeats(seats, clusters) {
  const expanded = [];
  let visualIndex = 0;
  for (const id of seats) {
    if (clusters[id]) {
      for (const guestId of clusters[id].guestIds) {
        expanded.push({ guestId, clusterId: id, visualIndex });
        visualIndex++;
      }
    } else {
      expanded.push({ guestId: id, clusterId: null, visualIndex });
      visualIndex++;
    }
  }
  return expanded;
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}\n    expected: ${b}\n    got:      ${a}`);
  }
}

function assertLength(arr, len, message) {
  if (arr.length === len) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected length ${len}, got ${arr.length}`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('expandSeats:');

// Test 1: All individuals → each gets its own visual index
{
  const seats = ['g1', 'g2', 'g3'];
  const clusters = {};
  const result = expandSeats(seats, clusters);
  assertLength(result, 3, 'all individuals: length 3');
  assertEqual(result[0], { guestId: 'g1', clusterId: null, visualIndex: 0 }, 'all individuals: slot 0');
  assertEqual(result[1], { guestId: 'g2', clusterId: null, visualIndex: 1 }, 'all individuals: slot 1');
  assertEqual(result[2], { guestId: 'g3', clusterId: null, visualIndex: 2 }, 'all individuals: slot 2');
}

// Test 2: One cluster of 3 → 3 consecutive visual slots starting at 0
{
  const seats = ['c1'];
  const clusters = { c1: { guestIds: ['g1', 'g2', 'g3'] } };
  const result = expandSeats(seats, clusters);
  assertLength(result, 3, 'one cluster of 3: length 3');
  assertEqual(result[0], { guestId: 'g1', clusterId: 'c1', visualIndex: 0 }, 'one cluster of 3: slot 0');
  assertEqual(result[1], { guestId: 'g2', clusterId: 'c1', visualIndex: 1 }, 'one cluster of 3: slot 1');
  assertEqual(result[2], { guestId: 'g3', clusterId: 'c1', visualIndex: 2 }, 'one cluster of 3: slot 2');
}

// Test 3: Mix: [individualA, cluster(2), individualB] → 4 slots, cluster in positions 1 and 2
{
  const seats = ['gA', 'c1', 'gB'];
  const clusters = { c1: { guestIds: ['m1', 'm2'] } };
  const result = expandSeats(seats, clusters);
  assertLength(result, 4, 'mix: length 4');
  assertEqual(result[0], { guestId: 'gA', clusterId: null, visualIndex: 0 }, 'mix: slot 0 = individualA');
  assertEqual(result[1], { guestId: 'm1', clusterId: 'c1',  visualIndex: 1 }, 'mix: slot 1 = cluster member 1');
  assertEqual(result[2], { guestId: 'm2', clusterId: 'c1',  visualIndex: 2 }, 'mix: slot 2 = cluster member 2');
  assertEqual(result[3], { guestId: 'gB', clusterId: null, visualIndex: 3 }, 'mix: slot 3 = individualB');
}

// Test 4: Cluster member order is preserved
{
  const seats = ['c1'];
  const clusters = { c1: { guestIds: ['alpha', 'beta', 'gamma', 'delta'] } };
  const result = expandSeats(seats, clusters);
  assertLength(result, 4, 'order preserved: length 4');
  assertEqual(result.map(e => e.guestId), ['alpha', 'beta', 'gamma', 'delta'], 'order preserved: guestId order');
  assertEqual(result.map(e => e.visualIndex), [0, 1, 2, 3], 'order preserved: visualIndex sequence');
}

// Test 5: clusterId is null for individuals, set for cluster members
{
  const seats = ['g1', 'c1', 'g2'];
  const clusters = { c1: { guestIds: ['m1', 'm2'] } };
  const result = expandSeats(seats, clusters);
  assertEqual(result[0].clusterId, null, 'clusterId null for individual g1');
  assertEqual(result[1].clusterId, 'c1', 'clusterId set for cluster member 1');
  assertEqual(result[2].clusterId, 'c1', 'clusterId set for cluster member 2');
  assertEqual(result[3].clusterId, null, 'clusterId null for individual g2');
}

// Test 6: Empty seats array → empty result
{
  const result = expandSeats([], {});
  assertLength(result, 0, 'empty seats → empty result');
}

// Test 7: Multiple clusters interleaved
{
  const seats = ['c1', 'g1', 'c2'];
  const clusters = {
    c1: { guestIds: ['a', 'b'] },
    c2: { guestIds: ['x', 'y', 'z'] },
  };
  const result = expandSeats(seats, clusters);
  assertLength(result, 6, 'multiple clusters: length 6');
  assertEqual(result[0], { guestId: 'a',  clusterId: 'c1', visualIndex: 0 }, 'multi-cluster: slot 0');
  assertEqual(result[1], { guestId: 'b',  clusterId: 'c1', visualIndex: 1 }, 'multi-cluster: slot 1');
  assertEqual(result[2], { guestId: 'g1', clusterId: null, visualIndex: 2 }, 'multi-cluster: slot 2');
  assertEqual(result[3], { guestId: 'x',  clusterId: 'c2', visualIndex: 3 }, 'multi-cluster: slot 3');
  assertEqual(result[4], { guestId: 'y',  clusterId: 'c2', visualIndex: 4 }, 'multi-cluster: slot 4');
  assertEqual(result[5], { guestId: 'z',  clusterId: 'c2', visualIndex: 5 }, 'multi-cluster: slot 5');
}

// ── Copies of computeCellSize / computeHoneycombLayout from render.js ────────

const TABLE_MIN_R = 64;
const TABLE_MAX_R = 120;
const GUESTS_FOR_MAX = 12;
const LABEL_R_OFFSET = 20;
const HALF_LABEL_W = 35;
const HALF_LABEL_H = 10;
const CELL_H_GAP = 24;
const CELL_V_GAP = 32;

function tableRadius(guestCount) {
  if (guestCount <= 0) return TABLE_MIN_R;
  const t = Math.min(guestCount / GUESTS_FOR_MAX, 1);
  return TABLE_MIN_R + t * (TABLE_MAX_R - TABLE_MIN_R);
}

function computeCellSize(guestCount) {
  const r = tableRadius(guestCount);
  const labelR = r + LABEL_R_OFFSET;
  return {
    w: 2 * (labelR + HALF_LABEL_W) + CELL_H_GAP,
    h: 2 * (labelR + HALF_LABEL_H) + CELL_V_GAP,
  };
}

function computeHoneycombLayout(cellSizes, gridWidth) {
  if (cellSizes.length === 0) return [];

  const maxCellW = Math.max(...cellSizes.map((s) => s.w));
  const cols = Math.max(1, Math.floor(gridWidth / maxCellW));
  const numRows = Math.ceil(cellSizes.length / cols);

  const colWidths = new Array(cols).fill(0);
  for (let i = 0; i < cellSizes.length; i++) {
    const col = i % cols;
    colWidths[col] = Math.max(colWidths[col], cellSizes[i].w);
  }

  const rowHeights = new Array(numRows).fill(0);
  for (let i = 0; i < cellSizes.length; i++) {
    const row = Math.floor(i / cols);
    rowHeights[row] = Math.max(rowHeights[row], cellSizes[i].h);
  }

  const colX = new Array(cols).fill(0);
  for (let c = 1; c < cols; c++) {
    colX[c] = colX[c - 1] + colWidths[c - 1];
  }

  const rowY = new Array(numRows).fill(0);
  for (let r = 1; r < numRows; r++) {
    rowY[r] = rowY[r - 1] + rowHeights[r - 1];
  }

  const totalRowWidth = colWidths.reduce((a, b) => a + b, 0);
  const honeycombOffset = totalRowWidth / cols / 2;

  return cellSizes.map((_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const offsetX = row % 2 === 1 ? honeycombOffset : 0;
    return {
      x: colX[col] + offsetX,
      y: rowY[row],
      w: colWidths[col],
      h: rowHeights[row],
    };
  });
}

// ── computeCellSize tests ─────────────────────────────────────────────────────

console.log('\ncomputeCellSize:');

function assertGt(a, b, message) {
  if (a > b) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${a} > ${b}`);
  }
}

{
  // 0 guests → smallest cell (r = TABLE_MIN_R = 64)
  const { w, h } = computeCellSize(0);
  const expectedW = 2 * (64 + 20 + 35) + 24; // 262
  const expectedH = 2 * (64 + 20 + 10) + 32; // 220
  assertEqual(w, expectedW, '0 guests: cellW');
  assertEqual(h, expectedH, '0 guests: cellH');
}

{
  // 12 guests → largest cell (r = TABLE_MAX_R = 120)
  const { w, h } = computeCellSize(12);
  const expectedW = 2 * (120 + 20 + 35) + 24; // 374
  const expectedH = 2 * (120 + 20 + 10) + 32; // 332
  assertEqual(w, expectedW, '12 guests: cellW');
  assertEqual(h, expectedH, '12 guests: cellH');
}

{
  // 6 guests → intermediate size
  const { w: w0 } = computeCellSize(0);
  const { w: w6 } = computeCellSize(6);
  const { w: w12 } = computeCellSize(12);
  assertGt(w6, w0, '6 guests cellW > 0 guests cellW');
  assertGt(w12, w6, '12 guests cellW > 6 guests cellW');
}

{
  // w and h increase monotonically with guest count
  let prevW = 0, prevH = 0;
  let monotonic = true;
  for (let n = 0; n <= 12; n++) {
    const { w, h } = computeCellSize(n);
    if (w < prevW || h < prevH) { monotonic = false; break; }
    prevW = w; prevH = h;
  }
  if (monotonic) { passed++; } else { failed++; console.error('  FAIL: w/h not monotonically increasing'); }
}

// ── computeHoneycombLayout tests ──────────────────────────────────────────────

console.log('\ncomputeHoneycombLayout:');

{
  // Empty input → empty output
  const result = computeHoneycombLayout([], 800);
  assertLength(result, 0, 'empty input → empty output');
}

{
  // All same size → matches uniform grid behavior
  const size = { w: 100, h: 80 };
  const sizes = [size, size, size, size]; // 4 cells, gridWidth=300 → cols=3
  const result = computeHoneycombLayout(sizes, 300);
  assertLength(result, 4, 'uniform grid: 4 results');
  // row 0: cells 0,1,2 → y=0, no offset
  assertEqual(result[0], { x: 0, y: 0, w: 100, h: 80 }, 'uniform: cell 0');
  assertEqual(result[1], { x: 100, y: 0, w: 100, h: 80 }, 'uniform: cell 1');
  assertEqual(result[2], { x: 200, y: 0, w: 100, h: 80 }, 'uniform: cell 2');
  // row 1: cell 3 → y=80, odd row gets offset
  const offset = (300 / 3) / 2; // = 50
  assertEqual(result[3], { x: 0 + offset, y: 80, w: 100, h: 80 }, 'uniform: cell 3 (odd row offset)');
}

{
  // One large cell in a row → that row is taller, that column is wider
  // 2 cells, gridWidth=500 → cols=2 (maxCellW=200)
  const sizes = [{ w: 200, h: 100 }, { w: 100, h: 50 }];
  const result = computeHoneycombLayout(sizes, 500);
  assertLength(result, 2, 'large cell: 2 results');
  // col 0 width = max(200) = 200, col 1 width = max(100) = 100
  // row 0 height = max(100, 50) = 100
  assertEqual(result[0].w, 200, 'large cell: col 0 gets max width');
  assertEqual(result[1].h, 100, 'large cell: row 0 height = max of row');
}

{
  // Single column (narrow viewport) → all cells stacked vertically
  const sizes = [{ w: 200, h: 80 }, { w: 200, h: 100 }, { w: 200, h: 60 }];
  const result = computeHoneycombLayout(sizes, 200); // exactly 1 column
  assertLength(result, 3, 'single col: 3 results');
  assertEqual(result[0].x, 0, 'single col: cell 0 x=0 (even row)');
  // Odd row gets half-column-width offset: 200/1/2 = 100
  assertEqual(result[1].x, 100, 'single col: cell 1 x=100 (odd row offset)');
  assertEqual(result[2].y, 80 + 100, 'single col: cell 2 y = sum of prev heights');
}

{
  // Odd rows get honeycomb offset, even rows don't
  const size = { w: 100, h: 80 };
  const sizes = new Array(6).fill(size); // 6 cells, gridWidth=300 → cols=3
  const result = computeHoneycombLayout(sizes, 300);
  // row 0 (cells 0-2): no offset
  assertEqual(result[0].x, 0, 'even row 0: no offset cell 0');
  assertEqual(result[1].x, 100, 'even row 0: no offset cell 1');
  // row 1 (cells 3-5): offset = 100/2 = 50
  const expectedOffset = 50;
  assertEqual(result[3].x, 0 + expectedOffset, 'odd row 1: offset cell 3');
  assertEqual(result[4].x, 100 + expectedOffset, 'odd row 1: offset cell 4');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
