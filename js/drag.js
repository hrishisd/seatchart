/**
 * drag.js — Pointer-event-based drag and drop for Seat Chart.
 *
 * Drag sources:
 *  - .guest-card[data-guest-id] in the unassigned panel
 *  - .cluster-card[data-cluster-id] in the unassigned panel
 *  - .seat-label[data-guest-id] on a table circle
 *
 * Drop targets:
 *  - .table-circle[data-table]  → assign/move/reorder
 *  - #unassigned-panel          → remove from table
 */

import {
  assignToTable,
  removeFromTable,
  reorderAtTable,
  moveToTable,
  getState,
} from './state.js';

import { showInsertionIndicator, clearInsertionIndicator } from './render.js';

// ── Drag state ────────────────────────────────────────────────────────────────

let drag = null;
/*
drag = {
  itemId:       string,           // guest or cluster ID
  itemType:     'guest'|'cluster',
  fromTable:    number|null,      // null = came from unassigned panel
  sourceEl:     Element,          // the original DOM element
  ghostEl:      Element,          // the floating clone
  pointerId:    number,
  startX:       number,
  startY:       number,
  currentTable: number|null,      // table being hovered
  insertionIdx: number,
}
*/

// ── Utilities ─────────────────────────────────────────────────────────────────

function createGhost(sourceEl, x, y) {
  const rect = sourceEl.getBoundingClientRect();
  const ghost = sourceEl.cloneNode(true);
  ghost.style.position = 'fixed';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.opacity = '0.75';
  ghost.style.zIndex = '9999';
  ghost.style.transition = 'none';
  ghost.style.margin = '0';
  // Reset any inherited transforms so the ghost stays where the original was
  ghost.style.transform = 'none';
  ghost.classList.add('dragging-ghost');
  document.body.appendChild(ghost);

  // Store offset from cursor to element top-left
  ghost._offsetX = rect.left - x;
  ghost._offsetY = rect.top - y;

  return ghost;
}

function moveGhost(ghost, x, y) {
  ghost.style.left = `${x + ghost._offsetX}px`;
  ghost.style.top = `${y + ghost._offsetY}px`;
}

/**
 * Hit-test elements under (x, y) ignoring the ghost.
 * Returns { tableEl, tableNum, unassignedEl }.
 *
 * For table detection we use distance-from-center rather than
 * elementsFromPoint, because the seat labels sit outside the circle's
 * border-radius and elementsFromPoint won't report .table-circle when
 * the cursor is in that outer ring.
 */
function hitTest(x, y) {
  // Check unassigned panel via elementsFromPoint
  const els = document.elementsFromPoint(x, y);
  let unassignedEl = null;
  for (const el of els) {
    if (el.id === 'unassigned-panel') {
      unassignedEl = el;
      break;
    }
  }

  // Check tables via distance from center (accounts for labels outside circle)
  let tableEl = null;
  let tableNum = null;
  let bestDist = Infinity;

  for (const circle of document.querySelectorAll('.table-circle[data-table]')) {
    const rect = circle.getBoundingClientRect();
    const r = rect.width / 2;
    const cx = rect.left + r;
    const cy = rect.top + r;
    const dist = Math.hypot(x - cx, y - cy);
    // Hit zone extends to r + 40 to cover seat labels around the perimeter
    if (dist <= r + 40 && dist < bestDist) {
      bestDist = dist;
      tableEl = circle;
      tableNum = Number(circle.dataset.table);
    }
  }

  return { tableEl, tableNum, unassignedEl };
}

/**
 * Given a cursor angle (0° = top, clockwise) and the number of displayed
 * seats, return the insertion index (0..seatCount-1).
 *
 * Seats are evenly spaced: seat i is at angle i * (360/seatCount).
 * Insertion index i means "insert at the midpoint before seat i"
 * (between seat i-1 and seat i, wrapping around).
 *
 * Exported for testing.
 */
export function insertionIndexFromAngle(cursorAngleDeg, seatCount) {
  if (seatCount === 0) return 0;

  const slotSize = 360 / seatCount;
  const angle = ((cursorAngleDeg % 360) + 360) % 360;

  // If the cursor is between seat i and seat i+1, the insertion index
  // is i+1 (insert before seat i+1, i.e. after seat i).
  // Boundaries fall exactly on seat positions.
  return (Math.floor(angle / slotSize) + 1) % seatCount;
}

/**
 * Compute insertion index from cursor position relative to a table circle.
 */
