// SPDX-License-Identifier: GPL-3.0-or-later
// Zero-dependency GJS architectural lint, Page Rule, EGO boundary, GTK4/Adw, and behavioral test suite.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {
    MAX_INDEXED_APPS, MAX_OPEN_WINDOWS, MAX_SCANNED_WORKSPACES, collect_installed_apps, collect_open_windows,
    format_shortcut_badge, is_pointer_stationary, normalize_query, rank_launcher_results, score_candidate_match,
} from '../extension/launcher/search_engine.js';
import { build_dialog_surface_css, build_entry_focus_css, build_selected_row_css, compute_scroll_height } from '../extension/ui/launcher_style.js';
import { SUITE_COLOR_TARGETS, format_rgba, is_dark_rgba, parse_rgba, sync_color_across_suite, text_color_for_css } from '../extension/ui/settings/color.js';
import { DEFAULT_TOGGLE_SHORTCUTS, ExtensionSettings, OVERLAY_KEY_ACTIONS } from '../extension/ui/settings/gsettings.js';
import { BORDER_PRESETS, build_about_page, build_launcher_styling_page } from '../extension/ui/settings/prefs_pages.js';

const BANNED_STEMS = new Set(['util', 'utils', 'lib', 'helper', 'helpers', 'common', 'misc', 'shared', 'base', 'core', 'types', 'mod']);
const DECODER = new TextDecoder('utf-8');
const REPO_ROOT = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const EXT_ROOT = GLib.build_filenamev([REPO_ROOT, 'extension']);

function assert(cond, msg) { if (!cond) throw new Error(`Verification failed: ${msg}`); }

function read_text(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok, `failed to read ${path}`);
    return DECODER.decode(bytes);
}

function walk_repo(dir_path, js_files, dirs) {
    dirs.push(dir_path);
    const enumerator = Gio.File.new_for_path(dir_path).enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
    for (let info; (info = enumerator.next_file(null)) !== null;) {
        const name = info.get_name();
        if (name.startsWith('.') || name === 'dist' || name === 'target') continue;
        const full = GLib.build_filenamev([dir_path, name]);
        if (info.get_file_type() === Gio.FileType.DIRECTORY) walk_repo(full, js_files, dirs);
        else if (name.endsWith('.js')) js_files.push(full);
    }
    enumerator.close(null);
}

function strip_line_comment(raw, blank_strings = false) {
    let out = '', quote = '';
    for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (quote) {
            if (!blank_strings) out += ch;
            if (ch === '\\' && i + 1 < raw.length) { if (!blank_strings) out += raw[i + 1]; i += 1; }
            else if (ch === quote) quote = '';
        } else if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch; out += blank_strings ? '""' : ch;
        } else if (ch === '/' && raw[i + 1] === '/') break;
        else out += ch;
    }
    return out;
}

function verify_page_rules_and_lint(js_files, dirs) {
    assert(js_files.length === 11, `expected 11 .js files, found ${js_files.length}`);
    const legacy = ['imports.gi', 'imports.ui', 'imports.misc', 'ExtensionUtils', 'Meta.LaterType', 'Clutter.Container', 'add_actor', 'remove_actor', 'new String('];
    for (const file of js_files) {
        const content = read_text(file);
        const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n');
        assert(lines.length >= 16 && lines.length <= 256, `Page Rule violation: ${file} has ${lines.length} lines (16..=256)`);
        assert(lines[0] === '// SPDX-License-Identifier: GPL-3.0-or-later', `Missing SPDX header in ${file}`);
        assert(lines[1].startsWith('// ') && lines[1].length >= 12, `Missing concise module description on line 2 of ${file}`);
        if (file.startsWith(EXT_ROOT)) {
            for (const sym of legacy) assert(!content.includes(sym), `Forbidden legacy symbol '${sym}' in ${file}`);
        }
        for (let idx = 0; idx < lines.length; idx += 1) {
            const raw = lines[idx], ln = idx + 1, code = strip_line_comment(raw, true);
            assert(raw.length <= 200, `Line ${ln} of ${file} exceeds 200 chars (${raw.length})`);
            if (!file.startsWith(EXT_ROOT)) continue;
            assert(!code.trimStart().startsWith('var ') && !code.includes(' var ') && !code.includes('(var '), `Forbidden var in ${file}:${ln}`);
            for (let i = 0; i < code.length - 1; i += 1) {
                const prev = i > 0 ? code[i - 1] : '';
                const prev_eq = prev === '=' || prev === '!' || prev === '<' || prev === '>';
                const next_eq = i + 2 < code.length && code[i + 2] === '=';
                assert(!(code[i] === '=' && code[i + 1] === '=' && !prev_eq && !next_eq), `Loose == in ${file}:${ln}`);
                assert(!(code[i] === '!' && code[i + 1] === '=' && !next_eq), `Loose != in ${file}:${ln}`);
            }
        }
    }
    for (const dir_path of dirs) {
        const enumerator = Gio.File.new_for_path(dir_path).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const visible = [];
        for (let info; (info = enumerator.next_file(null)) !== null;) {
            const name = info.get_name();
            if (!name.startsWith('.') && name !== 'dist' && name !== 'target') visible.push(name);
        }
        enumerator.close(null);
        assert(visible.length <= 8, `Directory density violation: ${dir_path} has ${visible.length} visible entries (max 8)`);
        for (const name of visible) {
            const stem = (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name).toLowerCase();
            assert(!BANNED_STEMS.has(stem), `Banned generic name '${name}' in ${dir_path}`);
        }
    }
}

