# EasyBatch - Adobe CEP Extension Development Guide

## Architecture Overview

EasyBatch is an **Adobe CEP (Common Extensibility Platform) extension** for After Effects that automates batch rendering of Motion Graphics Templates. It uses a **split architecture**:

- **UI Layer** (`src/`): Svelte 5 app running in Chromium Embedded Framework (CEF)
- **Host Layer** (`host/host.jsx`): ExtendScript (ES3) code executing in After Effects
- **Bridge**: `CSAdapter.ts` wraps `__adobe_cep__.evalScript()` for async communication

### Critical Data Flow
1. User interacts with Svelte UI → calls `CSAdapter.Eval("FunctionName", ...args)`
2. `CSAdapter` encodes arguments and invokes ExtendScript function in `host.jsx`
3. ExtendScript manipulates After Effects API, returns JSON string
4. Svelte parses response and updates UI

**Key constraint**: CEF opens as `file://` protocol, so Vite must bundle to single HTML file (via `vite-plugin-singlefile`).

## Development Workflow

### Initial Setup
```bash
# 1. Enable debug mode (required once per machine)
./tools/debug_config.sh  # Mac
./tools/debug_config.bat # Windows

# 2. Create symlink to dist/ in AE extensions folder
# See tools/debug_create_symlink_mac.txt for paths

# 3. Install dependencies
npm install
```

### Development Mode
```bash
npm run dev  # Starts Vite dev server on localhost:5173
```

- `public/dev.html` redirects to `localhost:5173` for hot reload of UI changes
- `CSXS/manifest.xml` MainPath is auto-updated by Vite config
- **Reload host.jsx changes**: Reload extension (Window > Extensions > EasyBatch) OR use VS Code ExtendScript Debugger to launch script
- **Reload manifest changes**: Restart After Effects completely

### Debugging
- **After Effects**: Open After Effects and go to Window > Extensions > EasyBatch to open the extension
- **CEF DevTools**: Open `http://localhost:8009/` (configured in `public/.debug`)
- **ExtendScript**: Use VS Code ExtendScript Debugger extension
- Console logs in `src/` → CEF DevTools; logs in `host.jsx` → ExtendScript Toolkit Console

### Building for Distribution
```bash
npm run build  # Creates dist/index.html with bundled JS/CSS
```
- Vite updates `manifest.xml` MainPath to `./index.html`
- Copies `CSXS/` and `host/` folders to `dist/`
- Version number injected from `package.json` via `_VERSION_` placeholder

## Project-Specific Conventions

### Communication Pattern
**Always use `CSAdapter.Eval()` for Svelte → ExtendScript calls**:
```typescript
// src/App.svelte
csa.Eval("GetTemplates").then((s_result) => {
  let result: GetTmplsResult = JSON.parse(s_result);
  // ...
});
```

**ExtendScript functions return JSON strings**:
```javascript
// host/host.jsx
function GetTemplates() {
  var result = { success: true, tmpls: [...] };
  return JSON.stringify(result);
}
```

### Type Safety Across Boundaries
- `src/lib/Messaging.ts`: Defines request/response types (e.g., `GetSettsResult`, `BatchRenderResult`)
- ExtendScript uses JSDoc to reference TypeScript types: `@typedef {import('../src/lib/Settings').Template} Template`
- Shared data models in `src/lib/Settings.ts` (Settings, Template, Column classes)

### State Management
- `Settings` class holds all app state, serialized to AE project metadata
- Debounced auto-save: `DebouncedSaveSetts()` waits 2s after last edit before calling `SaveSettings()`
- Reactivity trigger pattern: `setts = setts` forces Svelte to detect mutations on nested objects

### Keyboard Shortcuts
- `ActionCoordinator` (`src/lib/ActionCoordinator.ts`) registers shortcuts and menu actions by name
- Register interest via `csa.RegisterKeyEventsInterest([{keyCode, ctrlKey, ...}])`
- Fire actions programmatically: `ac.Fire("preview_row")` (useful for context menus)

## Testing

### E2E Tests with Playwright
Tests connect to **live After Effects CEF instance** (not mocked):
```bash
# Prerequisites: AE running, extension open, test project loaded
npm run test:e2e:ui  # Recommended: interactive UI mode
npm run test:e2e      # Headless
```

**Important**: Use `.tap()` instead of `.click()` for CEF interactions:
```typescript
// tests/e2e/startup.spec.ts
const button = await page.$('.header_tabs button::-p-text(Data)');
await button!.tap(); // CEF uses touch mode
```

Tests are **manual QA tools**, not CI/CD automation (require running AE instance).

## Critical Files

### Manifest & Build
- `CSXS/manifest.xml`: Extension ID, version, AE version compatibility, MainPath (updated by Vite)
- `vite.config.js`: Injects version, switches dev/prod MainPath, bundles to single file
- `public/.debug`: CEF debug port (8009)

### Core Logic
- `src/App.svelte`: Main UI entry point, orchestrates all workflows
- `host/host.jsx`: All After Effects API interactions (1376 lines)
- `src/lib/CSAdapter.ts`: Bridge layer wrapping `__adobe_cep__` API
- `src/lib/Settings.ts`: Data models (Template, Column, Row classes)

### UI Components
- `src/ui/PropInput.svelte`: Handles different AE property types (text, color, checkbox)
- `src/ui/ModalAlternateSrcV2.svelte`: File path pattern configuration
- Custom dropdown pattern: `src/ui/Dropdown.svelte` (native `<select>` styling issues in CEF)

## Common Patterns

### Adding a New ExtendScript Function
1. Add function to `host/host.jsx`: `function MyNewFunction(arg1, arg2) { ... return JSON.stringify(result); }`
2. Define result type in `src/lib/Messaging.ts`: `export interface MyNewFunctionResult extends Result { ... }`
3. Call from Svelte: `csa.Eval("MyNewFunction", arg1, arg2).then((s_result) => { ... })`

### Working with Essential Graphics Properties
ExtendScript accesses via `layer.essentialProperty`:
```javascript
// host/host.jsx
var av_templ_comp = render_comp.layers.add(templ_comp);
var e_props = av_templ_comp.essentialProperty;
for (var i_prop = 1; i_prop <= e_props.numProperties; i_prop++) {
  var templ_prop = e_props.property(i_prop);
  // Read/write values to populate template
}
```

### Path Resolution Patterns
Templates support dynamic paths with placeholders:
- `{base_path}/{template_name}_{row_number}` → resolved in `Template.ResolveSavePaths()`
- Column data as fields: `{column_0}`, `{column_1}`
- Special fields: `{row_number}`, `{increment:0000}`

## Gotchas

1. **ExtendScript is ES3**: No arrow functions, `let`/`const`, template literals, modern APIs
2. **Arguments are URI-encoded**: `CSAdapter.Eval()` encodes strings to handle special chars
3. **No module imports in host.jsx**: Use `//@include` directive for dependencies (e.g., `json2.js`)
4. **CEF doesn't support file:// modules**: Must use `vite-plugin-singlefile` to inline all JS/CSS
5. **Svelte 5 runes**: Use `$state()`, `$derived()`, `$effect()` instead of old reactive syntax
6. **Restart required**: AE must restart to load ExtendScript manifest changes

## Resources

- [CEP Documentation](https://github.com/Adobe-CEP/CEP-Resources)
- [After Effects Scripting Guide](https://ae-scripting.docsforadobe.dev/)
- [User Docs](https://gabriel-ar.github.io/Ae-EasyBatch/)
