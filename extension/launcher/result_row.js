// SPDX-License-Identifier: GPL-3.0-or-later
// Result row St.Button builder, icon texture creator, shortcut badge, and hover-guard wiring.

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { format_shortcut_badge, is_pointer_stationary } from './search_engine.js';

export { format_shortcut_badge, is_pointer_stationary };

export function create_result_row(item, index, settings, on_activate, on_hover_select) {
    const icon_size = settings.result_icon_size();
    let icon = null;
    try {
        if (item.app && typeof item.app.create_icon_texture === 'function') {
            icon = item.app.create_icon_texture(icon_size);
        }
    } catch (_e) {
        icon = null;
    }
    if (!icon) {
        icon = new St.Icon({
            icon_name: item.kind === 'window' ? 'focus-windows-symbolic' : 'application-x-executable-symbolic',
            icon_size,
        });
    }
    icon.y_align = Clutter.ActorAlign.CENTER;

    const name_label = new St.Label({
        text: item.name || 'Application',
        style_class: 'tide-launcher-result-name',
        x_expand: true,
    });
    name_label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

    const text_box = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    text_box.add_child(name_label);

    if (settings.show_descriptions() && item.description) {
        const desc_label = new St.Label({
            text: item.description,
            style_class: 'tide-launcher-result-description',
            x_expand: true,
        });
        desc_label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        text_box.add_child(desc_label);
    }

    const content = new St.BoxLayout({
        style_class: 'tide-launcher-result-content',
        x_expand: true,
    });
    content.add_child(icon);
    content.add_child(text_box);

    const badge_text = format_shortcut_badge(index, settings.show_shortcut_badges());
    if (badge_text) {
        const badge = new St.Label({
            text: badge_text,
            style_class: 'tide-launcher-result-badge',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(badge);
    }

    const button = new St.Button({
        style_class: 'tide-launcher-result',
        can_focus: false,
        x_expand: true,
        child: content,
    });

    button.connect('clicked', () => on_activate(index));
    button.connect('notify::hover', () => {
        if (button.hover) on_hover_select(index);
    });
    return button;
}
