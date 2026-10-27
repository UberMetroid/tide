# AGENTS.md — Tide Architectural Invariants & Engineering Standards

## 1. Global Engineering Philosophy

Tide (`tide@ubermetroid.github.io`) is built on four uncompromising engineering pillars:

1. **Linus Torvalds' "Good Taste"**: Eliminate special-case branching through clean data representation (immutable frozen enums, unified application and open-window candidate records, and pure fuzzy match scorers).
2. **UNIX Philosophy**: Each module ("page") does one thing well, composes cleanly via explicit ES2022 imports, and avoids hidden global state.
3. **NASA JPL Power-of-10 Safety Rules**:
   - All installed-application scans (`search_engine.js`) and workspace open-window enumerations enforce explicit upper iteration bounds (`MAX_INDEXED_APPS = 512`, `MAX_OPEN_WINDOWS = 128`, `MAX_SCANNED_WORKSPACES = 32`).
   - Zero dynamic code evaluation (`eval`, `Function`) and zero external subprocesses (`Gio.Subprocess`, `GLib.spawn_*`) in the compositor.
   - All `GLib.timeout_add` sources are deterministically named via `GLib.Source.set_name_by_id` and removed on teardown.
4. **OWASP Zero-Trust & Multi-Distro Security**:
   - Zero shell subprocesses or network calls; integrates natively with GNOME Shell lock/suspend `disable()` teardown, `org.gnome.desktop.a11y.keyboard` sticky-keys checks, and Mutter `overlay-key` signal blocking across Fedora, Debian, Ubuntu, Arch, openSUSE, and NixOS.
   - All CSS color inputs (`extension/ui/settings/color.js`) are clamped and sanitized before style generation.

---

## 2. The Page Rule & Directory Density (Enforced by `tests/verify.js`)

- **File Line Bounds**: Every `.js` source file in the repository (`extension/`, `tests/`) **must** be between **16 and 256 lines** (`16..=256`), and every line **must** be at most **200 characters** (`<= 200`).
- **Directory Density**: Every directory in the repository (`root`, `tests/`, `extension/`, and all subdirectories) **must** contain **at most 8 visible entries** (`<= 8`).
- **Banned Generic Names**: Generic grab-bag names (`util`, `utils`, `lib`, `helper`, `helpers`, `common`, `misc`, `shared`, `base`, `core`, `types`, `mod`) are strictly forbidden.
- **2-Line SPDX + Concise Module Header**:
   - Line 1 of every `.js` file must be `// SPDX-License-Identifier: GPL-3.0-or-later`.
   - Line 2 of every `.js` file must be a concise single-line module description (`// <Concise module description>`).

---

## 3. Process-Boundary & GNOME Shell / EGO Lifecycle Invariants (`tests/verify.js`)

- **ES2022 Strictness**: Zero `var` declarations (`const`/`let` only) and zero loose equality operators (`===`/`!==` only).
- **Process Boundary Separation**: `extension/prefs.js` runs in the GTK4 `gnome-extensions-app` process. Neither `prefs.js` nor any module in its import chain (`launcher/search_engine.js`, `ui/launcher_style.js`, `ui/settings/gsettings.js`, `ui/settings/color.js`, `ui/settings/prefs_pages.js`) may import compositor-only typelibs (`gi://Meta`, `gi://Clutter`, `gi://St`, `gi://Shell`, `resource:///org/gnome/shell/*`).
- **Deterministic EGO Teardown**: `extension/extension.js` performs zero top-level work at import time and deterministically cleans up all `global.display` `overlay-key` signal connections, unblocks the original GNOME Shell `overlay-key` signal handler, removes `Main.wm.removeKeybinding('toggle-launcher')`, restores `Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW)`, cancels named `GLib` timers, destroys the `ModalDialog` launcher, and unloads the stylesheet on `disable()`.

---

## 4. Functional Page Map

### Verification & Test Suite (`tests/` — 1 page)
- [`tests/verify.js`](tests/verify.js): Zero-dependency GJS architectural lint, Page Rule (`16..=256` lines, `<= 8` entries/dir), process-boundary check, GTK4/Libadwaita Preferences inspection, and headless behavioral test suite (`gjs -m tests/verify.js`).

### GNOME Shell Extension (`extension/` — 10 JS pages across 2 domain trees)
- **Root Entrypoints**:
  - [`extension/extension.js`](extension/extension.js): `TideExtension extends Extension` EGO lifecycle entrypoint.
  - [`extension/prefs.js`](extension/prefs.js): `TidePreferences extends ExtensionPreferences` 3-tab GTK4 / Libadwaita preferences UI.
- **Super-Key Launcher & Fuzzy Search Engine (`extension/launcher/` — 4 pages)**:
  - [`launcher_manager.js`](extension/launcher/launcher_manager.js): `global.display` `overlay-key` & `Main.wm.addKeybinding('toggle-launcher')` (`Super+Enter`) interceptor, `stickykeys-enable` accessibility guard, stylesheet loader, and named `[tide] style-refresh` timer.
  - [`launcher_dialog.js`](extension/launcher/launcher_dialog.js): `ModalDialog` launcher UI with search entry, quick preferences button, `Up`/`Down`/`Enter`/`Super+Enter`/`Esc`/`Ctrl+1..9` keyboard navigation, and outside-click dismissal.
  - [`search_engine.js`](extension/launcher/search_engine.js): Pure bounded application (`MAX_INDEXED_APPS = 512`) and open-window (`MAX_OPEN_WINDOWS = 128`) indexer, query normalizer, and fuzzy scorer (`score_candidate_match`, `rank_launcher_results`).
  - [`result_row.js`](extension/launcher/result_row.js): `St.Button` result row builder with application icon texture, ellipsized title/description, `Ctrl+1..9` shortcut badge, and stationary-pointer hover guard.
- **UI, Modal Styling & Settings (`extension/ui/` — 4 JS pages + stylesheet)**:
  - [`launcher_style.js`](extension/ui/launcher_style.js), `stylesheet.css`
  - `settings/`: [`color.js`](extension/ui/settings/color.js), [`gsettings.js`](extension/ui/settings/gsettings.js), [`prefs_pages.js`](extension/ui/settings/prefs_pages.js)
