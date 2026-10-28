// SPDX-License-Identifier: GPL-3.0-or-later
// Super-key (overlay-key) & Super+Enter interceptor, sticky-keys guard, stylesheet loader, and Tide coordinator.

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ExtensionSettings } from '../ui/settings/gsettings.js';
import { LauncherDialog } from './launcher_dialog.js';

const A11Y_SCHEMA = 'org.gnome.desktop.a11y.keyboard';
const STICKY_KEYS_KEY = 'stickykeys-enable';
const TOGGLE_SHORTCUT_KEY = 'toggle-launcher';
const STYLE_KEYS = new Set([
    'dialog-width', 'result-icon-size', 'show-dialog-border',
    'border-width', 'border-radius', 'border-color-rgba', 'background-opacity',
]);
const RESULT_KEYS = new Set([
    'max-results', 'search-open-windows', 'show-descriptions', 'show-shortcut-badges',
]);

export class LauncherManager {
    constructor(extension) {
        this.extension = extension;
        this.ext_settings = null;
        this.settings = null;
        this._a11y_settings = null;
        this._current_style = null;
        this._orig_overlay_key_id = 0;
        this._overlay_key_id = 0;
        this._shortcut_bound = false;
        this._settings_id = 0;
        this._style_timer_id = 0;
        this._launcher = null;
        this._destroyed = false;

        try {
            this.ext_settings = extension.getSettings();
            this.settings = new ExtensionSettings(this.ext_settings);
            try {
                if (Gio.SettingsSchemaSource.get_default()?.lookup(A11Y_SCHEMA, true)) {
                    this._a11y_settings = new Gio.Settings({ schema_id: A11Y_SCHEMA });
                }
            } catch (err) {
                console.warn(`[tide] failed to load ${A11Y_SCHEMA}:`, err);
                this._a11y_settings = null;
            }
            this.load_theme();
            this._launcher = new LauncherDialog(extension, this.settings);
            this._bind_overlay_key();
            this._sync_shortcut();
            this._connect_settings();
        } catch (err) {
            console.error('[tide] failed to initialize LauncherManager:', err);
            this.destroy();
        }
    }

    load_theme() {
        this.unload_theme();
        try {
            const file = Gio.File.new_for_path(`${this.extension.path}/ui/stylesheet.css`);
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (theme) {
                theme.load_stylesheet(file);
                this._current_style = file;
            }
        } catch (err) {
            console.error(err);
        }
    }

    unload_theme() {
        if (!this._current_style) return;
        try {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            if (theme) theme.unload_stylesheet(this._current_style);
        } catch (_e) { /* ignore */ }
        this._current_style = null;
    }

    _bind_overlay_key() {
        const found_id = GObject.signal_handler_find(global.display, { signalId: 'overlay-key' });
        if (found_id > 0 && GObject.signal_handler_is_connected(global.display, found_id)) {
            this._orig_overlay_key_id = found_id;
            global.display.block_signal_handler(this._orig_overlay_key_id);
        } else {
            console.warn('[tide] default overlay-key signal handler not found on global.display');
        }
        this._overlay_key_id = global.display.connect('overlay-key', () => {
            if (this._a11y_settings?.get_boolean(STICKY_KEYS_KEY)) return;
            this.toggle_action(this.settings.overlay_key_action());
        });
    }

    _sync_shortcut() {
        if (this.settings?.enable_super_enter()) this._bind_shortcut();
        else this._unbind_shortcut();
    }

    _bind_shortcut() {
        if (this._shortcut_bound || !this.ext_settings?.settings_schema?.has_key(TOGGLE_SHORTCUT_KEY)) return;
        try {
            Main.wm.addKeybinding(
                TOGGLE_SHORTCUT_KEY,
                this.ext_settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.SYSTEM_MODAL,
                () => this.toggle_action('launcher'),
            );
            this._shortcut_bound = true;
        } catch (err) {
            console.warn('[tide] failed to bind toggle-launcher shortcut:', err);
        }
    }

    _unbind_shortcut() {
        if (!this._shortcut_bound) return;
        try { Main.wm.removeKeybinding(TOGGLE_SHORTCUT_KEY); } catch (_e) { /* ignore */ }
        this._shortcut_bound = false;
    }

    _connect_settings() {
        if (this.settings?.int) {
            this._int_id = this.settings.int.connect('changed', () => this._schedule_style_refresh());
        }
        this._settings_id = this.ext_settings.connect('changed', (_s, key) => {
            if (key === 'overlay-key-action') {
                if (this._launcher?.visible) this._launcher.hide();
                return;
            }
            if (key === 'enable-super-enter') {
                this._sync_shortcut();
                return;
            }
            if (key === 'sort-by-usage') {
                this._launcher?.reload_apps();
                return;
            }
            if (STYLE_KEYS.has(key)) {
                this._schedule_style_refresh();
                return;
            }
            if (RESULT_KEYS.has(key) && this._launcher?.visible) {
                this._launcher.refresh_results();
            }
        });
    }

    _schedule_style_refresh() {
        if (this._style_timer_id !== 0) {
            GLib.Source.remove(this._style_timer_id);
            this._style_timer_id = 0;
        }
        this._style_timer_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            this._style_timer_id = 0;
            this._launcher?.sync_style();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._style_timer_id, '[tide] style-refresh');
    }

    toggle_action(action) {
        if (Main.overview.animationInProgress) return;
        if (action === 'launcher') {
            if (this._launcher?.visible) this._launcher.hide();
            else this._launcher?.show();
            return;
        }
        if (this._launcher?.visible) this._launcher.hide();
        if (action === 'app-grid') {
            if (Main.overview.visibleTarget) Main.overview.hide();
            else if (typeof Main.overview.showApps === 'function') Main.overview.showApps();
            else Main.overview.show();
            return;
        }
        if (Main.overview.visibleTarget) Main.overview.hide();
        else Main.overview.show();
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        if (this._style_timer_id !== 0) {
            GLib.Source.remove(this._style_timer_id);
            this._style_timer_id = 0;
        }
        this._unbind_shortcut();
        if (this._overlay_key_id > 0) {
            if (GObject.signal_handler_is_connected(global.display, this._overlay_key_id)) {
                global.display.disconnect(this._overlay_key_id);
            }
            this._overlay_key_id = 0;
        }
        if (this._orig_overlay_key_id > 0) {
            if (GObject.signal_handler_is_connected(global.display, this._orig_overlay_key_id)) {
                global.display.unblock_signal_handler(this._orig_overlay_key_id);
            }
            this._orig_overlay_key_id = 0;
        }
        if (this._int_id > 0) {
            this.settings?.int?.disconnect(this._int_id);
            this._int_id = 0;
        }
        if (this._settings_id > 0) {
            this.ext_settings?.disconnect(this._settings_id);
            this._settings_id = 0;
        }
        this._launcher?.destroy();
        this._launcher = null;
        this.unload_theme();
        this._a11y_settings = null;
        this.settings = null;
        this.ext_settings = null;
        this.extension = null;
    }
}
