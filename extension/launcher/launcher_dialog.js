// SPDX-License-Identifier: GPL-3.0-or-later
// ModalDialog launcher UI for Tide with search entry, result scrolling, and keyboard navigation.

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';
import {
    build_dialog_surface_css, build_entry_focus_css, build_selected_row_css, compute_scroll_height,
} from '../ui/launcher_style.js';
import { create_result_row } from './result_row.js';
import {
    collect_installed_apps, collect_open_windows, is_pointer_stationary, normalize_query, rank_launcher_results,
} from './search_engine.js';

export class LauncherDialog {
    constructor(extension, settings) {
        this.extension = extension;
        this.settings = settings;
        this._app_system = Shell.AppSystem.get_default();
        this._app_usage = Shell.AppUsage.get_default();
        this._window_tracker = Shell.WindowTracker.get_default();
        this._apps = [];
        this._results = [];
        this._buttons = [];
        this._selected_index = -1;
        this._hover_guard_pos = null;

        try {
            this._dialog = new ModalDialog({
                styleClass: 'tide-launcher-dialog', shellReactive: true,
                destroyOnClose: false, shouldFadeIn: false, shouldFadeOut: false,
            });
            this._header = new St.BoxLayout({ style_class: 'tide-launcher-header', x_expand: true });
            this._entry = new St.Entry({ style_class: 'tide-launcher-entry', can_focus: true, x_expand: true });
            this._entry.set_hint_text('Type to search apps & open windows…');
            this._prefs_btn = new St.Button({
                style_class: 'tide-launcher-prefs-button', can_focus: true, accessible_name: 'Tide Preferences',
                child: new St.Icon({ icon_name: 'preferences-system-symbolic', icon_size: 18 }),
            });
            this._prefs_btn.connect('clicked', () => {
                this.hide();
                try { this.extension?.openPreferences(); } catch (err) { console.warn('[tide] openPreferences failed:', err); }
            });
            this._header.add_child(this._entry);
            this._header.add_child(this._prefs_btn);
            this._dialog.contentLayout.add_child(this._header);

            this._list = new St.BoxLayout({ style_class: 'tide-launcher-list', vertical: true, x_expand: true });
            this._scroll = new St.ScrollView({
                style_class: 'tide-launcher-scroll', x_expand: true,
                hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            });
            this._scroll.set_child(this._list);
            this._dialog.contentLayout.add_child(this._scroll);

            this._bind_signals();
            this.sync_style();
            this.reload_apps();
        } catch (err) {
            this.destroy();
            throw err;
        }
    }

    get visible() { return Boolean(this._dialog?.visible); }

    _bind_signals() {
        const ct = this._entry.clutter_text;
        this._text_id = ct.connect('text-changed', () => this.refresh_results());
        this._act_id = ct.connect('activate', () => this._activate_at(this._selected_index));
        this._ekey_id = ct.connect('key-press-event', (_a, ev) => this._on_key_press(ev));
        this._dkey_id = this._dialog.connect('key-press-event', (_a, ev) => {
            if (this._entry?.clutter_text?.has_key_focus()) return Clutter.EVENT_PROPAGATE;
            return this._on_key_press(ev);
        });
        this._dbtn_id = this._dialog.connect('button-press-event', (_a, ev) => this._on_button_press(ev));
        this._dcls_id = this._dialog.connect('closed', () => this._on_closed());
        this._inst_id = this._app_system.connect('installed-changed', () => {
            this._apps_dirty = true;
            if (this.visible) this.reload_apps();
        });
    }

    _get_surface_actor() {
        const layout = this._dialog?.dialogLayout;
        return layout?._dialog || layout?.get_first_child?.() || layout || null;
    }

    sync_style() {
        if (!this._dialog || !this.settings) return;
        this._dialog.contentLayout.width = Math.max(448, this.settings.dialog_width() - 32);
        this._dialog.contentLayout.spacing = 12;
        const surface = this._get_surface_actor();
        if (surface) {
            surface.set_style(build_dialog_surface_css(
                this.settings.show_dialog_border(), this.settings.border_width(),
                this.settings.border_radius(), this.settings.border_color_rgba(),
                this.settings.background_opacity(),
            ));
        }
        this._entry.set_style(build_entry_focus_css(
            this.settings.show_dialog_border(), this.settings.border_color_rgba(),
        ));
        if (this.visible) this.refresh_results();
    }

    reload_apps() {
        if (!this._app_system || !this.settings) return;
        this._apps = collect_installed_apps(this._app_system, this._app_usage, this.settings.sort_by_usage());
        this._apps_dirty = false;
        if (this.visible) this.refresh_results();
    }

