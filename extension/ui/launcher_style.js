// SPDX-License-Identifier: GPL-3.0-or-later
// Pure inline CSS builders for Tide launcher modal dialog, search entry, and result rows.

import { format_rgba, parse_rgba } from './settings/color.js';

export function build_dialog_surface_css(show_border, border_width, border_radius, border_color_rgba, bg_opacity) {
    const r = Math.max(0, Math.min(36, Math.round(Number(border_radius) || 0)));
    const op = Math.max(0.6, Math.min(1.0, (Number(bg_opacity) || 96) / 100));
    const op_str = Math.round(op * 100) / 100;
    const bg = `background-color: rgba(18, 28, 38, ${op_str});`;
    if (!show_border) {
        return `${bg} border: 1px solid rgba(255, 255, 255, 0.12); border-radius: ${r}px;`;
    }
    const w = Math.max(0, Math.min(8, Math.round(Number(border_width) || 0)));
    if (w === 0) {
        return `${bg} border: none; border-radius: ${r}px;`;
    }
    const color = format_rgba(parse_rgba(border_color_rgba));
    return `${bg} border: ${w}px solid ${color}; border-radius: ${r}px;`;
}

export function build_entry_focus_css(show_border, border_color_rgba) {
    if (!show_border) {
        return 'border: 1px solid rgba(255, 255, 255, 0.24);';
    }
    const color = format_rgba(parse_rgba(border_color_rgba));
    return `border: 1px solid ${color};`;
}

export function build_selected_row_css(border_color_rgba) {
    const parsed = parse_rgba(border_color_rgba);
    return `background-color: rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, 0.20); ` +
        `border-color: rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, 0.55);`;
}

export function compute_scroll_height(result_count, row_height = 56, max_height = 420) {
    const count = Math.max(0, Math.round(Number(result_count) || 0));
    if (count === 0) return 64;
    return Math.min(max_height, count * row_height);
}
