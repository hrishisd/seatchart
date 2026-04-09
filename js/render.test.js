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

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
