/**
 * toolbar.js — Toolbar controls: table count, capacity limits, add/delete guest, status.
 */

import {
  getState,
  getUnassignedGuests,
  getUnassignedClusters,
  getGuestCount,
  addGuest,
  removeGuest,
  setTableCount,
  setMinCapacity,
  setMaxCapacity,
} from './state.js';

export function initToolbar() {
  const tablesInput = document.getElementById('tables-input');
  const minCapInput = document.getElementById('min-cap-input');
  const maxCapInput = document.getElementById('max-cap-input');
  const addGuestInput = document.getElementById('add-guest-input');
  const addGuestBtn = document.getElementById('add-guest-btn');

  // Initialize inputs from current state
  const { settings } = getState();
  tablesInput.value = settings.tableCount;
  if (settings.minCapacity !== null) minCapInput.value = settings.minCapacity;
  if (settings.maxCapacity !== null) maxCapInput.value = settings.maxCapacity;

  // Table count
  tablesInput.addEventListener('change', () => {
    const val = parseInt(tablesInput.value, 10);
    if (!isNaN(val) && val >= 0) setTableCount(val);
    else tablesInput.value = getState().settings.tableCount;
  });

  // Min capacity
  minCapInput.addEventListener('change', () => {
    const raw = minCapInput.value.trim();
    setMinCapacity(raw === '' ? null : parseInt(raw, 10));
  });

  // Max capacity
  maxCapInput.addEventListener('change', () => {
    const raw = maxCapInput.value.trim();
    setMaxCapacity(raw === '' ? null : parseInt(raw, 10));
  });

  // Add guest
  function doAddGuest() {
    const raw = addGuestInput.value.trim();
    if (!raw) return;
    const lastSpace = raw.lastIndexOf(' ');
    const firstName = lastSpace === -1 ? raw : raw.slice(0, lastSpace);
    const lastName = lastSpace === -1 ? '' : raw.slice(lastSpace + 1);
    addGuest(firstName, lastName);
    addGuestInput.value = '';
    addGuestInput.focus();
  }

  addGuestBtn.addEventListener('click', doAddGuest);
  addGuestInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAddGuest();
  });

  // Delete guest on right-click (contextmenu) — works on cards anywhere in the app
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('[data-guest-id]');
    if (!el) return;
    e.preventDefault();
    removeGuest(el.dataset.guestId);
  });

  // Status display
  document.addEventListener('state-changed', updateStatus);
  updateStatus();
}

function updateStatus() {
  const statusEl = document.getElementById('toolbar-status');
  if (!statusEl) return;

  const state = getState();
  const unassignedCount =
    getUnassignedGuests().length +
    getUnassignedClusters().reduce((sum, c) => sum + c.guestIds.length, 0);

  const { maxCapacity } = state.settings;
  let overCount = 0;
  if (maxCapacity !== null) {
    for (const num of Object.keys(state.tables)) {
      if (getGuestCount(Number(num)) > maxCapacity) overCount++;
    }
  }

  const parts = [];
  if (unassignedCount > 0) parts.push(`${unassignedCount} unassigned`);
  if (overCount > 0) parts.push(`${overCount} over capacity`);
  statusEl.textContent = parts.join(' · ');
  statusEl.className = 'toolbar-status' + (overCount > 0 ? ' has-warnings' : '');
}
