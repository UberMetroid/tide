// SPDX-License-Identifier: GPL-3.0-or-later
// Libadwaita Preferences Appearance & Styling, About & Support pages, row builders, and presets.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { format_rgba, parse_rgba } from './color.js';

export const BORDER_PRESETS = Object.freeze([
    ['Ocean Cyan', 'rgb(106,215,225)'],
    ['Kelp Emerald', 'rgb(46,194,126)'],
    ['Gruvbox Amber', 'rgb(251,184,108)'],
    ['Coral Red', 'rgb(255,0,0)'],
]);

export function make_switch_row(title, subtitle, active, on_toggle) {
    const row = new Adw.ActionRow({ title, subtitle });
    const sw = new Gtk.Switch({ active: Boolean(active), valign: Gtk.Align.CENTER });
    sw.connect('notify::active', () => on_toggle(sw.active));
    row.add_suffix(sw);
    row.activatable_widget = sw;
    return [row, sw];
}

export function make_spin_row(title, subtitle, value, min, max, step, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(value);
    spin.set_valign(Gtk.Align.CENTER);
    spin.connect('value-changed', () => on_change(spin.get_value_as_int()));
    row.add_suffix(spin);
    return [row, spin];
}

export function make_combo_row(title, subtitle, items, active_idx, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const combo = new Gtk.ComboBoxText({ valign: Gtk.Align.CENTER });
    for (const item of items) combo.append_text(item);
    combo.set_active(Math.max(0, active_idx));
    combo.connect('changed', () => on_change(combo.get_active()));
    row.add_suffix(combo);
    return [row, combo];
}

function add_link_row(group, title, subtitle, button_label, url, fallback_url = null) {
    const row = new Adw.ActionRow({ title, subtitle });
    const btn = new Gtk.Button({
        label: button_label,
        valign: Gtk.Align.CENTER,
        css_classes: ['pill'],
    });
    btn.connect('clicked', () => {
        let ok = false;
        try {
            ok = Boolean(Gio.AppInfo.launch_default_for_uri(url, null));
        } catch (_e) {
            ok = false;
        }
        if (!ok && fallback_url) {
            try { Gio.AppInfo.launch_default_for_uri(fallback_url, null); } catch (_e2) { /* ignore */ }
        }
    });
    row.add_suffix(btn);
    row.activatable_widget = btn;
    group.add(row);
}

export function build_launcher_styling_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({
        title: 'Appearance & Styling',
        icon_name: 'applications-graphics-symbolic',
    });

    const dim_group = new Adw.PreferencesGroup({
        title: 'Launcher Dimensions &amp; Surface Opacity',
        description: 'Configure modal dialog width, application icon size, and dark-navy surface opacity',
    });

    const [dw_row, dw_spin] = make_spin_row(
        'Launcher Dialog Width (px)',
        'Horizontal width of the Tide modal search dialog (480–960 px, default 680 px)',
        settings.dialog_width(), 480, 960, 20,
        (v) => settings.set_dialog_width(v),
    );
    const [ic_row, ic_spin] = make_spin_row(
        'Result Application Icon Size (px)',
        'Icon texture size inside each launcher result row (24–64 px, default 32 px)',
        settings.result_icon_size(), 24, 64, 4,
        (v) => settings.set_result_icon_size(v),
    );
    const [op_row, op_spin] = make_spin_row(
        'Dialog Surface Opacity (%)',
        'Background opacity of the Tide launcher modal surface (60–100%, default 96%)',
        settings.background_opacity(), 60, 100, 2,
        (v) => settings.set_background_opacity(v),
    );

    for (const r of [dw_row, ic_row, op_row]) dim_group.add(r);
    page.add(dim_group);

    const style_group = new Adw.PreferencesGroup({
        title: 'Launcher Modal Accent Border &amp; Presets',
        description: 'Style the Tide launcher modal ring and selected result row to match Kelp, Reef, and Coral',
    });

    const [bdr_row, bdr_sw] = make_switch_row(
        'Show Launcher Accent Border',
        'Draw a high-contrast accent border ring around the Tide modal dialog and search entry',
        settings.show_dialog_border(),
        (v) => settings.set_show_dialog_border(v),
    );

    const color_row = new Adw.ActionRow({
        title: 'Accent Border Color',
        subtitle: 'Pick a custom RGBA color or select a 1-click Ocean Cyan, Kelp, Gruvbox, or Coral preset',
    });
    const rgba = new Gdk.RGBA();
    if (!rgba.parse(settings.border_color_rgba())) rgba.parse('rgb(106,215,225)');
    const color_btn = new Gtk.ColorButton({ rgba, use_alpha: true, valign: Gtk.Align.CENTER });
    color_btn.connect('color-set', () => settings.set_border_color_rgba(color_btn.get_rgba().to_string()));
    color_row.add_suffix(color_btn);

    const preset_labels = [...BORDER_PRESETS.map(([label]) => label), 'Custom Color'];
    const match_preset = (color) => {
        const idx = BORDER_PRESETS.findIndex(([, c]) => format_rgba(parse_rgba(c)) === color);
        return idx >= 0 ? idx : BORDER_PRESETS.length;
    };
    const [preset_row, preset_combo] = make_combo_row(
        'Quick Color Presets',
        'One-click color presets matching Kelp active window borders, Reef dock, and Coral folders',
        preset_labels,
        match_preset(settings.border_color_rgba()),
        (idx) => {
            if (idx >= 0 && idx < BORDER_PRESETS.length) {
                const css_color = BORDER_PRESETS[idx][1];
                settings.set_border_color_rgba(css_color);
                const next_rgba = new Gdk.RGBA();
                if (next_rgba.parse(css_color)) color_btn.set_rgba(next_rgba);
            }
        },
    );

    const [bw_row, bw_spin] = make_spin_row(
        'Border Width (px)',
        'Thickness of the Tide launcher accent border ring (0–8 px, default 2 px)',
        settings.border_width(), 0, 8, 1,
        (v) => settings.set_border_width(v),
    );
    const [br_row, br_spin] = make_spin_row(
        'Border Corner Radius (px)',
        'Corner rounding of the Tide launcher modal dialog (0–36 px, default 18 px)',
        settings.border_radius(), 0, 36, 2,
        (v) => settings.set_border_radius(v),
    );

    for (const r of [bdr_row, color_row, preset_row, bw_row, br_row]) style_group.add(r);
    page.add(style_group);

    const sync_style = () => {
        if (dw_spin.get_value_as_int() !== settings.dialog_width()) dw_spin.set_value(settings.dialog_width());
        if (ic_spin.get_value_as_int() !== settings.result_icon_size()) ic_spin.set_value(settings.result_icon_size());
        if (op_spin.get_value_as_int() !== settings.background_opacity()) op_spin.set_value(settings.background_opacity());
        if (bdr_sw.active !== settings.show_dialog_border()) bdr_sw.active = settings.show_dialog_border();
        if (bw_spin.get_value_as_int() !== settings.border_width()) bw_spin.set_value(settings.border_width());
        if (br_spin.get_value_as_int() !== settings.border_radius()) br_spin.set_value(settings.border_radius());
        const next_color = settings.border_color_rgba();
        const next_rgba = new Gdk.RGBA();
        if (next_rgba.parse(next_color) && !color_btn.get_rgba().equal(next_rgba)) color_btn.set_rgba(next_rgba);
        const next_idx = match_preset(next_color);
        if (preset_combo.get_active() !== next_idx) preset_combo.set_active(next_idx);
    };
    const keys = [
        'dialog-width', 'result-icon-size', 'background-opacity',
        'show-dialog-border', 'border-width', 'border-radius', 'border-color-rgba',
    ];
    for (const k of keys) {
        if (ext_settings.settings_schema?.has_key(k)) {
            signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_style)]);
        }
    }
    return page;
}

