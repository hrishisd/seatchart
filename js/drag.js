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
  mergeClusters,
  reorderInCluster,
  getState,
} from './state.js';

import { showInsertionIndicator, clearInsertionIndicator, computeInsertionMidpoints } from './render.js';

// ── Drag state ────────────────────────────────────────────────────────────────

let drag = null;
/*
drag = {
  itemId:         string,           // guest or cluster ID
  itemType:       'guest'|'cluster'|'cluster-member',
  fromTable:      number|null,      // null = came from unassigned panel
  clusterId:      string|null,      // for 'cluster-member' type: the parent cluster
  sourceEl:       Element,          // the original DOM element
  ghostEl:        Element,          // the floating clone
  pointerId:      number,
  startX:         number,
  startY:         number,
  currentTable:   number|null,      // table being hovered
  insertionIdx:   number,
  mergeTargetId:  string|null,      // cluster ID to merge into (unassigned panel only)
  clusterInsertIdx: number,         // for 'cluster-member' type: insertion index within cluster
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
 * Create a cluster-card-like ghost showing all cluster members.
 * Used when dragging a cluster from a table.
 */
function createClusterGhost(clusterId, x, y) {
  const state = getState();
  const cluster = state.clusters[clusterId];
  if (!cluster) return null;

  const ghost = document.createElement('div');
  ghost.className = 'cluster-card dragging-ghost';
  ghost.style.position = 'fixed';
  ghost.style.pointerEvents = 'none';
  ghost.style.opacity = '0.75';
  ghost.style.zIndex = '9999';
  ghost.style.margin = '0';
  ghost.style.transform = 'none';

  for (const guestId of cluster.guestIds) {
    const guest = state.guests[guestId];
    if (!guest) continue;
    const card = document.createElement('div');
    card.className = 'guest-card';
    card.textContent = `${guest.firstName} ${guest.lastName}`.trim();
    if (cluster.color) {
      card.style.borderLeftWidth = '3px';
      card.style.borderLeftStyle = 'solid';
      card.style.borderLeftColor = cluster.color;
    }
    ghost.appendChild(card);
  }

  document.body.appendChild(ghost);

  // Center ghost on cursor (offset so cursor is roughly at top of card)
  const rect = ghost.getBoundingClientRect();
  ghost._offsetX = -(rect.width / 2);
  ghost._offsetY = -(rect.height / 2);
  ghost.style.left = `${x + ghost._offsetX}px`;
  ghost.style.top = `${y + ghost._offsetY}px`;

  return ghost;
}

/**
 * Hit-test elements under (x, y) ignoring the ghost.
 * Returns { tableEl, tableNum, unassignedEl, mergeClusterEl, mergeClusterId }.
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
  let mergeClusterEl = null;
  let mergeClusterId = null;

  for (const el of els) {
    if (el.id === 'unassigned-panel') {
      unassignedEl = el;
    }
    // Check if cursor is over a cluster card (potential merge target)
    if (!mergeClusterEl) {
      const clusterCard = el.closest?.('.cluster-card[data-cluster-id]');
      if (clusterCard && clusterCard.dataset.clusterId !== drag?.itemId) {
        mergeClusterEl = clusterCard;
        mergeClusterId = clusterCard.dataset.clusterId;
      }
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

  return { tableEl, tableNum, unassignedEl, mergeClusterEl, mergeClusterId };
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
 * Compute the unit-level insertion index from cursor position.
 * Maps the cursor angle to the nearest valid gap between units, skipping
 * over gaps that are between cluster members (which are not valid insertion points).
 */