function computeInsertionIndex(tableEl, cursorX, cursorY, currentSeatsCount) {
  if (currentSeatsCount === 0) return 0;

  const rect = tableEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = cursorX - cx;
  const dy = cursorY - cy;

  // Convert to our angle convention: 0° = top, increasing clockwise
  let cursorAngle = Math.atan2(dy, dx) * (180 / Math.PI);
  cursorAngle = ((cursorAngle + 90 + 360) % 360);

  return insertionIndexFromAngle(cursorAngle, currentSeatsCount);
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onPointerDown(e) {
  if (e.button !== 0) return; // left click only

  const target = e.target;

  // Determine drag source
  let itemId = null;
  let itemType = null;
  let fromTable = null;
  let sourceEl = null;

  // Guest card in unassigned panel
  const guestCard = target.closest('.guest-card[data-guest-id]');
  if (guestCard && !target.closest('.cluster-card')) {
    itemId = guestCard.dataset.guestId;
    itemType = 'guest';
    sourceEl = guestCard;
    fromTable = null;
  }

  // Cluster card in unassigned panel
  if (!itemId) {
    const clusterCard = target.closest('.cluster-card[data-cluster-id]');
    if (clusterCard) {
      itemId = clusterCard.dataset.clusterId;
      itemType = 'cluster';
      sourceEl = clusterCard;
      fromTable = null;
    }
  }

  // Seat label on a table
  if (!itemId) {
    const seatLabel = target.closest('.seat-label[data-guest-id]');
    if (seatLabel) {
      const state = getState();
      const guestId = seatLabel.dataset.guestId;
      // If this guest is part of a cluster on the table, drag the cluster
      const clusterId = seatLabel.dataset.clusterId;
      if (clusterId && state.clusters[clusterId]) {
        itemId = clusterId;
        itemType = 'cluster';
      } else {
        itemId = guestId;
        itemType = 'guest';
      }
      // Find which table
      const tableCircle = target.closest('.table-circle[data-table]');
      if (tableCircle) fromTable = Number(tableCircle.dataset.table);
      sourceEl = seatLabel;
    }
  }

  if (!itemId) return;

  e.preventDefault();

  const ghost = createGhost(sourceEl, e.clientX, e.clientY);
  sourceEl.classList.add('drag-source-dimmed');

  // Capture pointer on the source element so we keep receiving events
  // even when the cursor leaves the element
  try {
    sourceEl.setPointerCapture(e.pointerId);
  } catch (_) {
    // Some browsers may not support this on all element types
  }

  drag = {
    itemId,
    itemType,
    fromTable,
    sourceEl,
    ghostEl: ghost,
    pointerId: e.pointerId,
    currentTable: null,
    insertionIdx: 0,
  };

  // Attach move/up listeners to the source element
  sourceEl.addEventListener('pointermove', onPointerMove);
  sourceEl.addEventListener('pointerup', onPointerUp);
  sourceEl.addEventListener('pointercancel', onPointerCancel);
}

function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();

  moveGhost(drag.ghostEl, e.clientX, e.clientY);

  const { tableEl, tableNum, unassignedEl } = hitTest(e.clientX, e.clientY);

  // Clear previous highlights
  document.querySelectorAll('.table-circle.drop-target').forEach((el) => {
    el.classList.remove('drop-target');
    clearInsertionIndicator(el);
  });
  document.getElementById('unassigned-panel')?.classList.remove('drop-target');

  drag.currentTable = null;
  drag.insertionIdx = 0;

  if (tableEl && tableNum) {
    tableEl.classList.add('drop-target');
    drag.currentTable = tableNum;

    // Compute insertion index
    const state = getState();
    const seats = state.tables[tableNum]?.seats ?? [];
    const draggedSeatIdx = seats.indexOf(drag.itemId);
    const isReorder = draggedSeatIdx !== -1;

    const displayCount = seats.length;
    let idx = computeInsertionIndex(tableEl, e.clientX, e.clientY, displayCount);

    if (isReorder) {
      // Collapse the two midpoints adjacent to the dragged seat into one.
      // Index d means "midpoint before seat d" and (d+1)%n means "midpoint
      // after seat d". Both should snap to "return to position d" and the
      // indicator shows at seat d's angle instead of a midpoint.
      const next = (draggedSeatIdx + 1) % displayCount;
      if (idx === draggedSeatIdx || idx === next) {
        idx = draggedSeatIdx;
      }
    }

    drag.insertionIdx = idx;

    showInsertionIndicator(tableEl, idx, displayCount,
      isReorder ? draggedSeatIdx : -1);
  } else if (unassignedEl) {
    unassignedEl.classList.add('drop-target');
  }
}

function onPointerUp(e) {
  if (!drag) return;
  e.preventDefault();

  finalizeDrop(e.clientX, e.clientY);
  cleanupDrag();
}

function onPointerCancel(e) {
  if (!drag) return;
  cleanupDrag();
}

function finalizeDrop(x, y) {
  const { tableEl, tableNum, unassignedEl } = hitTest(x, y);
  const state = getState();

  if (tableNum) {
    const seats = state.tables[tableNum]?.seats ?? [];
    const displayCount = seats.length;
    const idx = computeInsertionIndex(tableEl, x, y, displayCount);

    if (drag.fromTable === null) {
      // From unassigned → table: idx is a midpoint among current seats.
      // assignToTable inserts at the given position.
      assignToTable(drag.itemId, tableNum, idx);
    } else if (drag.fromTable === tableNum) {
      // Same table — reorder. idx is computed against the full seat list
      // (which includes the dragged item). reorderAtTable removes the item
      // first then inserts at the new index.
      reorderAtTable(tableNum, drag.itemId, idx);
    } else {
      // Different table
      moveToTable(drag.itemId, drag.fromTable, tableNum, idx);
    }
  } else if (unassignedEl) {
    if (drag.fromTable !== null) {
      // From table → unassigned
      removeFromTable(drag.itemId);
    }
    // If already unassigned, no-op
  }
  // Else dropped nowhere — no-op
}

function cleanupDrag() {
  if (!drag) return;

  // Remove ghost
  drag.ghostEl.remove();

  // Restore source element
  drag.sourceEl.classList.remove('drag-source-dimmed');

  // Release pointer capture
  try {
    drag.sourceEl.releasePointerCapture(drag.pointerId);
  } catch (_) {}

  // Remove listeners
  drag.sourceEl.removeEventListener('pointermove', onPointerMove);
  drag.sourceEl.removeEventListener('pointerup', onPointerUp);
  drag.sourceEl.removeEventListener('pointercancel', onPointerCancel);

  // Clear highlights
  document.querySelectorAll('.table-circle.drop-target').forEach((el) => {
    el.classList.remove('drop-target');
    clearInsertionIndicator(el);
  });
  document.getElementById('unassigned-panel')?.classList.remove('drop-target');

  drag = null;
}

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Attach drag listeners to the document so we capture all draggable elements
 * (including dynamically rendered ones) via event delegation.
 */
export function initDrag() {
  document.addEventListener('pointerdown', onPointerDown);
}
