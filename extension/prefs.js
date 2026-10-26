// SPDX-License-Identifier: GPL-3.0-or-later
// 3-tab GTK4 / Libadwaita preferences UI for Tide Super-Key Launcher, Search, and Modal Styling.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { ExtensionSettings, OVERLAY_KEY_ACTIONS } from './ui/settings/gsettings.js';
import {
    build_about_page, build_launcher_styling_page,
    make_combo_row, make_spin_row, make_switch_row,
} from './ui/settings/prefs_pages.js';

function build_launcher_and_search_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({
        title: 'Launcher & Search',
        icon_name: 'system-search-symbolic',
    });

    const key_group = new Adw.PreferencesGroup({
        title: 'Super Key &amp; Modal Behavior',
        description: 'Configure what pressing the Super (Overlay) key opens and how the modal dialog behaves',
    });

    const action_labels = [
        'Tide Application & Window Launcher (Default)',
        'GNOME Activities Overview',
        'GNOME Overview Application Grid',
    ];
    const [act_row, act_combo] = make_combo_row(
        'Super Key Action',
        'Action triggered when pressing the Super key (automatically respects GNOME Sticky Keys)',
        action_labels,
        OVERLAY_KEY_ACTIONS.indexOf(settings.overlay_key_action()),
        (idx) => {
            if (idx >= 0 && idx < OVERLAY_KEY_ACTIONS.length) {
                settings.set_overlay_key_action(OVERLAY_KEY_ACTIONS[idx]);
            }
        },
    );

    const [clr_row, clr_sw] = make_switch_row(
        'Clear Search Query When Opening',
        'Reset the search entry text whenever the Tide launcher modal opens',
        settings.clear_search_on_open(),
        (v) => settings.set_clear_search_on_open(v),
    );
    const [out_row, out_sw] = make_switch_row(
        'Close Launcher on Outside Click',
        'Dismiss the Tide modal launcher when clicking anywhere outside the dialog bounds',
        settings.close_on_outside_click(),
        (v) => settings.set_close_on_outside_click(v),
    );

    for (const r of [act_row, clr_row, out_row]) key_group.add(r);
    page.add(key_group);

    const search_group = new Adw.PreferencesGroup({
        title: 'Search Indexing &amp; Result Rows',
        description: 'Customize open-window switching, recent-usage ranking, result count, and Ctrl+1..9 badges',
    });

    const [win_row, win_sw] = make_switch_row(
        'Search Open Windows Across Workspaces',
        'Include open windows in search results so you can jump directly to active windows on any workspace',
        settings.search_open_windows(),
        (v) => settings.set_search_open_windows(v),
    );
    const [usg_row, usg_sw] = make_switch_row(
        'Sort Applications by Recent Usage',
        'Order installed applications by GNOME Shell usage frequency instead of strictly A -> Z',
        settings.sort_by_usage(),
        (v) => settings.set_sort_by_usage(v),
    );
    const [max_row, max_spin] = make_spin_row(
        'Maximum Search Results',
        'Maximum number of application and window rows shown in the launcher list (3–15, default 9)',
        settings.max_results(), 3, 15, 1,
        (v) => settings.set_max_results(v),
    );
    const [dsc_row, dsc_sw] = make_switch_row(
        'Show Application Descriptions &amp; Workspace Subtitles',
        'Display the .desktop comment or active workspace number beneath each result title',
        settings.show_descriptions(),
        (v) => settings.set_show_descriptions(v),
    );
    const [bdg_row, bdg_sw] = make_switch_row(
        'Show Ctrl+1 .. Ctrl+9 Quick-Launch Badges',
        'Display keyboard shortcut badges on the right side of the first nine launcher results',
        settings.show_shortcut_badges(),
        (v) => settings.set_show_shortcut_badges(v),
    );

    const reset_row = new Adw.ActionRow({
        title: 'Reset to Tide Defaults',
        subtitle: 'Restore Super-key launcher mode, 9 results, open-window search, and Ocean Cyan border',
    });
    const reset_btn = new Gtk.Button({
        label: 'Reset Defaults',
        valign: Gtk.Align.CENTER,
        css_classes: ['suggested-action'],
    });
    reset_btn.connect('clicked', () => settings.reset_defaults());
    reset_row.add_suffix(reset_btn);
    reset_row.activatable_widget = reset_btn;

    for (const r of [win_row, usg_row, max_row, dsc_row, bdg_row, reset_row]) search_group.add(r);
    page.add(search_group);

    const sync_launcher = () => {
        const a_idx = Math.max(0, OVERLAY_KEY_ACTIONS.indexOf(settings.overlay_key_action()));
        if (act_combo.get_active() !== a_idx) act_combo.set_active(a_idx);
        if (clr_sw.active !== settings.clear_search_on_open()) clr_sw.active = settings.clear_search_on_open();
        if (out_sw.active !== settings.close_on_outside_click()) out_sw.active = settings.close_on_outside_click();
        if (win_sw.active !== settings.search_open_windows()) win_sw.active = settings.search_open_windows();
        if (usg_sw.active !== settings.sort_by_usage()) usg_sw.active = settings.sort_by_usage();
        if (max_spin.get_value_as_int() !== settings.max_results()) max_spin.set_value(settings.max_results());
        if (dsc_sw.active !== settings.show_descriptions()) dsc_sw.active = settings.show_descriptions();
        if (bdg_sw.active !== settings.show_shortcut_badges()) bdg_sw.active = settings.show_shortcut_badges();
    };
    const keys = [
        'overlay-key-action', 'clear-search-on-open', 'close-on-outside-click',
        'search-open-windows', 'sort-by-usage', 'max-results', 'show-descriptions', 'show-shortcut-badges',
    ];
    for (const k of keys) {
        if (ext_settings.settings_schema?.has_key(k)) {
            signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_launcher)]);
        }
    }
    return page;
}

export default class TidePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const ext_settings = this.getSettings();
        const settings = new ExtensionSettings(ext_settings);
        const signals = [];
        window.set_default_size(760, 680);
        window.add(build_launcher_and_search_page(ext_settings, settings, signals));
        window.add(build_launcher_styling_page(ext_settings, settings, signals));
        window.add(build_about_page(this.metadata?.['version-name']));
        window.connect('close-request', () => {
            for (const [obj, sig] of signals) obj.disconnect(sig);
            signals.length = 0;
            return false;
        });
    }
}
