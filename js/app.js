/**
 * app.js — Entry point. Wires render and drag together.
 */

import { renderAll } from './render.js';
import { initDrag } from './drag.js';
import { initToolbar } from './toolbar.js';

// Initial render
renderAll();

// Initialize drag and drop
initDrag();

// Initialize toolbar
initToolbar();

// Re-apply honeycomb layout when the window is resized,
// since column count depends on container width.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderAll, 100);
});