function verify_process_boundaries_and_invariants() {
    const shared = ['prefs.js', 'launcher/search_engine.js', 'ui/launcher_style.js', 'ui/settings/gsettings.js', 'ui/settings/color.js', 'ui/settings/prefs_pages.js'];
    const compositor_only = ['gi://Meta', 'gi://Clutter', 'gi://St', 'gi://Shell', 'resource:///org/gnome/shell/'];
    assert(strip_line_comment("import St from 'gi://St'; // comment").includes('gi://St'), 'strip_line_comment');
    for (const rel of shared) {
        for (const raw of read_text(GLib.build_filenamev([EXT_ROOT, rel])).split('\n')) {
            const code = strip_line_comment(raw);
            for (const sym of compositor_only) assert(!code.includes(sym), `Process-boundary violation: ${rel} imports '${sym}'`);
        }
    }
    const check_files = [
        'extension.js', 'prefs.js', 'ui/settings/prefs_pages.js', 'launcher/launcher_manager.js',
        'launcher/launcher_dialog.js', 'launcher/search_engine.js', 'launcher/result_row.js',
        'metadata.json', 'schemas/org.gnome.shell.extensions.tide.gschema.xml',
    ];
    const combined = check_files.map((rel) => read_text(GLib.build_filenamev([EXT_ROOT, rel]))).join('\n');
    const reqs = [
        'export default class TideExtension extends Extension', 'this.manager.destroy()', 'fillPreferencesWindow(window)',
        'Adw.PreferencesPage', 'close-request', 'Star Tide on GitHub', 'Tuition, Not Coffee — Help send my daughter to college',
        'https://ubermetroid.github.io/tuition-not-coffee', 'Derived from Pop Launcher Super-Key Standalone by icesx',
        '[tide] style-refresh', 'block_signal_handler', 'unblock_signal_handler', 'allowKeybinding', 'stickykeys-enable',
        'addKeybinding', 'removeKeybinding', 'SYSTEM_MODAL', 'name="enable-super-enter"', 'name="toggle-launcher"',
        '"45"', '"50"', '"settings-schema": "org.gnome.shell.extensions.tide"', 'name="overlay-key-action"',
        'name="search-open-windows"', '1.2.1', '"name": "Studio 2201: Tide (App Launcher)"', 'Sync Color Across Suite', 'sync_color_across_suite',
        'this.unload_theme()', 'load_stylesheet(file)', 'Support &amp; Community',
        'ensureActorVisibleInScrollView', 'animationUtils.js', 'signal_handler_is_connected', 'Clutter.ActorAlign.START',
    ];
    for (const req of reqs) assert(combined.includes(req), `Missing invariant: ${req}`);
    assert(!combined.includes('Util.ensureActorVisibleInScrollView'), 'Must not call non-existent Util.ensureActorVisibleInScrollView');
    assert(!combined.includes('Rust installer') && !combined.includes('cargo install'), 'No Rust CLI reference');
    const prefs_pages = read_text(GLib.build_filenamev([EXT_ROOT, 'ui/settings/prefs_pages.js']));
    assert(!/new Gtk\.Label\(\{[^}]*&amp;/s.test(prefs_pages), 'Gtk.Label must not contain raw &amp; without use_markup');
}

async function verify_behavioral_and_gtk_suite() {
    const tmp_dir = GLib.dir_make_tmp('tide-verify-XXXXXX');
    const schema_xml = 'org.gnome.shell.extensions.tide.gschema.xml';
    const dst_xml = Gio.File.new_for_path(GLib.build_filenamev([tmp_dir, schema_xml]));
    const comp = Gio.File.new_for_path(GLib.build_filenamev([tmp_dir, 'gschemas.compiled']));
    try {
        Gio.File.new_for_path(GLib.build_filenamev([EXT_ROOT, 'schemas', schema_xml])).copy(dst_xml, Gio.FileCopyFlags.OVERWRITE, null, null);
        assert(Gio.Subprocess.new(['glib-compile-schemas', tmp_dir], Gio.SubprocessFlags.NONE).wait_check(null), 'schema');
        const src = Gio.SettingsSchemaSource.new_from_directory(tmp_dir, Gio.SettingsSchemaSource.get_default(), false);
        const mem_backend = Gio.memory_settings_backend_new();
        const ext_settings = new Gio.Settings({ settings_schema: src.lookup('org.gnome.shell.extensions.tide', true), backend: mem_backend });
        const s = new ExtensionSettings(ext_settings);
        assert(s.overlay_key_action() === 'launcher' && s.enable_super_enter() && s.max_results() === 9 && s.search_open_windows(), 'defs');
        assert(s.toggle_launcher().length === 2 && s.toggle_launcher()[0] === '<Super>Return' && s.toggle_launcher()[1] === '<Super>KP_Enter', 'toggle_launcher defs');
        assert(s.sort_by_usage() && s.show_descriptions() && s.show_shortcut_badges() && s.clear_search_on_open() && s.close_on_outside_click(), 'row & dialog defs');
        assert(s.dialog_width() === 680 && s.result_icon_size() === 32 && s.show_dialog_border() && s.border_width() === 2, 'border defs');
        assert(s.border_radius() === 18 && s.background_opacity() === 96 && OVERLAY_KEY_ACTIONS.length === 3 && DEFAULT_TOGGLE_SHORTCUTS.length === 2 && BORDER_PRESETS.length === 4, 'enums');
        assert(MAX_INDEXED_APPS === 512 && MAX_OPEN_WINDOWS === 128 && MAX_SCANNED_WORKSPACES === 32, 'bounds');

        s.set_overlay_key_action('overview'); assert(s.overlay_key_action() === 'overview', 'action overview');
        s.set_overlay_key_action('invalid'); s.set_enable_super_enter(false); s.set_toggle_launcher(['<Super>space']);
        assert(s.overlay_key_action() === 'launcher' && !s.enable_super_enter() && s.toggle_launcher()[0] === '<Super>space', 'fallback & super+enter');
        s.set_max_results(99); assert(s.max_results() === 15, 'clamp max results');
        s.set_max_results(1); assert(s.max_results() === 3, 'clamp min results');
        s.set_dialog_width(2000); assert(s.dialog_width() === 960, 'clamp dialog width');
        s.set_result_icon_size(10); assert(s.result_icon_size() === 24, 'clamp icon size');
        s.set_border_width(20); s.set_border_radius(80); s.set_border_color_rgba('#2ec27e');
        assert(s.border_width() === 8 && s.border_radius() === 36 && s.border_color_rgba() === 'rgba(46, 194, 126, 1)', 'border');
        assert(is_dark_rgba(parse_rgba('#111111')) && text_color_for_css('#ffffff') === '#000000', 'luminance');
        assert(format_rgba(parse_rgba('#0ff8')) === `rgba(0, 255, 255, ${136 / 255})`, '4-digit hex #RGBA');
        assert(format_rgba(parse_rgba('rgba(10, 20, 30, 5e-1)')) === 'rgba(10, 20, 30, 0.5)', 'scientific float rgba');
        assert(format_rgba(parse_rgba('#zzzzzz')) === 'rgba(106, 215, 225, 1)', 'invalid hex falls back to Ocean Cyan');
        const surf_css = build_dialog_surface_css(true, 2, 18, 'rgb(106,215,225)', 96);
        assert(surf_css.includes('margin-top: 160px;') && surf_css.includes('border: 2px solid rgba(106, 215, 225, 1);') && surf_css.includes('border-radius: 18px;'), 'surface css');
        assert(build_dialog_surface_css(false, 2, 18, 'rgb(106,215,225)', 0).includes('rgba(18, 28, 38, 0.6)'), 'zero opacity clamps to 0.6');
        assert(build_entry_focus_css(true, 'rgb(106,215,225)') === 'border: 1px solid rgba(106, 215, 225, 1);', 'entry css');
        assert(build_selected_row_css('rgba(106,215,225,0.5)').includes('rgba(106, 215, 225, 0.10)'), 'selected row alpha scale');
        assert(compute_scroll_height(0) === 64 && compute_scroll_height(5) === 300 && compute_scroll_height(20) === 420, 'scroll height');
        s.reset_defaults();
        assert(s.enable_super_enter() && s.toggle_launcher()[0] === '<Super>Return' && s.max_results() === 9 && s.border_color_rgba() === 'rgba(106, 215, 225, 1)', 'reset defaults');
        const tide_sdir = GLib.build_filenamev([tmp_dir, 'tide@studio2201.github.io', 'schemas']);
        GLib.mkdir_with_parents(tide_sdir, 0o755);
        comp.copy(Gio.File.new_for_path(GLib.build_filenamev([tide_sdir, 'gschemas.compiled'])), Gio.FileCopyFlags.OVERWRITE, null, null);
        assert(SUITE_COLOR_TARGETS.length === 5 && sync_color_across_suite('#102030', tmp_dir, mem_backend) === 1 && s.border_color_rgba() === 'rgba(16, 32, 48, 1)', 'suite sync');
        for (const p of [GLib.build_filenamev([tide_sdir, 'gschemas.compiled']), tide_sdir, GLib.build_filenamev([tmp_dir, 'tide@studio2201.github.io'])]) Gio.File.new_for_path(p).delete(null);
        s.reset_defaults();
        assert(normalize_query('  FireFox  ') === 'firefox' && normalize_query(null) === '', 'normalize_query');
        assert(format_shortcut_badge(0, true) === 'Ctrl+1' && format_shortcut_badge(9, true) === '' && format_shortcut_badge(0, false) === '', 'badge');
        assert(is_pointer_stationary([10, 20], 11, 21) && !is_pointer_stationary([10, 20], 14, 20) && !is_pointer_stationary(null, 0, 0), 'hover guard');
        const c_ff = { id: 'org.mozilla.firefox.desktop', name: 'Firefox', description: 'Web Browser', keywords: 'internet web' };
        const c_files = { id: 'org.gnome.Nautilus.desktop', name: 'Files', description: 'Access and organize files', keywords: 'folder manager' };
        assert(score_candidate_match(c_ff, 'firefox') === 1000 && score_candidate_match(c_ff, 'fire') > score_candidate_match(c_ff, 'browser'), 'exact & prefix score');
        assert(score_candidate_match(c_files, 'nautilus') > score_candidate_match(c_files, 'organize'), 'desktop id beats description');
        assert(score_candidate_match(c_files, 'ffx') === 0 && score_candidate_match(c_ff, 'ffx') > score_candidate_match({ id: 'b', name: 'zzzzFirefox' }, 'ffx'), 'fuzzy');
        const mock_sys = {
            get_installed: () => [
                { get_id: () => 'hidden.desktop', should_show: () => false },
                { get_id: () => 'b.desktop', should_show: () => true, get_keywords: () => ['beta'] },
                { get_id: () => 'a.desktop', should_show: () => true, get_keywords: () => ['alpha'] },
            ],
            lookup_app: (id) => ({ get_id: () => id, get_name: () => (id === 'a.desktop' ? 'Alpha' : 'Beta'), get_description: () => `Desc ${id}` }),
        };
        const apps_alpha = collect_installed_apps(mock_sys, null, false);
        const apps_usage = collect_installed_apps(mock_sys, { compare: (a, b) => (a === 'b.desktop' ? -1 : (b === 'b.desktop' ? 1 : 0)) }, true);
        assert(apps_alpha.length === 2 && apps_alpha[0].name === 'Alpha' && apps_usage[0].name === 'Beta', 'collect_installed_apps alpha & usage');
        const mock_wm = {
            get_n_workspaces: () => 2,
            get_workspace_by_index: (idx) => ({ list_windows: () => (idx === 0 ? [
                { is_skip_taskbar: () => false, get_title: () => 'Tide Repo — Editor', get_wm_class: () => 'Code', get_stable_sequence: () => 10 },
                { is_skip_taskbar: () => false, get_title: () => 'Tide Repo — Editor', get_wm_class: () => 'Code', get_stable_sequence: () => 11 },
            ] : []) }),
        };
        const open_wins = collect_open_windows(mock_wm, null);
        assert(open_wins.length === 2 && open_wins[0].id === 'window:0:10' && open_wins[1].id === 'window:0:11', 'collect_open_windows unique ids');
        assert(compute_scroll_height(5, true) === 300 && compute_scroll_height(5, false) === 220, 'scroll height descriptions toggle');
        const ranked_empty = rank_launcher_results(apps_alpha, open_wins, '', 9), ranked_q = rank_launcher_results(apps_alpha, open_wins, 'tide repo', 9);
        assert(ranked_empty.length === 2 && ranked_empty[0].kind === 'app' && ranked_q.length === 2 && ranked_q[0].kind === 'window', 'rank_launcher_results');
        let Gtk = null, Adw = null;
        try { Gtk = (await import('gi://Gtk?version=4.0')).default; Adw = (await import('gi://Adw?version=1')).default; } catch (_e) { /* no Gtk4 typelib */ }
        if (Gtk && Adw && Gtk.init_check()) {
            Adw.init();
            const signals = [], page_s = build_launcher_styling_page(ext_settings, s, signals), page_a = build_about_page();
            assert(page_s.get_title() === 'Appearance & Styling' && page_a.get_title() === 'About & Support', 'GTK4 pages');
            let root_to_walk = [page_s, page_a];
            const gres = '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource';
            if (Gio.File.new_for_path(gres).query_exists(null)) {
                try {
                    Gio.resources_register(Gio.Resource.load(gres));
                    const { default: TidePreferences, build_launcher_and_search_page } = await import('../extension/prefs.js');
                    assert(build_launcher_and_search_page(ext_settings, s, signals).get_title() === 'Launcher & Search', 'Launcher & Search page title');
                    const prefs = Object.create(TidePreferences.prototype), win = new Adw.PreferencesWindow();
                    prefs.getSettings = () => ext_settings; prefs.fillPreferencesWindow(win); root_to_walk = [win];
                } catch (e) { if (String(e).includes('Verification failed')) throw e; }
            }
            const walk_labels = (w) => {
                if (!w) return;
                if (w instanceof Gtk.Label) {
                    const txt = w.get_text() || '';
                    assert(!txt.includes('&amp;'), `Unescaped &amp; in rendered Gtk.Label text: ${txt}`);
                    if (w.get_visible()) assert(txt.trim().length > 0, 'Empty visible Gtk.Label');
                }
                for (let c = w.get_first_child?.(); c; c = c.get_next_sibling?.()) walk_labels(c);
            };
            for (const r of root_to_walk) walk_labels(r);
            for (const [obj, sig] of signals) obj.disconnect(sig);
        }
    } finally {
        for (const f of [dst_xml, comp, Gio.File.new_for_path(tmp_dir)]) {
            try { if (f.query_exists(null)) f.delete(null); } catch (_e) { /* ignore cleanup error */ }
        }
    }
}
const js_files = [], dirs = [];
walk_repo(REPO_ROOT, js_files, dirs);
verify_page_rules_and_lint(js_files, dirs);
verify_process_boundaries_and_invariants();
await verify_behavioral_and_gtk_suite();
print(`OK: verified ${js_files.length} JS pages across ${dirs.length} directories and all headless behavioral suites.`);