function computeInsertionIndex(tableEl, cursorX, cursorY, seats, clusters) {
  if (seats.length === 0) return 0;

  const rect = tableEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = cursorX - cx;
  const dy = cursorY - cy;

  // Cursor angle in our convention: 0° = top, increasing clockwise
  let cursorAngle = Math.atan2(dy, dx) * (180 / Math.PI);
  cursorAngle = ((cursorAngle + 90 + 360) % 360);

  // Get valid insertion midpoints (standard convention) and find nearest
  const midpoints = computeInsertionMidpoints(seats, clusters);
  if (midpoints.length === 0) return 0;

  let bestIdx = midpoints[0].unitIdx;
  let bestDist = Infinity;

  for (const { unitIdx, midAngleDeg } of midpoints) {
    // Convert standard angle to cursor convention: cursor = standard + 90
    const midCursorAngle = ((midAngleDeg + 90) + 360) % 360;
    const dist = Math.min(
      (midCursorAngle - cursorAngle + 360) % 360,
      (cursorAngle - midCursorAngle + 360) % 360,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = unitIdx;
    }
  }

  return bestIdx;
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

  // Cluster-member reorder: guest card inside an unassigned cluster card
  // Must check this BEFORE the generic cluster-card check.
  const guestCardInCluster = target.closest('.guest-card[data-guest-id]');
  if (guestCardInCluster) {
    const parentClusterCard = guestCardInCluster.closest('.cluster-card[data-cluster-id]');
    if (parentClusterCard) {
      const cid = parentClusterCard.dataset.clusterId;
      const state = getState();
      // Only if the cluster is unassigned (not at any table)
      const isAtTable = Object.values(state.tables).some((t) => t.seats.includes(cid));
      if (!isAtTable) {
        itemId = guestCardInCluster.dataset.guestId;
        itemType = 'cluster-member';
        sourceEl = guestCardInCluster;
        fromTable = null;
        // We'll set drag.clusterId after creating drag object
      }
    }
  }

  // Guest card in unassigned panel (standalone)
  if (!itemId) {
    const guestCard = target.closest('.guest-card[data-guest-id]');
    if (guestCard && !target.closest('.cluster-card')) {
      itemId = guestCard.dataset.guestId;
      itemType = 'guest';
      sourceEl = guestCard;
      fromTable = null;
    }
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

  // For a cluster dragged from a table, use a cluster-card ghost and dim all members.
  // For everything else, clone the source element.
  let ghost;
  const isDraggingClusterFromTable = itemType === 'cluster' && fromTable !== null;
  if (isDraggingClusterFromTable) {
    ghost = createClusterGhost(itemId, e.clientX, e.clientY);
    // Dim all cluster member seat labels in that table
    const tableCircle = sourceEl.closest('.table-circle[data-table]');
    if (tableCircle) {
      tableCircle.querySelectorAll(`.seat-label[data-cluster-id="${itemId}"]`).forEach((el) => {
        el.classList.add('drag-source-dimmed');
      });
    }
  } else {
    ghost = createGhost(sourceEl, e.clientX, e.clientY);
    sourceEl.classList.add('drag-source-dimmed');
  }

  // Capture pointer on the source element so we keep receiving events
  // even when the cursor leaves the element
  try {
    sourceEl.setPointerCapture(e.pointerId);
  } catch (_) {
    // Some browsers may not support this on all element types
  }

  // Determine clusterId for cluster-member drags
  let clusterIdForMember = null;
  if (itemType === 'cluster-member') {
    const parentClusterCard = sourceEl.closest('.cluster-card[data-cluster-id]');
    if (parentClusterCard) clusterIdForMember = parentClusterCard.dataset.clusterId;
  }

  drag = {
    itemId,
    itemType,
    fromTable,
    clusterId: clusterIdForMember,
    sourceEl,
    ghostEl: ghost,
    pointerId: e.pointerId,
    currentTable: null,
    insertionIdx: 0,
    mergeTargetId: null,
    clusterInsertIdx: 0,
  };

  // Attach move/up listeners to the source element
  sourceEl.addEventListener('pointermove', onPointerMove);
  sourceEl.addEventListener('pointerup', onPointerUp);
  sourceEl.addEventListener('pointercancel', onPointerCancel);
}

/**
 * Compute insertion index within a cluster by hit-testing guest card positions.
 * Returns an integer index 0..memberCount (where memberCount = insert at end).
 */
function computeClusterInsertionIndex(clusterId, cursorY) {
  const clusterCard = document.querySelector(`.cluster-card[data-cluster-id="${clusterId}"]`);
  if (!clusterCard) return 0;

  const memberCards = Array.from(
    clusterCard.querySelectorAll('.guest-card[data-guest-id]')
  );
  if (memberCards.length === 0) return 0;

  for (let i = 0; i < memberCards.length; i++) {
    const rect = memberCards[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (cursorY < midY) return i;
  }
  return memberCards.length;
}

/**
 * Show a cluster-insert-line at the given insertion index within the cluster card.
 */
function showClusterInsertLine(clusterId, insertIdx) {
  clearClusterInsertLine();

  const clusterCard = document.querySelector(`.cluster-card[data-cluster-id="${clusterId}"]`);
  if (!clusterCard) return;

  clusterCard.classList.add('reorder-active');

  const memberCards = Array.from(
    clusterCard.querySelectorAll('.guest-card[data-guest-id]')
  );

  const line = document.createElement('div');
  line.className = 'cluster-insert-line';

  if (insertIdx >= memberCards.length) {
    // Append after last member
    clusterCard.appendChild(line);
  } else {
    clusterCard.insertBefore(line, memberCards[insertIdx]);
  }
}

function clearClusterInsertLine() {
  for (const line of document.querySelectorAll('.cluster-insert-line')) {
    line.remove();
  }
  for (const card of document.querySelectorAll('.cluster-card.reorder-active')) {
    card.classList.remove('reorder-active');
  }
}

function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();

  moveGhost(drag.ghostEl, e.clientX, e.clientY);

  // Handle cluster-member reorder separately
  if (drag.itemType === 'cluster-member') {
    const idx = computeClusterInsertionIndex(drag.clusterId, e.clientY);
    drag.clusterInsertIdx = idx;
    showClusterInsertLine(drag.clusterId, idx);
    return;
  }

  const { tableEl, tableNum, unassignedEl, mergeClusterEl, mergeClusterId } = hitTest(e.clientX, e.clientY);

  // Clear previous highlights
  document.querySelectorAll('.table-circle.drop-target').forEach((el) => {
    el.classList.remove('drop-target');
    clearInsertionIndicator(el);
  });
  document.getElementById('unassigned-panel')?.classList.remove('drop-target');
  document.querySelectorAll('.cluster-card.merge-target').forEach((el) => {
    el.classList.remove('merge-target');
  });

  drag.currentTable = null;
  drag.insertionIdx = 0;
  drag.mergeTargetId = null;

  // Merge target: only when dragging a cluster over another cluster in the unassigned panel
  if (drag.itemType === 'cluster' && drag.fromTable === null && mergeClusterEl && mergeClusterId) {
    mergeClusterEl.classList.add('merge-target');
    drag.mergeTargetId = mergeClusterId;
    // Still highlight the unassigned panel
    if (unassignedEl) {
      unassignedEl.classList.add('drop-target');
    }
    return;
  }

  if (tableEl && tableNum) {
    tableEl.classList.add('drop-target');
    drag.currentTable = tableNum;

    // Compute insertion index
    const state = getState();
    const seats = state.tables[tableNum]?.seats ?? [];
    const draggedSeatIdx = seats.indexOf(drag.itemId);
    const isReorder = draggedSeatIdx !== -1;

    let idx = computeInsertionIndex(tableEl, e.clientX, e.clientY, seats, state.clusters);

    if (isReorder) {
      // Collapse the two midpoints adjacent to the dragged unit into one:
      // "before d" and "before d+1" (= right after d) both snap to d,
      // showing the dot at the unit's current position.
      const next = (draggedSeatIdx + 1) % seats.length;
      if (idx === draggedSeatIdx || idx === next) {
        idx = draggedSeatIdx;
      }
    }

    drag.insertionIdx = idx;

    showInsertionIndicator(tableEl, idx, seats, state.clusters,
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
  // Handle cluster-member reorder
  if (drag.itemType === 'cluster-member') {
    // Check if still within the same cluster card
    const clusterCard = document.querySelector(`.cluster-card[data-cluster-id="${drag.clusterId}"]`);
    if (clusterCard) {
      const rect = clusterCard.getBoundingClientRect();
      const inCard = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      if (inCard) {
        reorderInCluster(drag.clusterId, drag.itemId, drag.clusterInsertIdx);
        return;
      }
    }
    // Dropped outside cluster — no-op (members cannot be removed from clusters this way)
    return;
  }

  const { tableEl, tableNum, unassignedEl, mergeClusterId } = hitTest(x, y);
  const state = getState();

  // Merge cluster: only when dragging an unassigned cluster onto another unassigned cluster
  if (drag.itemType === 'cluster' && drag.fromTable === null && mergeClusterId) {
    mergeClusters(drag.itemId, mergeClusterId);
    return;
  }

  if (tableNum) {
    const seats = state.tables[tableNum]?.seats ?? [];
    const idx = computeInsertionIndex(tableEl, x, y, seats, state.clusters);

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

  // Restore any dimmed elements (may be multiple for cluster-from-table drags)
  document.querySelectorAll('.drag-source-dimmed').forEach((el) => {
    el.classList.remove('drag-source-dimmed');
  });

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
  document.querySelectorAll('.cluster-card.merge-target').forEach((el) => {
    el.classList.remove('merge-target');
  });
  clearClusterInsertLine();

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
