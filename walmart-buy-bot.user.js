// ==UserScript==
// @name         Walmart Auto Buy Bot
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto search and buy Walmart SKU with Buy Now and Place Order automation.
// @author       GitHub Copilot
// @match        https://www.walmart.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'WalmartBuyBotConfig';
    const DEFAULT_CONFIG = {
        active: false,
        sku: '',
        quantity: 1,
        lastAction: 0,
        stage: 'idle'
    };

    let config = Object.assign({}, DEFAULT_CONFIG);
    let logLines = [];
    let state = {
        searchSubmitted: false,
        productLinkClicked: false,
        buyNowClicked: false,
        quantitySet: false,
        placeOrderClicked: false,
        lastUrl: location.href,
    };

    function loadConfig() {
        const saved = GM_getValue(STORAGE_KEY, null);
        if (!saved) return;
        try {
            const parsed = JSON.parse(saved);
            config = Object.assign(config, parsed);
        } catch (e) {
            console.warn('Walmart Buy Bot: failed to load config', e);
        }
    }

    function saveConfig() {
        GM_setValue(STORAGE_KEY, JSON.stringify(config));
    }

    function log(msg) {
        const time = new Date().toLocaleTimeString();
        const line = `[${time}] ${msg}`;
        logLines.push(line);
        if (logLines.length > 80) logLines.shift();
        const logEl = document.getElementById('wbBotLog');
        if (logEl) {
            logEl.textContent = logLines.join('\n');
            logEl.scrollTop = logEl.scrollHeight;
        }
        console.log('[WalmartBuyBot]', msg);
    }

    function humanClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        ['mousemove', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
            const ev = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
            });
            el.dispatchEvent(ev);
        });
    }

    function humanType(input, text) {
        if (!input) return;
        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        for (const char of text) {
            input.value += char;
            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    function findTextButton(root, matcher) {
        const candidates = Array.from(root.querySelectorAll('button, input[type="button"], input[type="submit"]'));
        return candidates.find(el => {
            const text = (el.innerText || el.value || '').trim();
            return matcher.test(text);
        }) || null;
    }

    function isProductPage() {
        return /\/ip\//i.test(location.pathname);
    }

    function isSearchResultsPage() {
        return /\/search/.test(location.pathname);
    }

    async function ensureSearchPage() {
        if (/https:\/\/www\.walmart\.com\/?($|\?)/.test(location.href) || isSearchResultsPage()) {
            return true;
        }
        return false;
    }

    function clickFirstProductResult() {
        const selectorList = [
            '[data-testid="item-stack"] a[href*="/ip/"]',
            '[data-testid="search-result-gridview-item"] a[href*="/ip/"]',
            'a[href*="/ip/"]'
        ];
        for (const sel of selectorList) {
            const el = document.querySelector(sel);
            if (el) {
                humanClick(el);
                setTimeout(() => { el.click(); }, 100);
                log('Clicked first product result.');
                state.productLinkClicked = true;
                return true;
            }
        }
        return false;
    }

    function submitSearch() {
        const searchSelector = '[data-automation-id="header-input-search"], input[aria-label="Search Walmart"]';
        const searchInput = document.querySelector(searchSelector);
        if (!searchInput) {
            log('Search bar not found yet.');
            return false;
        }
        humanType(searchInput, config.sku);
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        setTimeout(() => {
            const form = searchInput.closest('form');
            if (form) form.submit();
        }, 200);
        log(`Submitted search for ${config.sku}`);
        state.searchSubmitted = true;
        return true;
    }

    function tryBuyNow() {
        const buyNowSelectors = [
            '[data-testid="buy-now-wrapper"]',
            'button[aria-label*="Buy now"]',
            'button:contains("Buy now")'
        ];
        let btn = null;
        btn = document.querySelector('[data-testid="buy-now-wrapper"] button');
        if (!btn) {
            btn = findTextButton(document, /buy now/i);
        }
        if (!btn) {
            const wrapper = document.querySelector('[data-testid="buy-now-wrapper"]');
            if (wrapper) {
                const nestedBtn = wrapper.querySelector('button');
                if (nestedBtn) btn = nestedBtn;
            }
        }
        if (btn && !btn.disabled) {
            humanClick(btn);
            setTimeout(() => btn.click(), 150);
            log('Clicked Buy Now button.');
            state.buyNowClicked = true;
            return true;
        }
        return false;
    }

    function setQuantity() {
        if (config.quantity <= 1) {
            state.quantitySet = true;
            return true;
        }
        const stepper = document.querySelector('[data-testid="quantity-stepper"]');
        const incBtn = document.querySelector('[data-testid="quantity-stepper-inc-button"]');
        if (!stepper || !incBtn) {
            log('Quantity stepper not present yet.');
            return false;
        }
        const currentQtyLabel = stepper.querySelector('[data-testid="quantity-label"]');
        let currentQty = 1;
        if (currentQtyLabel) {
            const text = currentQtyLabel.textContent.trim();
            const parsed = parseInt(text, 10);
            if (!Number.isNaN(parsed)) currentQty = parsed;
        }
        if (currentQty >= config.quantity) {
            state.quantitySet = true;
            log(`Quantity already set to ${currentQty}.`);
            return true;
        }
        const clicks = config.quantity - currentQty;
        for (let i = 0; i < clicks; i += 1) {
            humanClick(incBtn);
            setTimeout(() => incBtn.click(), 120);
        }
        state.quantitySet = true;
        log(`Set quantity to ${config.quantity}.`);
        return true;
    }

    function placeOrder() {
        const placeBtn = findTextButton(document, /place order/i) || findTextButton(document, /checkout/i);
        if (placeBtn && !placeBtn.disabled) {
            humanClick(placeBtn);
            setTimeout(() => placeBtn.click(), 150);
            log('Clicked Place Order button.');
            state.placeOrderClicked = true;
            return true;
        }
        return false;
    }

    function updateStage() {
        if (isProductPage()) {
            if (!state.buyNowClicked) {
                config.stage = 'product';
            } else if (!state.quantitySet) {
                config.stage = 'quantity';
            } else if (!state.placeOrderClicked) {
                config.stage = 'place_order';
            } else {
                config.stage = 'done';
            }
        } else if (isSearchResultsPage()) {
            config.stage = 'search_results';
        } else {
            config.stage = 'search';
        }
        saveConfig();
    }

    function handlePage() {
        if (!config.active) return;
        if (Date.now() - config.lastAction < 900) return;
        config.lastAction = Date.now();
        updateStage();

        if (isProductPage()) {
            if (!state.buyNowClicked) {
                if (tryBuyNow()) return;
            }
            if (state.buyNowClicked && !state.quantitySet) {
                if (setQuantity()) return;
            }
            if (state.quantitySet && !state.placeOrderClicked) {
                placeOrder();
            }
            return;
        }

        if (isSearchResultsPage()) {
            if (!state.productLinkClicked) {
                clickFirstProductResult();
                return;
            }
            return;
        }

        if (/https:\/\/www\.walmart\.com\/?($|\?)/.test(location.href)) {
            if (!state.searchSubmitted) {
                submitSearch();
            }
            return;
        }

        if (!isProductPage() && !isSearchResultsPage()) {
            if (!state.searchSubmitted) {
                submitSearch();
            } else {
                clickFirstProductResult();
            }
        }
    }

    function initUI() {
        if (document.getElementById('wbBotContainer')) return;
        const container = document.createElement('div');
        container.id = 'wbBotContainer';
        container.style.position = 'fixed';
        container.style.bottom = '18px';
        container.style.right = '18px';
        container.style.width = '320px';
        container.style.background = 'rgba(255,255,255,0.96)';
        container.style.border = '1px solid rgba(0,0,0,0.16)';
        container.style.borderRadius = '14px';
        container.style.boxShadow = '0 18px 50px rgba(0,0,0,0.18)';
        container.style.zIndex = '2147483647';
        container.style.fontFamily = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
        container.style.fontSize = '13px';
        container.style.color = '#111';
        container.style.padding = '14px';
        container.style.maxHeight = '420px';
        container.style.overflow = 'hidden';

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <strong style="font-size:14px;">Walmart Buy Bot</strong>
                <button id="wbToggleGui" style="background:#1f2937;color:#fff;border:none;border-radius:10px;padding:6px 10px;cursor:pointer;font-size:11px;">-</button>
            </div>
            <div id="wbGuiContent">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <label style="flex:1;">SKU</label>
                    <input id="wbSku" type="text" value="${config.sku}" style="flex:1.5;padding:8px;border:1px solid #d1d5db;border-radius:8px;" />
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <label style="flex:1;">Qty</label>
                    <input id="wbQty" type="number" min="1" value="${config.quantity}" style="flex:1.5;padding:8px;border:1px solid #d1d5db;border-radius:8px;" />
                </div>
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <button id="wbStartStop" style="flex:1;padding:10px;border:none;border-radius:10px;background:#047857;color:white;cursor:pointer;">${config.active ? 'STOP' : 'START'}</button>
                    <button id="wbReset" style="flex:1;padding:10px;border:none;border-radius:10px;background:#6b7280;color:white;cursor:pointer;">RESET</button>
                </div>
                <div id="wbStatus" style="margin-bottom:10px;color:#4b5563;font-weight:600;">${config.active ? 'Running' : 'Stopped'}</div>
                <pre id="wbBotLog" style="height:140px;overflow:auto;background:#111827;color:#d1d5db;padding:10px;border-radius:12px;white-space:pre-wrap;margin:0;font-size:11px;"></pre>
            </div>
        `;

        document.body.appendChild(container);

        const skuInput = document.getElementById('wbSku');
        const qtyInput = document.getElementById('wbQty');
        const startBtn = document.getElementById('wbStartStop');
        const resetBtn = document.getElementById('wbReset');
        const statusEl = document.getElementById('wbStatus');
        const toggleBtn = document.getElementById('wbToggleGui');
        const contentEl = document.getElementById('wbGuiContent');

        skuInput.addEventListener('change', () => {
            config.sku = skuInput.value.trim();
            saveConfig();
            log('SKU saved.');
        });
        qtyInput.addEventListener('change', () => {
            config.quantity = Math.max(1, parseInt(qtyInput.value, 10) || 1);
            saveConfig();
            log('Quantity saved.');
        });
        startBtn.addEventListener('click', () => {
            config.active = !config.active;
            config.stage = 'idle';
            state = Object.assign(state, {
                searchSubmitted: false,
                productLinkClicked: false,
                buyNowClicked: false,
                quantitySet: false,
                placeOrderClicked: false,
            });
            saveConfig();
            startBtn.textContent = config.active ? 'STOP' : 'START';
            statusEl.textContent = config.active ? 'Running' : 'Stopped';
            log(config.active ? 'Bot started.' : 'Bot stopped.');
        });
        resetBtn.addEventListener('click', () => {
            config = Object.assign(DEFAULT_CONFIG, {sku: config.sku, quantity: config.quantity});
            saveConfig();
            state = {
                searchSubmitted: false,
                productLinkClicked: false,
                buyNowClicked: false,
                quantitySet: false,
                placeOrderClicked: false,
                lastUrl: location.href,
            };
            statusEl.textContent = 'Stopped';
            startBtn.textContent = 'START';
            log('Bot reset.');
        });
        toggleBtn.addEventListener('click', () => {
            const hidden = contentEl.style.display === 'none';
            contentEl.style.display = hidden ? 'block' : 'none';
            toggleBtn.textContent = hidden ? '-' : '+';
        });
    }

    function migrateStateOnNavigation() {
        if (location.href !== state.lastUrl) {
            state.lastUrl = location.href;
            state.productLinkClicked = false;
            state.buyNowClicked = false;
            state.quantitySet = false;
            state.placeOrderClicked = false;
            state.searchSubmitted = false;
            log('URL changed, refreshed bot state for new page.');
        }
    }

    loadConfig();
    initUI();
    log('Walmart Buy Bot loaded.');

    setInterval(() => {
        migrateStateOnNavigation();
        handlePage();
    }, 1200);
})();