/**
 * render.js — Renders the unassigned panel and tables panel.
 * Listens for 'state-changed' events and re-renders on change.
 */

import {
  getState,
  getUnassignedGuests,
  getUnassignedClusters,
  getGuestCount,
} from './state.js';

// ── Name disambiguation ───────────────────────────────────────────────────────

/**
 * Build a map from guestId → display name.
 * If two guests share a first name, both get "First L." format.
 */
function buildDisplayNames(state) {
  const firstNameCounts = {};
  for (const g of Object.values(state.guests)) {
    const fn = g.firstName;
    firstNameCounts[fn] = (firstNameCounts[fn] ?? 0) + 1;
  }
  const map = {};
  for (const g of Object.values(state.guests)) {
    if (firstNameCounts[g.firstName] > 1 && g.lastName) {
      map[g.id] = `${g.firstName} ${g.lastName.charAt(0)}.`;
    } else {
      map[g.id] = g.firstName;
    }
  }
  return map;
}

function fullName(g) {
  return g.lastName ? `${g.firstName} ${g.lastName}` : g.firstName;
}

// ── Unassigned Panel ──────────────────────────────────────────────────────────

function renderUnassigned(state, displayNames) {
  const panel = document.getElementById('unassigned-panel');
  if (!panel) return;

  const unassignedGuests = getUnassignedGuests();
  const unassignedClusters = getUnassignedClusters();

  panel.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'panel-heading';
  const total = unassignedGuests.length +
    unassignedClusters.reduce((s, c) => s + c.guestIds.length, 0);
  heading.textContent = `Unassigned (${total})`;
  panel.appendChild(heading);

  // Render unassigned clusters
  for (const cluster of unassignedClusters) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cluster-card';
    wrapper.dataset.clusterId = cluster.id;

    const label = document.createElement('div');
    label.className = 'cluster-label';
    label.textContent = `Group (${cluster.guestIds.length})`;
    wrapper.appendChild(label);

    for (const gid of cluster.guestIds) {
      const g = state.guests[gid];
      if (!g) continue;
      const card = makeGuestCard(g, displayNames, 'cluster');
      wrapper.appendChild(card);
    }
    panel.appendChild(wrapper);
  }

  // Render standalone unassigned guests
  for (const g of unassignedGuests) {
    const card = makeGuestCard(g, displayNames, 'unassigned');
    panel.appendChild(card);
  }

  if (unassignedGuests.length === 0 && unassignedClusters.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = 'Everyone is seated!';
    panel.appendChild(empty);
  }
}

function makeGuestCard(guest, displayNames, context) {
  const card = document.createElement('div');
  card.className = 'guest-card';
  card.dataset.guestId = guest.id;
  card.dataset.context = context;
  card.title = fullName(guest);
  card.textContent = displayNames[guest.id] ?? guest.firstName;
  return card;
}

// ── Tables Panel ─────────────────────────────────────────────────────────────

const TABLE_MIN_R = 64;   // px, minimum radius
const TABLE_MAX_R = 120;  // px, maximum radius
const GUESTS_FOR_MAX = 12; // guest count that yields max radius

function tableRadius(guestCount) {
  if (guestCount <= 0) return TABLE_MIN_R;
  const t = Math.min(guestCount / GUESTS_FOR_MAX, 1);
  return TABLE_MIN_R + t * (TABLE_MAX_R - TABLE_MIN_R);
}

