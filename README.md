# Seatchart

Interactive web-based seating chart tool for events. Drag-and-drop guests onto tables, group guests into clusters, and import/export via CSV.

## Features

- **Drag & drop** guests onto tables, reorder seats by dragging around the table perimeter
- **Clusters** group related guests (e.g. families) who stay together when moved between tables
- **CSV import/export** for bulk guest management
- **Auto-save** to localStorage; manual save/load as JSON files
- **Capacity constraints** with visual indicators (red = over max, orange = under min)

## Architecture

Pure vanilla JS (ES modules), no dependencies.

```
index.html          Entry point
css/style.css       Dark-themed UI
js/
  app.js            Initialization, wires modules together
  state.js          Centralized data model & mutations (guests, clusters, tables, settings)
  render.js         DOM rendering for unassigned panel + table circles
  drag.js           Pointer-event drag & drop with angular insertion logic
  toolbar.js        Controls: table count, capacity, add guest, import/export
  csv.js            CSV parsing and generation
  storage.js        localStorage auto-save + JSON file save/load
  drag.test.js      Tests for insertion index math
  render.test.js    Tests for rendering logic
```

### State management

All mutations go through `state.js`, which emits a `state-changed` custom event. Listeners re-render the UI reactively.

```js
state = {
  settings: { tableCount, minCapacity, maxCapacity },
  guests: { [id]: { id, firstName, lastName } },
  clusters: { [id]: { id, guestIds: [], color } },
  tables: { [n]: { seats: [] } }
}
```

### Drag & drop

Uses pointer events. Cursor angle around a table circle determines insertion index. Guests can be dragged between tables, to/from the unassigned panel, or onto other clusters to merge them.

## Tests

```bash
node js/drag.test.js
node js/render.test.js
```
