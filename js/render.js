/**
 * render.js — Renders the unassigned panel and tables panel.
 * Listens for 'state-changed' events and re-renders on change.
 */

import {
  getState,
  getUnassignedGuests,
  getUnassignedClusters,
  getGuestCount,
  createCluster,
  dissolveCluster,
  removeGuest,
} from './state.js';

// ── Selection state ───────────────────────────────────────────────────────────

// Set of selected guest IDs (only standalone unassigned guests)
const selectedGuestIds = new Set();
// Set of selected cluster IDs (unassigned clusters)
const selectedClusterIds = new Set();
// Last clicked guest ID for shift-click range selection
let lastClickedGuestId = null;

function clearSelection() {
  selectedGuestIds.clear();
  selectedClusterIds.clear();
  lastClickedGuestId = null;
}

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

    // Apply selected state
    if (selectedClusterIds.has(cluster.id)) {
      wrapper.classList.add('selected');
    }

    // Toggle cluster selection on click (ungroup button stops propagation so it's unaffected)
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedClusterIds.has(cluster.id)) {
        selectedClusterIds.delete(cluster.id);
      } else {
        selectedClusterIds.add(cluster.id);
      }
      const s = getState();
      renderUnassigned(s, buildDisplayNames(s));
    });

    // Apply cluster color to the border
    if (cluster.color) {
      wrapper.style.borderColor = cluster.color;
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'cluster-header';

    const label = document.createElement('div');
    label.className = 'cluster-label';
    label.textContent = `Group (${cluster.guestIds.length})`;
    if (cluster.color) {
      label.style.color = cluster.color;
    }
    headerRow.appendChild(label);

    const ungroupBtn = document.createElement('button');
    ungroupBtn.className = 'ungroup-btn';
    ungroupBtn.title = 'Ungroup';
    ungroupBtn.textContent = '✕';
    ungroupBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); // don't trigger drag
    });
    ungroupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dissolveCluster(cluster.id);
    });
    headerRow.appendChild(ungroupBtn);

    wrapper.appendChild(headerRow);

    for (const gid of cluster.guestIds) {
      const g = state.guests[gid];
      if (!g) continue;
      const card = makeGuestCard(g, displayNames, 'cluster');
      // Apply cluster color as left border
      if (cluster.color) {
        card.style.borderLeftWidth = '3px';
        card.style.borderLeftStyle = 'solid';
        card.style.borderLeftColor = cluster.color;
      }
      wrapper.appendChild(card);
    }
    panel.appendChild(wrapper);
  }

  // Render standalone unassigned guests
  for (const g of unassignedGuests) {
    const card = makeGuestCard(g, displayNames, 'unassigned');
    // Apply selected class
    if (selectedGuestIds.has(g.id)) {
      card.classList.add('selected');
    }
    // Click / shift-click / ctrl-click selection
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      handleGuestCardClick(e, g.id, unassignedGuests);
    });
    panel.appendChild(card);
  }

  // Sticky action button at the bottom — shown when 2+ items selected
  const totalSelected = selectedGuestIds.size + selectedClusterIds.size;
  if (totalSelected >= 2) {
    const stickyContainer = document.createElement('div');
    stickyContainer.className = 'group-btn-sticky';

    const groupBtn = document.createElement('button');
    groupBtn.className = 'group-btn';
    if (selectedClusterIds.size > 0) {
      const clusterGuestCount = [...selectedClusterIds].reduce(
        (sum, cid) => sum + (state.clusters[cid]?.guestIds.length ?? 0),
        0
      );
      groupBtn.textContent = `Merge selected (${selectedGuestIds.size + clusterGuestCount} guests)`;
    } else {
      groupBtn.textContent = `Group selected (${selectedGuestIds.size})`;
    }
    groupBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    groupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const allGuestIds = [...selectedGuestIds];
      for (const cid of selectedClusterIds) {
        const cluster = state.clusters[cid];
        if (cluster) allGuestIds.push(...cluster.guestIds);
      }
      for (const cid of [...selectedClusterIds]) {
        dissolveCluster(cid);
      }
      clearSelection();
      createCluster(allGuestIds);
    });
    stickyContainer.appendChild(groupBtn);
    panel.appendChild(stickyContainer);
  }

  if (unassignedGuests.length === 0 && unassignedClusters.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-message';
    empty.textContent = 'Everyone is seated!';
    panel.appendChild(empty);
  }
}