function renderTables(state, displayNames) {
  const panel = document.getElementById('tables-panel');
  if (!panel) return;

  panel.innerHTML = '';

  const tableNums = Object.keys(state.tables)
    .map(Number)
    .sort((a, b) => a - b);

  if (tableNums.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = 'No tables yet.';
    panel.appendChild(empty);
    return;
  }

  // Use a fixed logical cell size for honeycomb layout
  const CELL_W = TABLE_MAX_R * 2 + 32; // diameter + gap
  const CELL_H = TABLE_MAX_R * 2 + 48;

  // We'll lay out in a grid; actual column count computed after render
  // Use a wrapper that we measure after mount
  const grid = document.createElement('div');
  grid.className = 'tables-grid';
  panel.appendChild(grid);

  // Render each table
  for (const num of tableNums) {
    const table = state.tables[num];
    const guestCount = getGuestCount(num);
    const r = tableRadius(guestCount);
    const diameter = r * 2;

    const { minCapacity, maxCapacity } = state.settings;
    let capacityClass = '';
    if (maxCapacity !== null && guestCount > maxCapacity) {
      capacityClass = 'over-max';
    } else if (minCapacity !== null && guestCount < minCapacity) {
      capacityClass = 'under-min';
    }

    const cell = document.createElement('div');
    cell.className = 'table-cell';
    cell.style.width = `${CELL_W}px`;
    cell.style.height = `${CELL_H}px`;

    const circle = document.createElement('div');
    circle.className = `table-circle ${capacityClass}`;
    circle.style.width = `${diameter}px`;
    circle.style.height = `${diameter}px`;
    circle.dataset.table = num;

    // Table number label
    const numLabel = document.createElement('div');
    numLabel.className = 'table-number';
    numLabel.textContent = num;
    circle.appendChild(numLabel);

    // Capacity label
    const capLabel = document.createElement('div');
    capLabel.className = `table-capacity ${capacityClass}`;
    if (maxCapacity !== null) {
      capLabel.textContent = `${guestCount} / ${maxCapacity}`;
    } else {
      capLabel.textContent = guestCount > 0 ? String(guestCount) : '';
    }
    circle.appendChild(capLabel);

    // Place guest/cluster names around the perimeter
    placeSeatsAroundCircle(circle, table.seats, r, state, displayNames);

    cell.appendChild(circle);
    grid.appendChild(cell);
  }

  // After rendering, apply honeycomb offsets
  applyHoneycombLayout(grid, CELL_W, CELL_H);
}

/**
 * Place name labels around the perimeter of the table circle.
 * Seats start at the top (−90°) and go clockwise.
 */
function placeSeatsAroundCircle(circle, seats, r, state, displayNames) {
  if (seats.length === 0) return;

  const count = seats.length;
  const labelR = r + 20; // distance from center to label center
  const startAngleDeg = -90; // top of circle

  for (let i = 0; i < count; i++) {
    const id = seats[i];
    const angleDeg = startAngleDeg + (360 / count) * i;
    const angleRad = (angleDeg * Math.PI) / 180;

    const x = r + labelR * Math.cos(angleRad); // relative to top-left of circle
    const y = r + labelR * Math.sin(angleRad);

    if (state.guests[id]) {
      // Single guest
      const g = state.guests[id];
      const label = makeSeatLabel(g, displayNames, 'table', r, i, seats.length);
      positionLabel(label, x, y);
      circle.appendChild(label);
    } else if (state.clusters[id]) {
      // Cluster — render each member
      const cluster = state.clusters[id];
      const memberCount = cluster.guestIds.length;
      const spread = memberCount > 1 ? 20 : 0; // degrees to spread members

      for (let m = 0; m < memberCount; m++) {
        const gid = cluster.guestIds[m];
        const g = state.guests[gid];
        if (!g) continue;

        const offset = memberCount > 1
          ? spread * (m / (memberCount - 1) - 0.5)
          : 0;
        const memberAngleDeg = angleDeg + offset;
        const memberAngleRad = (memberAngleDeg * Math.PI) / 180;
        const mx = r + labelR * Math.cos(memberAngleRad);
        const my = r + labelR * Math.sin(memberAngleRad);

        const label = makeSeatLabel(g, displayNames, 'table-cluster', r, i, seats.length);
        label.dataset.clusterId = id;
        positionLabel(label, mx, my);
        circle.appendChild(label);
      }
    }
  }
}

function makeSeatLabel(guest, displayNames, context, _r, _seatIdx, _total) {
  const label = document.createElement('div');
  label.className = 'seat-label';
  label.dataset.guestId = guest.id;
  label.dataset.context = context;
  label.title = fullName(guest);
  label.textContent = displayNames[guest.id] ?? guest.firstName;
  return label;
}

