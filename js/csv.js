/**
 * csv.js — CSV import/export for the seating chart.
 * No external dependencies.
 */

import {
  getState,
  addGuest,
  assignToTable,
  setTableCount,
  replaceState,
} from './state.js';
import { expandSeats } from './render.js';

// ── CSV Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of objects keyed by header names.
 * Handles quoted fields (including embedded commas and escaped quotes).
 */
function parseCSV(text) {
  const lines = splitCSVLines(text);
  if (lines.length === 0) return [];

  const headers = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVRow(lines[i]);
    if (vals.every((v) => v.trim() === '')) continue; // skip blank lines
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = (vals[j] ?? '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

function splitCSVLines(text) {
  // Split on newlines, but respect quoted fields that span lines
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // skip \r\n
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ── Import ───────────────────────────────────────────────────────────────────

/**
 * Import guests from a CSV string.
 * Required column: "name". Optional column: "table".
 * Shows confirm() before replacing if guests exist.
 */
export function importCSV(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length === 0) return;

  // Validate "name" column exists
  if (!('name' in rows[0])) {
    alert('CSV must have a "name" column.');
    return;
  }

  const state = getState();
  const hasGuests = Object.keys(state.guests).length > 0;
  if (hasGuests) {
    if (!confirm('This will replace all current guests. Continue?')) return;
  }

  // Clear current state — replace with empty, then add guests
  replaceState({
    settings: { ...state.settings },
    guests: {},
    clusters: {},
    tables: (() => {
      const t = {};
      for (let i = 1; i <= state.settings.tableCount; i++) t[i] = { seats: [] };
      return t;
    })(),
  });

  // Track max table number referenced
  let maxTable = state.settings.tableCount;

  // Parse and add guests
  const guestsByTable = {}; // tableNum → [guest]
  const duplicateNames = [];

  for (const row of rows) {
    const rawName = row.name;
    if (!rawName) continue;

    const lastSpace = rawName.lastIndexOf(' ');
    const firstName = lastSpace === -1 ? rawName : rawName.slice(0, lastSpace);
    const lastName = lastSpace === -1 ? '' : rawName.slice(lastSpace + 1);

    // Check for duplicate names
    const currentState = getState();
    for (const g of Object.values(currentState.guests)) {
      if (g.firstName === firstName && g.lastName === lastName) {
        duplicateNames.push(rawName);
        break;
      }
    }

    const guest = addGuest(firstName, lastName);

    const tableNum = row.table ? parseInt(row.table, 10) : NaN;
    if (!isNaN(tableNum) && tableNum > 0) {
      if (tableNum > maxTable) maxTable = tableNum;
      if (!guestsByTable[tableNum]) guestsByTable[tableNum] = [];
      guestsByTable[tableNum].push(guest);
    }
  }

  // Ensure enough tables exist
  if (maxTable > getState().settings.tableCount) {
    setTableCount(maxTable);
  }

  // Assign guests to tables
  for (const [tableNum, guests] of Object.entries(guestsByTable)) {
    for (const guest of guests) {
      assignToTable(guest.id, Number(tableNum));
    }
  }

  if (duplicateNames.length > 0) {
    alert(`Warning: duplicate names found: ${duplicateNames.join(', ')}`);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Generate CSV string and trigger browser download.
 */
export function exportCSV() {
  const state = getState();
  const lines = ['name,table'];

  // Assigned guests: sorted by table number, then seat order (expanded for clusters)
  const tableNums = Object.keys(state.tables).map(Number).sort((a, b) => a - b);
  for (const num of tableNums) {
    const table = state.tables[num];
    const expanded = expandSeats(table.seats, state.clusters);
    for (const entry of expanded) {
      const g = state.guests[entry.guestId];
      if (!g) continue;
      const name = g.lastName ? `${g.firstName} ${g.lastName}` : g.firstName;
      lines.push(`${csvEscape(name)},${num}`);
    }
  }

  // Unassigned guests (not in any table, including cluster members)
  const seatedGuestIds = new Set();
  for (const table of Object.values(state.tables)) {
    const expanded = expandSeats(table.seats, state.clusters);
    for (const e of expanded) seatedGuestIds.add(e.guestId);
  }

  for (const g of Object.values(state.guests)) {
    if (seatedGuestIds.has(g.id)) continue;
    const name = g.lastName ? `${g.firstName} ${g.lastName}` : g.firstName;
    lines.push(`${csvEscape(name)},`);
  }

  const csv = lines.join('\n');
  downloadFile(csv, 'seating-chart.csv', 'text/csv');
}

function csvEscape(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
