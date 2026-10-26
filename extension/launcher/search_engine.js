// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded application & open-window indexer, query normalizer, and fuzzy scorer for Tide.

export const MAX_INDEXED_APPS = 512;
export const MAX_OPEN_WINDOWS = 128;
export const MAX_SCANNED_WORKSPACES = 32;

export function normalize_query(text) {
    if (typeof text !== 'string') return '';
    return text.trim().toLocaleLowerCase();
}

export function score_candidate_match(candidate, query) {
    const q = normalize_query(query);
    if (!q) return 1;
    const name = normalize_query(candidate?.name);
    const desc = normalize_query(candidate?.description);
    const id = normalize_query(candidate?.id);
    const kw = normalize_query(candidate?.keywords);

    if (name === q) return 1000;
    if (name.startsWith(q)) return 850 - Math.min(100, name.length);
    const word_idx = name.indexOf(` ${q}`);
    if (word_idx >= 0) return 720 - Math.min(80, word_idx);
    const sub_idx = name.indexOf(q);
    if (sub_idx >= 0) return 600 - Math.min(80, sub_idx);
    if (id.startsWith(q) || id.includes(`.${q}`)) return 480;
    if (kw.includes(q)) return 420;
    if (id.includes(q)) return 360;
    if (desc.includes(q)) return 320;

    let qi = 0;
    let gaps = 0;
    for (let i = 0; i < name.length && qi < q.length; i += 1) {
        if (name[i] === q[qi]) qi += 1;
        else if (qi > 0) gaps += 1;
    }
    if (qi === q.length && q.length >= 2 && gaps <= 6) {
        return Math.max(80, 200 - gaps * 15);
    }
    return 0;
}

export function collect_installed_apps(app_system, app_usage, sort_by_usage = true) {
    if (!app_system || typeof app_system.get_installed !== 'function') return [];
    const raw = app_system.get_installed() || [];
    const seen = new Set();
    const out = [];
    const limit = Math.min(raw.length, MAX_INDEXED_APPS);
    let err_count = 0;

    for (let i = 0; i < limit; i += 1) {
        const info = raw[i];
        try {
            const id = info?.get_id?.();
            if (!id || seen.has(id)) continue;
            if (typeof info.should_show === 'function' && !info.should_show()) continue;
            const app = app_system.lookup_app?.(id) ?? null;
            const app_id = app?.get_id?.() || id;
            if (!app || seen.has(app_id)) continue;
            seen.add(app_id);
            const kw_list = typeof info.get_keywords === 'function' ? (info.get_keywords() || []) : [];
            out.push({
                kind: 'app',
                id: app_id,
                name: app.get_name?.() || info.get_name?.() || app_id,
                description: app.get_description?.() || info.get_description?.() || '',
                keywords: Array.isArray(kw_list) ? kw_list.join(' ') : '',
                app,
                window: null,
            });
        } catch (err) {
            if (err_count < 3) console.warn(`[tide] skip malformed app entry: ${err}`);
            err_count += 1;
        }
    }

    if (sort_by_usage && app_usage && typeof app_usage.compare === 'function') {
        out.sort((a, b) => app_usage.compare(a.id, b.id));
    } else {
        out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
    return out;
}

export function collect_open_windows(workspace_manager, window_tracker) {
    if (!workspace_manager || typeof workspace_manager.get_n_workspaces !== 'function') return [];
    const n_ws = Math.min(MAX_SCANNED_WORKSPACES, workspace_manager.get_n_workspaces());
    const out = [];
    const seen_win = new Set();

    for (let w_idx = 0; w_idx < n_ws; w_idx += 1) {
        const ws = workspace_manager.get_workspace_by_index?.(w_idx);
        const wins = ws?.list_windows?.() || [];
        for (let i = 0; i < wins.length && out.length < MAX_OPEN_WINDOWS; i += 1) {
            const win = wins[i];
            if (!win || seen_win.has(win) || win.is_skip_taskbar?.()) continue;
            seen_win.add(win);
            const title = win.get_title?.() || '';
            if (!title) continue;
            const app = window_tracker?.get_window_app?.(win) ?? null;
            const app_name = app?.get_name?.() || win.get_wm_class?.() || 'Window';
            const seq = win.get_stable_sequence?.() ?? out.length;
            out.push({
                kind: 'window',
                id: `window:${w_idx}:${seq}:${title}`,
                name: title,
                description: `${app_name} — Workspace ${w_idx + 1}`,
                keywords: `${app_name} workspace ${w_idx + 1}`,
                app,
                window: win,
            });
        }
    }
    return out;
}

export function rank_launcher_results(apps, open_windows, query, max_results = 9, shell_search_ids = null) {
    const cap = Math.max(1, Math.min(15, Math.round(Number(max_results) || 9)));
    const q = normalize_query(query);
    const safe_apps = Array.isArray(apps) ? apps.slice(0, MAX_INDEXED_APPS) : [];
    const safe_wins = Array.isArray(open_windows) ? open_windows.slice(0, MAX_OPEN_WINDOWS) : [];

    if (!q) {
        const initial = [];
        for (let i = 0; i < safe_apps.length && initial.length < cap; i += 1) {
            initial.push(safe_apps[i]);
        }
        return initial;
    }

    const shell_bonus = new Map();
    if (Array.isArray(shell_search_ids)) {
        for (let i = 0; i < shell_search_ids.length && i < MAX_INDEXED_APPS; i += 1) {
            shell_bonus.set(shell_search_ids[i], Math.max(40, 260 - i * 8));
        }
    }

    const scored = [];
    for (let i = 0; i < safe_wins.length; i += 1) {
        const w = safe_wins[i];
        const s = score_candidate_match(w, q);
        if (s > 0) scored.push({ item: w, score: s + 40, order: i });
    }
    for (let i = 0; i < safe_apps.length; i += 1) {
        const a = safe_apps[i];
        const base = score_candidate_match(a, q);
        const bonus = shell_bonus.get(a.id) || 0;
        const total = base + bonus;
        if (total > 0) scored.push({ item: a, score: total, order: safe_wins.length + i });
    }

    scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.order - b.order));
    return scored.slice(0, cap).map((entry) => entry.item);
}

export function format_shortcut_badge(index, show_badges = true) {
    if (!show_badges || index < 0 || index >= 9) return '';
    return `Ctrl+${index + 1}`;
}

export function is_pointer_stationary(guard_pos, cur_x, cur_y) {
    if (!Array.isArray(guard_pos) || guard_pos.length < 2) return false;
    return guard_pos[0] === cur_x && guard_pos[1] === cur_y;
}
