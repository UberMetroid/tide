// SPDX-License-Identifier: GPL-3.0-or-later
// Data-driven GSettings wrapper for Tide Super-key launcher behavior, search, and modal styling.

import { format_rgba, parse_rgba } from './color.js';

export const OVERLAY_KEY_ACTIONS = Object.freeze(['launcher', 'overview', 'app-grid']);
export const DEFAULT_TOGGLE_SHORTCUTS = Object.freeze(['<Super>Return', '<Super>KP_Enter']);

const SCHEMA_SPEC = Object.freeze({
    overlay_key_action: Object.freeze({ key: 'overlay-key-action', type: 'enum', values: OVERLAY_KEY_ACTIONS, def: 'launcher' }),
    enable_super_enter: Object.freeze({ key: 'enable-super-enter', type: 'bool', def: true }),
    toggle_launcher: Object.freeze({ key: 'toggle-launcher', type: 'strv', def: DEFAULT_TOGGLE_SHORTCUTS }),
    max_results: Object.freeze({ key: 'max-results', type: 'int', min: 3, max: 15, def: 9 }),
    search_open_windows: Object.freeze({ key: 'search-open-windows', type: 'bool', def: true }),
    sort_by_usage: Object.freeze({ key: 'sort-by-usage', type: 'bool', def: true }),
    show_descriptions: Object.freeze({ key: 'show-descriptions', type: 'bool', def: true }),
    show_shortcut_badges: Object.freeze({ key: 'show-shortcut-badges', type: 'bool', def: true }),
    clear_search_on_open: Object.freeze({ key: 'clear-search-on-open', type: 'bool', def: true }),
    close_on_outside_click: Object.freeze({ key: 'close-on-outside-click', type: 'bool', def: true }),
    dialog_width: Object.freeze({ key: 'dialog-width', type: 'int', min: 480, max: 960, def: 680 }),
    result_icon_size: Object.freeze({ key: 'result-icon-size', type: 'int', min: 24, max: 64, def: 32 }),
    show_dialog_border: Object.freeze({ key: 'show-dialog-border', type: 'bool', def: true }),
    border_width: Object.freeze({ key: 'border-width', type: 'int', min: 0, max: 8, def: 2 }),
    border_radius: Object.freeze({ key: 'border-radius', type: 'int', min: 0, max: 36, def: 18 }),
    border_color_rgba: Object.freeze({ key: 'border-color-rgba', type: 'rgba', def: 'rgb(106,215,225)' }),
    background_opacity: Object.freeze({ key: 'background-opacity', type: 'int', min: 60, max: 100, def: 96 }),
});

