/**
 * app.js — Entry point. Wires render, drag, toolbar, csv, and storage together.
 */

import { renderAll } from './render.js';
import { initDrag } from './drag.js';
import { initToolbar } from './toolbar.js';
import { restoreFromLocalStorage, initAutoSave, saveJSON, loadJSON } from './storage.js';
import { importCSV, exportCSV } from './csv.js';

// Restore saved state before initial render (if any)
restoreFromLocalStorage();

// Initial render
renderAll();

// Initialize drag and drop
initDrag();

// Initialize toolbar
initToolbar();

// Start auto-saving to localStorage
initAutoSave();

// Wire up import/export/save/load buttons
document.getElementById('import-csv-btn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCSV(reader.result);
    reader.readAsText(file);
  });
  input.click();
});

document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
document.getElementById('save-json-btn').addEventListener('click', saveJSON);
document.getElementById('load-json-btn').addEventListener('click', loadJSON);

// Re-apply honeycomb layout when the window is resized,
// since column count depends on container width.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderAll, 100);
});