function handleGuestCardClick(e, guestId, unassignedGuests) {
  if (e.ctrlKey || e.metaKey) {
    // Toggle this guest
    if (selectedGuestIds.has(guestId)) {
      selectedGuestIds.delete(guestId);
    } else {
      selectedGuestIds.add(guestId);
      lastClickedGuestId = guestId;
    }
  } else if (e.shiftKey && lastClickedGuestId) {
    // Select range from lastClickedGuestId to this one
    const ids = unassignedGuests.map((g) => g.id);
    const fromIdx = ids.indexOf(lastClickedGuestId);
    const toIdx = ids.indexOf(guestId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      selectedGuestIds.clear();
      for (let i = lo; i <= hi; i++) {
        selectedGuestIds.add(ids[i]);
      }
    }
  } else {
    // Select only this guest
    selectedGuestIds.clear();
    selectedGuestIds.add(guestId);
    lastClickedGuestId = guestId;
  }

  // Re-render the unassigned panel to update selection highlights
  const state = getState();
  const displayNames = buildDisplayNames(state);
  renderUnassigned(state, displayNames);
}

function makeDeleteBtn(guestId) {
  const btn = document.createElement('button');
  btn.className = 'guest-delete-btn';

  function showNormal() {
    btn.textContent = '×';
    btn.title = 'Remove guest';
    btn.style.display = '';
    btn.style.alignItems = '';
    btn.style.gap = '';
  }

  function showConfirm() {
    btn.textContent = '';
    btn.title = '';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '3px';

    const label = document.createElement('span');
    label.className = 'delete-confirm-label';
    label.textContent = 'Delete?';

    const yes = document.createElement('button');
    yes.className = 'delete-confirm-yes';
    yes.textContent = 'Yes';

    const no = document.createElement('button');
    no.className = 'delete-confirm-no';
    no.textContent = 'No';

    for (const el of [yes, no]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    yes.addEventListener('click', (e) => {
      e.stopPropagation();
      document.removeEventListener('click', outsideClick);
      removeGuest(guestId);
    });

    no.addEventListener('click', (e) => {
      e.stopPropagation();
      document.removeEventListener('click', outsideClick);
      showNormal();
    });

    btn.appendChild(label);
    btn.appendChild(yes);
    btn.appendChild(no);

    function outsideClick(e) {
      if (!btn.contains(e.target)) {
        document.removeEventListener('click', outsideClick);
        showNormal();
      }
    }
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
  }

  showNormal();

  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirm();
  });

  return btn;
}

