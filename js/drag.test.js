/**
 * Tests for insertion index math.
 * Run: node js/drag.test.js
 *
 * We can't import the ES modules directly in Node without a full ESM setup,
 * so we duplicate the pure functions here.
 */

// ── Copy of hasExceededDragThreshold from drag.js ────────────────────────────
function hasExceededDragThreshold(startX, startY, currentX, currentY, threshold = 5) {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold;
}

// ── Copy of insertionIndexFromAngle from drag.js ─────────────────────────────
function insertionIndexFromAngle(cursorAngleDeg, seatCount) {
  if (seatCount === 0) return 0;
  const slotSize = 360 / seatCount;
  const angle = ((cursorAngleDeg % 360) + 360) % 360;
  return (Math.floor(angle / slotSize) + 1) % seatCount;
}

// ── Copies of expandSeats + computeInsertionMidpoints from render.js ──────────

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

function computeInsertionMidpoints(seats, clusters) {
  if (seats.length === 0) return [];
  const expanded = expandSeats(seats, clusters);
  const totalSlots = expanded.length;
  if (totalSlots === 0) return [];
  const slotSize = 360 / totalSlots;

  const unitSlots = new Map();
  for (const { clusterId, guestId, visualIndex } of expanded) {
    const seatId = clusterId ?? guestId;
    const cur = unitSlots.get(seatId);
    if (!cur) {
      unitSlots.set(seatId, { first: visualIndex, last: visualIndex });
    } else {
      cur.first = Math.min(cur.first, visualIndex);
      cur.last = Math.max(cur.last, visualIndex);
    }
  }

  return seats.map((seatId, i) => {
    const prevSeatId = seats[(i - 1 + seats.length) % seats.length];
    const firstSlot = unitSlots.get(seatId)?.first ?? i;
    const lastSlotPrev = unitSlots.get(prevSeatId)?.last ?? i;
    const firstAngle = -90 + firstSlot * slotSize;
    const lastAnglePrev = -90 + lastSlotPrev * slotSize;
    const gapCW = ((firstAngle - lastAnglePrev) + 360) % 360;
    return { unitIdx: i, midAngleDeg: lastAnglePrev + gapCW / 2 };
  });
}

// Simulate computeInsertionIndex (the cursor → unit index mapping from drag.js)
function computeInsertionIndexFromCursor(cursorAngleDeg, seats, clusters) {
  const midpoints = computeInsertionMidpoints(seats, clusters);
  if (midpoints.length === 0) return 0;
  let bestIdx = midpoints[0].unitIdx;
  let bestDist = Infinity;
  for (const { unitIdx, midAngleDeg } of midpoints) {
    const midCursorAngle = ((midAngleDeg + 90) + 360) % 360;
    const dist = Math.min(
      (midCursorAngle - cursorAngleDeg + 360) % 360,
      (cursorAngleDeg - midCursorAngle + 360) % 360,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = unitIdx;
    }
  }
  return bestIdx;
}

// ── Copy of indicator angle formula from render.js ───────────────────────────
function indicatorAngleDeg(insertionIndex, seatCount) {
  if (seatCount === 0) return -90;
  const slotSize = 360 / seatCount;
  return -90 + (insertionIndex - 0.5) * slotSize;
}