function positionLabel(el, cx, cy) {
  // cx, cy are the center coordinates within the circle div
  // We use translate(-50%, -50%) so the label is centered on that point
  el.style.position = 'absolute';
  el.style.left = `${cx}px`;
  el.style.top = `${cy}px`;
  el.style.transform = 'translate(-50%, -50%)';
}

/**
 * Apply a honeycomb (brick) offset layout to a grid of fixed-size cells.
 * Even rows (0-indexed) are at normal x; odd rows are offset by half a cell width.
 */
function applyHoneycombLayout(grid, cellW, cellH) {
  const gridWidth = grid.parentElement?.clientWidth ?? 800;
  const cols = Math.max(1, Math.floor(gridWidth / cellW));

  const cells = Array.from(grid.children);
  const totalCells = cells.length;

  let maxBottom = 0;

  cells.forEach((cell, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const offsetX = row % 2 === 1 ? cellW / 2 : 0;

    const x = col * cellW + offsetX;
    const y = row * cellH;

    cell.style.position = 'absolute';
    cell.style.left = `${x}px`;
    cell.style.top = `${y}px`;

    maxBottom = Math.max(maxBottom, y + cellH);
  });

  grid.style.position = 'relative';
  grid.style.height = `${maxBottom}px`;

  // Adjust grid width to fit odd-row overflow
  const maxCols = Math.min(cols, totalCells);
  const maxRow = Math.ceil(totalCells / cols) - 1;
  const hasOddRow = maxRow % 2 === 1;
  const extraWidth = hasOddRow ? cellW / 2 : 0;
  grid.style.width = `${maxCols * cellW + extraWidth}px`;
}

// ── Drop-zone insertion indicator ─────────────────────────────────────────────

/**
 * Show a visual insertion indicator on a table at the given insertion index.
 * Called by drag.js during pointermove over a table.
 *
 * The indicator appears at the midpoint between seat (insertionIndex - 1) and
 * seat (insertionIndex), using the same angular positions as the existing
 * seat labels. For an empty table, it appears at the top.
 */
/**
 * @param {number} draggedSeatIdx — When reordering, the index of the seat
 *   being dragged. If insertionIndex === draggedSeatIdx, the dot appears
 *   at the seat's own position (not a midpoint). Pass -1 when not reordering.
 */
export function showInsertionIndicator(tableEl, insertionIndex, totalSeats, draggedSeatIdx = -1) {
  clearInsertionIndicator(tableEl);

  const r = tableEl.offsetWidth / 2;
  const labelR = r + 20;
  let angleDeg;

  if (totalSeats === 0) {
    angleDeg = -90;
  } else if (draggedSeatIdx >= 0 && insertionIndex === draggedSeatIdx) {
    // Reorder: show dot at the dragged seat's own position
    const slotSize = 360 / totalSeats;
    angleDeg = -90 + insertionIndex * slotSize;
  } else {
    const slotSize = 360 / totalSeats;
    angleDeg = -90 + (insertionIndex - 0.5) * slotSize;
  }

  const angleRad = (angleDeg * Math.PI) / 180;
  const x = r + labelR * Math.cos(angleRad);
  const y = r + labelR * Math.sin(angleRad);

  const dot = document.createElement('div');
  dot.className = 'insertion-indicator';
  dot.style.position = 'absolute';
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  dot.style.transform = 'translate(-50%, -50%)';
  tableEl.appendChild(dot);
}

export function clearInsertionIndicator(tableEl) {
  if (!tableEl) return;
  for (const el of tableEl.querySelectorAll('.insertion-indicator')) {
    el.remove();
  }
}

// ── Main render entry point ───────────────────────────────────────────────────

export function renderAll() {
  const state = getState();
  const displayNames = buildDisplayNames(state);
  renderUnassigned(state, displayNames);
  renderTables(state, displayNames);
}

// Listen for state changes
document.addEventListener('state-changed', renderAll);