function makeGuestCard(guest, displayNames, context) {
  const card = document.createElement('div');
  card.className = 'guest-card';
  card.dataset.guestId = guest.id;
  card.dataset.context = context;
  card.title = fullName(guest);
  const nameSpan = document.createElement('span');
  nameSpan.textContent = displayNames[guest.id] ?? guest.firstName;
  card.appendChild(nameSpan);
  card.appendChild(makeDeleteBtn(guest.id));
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

// Constants for dynamic cell sizing (must match placeSeatsAroundCircle's labelR = r + 20)
const LABEL_R_OFFSET = 20;
const HALF_LABEL_W = 35;  // ~half of a typical name label width (~70px)
const HALF_LABEL_H = 10;  // ~half of label height (~20px)
const CELL_H_GAP = 24;    // horizontal padding between adjacent label zones
const CELL_V_GAP = 32;    // vertical padding between adjacent label zones

/**
 * Compute the required cell dimensions for a table with the given guest count.
 * Based on the table radius and the extent of name labels around the perimeter.
 */
export function computeCellSize(guestCount) {
  const r = tableRadius(guestCount);
  const labelR = r + LABEL_R_OFFSET;
  return {
    w: 2 * (labelR + HALF_LABEL_W) + CELL_H_GAP,
    h: 2 * (labelR + HALF_LABEL_H) + CELL_V_GAP,
  };
}

/**
 * Compute honeycomb grid positions for an array of cells with variable sizes.
 * Returns an array of { x, y, w, h } — one per input cell — where w/h are the
 * column/row maximums (so the table circle stays centered within its cell).
 *
 * @param {Array<{w: number, h: number}>} cellSizes
 * @param {number} gridWidth - available width for the grid
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
export function computeHoneycombLayout(cellSizes, gridWidth) {
  if (cellSizes.length === 0) return [];

  const maxCellW = Math.max(...cellSizes.map((s) => s.w));
  const cols = Math.max(3, Math.floor(gridWidth / maxCellW));
  const numRows = Math.ceil(cellSizes.length / cols);

  // Per-column widths: max of all cells in that column
  const colWidths = new Array(cols).fill(0);
  for (let i = 0; i < cellSizes.length; i++) {
    const col = i % cols;
    colWidths[col] = Math.max(colWidths[col], cellSizes[i].w);
  }

  // Per-row heights: max of all cells in that row
  const rowHeights = new Array(numRows).fill(0);
  for (let i = 0; i < cellSizes.length; i++) {
    const row = Math.floor(i / cols);
    rowHeights[row] = Math.max(rowHeights[row], cellSizes[i].h);
  }

  // Cumulative x-offsets
  const colX = new Array(cols).fill(0);
  for (let c = 1; c < cols; c++) {
    colX[c] = colX[c - 1] + colWidths[c - 1];
  }

  // Cumulative y-offsets
  const rowY = new Array(numRows).fill(0);
  for (let r = 1; r < numRows; r++) {
    rowY[r] = rowY[r - 1] + rowHeights[r - 1];
  }

  const totalRowWidth = colWidths.reduce((a, b) => a + b, 0);
  const honeycombOffset = totalRowWidth / cols / 2; // half the average column width

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

  // We'll lay out in a grid; actual column count computed after render
  // Use a wrapper that we measure after mount
  const grid = document.createElement('div');
  grid.className = 'tables-grid';
  panel.appendChild(grid);

  const cellSizes = [];

  // Render each table
  for (const num of tableNums) {
    const table = state.tables[num];
    const guestCount = getGuestCount(num);
    const r = tableRadius(guestCount);
    const diameter = r * 2;
    const { w: cellW, h: cellH } = computeCellSize(guestCount);

    const { minCapacity, maxCapacity } = state.settings;
    let capacityClass = '';
    if (maxCapacity !== null && guestCount > maxCapacity) {
      capacityClass = 'over-max';
    } else if (minCapacity !== null && guestCount < minCapacity) {
      capacityClass = 'under-min';
    }

    const cell = document.createElement('div');
    cell.className = 'table-cell';
    cell.style.width = `${cellW}px`;
    cell.style.height = `${cellH}px`;

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
    cellSizes.push({ w: cellW, h: cellH });
  }

  // After rendering, apply honeycomb offsets
  applyHoneycombLayout(grid, cellSizes);
}

/**
 * Expand a seats array (which may contain cluster IDs) into a flat list of
 * visual slot entries. Each cluster member gets its own angular slot.
 *
 * Returns an array of:
 *   { guestId, clusterId /* null if individual *\/, visualIndex }
 *
 * Example: seats=[guestA, clusterX(2 members), guestB]
 * → [
 *     { guestId: guestA, clusterId: null,     visualIndex: 0 },
 *     { guestId: m1,     clusterId: clusterX, visualIndex: 1 },
 *     { guestId: m2,     clusterId: clusterX, visualIndex: 2 },
 *     { guestId: guestB, clusterId: null,     visualIndex: 3 },
 *   ]
 */
export function expandSeats(seats, clusters) {
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

/**
 * Place name labels around the perimeter of the table circle.
 * Seats start at the top (−90°) and go clockwise.
 * Cluster members each get their own equally-spaced angular slot.
 */
function placeSeatsAroundCircle(circle, seats, r, state, displayNames) {
  if (seats.length === 0) return;

  const expanded = expandSeats(seats, state.clusters);
  const totalSlots = expanded.length;
  const labelR = r + 20; // distance from center to label center
  const startAngleDeg = -90; // top of circle

  // Track cluster member angles for drawing arcs: clusterId → [angleDeg, ...]
  const clusterAngles = {};

  for (const entry of expanded) {
    const { guestId, clusterId, visualIndex } = entry;
    const g = state.guests[guestId];
    if (!g) continue;

    const angleDeg = startAngleDeg + (360 / totalSlots) * visualIndex;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = r + labelR * Math.cos(angleRad);
    const y = r + labelR * Math.sin(angleRad);

    if (clusterId) {
      const cluster = state.clusters[clusterId];
      if (!clusterAngles[clusterId]) clusterAngles[clusterId] = [];
      clusterAngles[clusterId].push(angleDeg);

      const label = makeSeatLabel(g, displayNames, 'table-cluster', r, visualIndex, totalSlots);
      label.dataset.clusterId = clusterId;
      if (cluster && cluster.color) {
        label.style.borderLeftWidth = '3px';
        label.style.borderLeftStyle = 'solid';
        label.style.borderLeftColor = cluster.color;
      }
      positionLabel(label, x, y);
      circle.appendChild(label);
    } else {
      const label = makeSeatLabel(g, displayNames, 'table', r, visualIndex, totalSlots);
      positionLabel(label, x, y);
      circle.appendChild(label);
    }
  }

  // Draw SVG arc overlays for each cluster at this table
  if (Object.keys(clusterAngles).length > 0) {
    drawClusterArcs(circle, r, labelR, clusterAngles, state.clusters);
  }
}

/**
 * Draw faint dotted SVG arcs connecting each cluster's members around the table perimeter.
 * Uses cluster color if available, falls back to the default accent color.
 */
function drawClusterArcs(circle, r, arcR, clusterAngles, clusters) {
  const size = r * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.style.position = 'absolute';
  svg.style.left = '0';
  svg.style.top = '0';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '1';
  svg.style.overflow = 'visible';

  for (const [clusterId, angles] of Object.entries(clusterAngles)) {
    if (angles.length < 2) continue;

    const startDeg = angles[0];
    const endDeg = angles[angles.length - 1];

    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;

    const cx = r; // center of circle div
    const cy = r;

    const x1 = cx + arcR * Math.cos(startRad);
    const y1 = cy + arcR * Math.sin(startRad);
    const x2 = cx + arcR * Math.cos(endRad);
    const y2 = cy + arcR * Math.sin(endRad);

    // Use a large-radius arc so the path curves outward with the circle
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    // SVG arc: A rx ry x-rotation large-arc-flag sweep-flag x y
    // sweep-flag=1 = clockwise
    // large-arc-flag: 0 if the arc spans less than 180°, else 1
    const spanDeg = endDeg - startDeg;
    const largeArc = spanDeg > 180 ? 1 : 0;
    const d = `M ${x1} ${y1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${x2} ${y2}`;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');

    // Use cluster color if available
    const clusterColor = clusters?.[clusterId]?.color;
    const strokeColor = clusterColor
      ? clusterColor + '99' // add alpha: ~60% opacity
      : 'rgba(124, 143, 255, 0.45)';
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '4 3');
    path.setAttribute('stroke-linecap', 'round');

    svg.appendChild(path);
  }

  circle.appendChild(svg);
}

function makeSeatLabel(guest, displayNames, context, _r, _seatIdx, _total) {
  const label = document.createElement('div');
  label.className = 'seat-label';
  label.dataset.guestId = guest.id;
  label.dataset.context = context;
  label.title = fullName(guest);
  const nameSpan = document.createElement('span');
  nameSpan.textContent = displayNames[guest.id] ?? guest.firstName;
  label.appendChild(nameSpan);
  label.appendChild(makeDeleteBtn(guest.id));
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
 * Apply a honeycomb (brick) offset layout to a grid of variable-size cells.
 * Even rows (0-indexed) are at normal x; odd rows are offset by half the average column width.
 * Cell dimensions are expanded to the column/row maximum so the table circle stays centered.
 */
function applyHoneycombLayout(grid, cellSizes) {
  const gridWidth = grid.parentElement?.clientWidth ?? 800;
  const positions = computeHoneycombLayout(cellSizes, gridWidth);

  const cells = Array.from(grid.children);
  let maxBottom = 0;
  let maxRight = 0;

  cells.forEach((cell, i) => {
    const { x, y, w, h } = positions[i];
    cell.style.position = 'absolute';
    cell.style.left = `${x}px`;
    cell.style.top = `${y}px`;
    cell.style.width = `${w}px`;
    cell.style.height = `${h}px`;

    maxBottom = Math.max(maxBottom, y + h);
    maxRight = Math.max(maxRight, x + w);
  });

  grid.style.position = 'relative';
  grid.style.height = `${maxBottom}px`;
  grid.style.width = `${maxRight}px`;
}

// ── Drop-zone insertion indicator ─────────────────────────────────────────────

/**
 * Compute the midpoint angle (standard math convention, -90° = top) for each
 * valid insertion gap between units. A "unit" is either an individual guest or
 * a whole cluster. Gaps only exist BETWEEN units — never between cluster members.
 *
 * Returns an array of { unitIdx, midAngleDeg } with one entry per unit:
 *   unitIdx i  → "insert before seats[i]" (i.e. in the gap between seats[i-1] and seats[i])
 *   midAngleDeg → the angle of that gap's midpoint, in standard math convention
 *
 * Exported for testing.
 */
export function computeInsertionMidpoints(seats, clusters) {
  if (seats.length === 0) return [];
  const expanded = expandSeats(seats, clusters);
  const totalSlots = expanded.length;
  if (totalSlots === 0) return [];
  const slotSize = 360 / totalSlots;

  // Build map: seatId → { first, last } visual slot index
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

    // Angles in standard math convention (-90° = top, increasing clockwise)
    const firstAngle = -90 + firstSlot * slotSize;
    const lastAnglePrev = -90 + lastSlotPrev * slotSize;

    // Clockwise gap from lastAnglePrev to firstAngle, then take the midpoint
    const gapCW = ((firstAngle - lastAnglePrev) + 360) % 360;
    return { unitIdx: i, midAngleDeg: lastAnglePrev + gapCW / 2 };
  });
}

