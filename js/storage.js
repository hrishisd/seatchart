/**
 * storage.js — localStorage auto-save + JSON save/load.
 */

import { getState, replaceState } from './state.js';

const STORAGE_KEY = 'seatchart-state';

// ── Auto-save ────────────────────────────────────────────────────────────────

export function saveToLocalStorage() {
  const state = getState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function restoreFromLocalStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!validateState(parsed)) return false;
    replaceState(parsed);
    return true;
  } catch {
    return false;
  }
}

export function initAutoSave() {
  document.addEventListener('state-changed', saveToLocalStorage);
}

// ── Manual Save (JSON download) ──────────────────────────────────────────────

export function saveJSON() {
  const state = getState();
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seating-chart.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Manual Load (JSON file picker) ───────────────────────────────────────────

export function loadJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!validateState(parsed)) {
          alert('Invalid seating chart file.');
          return;
        }
        const state = getState();
        const hasGuests = Object.keys(state.guests).length > 0;
        if (hasGuests) {
          if (!confirm('This will replace all current data. Continue?')) return;
        }
        replaceState(parsed);
      } catch {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateState(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    'guests' in obj &&
    'tables' in obj &&
    'clusters' in obj &&
    'settings' in obj
  );
}
