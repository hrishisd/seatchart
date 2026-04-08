/**
 * state.js — Central data model and mutation functions.
 *
 * State shape:
 * {
 *   settings: { tableCount, minCapacity, maxCapacity },
 *   guests: { [uuid]: { id, firstName, lastName } },
 *   clusters: { [uuid]: { id, guestIds: [] } },
 *   tables: { [n]: { seats: [] } }   // seats: ordered array of guestId or clusterId
 * }
 */

const state = {
  settings: {
    tableCount: 10,
    minCapacity: null,
    maxCapacity: null,
  },
  guests: {},
  clusters: {},
  tables: {},
};

// ── helpers ──────────────────────────────────────────────────────────────────

function emit() {
  document.dispatchEvent(new CustomEvent('state-changed'));
}

function initTables(count) {
  const tables = {};
  for (let i = 1; i <= count; i++) {
    tables[i] = { seats: [] };
  }
  return tables;
}

/** Returns the table number (as number) that contains itemId, or null. */
function findTable(itemId) {
  for (const [num, table] of Object.entries(state.tables)) {
    if (table.seats.includes(itemId)) return Number(num);
  }
  return null;
}

// ── exports ──────────────────────────────────────────────────────────────────

export function getState() {
  return state;
}

export function getUnassignedGuests() {
  // Guests not in any cluster and not in any table's seats
  const clusteredGuestIds = new Set(
    Object.values(state.clusters).flatMap((c) => c.guestIds)
  );
  const seatedIds = new Set(
    Object.values(state.tables).flatMap((t) => t.seats)
  );
  return Object.values(state.guests).filter(
    (g) => !clusteredGuestIds.has(g.id) && !seatedIds.has(g.id)
  );
}

export function getUnassignedClusters() {
  const seatedIds = new Set(
    Object.values(state.tables).flatMap((t) => t.seats)
  );
  return Object.values(state.clusters).filter((c) => !seatedIds.has(c.id));
}

export function getGuestCount(tableNumber) {
  const table = state.tables[tableNumber];
  if (!table) return 0;
  let count = 0;
  for (const id of table.seats) {
    if (state.guests[id]) {
      count += 1;
    } else if (state.clusters[id]) {
      count += state.clusters[id].guestIds.length;
    }
  }
  return count;
}

export function addGuest(firstName, lastName) {
  const id = crypto.randomUUID();
  const guest = { id, firstName, lastName: lastName ?? '' };
  state.guests[id] = guest;
  emit();
  return guest;
}

export function removeGuest(guestId) {
  // Remove from any cluster
  for (const cluster of Object.values(state.clusters)) {
    const idx = cluster.guestIds.indexOf(guestId);
    if (idx !== -1) {
      cluster.guestIds.splice(idx, 1);
      // If cluster is now empty, remove it
      if (cluster.guestIds.length === 0) {
        removeFromTable(cluster.id);
        delete state.clusters[cluster.id];
      }
    }
  }
  // Remove from any table
  removeFromTable(guestId);
  delete state.guests[guestId];
  emit();
}

export function assignToTable(itemId, tableNumber, insertionIndex) {
  const table = state.tables[tableNumber];
  if (!table) return;
  // Remove from wherever it currently is
  _removeFromTableInternal(itemId);
  const idx =
    insertionIndex != null
      ? Math.min(insertionIndex, table.seats.length)
      : table.seats.length;
  table.seats.splice(idx, 0, itemId);
  emit();
}

export function removeFromTable(itemId) {
  _removeFromTableInternal(itemId);
  emit();
}

function _removeFromTableInternal(itemId) {
  for (const table of Object.values(state.tables)) {
    const idx = table.seats.indexOf(itemId);
    if (idx !== -1) {
      table.seats.splice(idx, 1);
      return;
    }
  }
}

export function reorderAtTable(tableNumber, itemId, newIndex) {
  const table = state.tables[tableNumber];
  if (!table) return;
  const oldIdx = table.seats.indexOf(itemId);
  if (oldIdx === -1) return;
  table.seats.splice(oldIdx, 1);
  // After removal, indices above oldIdx shift down by 1.
  // Adjust newIndex to account for the removed element.
  const adjusted = newIndex > oldIdx ? newIndex - 1 : newIndex;
  const clampedIdx = Math.min(adjusted, table.seats.length);
  table.seats.splice(clampedIdx, 0, itemId);
  emit();
}

export function moveToTable(itemId, fromTable, toTable, insertionIndex) {
  // fromTable parameter kept for API symmetry but we find it dynamically
  _removeFromTableInternal(itemId);
  const table = state.tables[toTable];
  if (!table) return;
  const idx =
    insertionIndex != null
      ? Math.min(insertionIndex, table.seats.length)
      : table.seats.length;
  table.seats.splice(idx, 0, itemId);
  emit();
}

export function setTableCount(count) {
  const current = state.settings.tableCount;
  if (count === current) return;

  if (count < current) {
    // Remove tables from the end; displace their guests
    for (let i = current; i > count; i--) {
      const table = state.tables[i];
      if (table) {
        // All seated items become unassigned (just remove from table)
        table.seats = [];
        delete state.tables[i];
      }
    }
  } else {
    // Add new empty tables
    for (let i = current + 1; i <= count; i++) {
      state.tables[i] = { seats: [] };
    }
  }
  state.settings.tableCount = count;
  emit();
}

// ── seed data ─────────────────────────────────────────────────────────────────

function seedState() {
  state.tables = initTables(state.settings.tableCount);

  const names = [
    ['Alice', 'Sullivan'],
    ['Bob', 'Martinez'],
    ['Clara', 'Nguyen'],
    ['David', 'Kim'],
    ['Emma', 'Patel'],
    ['Frank', 'Johnson'],
    ['Grace', 'Williams'],
    ['Henry', 'Davis'],
    ['Isabel', 'Garcia'],
    ['James', 'Chen'],
    ['Karen', 'Thompson'],
    ['Liam', 'Anderson'],
    ['Mia', 'Brown'],
    ['Noah', 'Wilson'],
    ['Olivia', 'Taylor'],
    ['Peter', 'Moore'],
    ['Quinn', 'Jackson'],
    ['Rachel', 'White'],
    ['Sam', 'Harris'],
    ['Tara', 'Martin'],
  ];

  const guests = names.map(([firstName, lastName]) => {
    const id = crypto.randomUUID();
    const g = { id, firstName, lastName };
    state.guests[id] = g;
    return g;
  });

  // Assign some guests to tables
  // Table 1: Alice, Bob, Clara, David
  state.tables[1].seats = [
    guests[0].id,
    guests[1].id,
    guests[2].id,
    guests[3].id,
  ];
  // Table 2: Emma, Frank, Grace, Henry, Isabel
  state.tables[2].seats = [
    guests[4].id,
    guests[5].id,
    guests[6].id,
    guests[7].id,
    guests[8].id,
  ];
  // Table 3: James, Karen, Liam
  state.tables[3].seats = [guests[9].id, guests[10].id, guests[11].id];

  // The rest (Mia, Noah, Olivia, Peter, Quinn, Rachel, Sam, Tara) are unassigned
}

seedState();
