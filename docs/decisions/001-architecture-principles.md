# Architecture Principles

1. **No Build Step**: The web app runs directly in the browser using standard ES modules (`<script type="module">`). This allows for fast iteration without the complexity of webpack, vite, or bundlers.
2. **Local Storage First**: Given the personal nature of the tool, data is predominantly stored locally in `localStorage`. 
3. **Strict Data Layer Boundaries**: Data read/writes are centralized. 
   - `model.js`: Pure functions normalizing structure.
   - `migrations.js`: Versioned data patches.
   - `storage.js`: Impure adapter wrapping exact reads/writes.
4. **Plugin Architecture for LLMs**: Supporting multiple LLMs via a simple `{ validate, healthCheck, analyze }` interface.
5. **Central Action Router**: Events are bound generically via `data-action` and dispatched safely by a centralized routing matrix.