    show() {
        if (!this._dialog) return;
        if (Main.overview.visibleTarget) Main.overview.hide();
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.ALL);
        try {
            if (this._apps_dirty) this.reload_apps();
            this.sync_style();
            if (this.settings.clear_search_on_open()) this._entry.set_text('');
            this.refresh_results();
            if (this._dialog.open()) this._entry.grab_key_focus();
            else this._restore_overlay_key_mode();
        } catch (err) { this._restore_overlay_key_mode(); throw err; }
    }

    hide() { if (this._dialog?.visible) this._dialog.close(); }

    refresh_results() {
        if (!this._list || !this.settings) return;
        const [px, py] = global.get_pointer();
        this._hover_guard_pos = [px, py];
        this._list.destroy_all_children();
        this._buttons = [];

        const query = this._entry.get_text();
        const has_query = normalize_query(query).length > 0;
        const open_wins = has_query && this.settings.search_open_windows()
            ? collect_open_windows(global.workspace_manager, this._window_tracker)
            : [];

        this._results = rank_launcher_results(this._apps, open_wins, query, this.settings.max_results());
        this._selected_index = -1;
        this._scroll.height = compute_scroll_height(this._results.length, this.settings.show_descriptions());

        if (this._results.length === 0) {
            this._list.add_child(new St.Label({
                text: 'No matching applications or windows found',
                style_class: 'tide-launcher-empty', x_align: Clutter.ActorAlign.CENTER,
            }));
            return;
        }

        for (let i = 0; i < this._results.length; i += 1) {
            const btn = create_result_row(
                this._results[i], i, this.settings, (idx) => this._activate_at(idx),
                (idx) => {
                    const [cx, cy] = global.get_pointer();
                    if (is_pointer_stationary(this._hover_guard_pos, cx, cy)) return;
                    this._hover_guard_pos = null;
                    this._select(idx, true);
                },
            );
            this._buttons.push(btn);
            this._list.add_child(btn);
        }
        this._select(0, false);
    }

    _select(index, ensure_visible = true) {
        const count = this._results.length;
        if (count === 0) { this._selected_index = -1; return; }
        this._selected_index = ((index % count) + count) % count;
        const sel_css = build_selected_row_css(this.settings.border_color_rgba());
        for (let i = 0; i < this._buttons.length; i += 1) {
            const btn = this._buttons[i];
            if (i === this._selected_index) { btn.add_style_class_name('selected'); btn.set_style(sel_css); }
            else { btn.remove_style_class_name('selected'); btn.set_style(null); }
        }
        if (ensure_visible && this._buttons[this._selected_index]) {
            ensureActorVisibleInScrollView(this._scroll, this._buttons[this._selected_index]);
        }
    }

    _on_key_press(event) {
        const sym = event.get_key_symbol(), state = event.get_state();
        if (sym === Clutter.KEY_Escape) { this.hide(); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) {
            if (!this._entry.clutter_text.has_key_focus()) {
                this._activate_at(this._selected_index);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        if (sym === Clutter.KEY_Up) { this._select(this._selected_index - 1, true); return Clutter.EVENT_STOP; }
        if (sym === Clutter.KEY_Down) { this._select(this._selected_index + 1, true); return Clutter.EVENT_STOP; }
        const mods = state & Clutter.ModifierType.MODIFIER_MASK;
        const non_lock = mods & ~(Clutter.ModifierType.LOCK_MASK | Clutter.ModifierType.MOD2_MASK);
        if (non_lock === Clutter.ModifierType.CONTROL_MASK && sym >= Clutter.KEY_1 && sym <= Clutter.KEY_9) {
            this._activate_at(sym - Clutter.KEY_1);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _on_button_press(event) {
        if (!this.settings?.close_on_outside_click()) return Clutter.EVENT_PROPAGATE;
        const surface = this._get_surface_actor();
        if (!surface) return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const [dx, dy] = surface.get_transformed_position();
        const [dw, dh] = surface.get_transformed_size?.() || [surface.width, surface.height];
        if (x < dx || x > dx + dw || y < dy || y > dy + dh) {
            this.hide();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _activate_at(index) {
        if (index < 0 || index >= this._results.length) return;
        const item = this._results[index];
        this.hide();
        try {
            if (item.kind === 'window' && item.window) Main.activateWindow(item.window);
            else if (item.app) item.app.activate();
        } catch (_e) { /* ignore activation failure */ }
    }

    _on_closed() { this._selected_index = -1; this._results = []; this._restore_overlay_key_mode(); }

    _restore_overlay_key_mode() {
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
    }

    destroy() {
        this.hide();
        this._restore_overlay_key_mode();
        if (this._inst_id) { this._app_system?.disconnect(this._inst_id); this._inst_id = 0; }
        const ct = this._entry?.clutter_text;
        for (const id of [this._text_id, this._act_id, this._ekey_id]) { if (id) ct?.disconnect(id); }
        for (const id of [this._dkey_id, this._dbtn_id, this._dcls_id]) { if (id) this._dialog?.disconnect(id); }
        this._text_id = this._act_id = this._ekey_id = this._dkey_id = this._dbtn_id = this._dcls_id = 0;
        this._dialog?.destroy();
        this._dialog = this._header = this._entry = this._prefs_btn = this._list = this._scroll = null;
        this._app_system = this._app_usage = this._window_tracker = this.settings = this.extension = null;
        this._hover_guard_pos = null;
        this._apps = this._results = this._buttons = [];
    }
}
