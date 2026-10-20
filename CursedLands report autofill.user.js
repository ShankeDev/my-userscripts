// ==UserScript==
// @name         CursedLands - issue autofill
// @namespace    local.cursedlands.autofill
// @version      1.5
// @description  Auto-fills the new-issue title (and optional body) on TheWWWorm/CursedLands with a preset (version taken from the latest release, platform chosen by flag)
// @match        https://github.com/TheWWWorm/CursedLands/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ===== PLATFORM FLAG: 'android' | 'linux' | 'macos' | 'web' | 'windows' =====
    const PLATFORM = 'linux';
    // ============================================================================

    // ===== BODY FLAG: your own text, line breaks and empty lines are kept exactly as written.
    // Leave it empty (``) to not touch the description field at all.
    // Don't indent the lines inside the backticks, or the indentation ends up in the text.
    const BODY = `24 строка юзер скрипта.`;
    // ============================================================================

    const API = 'https://api.github.com/repos/TheWWWorm/CursedLands/releases?per_page=1';
    const CACHE_TTL = 10 * 60 * 1000; // 10 min, avoids API rate limit

    // Title = "BUG: " + [cursor here] + " - Проклятые земли - CursedLands-<version>-<platform>"
    // The cursor goes between the two spaces: one ends TITLE_PREFIX, the other starts TITLE_REST.
    const TITLE_PREFIX = 'BUG: ';
    const TITLE_REST = ' - Проклятые земли - CursedLands-';
    const TITLE_TPL = (v) => `${TITLE_PREFIX}${TITLE_REST}${v}-${PLATFORM}`;
    const TITLE_CURSOR = TITLE_PREFIX.length;

    const TITLE_SEL = [
        'input#issue_title',
        'input[aria-label="Add a title"]',
        'input[placeholder="Title"]',
    ].join(',');
    const BODY_SEL = [
        'textarea#issue_body',
        'textarea[aria-label="Markdown value"]',
        'textarea[placeholder^="Type your description"]',
    ].join(',');

    const USE_BODY = BODY.length > 0;

    function getVersion() {
        return new Promise((resolve) => {
            const cached = GM_getValue('ver', null);
            const ts = GM_getValue('ver_ts', 0);
            if (cached && Date.now() - ts < CACHE_TTL) return resolve(cached);

            GM_xmlhttpRequest({
                method: 'GET',
                url: API,
                headers: { Accept: 'application/vnd.github+json' },
                onload: (r) => {
                    try {
                        const data = JSON.parse(r.responseText);
                        const tag = data[0].tag_name || data[0].name;
                        const ver = String(tag).replace(/^v/i, '');
                        GM_setValue('ver', ver);
                        GM_setValue('ver_ts', Date.now());
                        resolve(ver);
                    } catch (e) {
                        resolve(cached || 'VERSION');
                    }
                },
                onerror: () => resolve(cached || 'VERSION'),
            });
        });
    }

    function setNativeValue(el, value) {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // The page (React) may re-render and reset the caret after we set the value,
    // so re-apply the cursor position a few times with short delays.
    function placeCursor(getEl, expectedValue) {
        const apply = () => {
            const el = getEl();
            if (!el || el.value !== expectedValue) return; // user already changed it, don't interfere
            el.focus();
            el.setSelectionRange(TITLE_CURSOR, TITLE_CURSOR);
        };
        apply();
        requestAnimationFrame(apply);
        [30, 100, 250, 500].forEach((ms) => setTimeout(apply, ms));
    }

    let busy = false;

    async function tryFill() {
        if (busy) return;
        if (!/^\/TheWWWorm\/CursedLands\/issues\/new\/?$/.test(location.pathname)) return;

        const titleEl = document.querySelector(TITLE_SEL);
        const bodyEl = USE_BODY ? document.querySelector(BODY_SEL) : null;
        if (!titleEl) return;
        if (USE_BODY && !bodyEl) return;
        if (titleEl.dataset.clFilled) return;

        // don't overwrite anything the user already typed
        if (titleEl.value.trim() || (bodyEl && bodyEl.value.trim())) {
            titleEl.dataset.clFilled = '1';
            return;
        }

        busy = true;
        titleEl.dataset.clFilled = '1';
        const ver = await getVersion();

        // elements may have been re-rendered while waiting
        const t = document.querySelector(TITLE_SEL) || titleEl;
        const b = USE_BODY ? (document.querySelector(BODY_SEL) || bodyEl) : null;

        const title = TITLE_TPL(ver);

        if (b) setNativeValue(b, BODY);
        setNativeValue(t, title);

        placeCursor(() => document.querySelector(TITLE_SEL), title);
        busy = false;
    }

    // GitHub is an SPA (turbo) — poll instead of relying on page loads
    setInterval(tryFill, 500);
    document.addEventListener('turbo:render', () => setTimeout(tryFill, 100));
})();
