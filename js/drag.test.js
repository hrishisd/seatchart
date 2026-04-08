/**
 * Tests for insertion index math.
 * Run: node js/drag.test.js
 *
 * We can't import the ES module directly in Node without a full ESM setup,
 * so we duplicate the pure function here. It's small enough that this is fine.
 */

// ── Copy of insertionIndexFromAngle from drag.js ─────────────────────────────
function insertionIndexFromAngle(cursorAngleDeg, seatCount) {
  if (seatCount === 0) return 0;
  const slotSize = 360 / seatCount;
  const angle = ((cursorAngleDeg % 360) + 360) % 360;
  return (Math.floor(angle / slotSize) + 1) % seatCount;
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

// ── insertionIndexFromAngle ──────────────────────────────────────────────────

console.log('insertionIndexFromAngle:');

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

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
