// SPDX-License-Identifier: GPL-3.0-or-later
// Pure inline CSS builders for Tide launcher modal dialog, search entry, and result rows.

import { format_rgba, parse_rgba } from './settings/color.js';

export function build_dialog_surface_css(
    show_border, border_width, border_radius, border_color_rgba, bg_opacity, top_offset_px = 460, is_dark = true,
) {
    const r = Math.max(0, Math.min(36, Math.round(Number(border_radius) || 0)));
    const top_px = Math.max(120, Math.min(1200, Math.round(Number(top_offset_px) || 460)));
    const raw_op = Number(bg_opacity);
    const pct = Number.isFinite(raw_op) ? raw_op : 96;
    const op = Math.max(0.6, Math.min(1.0, pct / 100));
    const op_str = Math.round(op * 100) / 100;
    const bg_rgb = is_dark ? '18, 28, 38' : '246, 248, 250';
    const bg = `margin-top: ${top_px}px; background-color: rgba(${bg_rgb}, ${op_str});`;
    if (!show_border) {
        const bdr_fb = is_dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.14)';
        return `${bg} border: 1px solid ${bdr_fb}; border-radius: ${r}px;`;
    }
    const w = Math.max(0, Math.min(8, Math.round(Number(border_width) || 0)));
    if (w === 0) {
        return `${bg} border: none; border-radius: ${r}px;`;
    }
    const color = format_rgba(parse_rgba(border_color_rgba));
    return `${bg} border: ${w}px solid ${color}; border-radius: ${r}px;`;
}

export function build_entry_focus_css(show_border, border_color_rgba, is_dark = true) {
    if (!show_border) {
        return is_dark ? 'border: 1px solid rgba(255, 255, 255, 0.24);' : 'border: 1px solid rgba(0, 0, 0, 0.24);';
    }
    const color = format_rgba(parse_rgba(border_color_rgba));
    return `border: 1px solid ${color};`;
}

export function build_selected_row_css(border_color_rgba) {
    const parsed = parse_rgba(border_color_rgba);
    const a_scale = Number.isFinite(parsed.alpha) ? Math.max(0.25, Math.min(1.0, parsed.alpha)) : 1.0;
    const bg_a = (0.20 * a_scale).toFixed(2);
    const bdr_a = (0.55 * a_scale).toFixed(2);
    return `background-color: rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${bg_a}); ` +
        `border-color: rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${bdr_a});`;
}

export function compute_scroll_height(result_count, row_height = 60, max_height = 420) {
    const count = Math.max(0, Math.round(Number(result_count) || 0));
    if (count === 0) return 64;
    const h = typeof row_height === 'boolean' ? (row_height ? 60 : 44) : (Number(row_height) || 60);
    return Math.min(max_height, count * h);
}
