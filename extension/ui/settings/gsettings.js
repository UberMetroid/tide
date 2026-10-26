// SPDX-License-Identifier: GPL-3.0-or-later
// Data-driven GSettings wrapper for Tide Super-key launcher behavior, search, and modal styling.

import { format_rgba, parse_rgba } from './color.js';

export const OVERLAY_KEY_ACTIONS = Object.freeze(['launcher', 'overview', 'app-grid']);

const SCHEMA_SPEC = Object.freeze({
    overlay_key_action: Object.freeze({ key: 'overlay-key-action', type: 'enum', values: OVERLAY_KEY_ACTIONS, def: 'launcher' }),
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
    }

    _has(key) {
        return Boolean(this.gio && this.gio.settings_schema?.has_key(key));
    }

    _read(spec) {
        if (!this._has(spec.key)) {
            return spec.type === 'rgba' ? format_rgba(parse_rgba(spec.def)) : spec.def;
        }
        if (spec.type === 'bool') return this.gio.get_boolean(spec.key);
        if (spec.type === 'int') return clamp_int(this.gio.get_int(spec.key), spec.min, spec.max, spec.def);
        if (spec.type === 'enum') {
            const raw = this.gio.get_string(spec.key);
            return spec.values.includes(raw) ? raw : spec.def;
        }
        return format_rgba(parse_rgba(this.gio.get_string(spec.key)));
    }

    _write(spec, val) {
        if (!this._has(spec.key)) return;
        if (spec.type === 'bool') {
            this.gio.set_boolean(spec.key, Boolean(val));
        } else if (spec.type === 'int') {
            const clamped = clamp_int(val, spec.min, spec.max, spec.def);
            if (this.gio.get_int(spec.key) !== clamped) this.gio.set_int(spec.key, clamped);
        } else if (spec.type === 'enum') {
            this.gio.set_string(spec.key, spec.values.includes(val) ? val : spec.def);
        } else {
            this.gio.set_string(spec.key, format_rgba(parse_rgba(val)));
        }
    }

    reset_defaults() {
        for (const spec of Object.values(SCHEMA_SPEC)) {
            this._write(spec, spec.def);
        }
    }
}

for (const [prop, spec] of Object.entries(SCHEMA_SPEC)) {
    ExtensionSettings.prototype[prop] = function () { return this._read(spec); };
    ExtensionSettings.prototype[`set_${prop}`] = function (v) { this._write(spec, v); };
}
