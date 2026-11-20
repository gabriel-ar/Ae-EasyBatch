# EasyBatch - Adobe CEP Extension Development Guide

## Architecture Overview

EasyBatch is an **Adobe CEP (Common Extensibility Platform) extension** for After Effects that automates batch rendering of Motion Graphics Templates. It uses a **split architecture**:

- **UI Layer** (`src/`): Svelte 5 app running in Chromium Embedded Framework (CEF)
- **Host Layer** (`src/host/host.jsx`): ExtendScript (ES3) code executing in After Effects
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

# 2. Create a symlink to dist/ in the AE extensions folder
npm run symlink:windows  # Windows
npm run symlink:macos    # macOS

# 3. Install dependencies
npm install
```

### Development Mode
```bash
npm run dev  # Starts Vite dev server on localhost:5173
```

- `public/dev.html` redirects to `localhost:5173` for hot reload of UI changes
- `CSXS/manifest.xml` MainPath is auto-updated by Vite config
- **Reload host.jsx changes**: Restart `npm run dev` to refresh `dist/host/`, then reopen EasyBatch (Window > Extensions > EasyBatch). UI hot reload alone does not update the ExtendScript already loaded by After Effects.
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
- **Agents: never run `npm run build`.** `dist/` is symlinked into After Effects and the build overwrites `dist/CSXS/manifest.xml` (MainPath → `index.html`) and removes `dev.html`, breaking the dev redirect. To verify the project compiles, run `npm run build:check` (outputs to the git-ignored `dist-check/`, leaves `dist/` untouched). `npm run package` and releases are the only reasons to build into `dist/`, and only when the user asks.

## Project-Specific Conventions

### Agent Changes
- Do not update README or user documentation unless explicitly requested. Keep durable implementation notes in these instructions, briefly.
- macOS secrets use `src/native/SecretStore.m` (`SecItem` APIs) through `CSAdapter.Eval` and `host/SecretStore.jsx`, never the CLI. Service `com.setreports.easybatch.native` deliberately excludes old CLI-trusted entries; reconnect Google once. Native failures must surface, never fall back to plaintext/CLI.
- Windows secrets use `src/native/SecretStore.win.c` (Credential Manager generic credentials, local-machine persistence) through the same bridge. `ExternalObject` loads `native/EasyBatchSecretStore.<x64|arm64>.dll` (AE 26+ on Windows ARM is native ARM64) and calls `Execute(action, service, key, value)`; answers are `status[:value]` with Win32 codes mapped in `src/lib/SecretStore.ts`.
- Run `npm run native:build` on each OS to compile its native components into `prebuilt/`, and commit those outputs. Rebuild only after relevant native source or build changes. The macOS build uses Xcode tools and creates a universal bundle; `EASYBATCH_SIGN_IDENTITY` selects a signing identity (default ad-hoc, development only). Windows uses MSVC via vswhere/`vcvarsall` and needs x64 and ARM64 tools (`VC.Tools.ARM64`); Windows DLLs are not code-signed yet.
- Vite copies prebuilt components into the extension without compiling them. Production builds require both platforms; dev and `build:check` require the current platform. After rebuilding native components, restart dev and reload the panel. Windows AE keeps DLLs mapped until it quits, so Vite skips unchanged DLLs and copying changed DLLs may require quitting AE. Packaging remains separate.
- Keychain access trusts the AE host, not EasyBatch alone. AE restart, locked-Keychain prompts, other AE versions, and distribution notarization still require manual validation.
- Credential Manager protects entries per Windows user, not per app: any same-user process, including code inside AE, reads them silently. Do not describe it as app-isolated. Accepted by the owner as better than plaintext; DPAPI, TPM keys without a PIN, and an elevated broker were checked and give no stronger same-user boundary. A Hello-gated key or a passphrase-derived key is the stricter follow-up if ever needed (Hello was not available on the dev PC). ARM64 build/run, DLL signing and AV behavior, AE restart, and other AE versions still require manual validation.
- Multi-Output Stop must wait until AE reports the render queue idle before resetting it. `stopRendering()` can return before rendering stops; the idle reset calls `pauseRendering(false)` to clear AE's hidden pause state so the next batch can start.
- Batch Preflight runs before rendering or queuing. Keep the checks read-only, pass the checked snapshot to render, and show one blocking modal only if checks find issues. Compare resolved patterns without creating queue items to discover AE-added extensions or sequence suffixes.
- In the preflight modal, group conflicting rows by composition and collapse consecutive row numbers into ranges without hiding gaps.
- Summarize missing replacement files by column only when every checked row is affected and more than one row was checked; keep the individual paths available in the summary.

### User Documentation
- Write for the artists and other end users who use EasyBatch. Use plain language and the labels they see in the panel.
- Cover only what users can see, do, or need to know: steps, choices, results, and what to do when something goes wrong. Keep implementation details such as polling, internal data flow, and storage out of user-facing docs.

### Code Style
- Variables, parameters, object properties and non-exported constants use `snake_case` (e.g., `sheet_name`, `header_index`); functions, methods, classes and types use `PascalCase` (e.g., `LoadSource`, `ImportSource`). Keep third-party option names as they are (e.g., `bookType`).
- Use 2-space indentation. Separate logical steps with a blank line, and keep related statements together.
- Comment only what is not self-explanatory, briefly: `//Short note` before a snippet, and `/**Short summary*/` before a function whose purpose or side effects are not obvious.
- Build-time configuration (e.g., Google credentials) goes in the git-ignored `.env.local`, with a blank template in `.env.example`.