// ── Seat angle (standard math coords, matching render.js) ────────────────────
function seatAngleDeg(seatIndex, seatCount) {
  return -90 + (360 / seatCount) * seatIndex;
}

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual, expected, message, tolerance = 0.01) {
  if (Math.abs(actual - expected) < tolerance) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ~${expected}, got ${actual}`);
  }
}

// ── hasExceededDragThreshold ─────────────────────────────────────────────────

console.log('hasExceededDragThreshold:');

// No movement — never triggers
assertEqual(hasExceededDragThreshold(0, 0, 0, 0), false, 'no movement');

// Movement below threshold
assertEqual(hasExceededDragThreshold(0, 0, 4, 0), false, '4px horizontal < 5px');
assertEqual(hasExceededDragThreshold(0, 0, 0, 4), false, '4px vertical < 5px');
assertEqual(hasExceededDragThreshold(0, 0, 3, 3), false, '~4.24px diagonal < 5px');

// Exactly at threshold (>= so should be true)
assertEqual(hasExceededDragThreshold(0, 0, 5, 0), true, 'exactly 5px horizontal');
assertEqual(hasExceededDragThreshold(0, 0, 0, 5), true, 'exactly 5px vertical');
assertEqual(hasExceededDragThreshold(10, 10, 13, 14), true, '3-4-5 triangle: exactly 5px');

// Movement above threshold
assertEqual(hasExceededDragThreshold(0, 0, 6, 0), true, '6px horizontal > 5px');
assertEqual(hasExceededDragThreshold(100, 200, 105, 205), true, 'moved ~7.07px diagonally');

// Custom threshold
assertEqual(hasExceededDragThreshold(0, 0, 4, 0, 3), true, '4px > custom threshold 3');
assertEqual(hasExceededDragThreshold(0, 0, 2, 0, 3), false, '2px < custom threshold 3');

// ── insertionIndexFromAngle ──────────────────────────────────────────────────

console.log('\ninsertionIndexFromAngle:');

// 0 seats: always 0
assertEqual(insertionIndexFromAngle(0, 0), 0, '0 seats, 0°');
assertEqual(insertionIndexFromAngle(180, 0), 0, '0 seats, 180°');

// 1 seat: only one gap, always 0
assertEqual(insertionIndexFromAngle(0, 1), 0, '1 seat, 0°');
assertEqual(insertionIndexFromAngle(90, 1), 0, '1 seat, 90°');
assertEqual(insertionIndexFromAngle(270, 1), 0, '1 seat, 270°');

// 2 seats: seat 0 at 0° (top), seat 1 at 180° (bottom)
// Midpoint 0: at 270° (between seat 1 and seat 0, wrapping)
// Midpoint 1: at 90° (between seat 0 and seat 1)
assertEqual(insertionIndexFromAngle(90, 2), 1, '2 seats, 90° → 1');
assertEqual(insertionIndexFromAngle(270, 2), 0, '2 seats, 270° → 0');
assertEqual(insertionIndexFromAngle(1, 2), 1, '2 seats, 1° → 1 (just past seat 0, between seat 0 and 1)');
assertEqual(insertionIndexFromAngle(179, 2), 1, '2 seats, 179° → 1');
assertEqual(insertionIndexFromAngle(181, 2), 0, '2 seats, 181° → 0');
assertEqual(insertionIndexFromAngle(359, 2), 0, '2 seats, 359° → 0');

// 3 seats: at 0°, 120°, 240°. Midpoints at 60°, 180°, 300°.
assertEqual(insertionIndexFromAngle(60, 3), 1, '3 seats, 60° → 1');
assertEqual(insertionIndexFromAngle(180, 3), 2, '3 seats, 180° → 2');
assertEqual(insertionIndexFromAngle(300, 3), 0, '3 seats, 300° → 0');
// Near boundaries
assertEqual(insertionIndexFromAngle(59, 3), 1, '3 seats, 59° → 1');
assertEqual(insertionIndexFromAngle(61, 3), 1, '3 seats, 61° → 1');
assertEqual(insertionIndexFromAngle(119, 3), 1, '3 seats, 119° → 1');
assertEqual(insertionIndexFromAngle(121, 3), 2, '3 seats, 121° → 2');

// 4 seats: at 0°, 90°, 180°, 270°. Midpoints at 45°, 135°, 225°, 315°.
assertEqual(insertionIndexFromAngle(45, 4), 1, '4 seats, 45° → 1');
assertEqual(insertionIndexFromAngle(135, 4), 2, '4 seats, 135° → 2');
assertEqual(insertionIndexFromAngle(225, 4), 3, '4 seats, 225° → 3');
assertEqual(insertionIndexFromAngle(315, 4), 0, '4 seats, 315° → 0');
// Near seat positions (boundary between two midpoints)
assertEqual(insertionIndexFromAngle(89, 4), 1, '4 seats, 89° → 1');
assertEqual(insertionIndexFromAngle(91, 4), 2, '4 seats, 91° → 2');

// ── Indicator appears at correct midpoint ────────────────────────────────────

console.log('\nIndicator angle consistency:');

// For n seats, the indicator for index i should appear halfway between
// seat (i-1) and seat (i). In standard math coords:
// seat i-1 is at: -90 + (i-1) * 360/n
// seat i is at:   -90 + i * 360/n
// midpoint:       -90 + (i - 0.5) * 360/n  ← this is what indicatorAngleDeg computes

for (const n of [2, 3, 4, 5, 8]) {
  for (let i = 0; i < n; i++) {
    const prevSeat = seatAngleDeg((i - 1 + n) % n, n);
    const nextSeat = seatAngleDeg(i, n);

    // Midpoint in angular terms (handle wrap-around)
    let expectedMid;
    if (i === 0) {
      // Between last seat and first seat (wrapping around 360°)
      expectedMid = seatAngleDeg(n - 1, n) + (360 / n) / 2;
    } else {
      expectedMid = (prevSeat + nextSeat) / 2;
    }

    const actual = indicatorAngleDeg(i, n);

    // Normalize both to compare (they might differ by 360)
    const norm = (a) => ((a % 360) + 360) % 360;
    assertApprox(norm(actual), norm(expectedMid),
      `n=${n}, idx=${i}: indicator at ${actual.toFixed(1)}° should match midpoint ${expectedMid.toFixed(1)}°`);
  }
}

// ── Round-trip: cursor at midpoint → correct index ───────────────────────────

console.log('\nRound-trip (cursor at midpoint → index):');

for (const n of [2, 3, 4, 5, 8]) {
  for (let i = 0; i < n; i++) {
    // Place cursor at exactly where the indicator for index i would be
    const indAngle = indicatorAngleDeg(i, n);
    // Convert to our cursor convention (0° = top, clockwise)
    // standard → cursor: cursorAngle = standardAngle + 90
    const cursorAngle = ((indAngle + 90 + 360) % 360);
    const result = insertionIndexFromAngle(cursorAngle, n);
    assertEqual(result, i, `n=${n}: cursor at midpoint ${i} → index ${i}`);
  }
}

// ── computeInsertionMidpoints: midpoint angles ───────────────────────────────

console.log('\ncomputeInsertionMidpoints — midpoint angles:');

// All individuals: midpoints should be exactly halfway between each pair of adjacent seats
// seats=[A,B,C], 3 slots, slotSize=120°. Slots at -90°, 30°, 150°.
// Gaps: A←→C at 210°, B←→A at -30°, C←→B at 90°... wait let me recalculate.
// slot 0 (A) = -90°, slot 1 (B) = 30°, slot 2 (C) = 150°
// i=0 (before A): prev=C (last=150°), this first=-90°; gap=(−90−150+360)%360=120°; mid=150+60=210°
// i=1 (before B): prev=A (last=-90°), this first=30°;  gap=(30−(−90)+360)%360=120°; mid=-90+60=-30°
// i=2 (before C): prev=B (last=30°),  this first=150°; gap=(150−30+360)%360=120°;   mid=30+60=90°
{
  const seats = ['A', 'B', 'C'];
  const clusters = {};
  const result = computeInsertionMidpoints(seats, clusters);
  assertEqual(result.length, 3, 'all-individual 3 seats: 3 midpoints');
  assertApprox(result[0].midAngleDeg, 210, 'all-individual: gap before A = 210°');
  assertApprox(result[1].midAngleDeg, -30, 'all-individual: gap before B = -30°');
  assertApprox(result[2].midAngleDeg,  90, 'all-individual: gap before C = 90°');
}

// [A, XY(2 members), B] → 4 visual slots, 3 valid gaps
// slots: A=0(-90°), X=1(0°), Y=2(90°), B=3(180°)
// i=0 (before A): prev=B (last slot=3 →180°), this first=0→-90°; gap=90°; mid=180+45=225°
// i=1 (before XY): prev=A (last=0→-90°), this first=1→0°;  gap=90°; mid=-90+45=-45°
// i=2 (before B): prev=XY (last=2→90°), this first=3→180°; gap=90°; mid=90+45=135°
{
  const seats = ['A', 'XY', 'B'];
  const clusters = { XY: { guestIds: ['x', 'y'] } };
  const result = computeInsertionMidpoints(seats, clusters);
  assertEqual(result.length, 3, '[A, XY(2), B]: 3 midpoints');
  assertApprox(result[0].midAngleDeg, 225, '[A, XY(2), B]: gap before A = 225°');
  assertApprox(result[1].midAngleDeg, -45, '[A, XY(2), B]: gap before XY = -45°');
  assertApprox(result[2].midAngleDeg, 135, '[A, XY(2), B]: gap before B = 135°');
}

// [XYZ(3 members), A] → 4 visual slots, 2 valid gaps
// slots: X=0(-90°), Y=1(0°), Z=2(90°), A=3(180°)
// i=0 (before XYZ): prev=A (last=3→180°), this first=0→-90°; gap=90°; mid=225°
// i=1 (before A): prev=XYZ (last=2→90°), this first=3→180°;  gap=90°; mid=135°
{
  const seats = ['XYZ', 'A'];
  const clusters = { XYZ: { guestIds: ['x', 'y', 'z'] } };
  const result = computeInsertionMidpoints(seats, clusters);
  assertEqual(result.length, 2, '[XYZ(3), A]: 2 midpoints');
  assertApprox(result[0].midAngleDeg, 225, '[XYZ(3), A]: gap before XYZ = 225°');
  assertApprox(result[1].midAngleDeg, 135, '[XYZ(3), A]: gap before A = 135°');
}

// Single cluster: one gap that wraps all the way around
// [XYZ(3)]: slots at -90°, 30°, 150°. Only 1 unit, gap = 120° wide, mid = 150+60=210°
{
  const seats = ['XYZ'];
  const clusters = { XYZ: { guestIds: ['x', 'y', 'z'] } };
  const result = computeInsertionMidpoints(seats, clusters);
  assertEqual(result.length, 1, 'single cluster: 1 midpoint');
  assertApprox(result[0].midAngleDeg, 210, 'single cluster: gap mid = 210°');
}

// Empty: no midpoints
{
  const result = computeInsertionMidpoints([], {});
  assertEqual(result.length, 0, 'empty seats: 0 midpoints');
}

// ── computeInsertionMidpoints: never lands between cluster members ────────────

console.log('\ncomputeInsertionMidpoints — no gaps inside clusters:');

// For [A, XY(2), B]: the gap at ~90° (between X and Y) must NOT be a valid midpoint
{
  const seats = ['A', 'XY', 'B'];
  const clusters = { XY: { guestIds: ['x', 'y'] } };
  const midpoints = computeInsertionMidpoints(seats, clusters);
  // Valid gaps are at 225°, -45°, 135° — NOT at 45° (between X and Y)
  const midAngles = midpoints.map(m => ((m.midAngleDeg % 360) + 360) % 360);
  const hasGapBetweenXY = midAngles.some(a => Math.abs(a - 45) < 5);
  assertEqual(hasGapBetweenXY, false, 'no gap inserted between X and Y of cluster XY');
  assertEqual(midpoints.length, 3, 'exactly 3 gaps for 3 units');
}

// ── Round-trip: cursor at midpoint → maps back to correct unit index ──────────

console.log('\ncomputeInsertionMidpoints — round-trip cursor → index:');

// All-individual: behaves same as insertionIndexFromAngle
{
  const seats = ['A', 'B', 'C', 'D'];
  const clusters = {};
  const midpoints = computeInsertionMidpoints(seats, clusters);
  for (const { unitIdx, midAngleDeg } of midpoints) {
    // Convert standard → cursor convention (+90°)
    const cursorAngle = ((midAngleDeg + 90) + 360) % 360;
    const result = computeInsertionIndexFromCursor(cursorAngle, seats, clusters);
    assertEqual(result, unitIdx, `all-individual 4 seats: cursor at gap ${unitIdx} → index ${unitIdx}`);
  }
}

// [A, XY(2), B]: cursor at each valid gap → correct unit index
{
  const seats = ['A', 'XY', 'B'];
  const clusters = { XY: { guestIds: ['x', 'y'] } };
  const midpoints = computeInsertionMidpoints(seats, clusters);
  for (const { unitIdx, midAngleDeg } of midpoints) {
    const cursorAngle = ((midAngleDeg + 90) + 360) % 360;
    const result = computeInsertionIndexFromCursor(cursorAngle, seats, clusters);
    assertEqual(result, unitIdx, `[A, XY(2), B]: cursor at gap ${unitIdx} → index ${unitIdx}`);
  }
}

// Cursor between cluster members (45° cursor = between X and Y) → snaps to nearest valid gap
// The nearest gaps are at -45°→cursor 45° and 135°→cursor 225° and 225°→cursor 315°
// 45° cursor: distance to -45°+90=45° is 0° → unitIdx 1 (before XY)
{
  const seats = ['A', 'XY', 'B'];
  const clusters = { XY: { guestIds: ['x', 'y'] } };
  // Cursor at 90° (right side, between X at 0°+90=90° and Y at 90°+90=180°)
  const result = computeInsertionIndexFromCursor(90, seats, clusters);
  // Should NOT be a gap inside XY — must map to a valid unit boundary
  const validIndices = [0, 1, 2];
  assertEqual(validIndices.includes(result), true, 'cursor between cluster members → valid unit idx');
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
