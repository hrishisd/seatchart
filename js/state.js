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

// ── Cluster color palette ─────────────────────────────────────────────────────

export const CLUSTER_PALETTE = [
  '#c0485a', // rose
  '#3d9e87', // teal
  '#b8892e', // amber
  '#7a5bbf', // violet
  '#3d7fbf', // blue
  '#4e9e52', // green
  '#bf5f3d', // coral
  '#4a5f9e', // slate-blue
];

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

export function reorderInCluster(clusterId, guestId, newIndex) {
  const cluster = state.clusters[clusterId];
  if (!cluster) return;
  const oldIdx = cluster.guestIds.indexOf(guestId);
  if (oldIdx === -1) return;
  cluster.guestIds.splice(oldIdx, 1);
  // After removal, indices above oldIdx shift down by 1.
  const adjusted = newIndex > oldIdx ? newIndex - 1 : newIndex;
  const clampedIdx = Math.min(adjusted, cluster.guestIds.length);
  cluster.guestIds.splice(clampedIdx, 0, guestId);
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

function pickClusterColor() {
  const usedColors = new Set(Object.values(state.clusters).map((c) => c.color));
  for (const color of CLUSTER_PALETTE) {
    if (!usedColors.has(color)) return color;
  }
  // All colors used — cycle from start
  return CLUSTER_PALETTE[Object.keys(state.clusters).length % CLUSTER_PALETTE.length];
}

export function createCluster(guestIds) {
  // Validate: all guests must be currently unassigned (not in any table, not in any cluster)
  const clusteredGuestIds = new Set(
    Object.values(state.clusters).flatMap((c) => c.guestIds)
  );
  const seatedIds = new Set(
    Object.values(state.tables).flatMap((t) => t.seats)
  );
  for (const gid of guestIds) {
    if (!state.guests[gid]) throw new Error(`Guest ${gid} does not exist`);
    if (clusteredGuestIds.has(gid)) throw new Error(`Guest ${gid} is already in a cluster`);
    if (seatedIds.has(gid)) throw new Error(`Guest ${gid} is already at a table`);
  }
  const id = crypto.randomUUID();
  const color = pickClusterColor();
  const cluster = { id, guestIds: [...guestIds], color };
  state.clusters[id] = cluster;
  emit();
  return cluster;
}

export function dissolveCluster(clusterId) {
  const cluster = state.clusters[clusterId];
  if (!cluster) return;

  const tableNum = findTable(clusterId);
  if (tableNum !== null) {
    // Cluster is at a table: replace the cluster ID in seats with individual guest IDs
    const table = state.tables[tableNum];
    const idx = table.seats.indexOf(clusterId);
    if (idx !== -1) {
      table.seats.splice(idx, 1, ...cluster.guestIds);
    }
  }
  // If unassigned, guests just become standalone unassigned (no action needed for seats)

  delete state.clusters[clusterId];
  emit();
}

export function mergeClusters(clusterId1, clusterId2) {
  const c1 = state.clusters[clusterId1];
  const c2 = state.clusters[clusterId2];
  if (!c1 || !c2) return;

  // Merge guestIds into c1, remove c2
  c1.guestIds = [...c1.guestIds, ...c2.guestIds];
  delete state.clusters[clusterId2];
  emit();
}

export function setMinCapacity(val) {
  state.settings.minCapacity = val;
  emit();
}

export function setMaxCapacity(val) {
  state.settings.maxCapacity = val;
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

export function replaceState(newState) {
  state.settings = newState.settings;
  state.guests = newState.guests;
  state.clusters = newState.clusters;
  state.tables = newState.tables;
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
  // Create a seed cluster: Mia + Noah + Quinn (guests[12], guests[13], guests[16]) — 3 members for reorder testing
  const seedClusterId = crypto.randomUUID();
  state.clusters[seedClusterId] = {
    id: seedClusterId,
    guestIds: [guests[12].id, guests[13].id, guests[16].id],
    color: CLUSTER_PALETTE[0],
  };

  // Create another seed cluster at table 1: add Olivia + Peter (guests[14], guests[15]) as a cluster
  const seedCluster2Id = crypto.randomUUID();
  state.clusters[seedCluster2Id] = {
    id: seedCluster2Id,
    guestIds: [guests[14].id, guests[15].id],
    color: CLUSTER_PALETTE[1],
  };
  state.tables[1].seats.push(seedCluster2Id);
}

seedState();