### UI Component Organization
- Use Title Case for app-authored button labels, menu actions, and short labels for icon buttons (e.g., **Collapse All**, **Open Containing Folder**). Lowercase short articles, conjunctions, and prepositions unless they start or end the label. Preserve the original capitalization of names from users and After Effects.
- Keep individual UI components directly in `src/ui/`; create a subfolder when it groups multiple closely related files.
- Name related components with a shared subject prefix so they sort together, e.g. `DataExport.svelte` and `DataImport.svelte`.
- Keep component-specific behavior and types in the component; use shared modules for logic or types used across features. Let `App.svelte` coordinate components and present results.

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
- `src/lib/LocalSettings.ts` manages settings stored locally across projects; preserve existing storage keys and surface storage errors.
- Debounced auto-save: `DebouncedSaveSetts()` waits 2s after last edit before calling `SaveSettings()`
- Reactivity trigger pattern: `setts = setts` forces Svelte to detect mutations on nested objects

### Keyboard Shortcuts
- `ActionCoordinator` (`src/lib/ActionCoordinator.ts`) registers shortcuts and menu actions by name
- Register interest via `csa.RegisterKeyEventsInterest([{keyCode, ctrlKey, ...}])`
- Fire actions programmatically: `ac.Fire("preview_row")` (useful for context menus)

## Testing

### Unit Tests

Run the unit suite with `npm run test:unit`. `package.json` explicitly lists the test files, run by Node's built-in `node:test` runner. Tests use Vite to load project modules and Node's `vm` to simulate ExtendScript, After Effects, and CEP APIs. Local storage, files, native-store responses, and Google requests are faked; the tests do not require After Effects, real native secret stores, Google credentials, or Google network access.

`tests/unit/import-dialog.test.mjs` also runs Svelte UI workflows in headless Chromium through Playwright. CEP dialogs, filesystem operations, and Google Sheets calls are faked, but the UI and DOM interactions run in a real browser. Install project dependencies and ensure Playwright can launch Chromium; `CHROME_PATH` can select an executable.

Vite SSR tests use middleware mode with HMR and WebSockets disabled. Keep `server.ws: false` to avoid binding Vite's WebSocket port. The browser test selects an available nonzero localhost port; don't use the development server port, which could reconnect the live panel to the test harness.

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

## Key Files

### Manifest & Build
- `src/host/manifest.xml`: Extension ID, version, AE compatibility, MainPath template (updated by Vite)
- `vite.config.js`: Injects version, switches dev/prod MainPath, bundles to single file
- `src/host/.debug`: CEF debug port (8009)

### Core Logic
- `src/App.svelte`: Main UI entry point, orchestrates all workflows
- `src/host/host.jsx`: After Effects API interactions
- `src/lib/CSAdapter.ts`: Bridge layer wrapping `__adobe_cep__` API
- `src/lib/Settings.svelte.ts`: Data models (Template, Column, Row classes)

### UI Components
- `src/ui/PropInput.svelte`: Handles different AE property types (text, color, checkbox)
- `src/ui/ModalAlternateSrcV2.svelte`: File path pattern configuration
- Custom dropdown pattern: `src/ui/Dropdown.svelte` (native `<select>` styling issues in CEF)

## Common Patterns

### Adding a New ExtendScript Function
1. Add function to `src/host/host.jsx`: `function MyNewFunction(arg1, arg2) { ... return JSON.stringify(result); }`
2. Define result type in `src/lib/Messaging.ts`: `export interface MyNewFunctionResult extends Result { ... }`
3. Call from Svelte: `csa.Eval("MyNewFunction", arg1, arg2).then((s_result) => { ... })`

### Working with Essential Graphics Properties
ExtendScript accesses via `layer.essentialProperty`:
```javascript
// src/host/host.jsx
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

## User Journey

Users create a template in After Effects' Essential Graphics panel; EasyBatch loads its properties as data columns. They fill or import rows, optionally preview one, then configure output paths and render settings before rendering. CSV and Excel import/export are also available.

## Gotchas

1. **ExtendScript is ES3**: No arrow functions, `let`/`const`, template literals, modern APIs
2. **Arguments are URI-encoded**: `CSAdapter.Eval()` encodes strings to handle special chars
3. **No module imports in host.jsx**: Use `//@include` directive for dependencies (e.g., `json2.js`)
4. **CEF doesn't support file:// modules**: Must use `vite-plugin-singlefile` to inline all JS/CSS
5. **Svelte 5 runes**: Use `$state()`, `$derived()`, `$effect()` instead of old reactive syntax
6. **Reload requirements**: Restart After Effects to load manifest changes. For host-script changes, restart the dev server and reopen the extension panel.

## Resources

- [CEP Documentation](https://github.com/Adobe-CEP/CEP-Resources)
- [After Effects Scripting Guide](https://ae-scripting.docsforadobe.dev/)
- [User Docs](https://gabriel-ar.github.io/Ae-EasyBatch/)
