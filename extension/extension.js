// SPDX-License-Identifier: GPL-3.0-or-later
// GNOME Shell extension entrypoint (TideExtension extends Extension) managing enable/disable.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { LauncherManager } from './launcher/launcher_manager.js';

export default class TideExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.manager = null;
    }

    enable() {
        if (this.manager !== null) return;
        const mgr = new LauncherManager(this);
        this.manager = mgr._destroyed ? null : mgr;
    }

    disable() {
        if (this.manager !== null) {
            this.manager.destroy();
            this.manager = null;
        }
    }
}