function clamp_int(v, min, max, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export class ExtensionSettings {
    constructor(gio_settings) {
        this.gio = gio_settings;
        this._schema = gio_settings?.settings_schema ?? null;
        this._keys = new Map();
    }

    _has(key) {
        if (!this.gio || !this._schema) return false;
        let ok = this._keys.get(key);
        if (ok === undefined) {
            ok = Boolean(this._schema.has_key(key));
            this._keys.set(key, ok);
        }
        return ok;
    }

    _read(spec) {
        if (!this._has(spec.key)) {
            if (spec.type === 'strv') return Array.from(spec.def);
            return spec.type === 'rgba' ? format_rgba(parse_rgba(spec.def)) : spec.def;
        }
        if (spec.type === 'bool') return this.gio.get_boolean(spec.key);
        if (spec.type === 'int') return clamp_int(this.gio.get_int(spec.key), spec.min, spec.max, spec.def);
        if (spec.type === 'strv') return this.gio.get_strv(spec.key);
        if (spec.type === 'enum') {
            const raw = this.gio.get_string(spec.key);
            return spec.values.includes(raw) ? raw : spec.def;
        }
        return format_rgba(parse_rgba(this.gio.get_string(spec.key)));
    }

    _write(spec, val) {
        if (!this._has(spec.key)) return;
        if (spec.type === 'bool') {
            const next = Boolean(val);
            if (this.gio.get_boolean(spec.key) !== next) this.gio.set_boolean(spec.key, next);
        } else if (spec.type === 'int') {
            const clamped = clamp_int(val, spec.min, spec.max, spec.def);
            if (this.gio.get_int(spec.key) !== clamped) this.gio.set_int(spec.key, clamped);
        } else if (spec.type === 'strv') {
            const next = Array.isArray(val) ? val.map(String) : Array.from(spec.def);
            this.gio.set_strv(spec.key, next);
        } else if (spec.type === 'enum') {
            const next = spec.values.includes(val) ? val : spec.def;
            if (this.gio.get_string(spec.key) !== next) this.gio.set_string(spec.key, next);
        } else {
            const next = format_rgba(parse_rgba(val));
            if (this.gio.get_string(spec.key) !== next) this.gio.set_string(spec.key, next);
        }
    }

    reset_defaults() {
        for (const spec of Object.values(SCHEMA_SPEC)) {
            if (!this._has(spec.key)) continue;
            if (typeof this.gio.reset === 'function') this.gio.reset(spec.key);
            else this._write(spec, spec.def);
        }
    }

    overlay_key_action() { return this._read(SCHEMA_SPEC.overlay_key_action); }
    set_overlay_key_action(v) { this._write(SCHEMA_SPEC.overlay_key_action, v); }
    enable_super_enter() { return this._read(SCHEMA_SPEC.enable_super_enter); }
    set_enable_super_enter(v) { this._write(SCHEMA_SPEC.enable_super_enter, v); }
    toggle_launcher() { return this._read(SCHEMA_SPEC.toggle_launcher); }
    set_toggle_launcher(v) { this._write(SCHEMA_SPEC.toggle_launcher, v); }
    max_results() { return this._read(SCHEMA_SPEC.max_results); }
    set_max_results(v) { this._write(SCHEMA_SPEC.max_results, v); }
    search_open_windows() { return this._read(SCHEMA_SPEC.search_open_windows); }
    set_search_open_windows(v) { this._write(SCHEMA_SPEC.search_open_windows, v); }
    sort_by_usage() { return this._read(SCHEMA_SPEC.sort_by_usage); }
    set_sort_by_usage(v) { this._write(SCHEMA_SPEC.sort_by_usage, v); }
    show_descriptions() { return this._read(SCHEMA_SPEC.show_descriptions); }
    set_show_descriptions(v) { this._write(SCHEMA_SPEC.show_descriptions, v); }
    show_shortcut_badges() { return this._read(SCHEMA_SPEC.show_shortcut_badges); }
    set_show_shortcut_badges(v) { this._write(SCHEMA_SPEC.show_shortcut_badges, v); }
    clear_search_on_open() { return this._read(SCHEMA_SPEC.clear_search_on_open); }
    set_clear_search_on_open(v) { this._write(SCHEMA_SPEC.clear_search_on_open, v); }
    close_on_outside_click() { return this._read(SCHEMA_SPEC.close_on_outside_click); }
    set_close_on_outside_click(v) { this._write(SCHEMA_SPEC.close_on_outside_click, v); }
    dialog_width() { return this._read(SCHEMA_SPEC.dialog_width); }
    set_dialog_width(v) { this._write(SCHEMA_SPEC.dialog_width, v); }
    result_icon_size() { return this._read(SCHEMA_SPEC.result_icon_size); }
    set_result_icon_size(v) { this._write(SCHEMA_SPEC.result_icon_size, v); }
    show_dialog_border() { return this._read(SCHEMA_SPEC.show_dialog_border); }
    set_show_dialog_border(v) { this._write(SCHEMA_SPEC.show_dialog_border, v); }
    border_width() { return this._read(SCHEMA_SPEC.border_width); }
    set_border_width(v) { this._write(SCHEMA_SPEC.border_width, v); }
    border_radius() { return this._read(SCHEMA_SPEC.border_radius); }
    set_border_radius(v) { this._write(SCHEMA_SPEC.border_radius, v); }
    border_color_rgba() { return this._read(SCHEMA_SPEC.border_color_rgba); }
    set_border_color_rgba(v) { this._write(SCHEMA_SPEC.border_color_rgba, v); }
    background_opacity() { return this._read(SCHEMA_SPEC.background_opacity); }
    set_background_opacity(v) { this._write(SCHEMA_SPEC.background_opacity, v); }
}