export function build_about_page(version_name = '1.0.3') {
    const page = new Adw.PreferencesPage({
        title: 'About & Support',
        icon_name: 'help-about-symbolic',
    });

    const header_group = new Adw.PreferencesGroup({
        title: 'Tide — Super-Key Application &amp; Open-Window Launcher',
        description: 'Zero-subprocess, Wayland-native Super &amp; Super+Enter launcher for GNOME 45–50 with instant fuzzy ' +
            'application and open-window search, Ctrl+1..9 shortcuts, and custom accent borders.',
    });

    const ver_row = new Adw.ActionRow({
        title: 'Tide Release Version',
        subtitle: 'Zero-subprocess, zero-telemetry Wayland Super-key application launcher for GNOME Shell',
    });
    const clean_ver = String(version_name || '1.0.3').replace(/^v/, '');
    ver_row.add_suffix(new Gtk.Label({
        label: `v${clean_ver}`, valign: Gtk.Align.CENTER, css_classes: ['monospace'],
    }));
    header_group.add(ver_row);

    const lic_row = new Adw.ActionRow({
        title: 'Open-Source License',
        subtitle: 'Derived from Pop Launcher Super-Key Standalone by icesx &amp; ManeLippert — free software forever',
    });
    lic_row.add_suffix(new Gtk.Label({
        label: 'GPL-3.0-or-later', valign: Gtk.Align.CENTER, css_classes: ['monospace'],
    }));
    header_group.add(lic_row);
    page.add(header_group);

    const support_group = new Adw.PreferencesGroup({
        title: 'Support &amp; Community',
        description: 'If Tide improves your daily workflow alongside Kelp, Reef, Shoal, Coral, and Seabed, starring ' +
            'the repository or sponsoring development helps keep GNOME 45–50 support fast and rock-solid.',
    });

    add_link_row(
        support_group,
        'Star Tide on GitHub',
        'Star UberMetroid/tide to help other GNOME &amp; Linux users discover Tide',
        'Star on GitHub',
        'https://github.com/UberMetroid/tide',
    );
    add_link_row(
        support_group,
        'Tuition, Not Coffee — Help send my daughter to college',
        "Skip the coffee — 100% of sponsorships go toward my daughter's college &amp; future fund",
        'Tuition, Not Coffee',
        'https://ubermetroid.github.io/tuition-not-coffee',
        'https://github.com/UberMetroid/tide',
    );
    add_link_row(
        support_group,
        'Project Website &amp; Documentation',
        'Explore the Tide feature guide, keyboard shortcut table, and configuration reference',
        'Open Website',
        'https://ubermetroid.github.io/tide/',
    );
    add_link_row(
        support_group,
        'Report an Issue or Request a Feature',
        'Found a bug or have a feature request? Open an issue on GitHub',
        'Report Issue',
        'https://github.com/UberMetroid/tide/issues',
    );

    page.add(support_group);
    return page;
}