/**
 * Show a visual insertion indicator dot on a table element.
 *
 * @param tableEl        - the .table-circle element
 * @param insertionIndex - unit-level index into seats where item will be inserted
 * @param seats          - table's seats array (guestIds and clusterIds)
 * @param clusters       - clusters map from state
 * @param draggedSeatIdx - when reordering, the unit-level index of the dragged
 *   item; if insertionIndex === draggedSeatIdx the dot appears at the unit's
 *   visual center (not a midpoint). Pass -1 when not reordering.
 */
export function showInsertionIndicator(tableEl, insertionIndex, seats, clusters, draggedSeatIdx = -1) {
  clearInsertionIndicator(tableEl);

  const r = tableEl.offsetWidth / 2;
  const labelR = r + 20;
  let angleDeg;

  if (seats.length === 0) {
    angleDeg = -90;
  } else if (draggedSeatIdx >= 0 && insertionIndex === draggedSeatIdx) {
    // Reorder: dot at the visual center of the dragged unit's slots
    const expanded = expandSeats(seats, clusters);
    const totalSlots = expanded.length;
    const seatId = seats[draggedSeatIdx];
    const slots = expanded
      .filter((e) => (e.clusterId ?? e.guestId) === seatId)
      .map((e) => e.visualIndex);
    const avgSlot = slots.length > 0
      ? slots.reduce((a, b) => a + b, 0) / slots.length
      : draggedSeatIdx;
    angleDeg = -90 + avgSlot * (360 / totalSlots);
  } else {
    const midpoints = computeInsertionMidpoints(seats, clusters);
    const mp = midpoints.find((m) => m.unitIdx === insertionIndex);
    angleDeg = mp?.midAngleDeg ?? -90;
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

// Listen for state changes — clear selection when unassigned guest list changes
document.addEventListener('state-changed', () => {
  // Clear selection on state change (guest assignments may have changed)
  clearSelection();
  renderAll();
});
