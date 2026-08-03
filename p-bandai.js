// ==UserScript==
// @name         P-Bandai SG Auto Cart & Checkout Bot (Full)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Auto Add to Cart, Checkout, and Payment for P-Bandai SG with GUI
// @author       Pythonic Shariful
// @match        https://p-bandai.com/sg
// @match        https://p-bandai.com/sg/
// @match        https://p-bandai.com/sg/item/*
// @match        https://p-bandai.com/sg/cart*
// @match        https://p-bandai.com/sg/orderdetails*
// @match        https://webservices.global-e.com/*
// @match        https://secure-bandai.global-e.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=p-bandai.com
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // GUI AND LOGGING SETUP
    // -------------------------------------------------------------------------

    // Default config
    let config = {
        active: true,
        quantity: 1,
        minDelay: 3,
        maxDelay: 8,
        cardNumber: '',
        cardExpiry: '',
        cardCvv: ''
    };

    // Load saved configuration across pages
    const savedConfig = GM_getValue('PBandaiFullConfig', null);
    if (savedConfig) {
        try {
            config = Object.assign(config, JSON.parse(savedConfig));
            config.active = true; // Always active
            if (sessionStorage.getItem('pbBotAutoRestart') === 'true') {
                sessionStorage.removeItem('pbBotAutoRestart'); // Consume it
            }
        } catch (e) {
            console.error('Failed to parse config', e);
        }
    }

    function saveConfig() {
        GM_setValue('PBandaiFullConfig', JSON.stringify(config));
    }

    let guiVisible = true;
    let globalLog = [];

    function logMsg(msg) {
        const time = new Date().toLocaleTimeString();
        const logLine = `[${time}] ${msg}`;
        globalLog.push(logLine);
        if (globalLog.length > 100) globalLog.shift(); // Keep last 100 logs

        if (window !== window.top) {
            // If in an iframe, send log to the top window
            window.top.postMessage({ type: 'PBBOT_LOG', msg: logLine }, '*');
            console.log('[PB-Bot Iframe]', msg);
            return;
        }

        const statusEl = document.getElementById('pbStatus');
        if (statusEl) statusEl.innerText = msg;

        const debugEl = document.getElementById('pbDebugConsole');
        if (debugEl) {
            const div = document.createElement('div');
            div.innerText = logLine;
            debugEl.appendChild(div);
            debugEl.scrollTop = debugEl.scrollHeight;
        }
        console.log('[PB-Bot]', msg);
    }

    if (window === window.top) {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'PBBOT_LOG') {
                const debugEl = document.getElementById('pbDebugConsole');
                if (debugEl) {
                    const div = document.createElement('div');
                    div.innerText = event.data.msg;
                    debugEl.appendChild(div);
                    debugEl.scrollTop = debugEl.scrollHeight;
                }
            }
        });
    }

    function initGUI() {
        if (document.getElementById('pbSimpleGui')) return;

        const guiHTML = `
            <style>
                #pbSimpleGui {
                    position: fixed !important;
                    bottom: 20px !important;
                    left: 20px !important;
                    width: 340px !important;
                    background: #fff !important;
                    border: 2px solid #333 !important;
                    border-radius: 8px !important;
                    z-index: 2147483647 !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                    font-family: Arial, sans-serif !important;
                    font-size: 13px !important;
                    display: flex !important;
                    flex-direction: column !important;
                    color: #000 !important;
                    overflow: hidden !important;
                    pointer-events: auto !important;
                }
                #pbSimpleGuiHeader {
                    background: #e60012 !important;
                    color: #fff !important;
                    padding: 10px !important;
                    font-weight: bold !important;
                    text-align: center !important;
                    cursor: pointer !important;
                    display: flex !important;
                    justify-content: space-between !important;
                }
                #pbSimpleGuiContent {
                    padding: 15px !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 12px !important;
                    background: #fff !important;
                    max-height: 500px !important;
                    overflow-y: auto !important;
                }
                .pb-row {
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                }
                .pb-row input {
                    width: 50px !important;
                    padding: 4px !important;
                    border: 1px solid #ccc !important;
                    border-radius: 4px !important;
                    text-align: center !important;
                    color: #000 !important;
                }
                .pb-row input.wide {
                    width: 130px !important;
                }
                .pb-btn {
                    background: #d32f2f !important;
                    color: white !important;
                    border: none !important;
                    padding: 10px !important;
                    cursor: pointer !important;
                    border-radius: 4px !important;
                    font-weight: bold !important;
                    text-transform: uppercase !important;
                }
                .pb-btn.active {
                    background: #2e7d32 !important;
                }
                .pb-btn:hover {
                    opacity: 0.9 !important;
                }
                #pbStatus {
                    font-size: 12px !important;
                    color: #666 !important;
                    text-align: center !important;
                    margin-top: 5px !important;
                    min-height: 15px !important;
                    font-weight: bold !important;
                }
                #pbDebugConsole {
                    height: 120px !important;
                    overflow-y: auto !important;
                    background: #1e1e1e !important;
                    color: #00ff00 !important;
                    font-family: monospace !important;
                    font-size: 11px !important;
                    padding: 5px !important;
                    border: 1px solid #000 !important;
                    word-wrap: break-word !important;
                    line-height: 1.2 !important;
                    text-align: left !important;
                }
            </style>
            <div id="pbSimpleGuiHeader">
                <span>🤖 PB Auto Order Full</span>
                <span id="pbToggleGui">${guiVisible ? '[-]' : '[+]'}</span>
            </div>
            <div id="pbSimpleGuiContent" style="display: ${guiVisible ? 'flex' : 'none'} !important;">
                <div class="pb-row">
                    <label>Quantity:</label>
                    <input type="number" id="pbQty" min="1" value="${config.quantity}">
                </div>

                <div class="pb-row">
                    <label title="Refresh between these seconds">Refresh Min/Max (s):</label>
                    <div>
                        <input type="number" id="pbMinDelay" min="1" value="${config.minDelay}"> -
                        <input type="number" id="pbMaxDelay" min="1" value="${config.maxDelay}">
                    </div>
                </div>

                <hr style="width:100%; border:0; border-top:1px solid #ccc; margin: 0 !important;">

                <div class="pb-row">
                    <label>Card Number:</label>
                    <input type="text" id="pbCard" class="wide" value="${config.cardNumber}">
                </div>
                <div class="pb-row">
                    <label>Expiry (MM/YY):</label>
                    <input type="text" id="pbExp" class="wide" value="${config.cardExpiry}">
                </div>
                <div class="pb-row">
                    <label>CVV:</label>
                    <input type="password" id="pbCvv" class="wide" value="${config.cardCvv}">
                </div>

                <div id="pbStatus">Waiting...</div>
                <div id="pbDebugConsole"></div>
            </div>
        `;
        const guiContainer = document.createElement('div');
        guiContainer.id = 'pbSimpleGui';
        guiContainer.innerHTML = guiHTML;

        let target = document.documentElement || document.body;
        if (target) {
            target.appendChild(guiContainer);
        }

        const debugEl = document.getElementById('pbDebugConsole');
        if (debugEl) {
            debugEl.innerHTML = globalLog.join('<br>');
            debugEl.scrollTop = debugEl.scrollHeight;
        }

        function saveInputsToConfig() {
            const qtyInput = document.getElementById('pbQty');
            if (qtyInput) config.quantity = parseInt(qtyInput.value) || 1;

            const minInput = document.getElementById('pbMinDelay');
            const maxInput = document.getElementById('pbMaxDelay');
            if (minInput && maxInput) {
                config.minDelay = parseInt(minInput.value) || 1;
                config.maxDelay = parseInt(maxInput.value) || 1;
                if (config.minDelay > config.maxDelay) config.maxDelay = config.minDelay;
            }

            const cardInput = document.getElementById('pbCard');
            if (cardInput) config.cardNumber = cardInput.value;

            const expInput = document.getElementById('pbExp');
            if (expInput) config.cardExpiry = expInput.value;

            const cvvInput = document.getElementById('pbCvv');
            if (cvvInput) config.cardCvv = cvvInput.value;
        }

        const inputs = ['pbQty', 'pbMinDelay', 'pbMaxDelay', 'pbCard', 'pbExp', 'pbCvv'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    saveInputsToConfig();
                    saveConfig();
                    logMsg(`Settings saved.`);
                });
            }
        });

        const toggleGui = document.getElementById('pbToggleGui');
        if (toggleGui) {
            toggleGui.addEventListener('click', (e) => {
                guiVisible = !guiVisible;
                const content = document.getElementById('pbSimpleGuiContent');
                if (content) {
                    content.style.setProperty('display', guiVisible ? 'flex' : 'none', 'important');
                }
                e.target.textContent = guiVisible ? '[-]' : '[+]';
            });
        }

        logMsg('Bot initialized & ACTIVE.');
    }

    if (window === window.top) {
        if (document.documentElement || document.body) {
            initGUI();
        } else {
            document.addEventListener('DOMContentLoaded', initGUI);
        }

        // Fallback GUI injection
        setInterval(() => {
            let gui = document.getElementById('pbSimpleGui');
            let target = document.documentElement || document.body;

            if (!gui) {
                if (target) {
                    initGUI();
                }
            } else {
                if (target && gui.parentElement !== target) {
                    target.appendChild(gui);
                }
                if (guiVisible) {
                    gui.style.setProperty('display', 'flex', 'important');
                }
                gui.style.setProperty('z-index', '2147483647', 'important');
                gui.style.setProperty('visibility', 'visible', 'important');
                gui.style.setProperty('opacity', '1', 'important');
            }
        }, 1000);
    }

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------

    function nativeClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        events.forEach(eventType => {
            try {
                el.dispatchEvent(new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                    screenX: x,
                    screenY: y
                }));
            } catch (e) {}
        });
    }

    function nativeFill(el, value) {
        if (!el) return false;
        el.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (nativeInputValueSetter && nativeInputValueSetter.set) {
            nativeInputValueSetter.set.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        return true;
    }

    function nativeSelectFill(el, value) {
        if (!el) return false;
        const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
        if (nativeSelectValueSetter && nativeSelectValueSetter.set) {
            nativeSelectValueSetter.set.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        return true;
    }


    // -------------------------------------------------------------------------
    // PAGE LOGIC
    // -------------------------------------------------------------------------

    function handleItemPage() {
        let quantitySelected = false;
        let preOrderClicked = false;

        let missingQtyCount = 0;
        let missingPreOrderCount = 0;
        let refreshing = false;

        let lastClickTime = 0;
        let clicksDone = 0;
        let targetClicks = -1;

        const interval = setInterval(() => {
            if (!config.active || refreshing) return;

            if (preOrderClicked) {
                const toasts = document.querySelectorAll('.c-toast');
                let foundToast = false;
                for (let i = 0; i < toasts.length; i++) {
                    if (toasts[i].textContent.includes('added to your cart')) {
                        foundToast = true;
                        break;
                    }
                }

                if (foundToast) {
                    logMsg('Success toast detected! Redirecting to cart...');
                    clearInterval(interval);
                    sessionStorage.setItem('pbBotAutoRestart', 'true');
                    window.location.href = 'https://p-bandai.com/sg/cart';
                }
                return;
            }

            const preOrderBtn = document.querySelector('button[data-bs-text-key="msg.placePreOrder"]');

            if (!preOrderBtn || preOrderBtn.disabled) {
                missingPreOrderCount++;
                if (missingPreOrderCount % 5 === 0) {
                    logMsg(`Searching for PLACE PRE-ORDER button... (${missingPreOrderCount}/15)`);
                }

                if (missingPreOrderCount > 15) {
                    logMsg('Pre-Order button missing or disabled. Stock out!');
                    refreshing = true;

                    const delaySecs = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) + config.minDelay;
                    logMsg(`Refreshing page in ${delaySecs} seconds...`);

                    setTimeout(() => {
                        sessionStorage.setItem('pbBotAutoRestart', 'true');
                        window.location.reload();
                    }, delaySecs * 1000);
                }
                return;
            } else {
                missingPreOrderCount = 0;
            }

            if (!quantitySelected) {
                if (targetClicks === -1) {
                    targetClicks = config.quantity > 1 ? (config.quantity - 1) : 0;
                }

                if (targetClicks === 0) {
                    logMsg('Qty target is 1, no need to click + button.');
                    quantitySelected = true;
                } else {
                    const incBtn = document.querySelector('.c-input-quantity__inc');

                    if (!incBtn || incBtn.disabled) {
                        logMsg('Quantity + button missing or disabled. Skipping to Pre-Order.');
                        quantitySelected = true;
                    } else if (clicksDone < targetClicks) {
                        const now = Date.now();
                        if (now - lastClickTime < 800) return;

                        clicksDone++;
                        lastClickTime = now;
                        logMsg(`Clicking + button... (${clicksDone}/${targetClicks})`);
                        nativeClick(incBtn);
                        return;
                    } else {
                        const now = Date.now();
                        if (now - lastClickTime < 800) return;
                        logMsg(`Finished clicking + button ${clicksDone} times!`);
                        quantitySelected = true;
                    }
                }
            }

            if (quantitySelected) {
                logMsg('Found PLACE PRE-ORDER button. Clicking!');
                nativeClick(preOrderBtn);
                preOrderClicked = true;
                logMsg('Waiting for success toast notification...');
            }
        }, 200);
    }

    function handleCartPage() {
        let checkoutClicked = false;

        const interval = setInterval(() => {
            if (!config.active) return;
            if (checkoutClicked) return;

            const checkoutBtn = document.querySelector('button[data-bs-text-key="msg.proceedToCheckout"]');
            if (checkoutBtn && !checkoutBtn.disabled) {
                logMsg('Found PROCEED TO CHECKOUT button. Clicking!');
                nativeClick(checkoutBtn);
                checkoutClicked = true;
                clearInterval(interval);
            }
        }, 500);
    }

    function handleOrderDetailsPage() {
        logMsg('On Order Details page.');
        let scrolled = false;
        let isGlobalE = window.location.hostname.includes('global-e.com');
        let filled = { num: false, month: false, year: false, cvv: false };

        if (isGlobalE) {
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'PBBOT_CARD_FILLED') {
                    logMsg('Received card filled signal. Proceeding to submit...');
                    setTimeout(() => {
                        const tnc = document.querySelector('#CheckoutData_TnCConsent0, input[name="CheckoutData.TnCConsent0"]');
                        if (tnc && !tnc.checked) {
                            tnc.click();
                            logMsg('Clicked T&C Checkbox');
                        }

                        setTimeout(() => {
                            const payBtn = document.querySelector('#btnPay');
                            if (payBtn) {
                                payBtn.click();
                                logMsg('Clicked Pay and place order Button');
                            }
                        }, 800);
                    }, 1000);
                }
            });
        }

        const interval = setInterval(() => {
            const latestConfig = GM_getValue('PBandaiFullConfig', null);
            if (latestConfig) {
                try { config = Object.assign(config, JSON.parse(latestConfig)); } catch(e){}
            }

            if (!isGlobalE && !config.active) return;

            const iframe = document.querySelector('iframe.Intrnl_CO_Container, iframe#Intrnl_CO_Container');

            if (iframe && !scrolled && !isGlobalE) {
                logMsg('Found Global-e iframe, scrolling to it...');
                iframe.scrollIntoView({ behavior: 'smooth', block: 'center' });
                scrolled = true;
            }

            if (iframe && !isGlobalE) return; // Script inside iframe handles it

            const ccNum = document.querySelector('#cardNum, input[name="PaymentData.cardNum"]');
            const expMonth = document.querySelector('#cardExpiryMonth');
            const expYear = document.querySelector('#cardExpiryYear');
            const cvv = document.querySelector('#cvdNumber, input[name="PaymentData.cvdNumber"]');

            if (ccNum && config.cardNumber && !filled.num) {
                if (nativeFill(ccNum, config.cardNumber)) {
                    logMsg('Filled Card Number: ' + config.cardNumber.slice(0,4) + '****');
                    filled.num = true;
                }
            }

            if (config.cardExpiry && config.cardExpiry.includes('/')) {
                const [m, y] = config.cardExpiry.split('/').map(s => s.trim());
                const fullYear = y.length === 2 ? '20' + y : y;

                if (expMonth && !filled.month) {
                    if (nativeSelectFill(expMonth, m)) {
                        logMsg('Filled Expiry Month: ' + m);
                        filled.month = true;
                    }
                }
                if (expYear && !filled.year) {
                    if (nativeSelectFill(expYear, fullYear)) {
                        logMsg('Filled Expiry Year: ' + fullYear);
                        filled.year = true;
                    }
                }
            }

            if (cvv && config.cardCvv && !filled.cvv) {
                if (nativeFill(cvv, config.cardCvv)) {
                    logMsg('Filled CVV');
                    filled.cvv = true;
                }
            }

            if (filled.num && filled.month && filled.year && filled.cvv) {
                logMsg('All card fields filled! Stopping interval.');
                clearInterval(interval);
            }
        }, 1000);
    }

    function handlePaymentIframe() {
        logMsg('On Secure Payment Iframe page.');
        let filled = { num: false, month: false, year: false, cvv: false };

        const interval = setInterval(() => {
            const latestConfig = GM_getValue('PBandaiFullConfig', null);
            if (latestConfig) {
                try { config = Object.assign(config, JSON.parse(latestConfig)); } catch(e){}
            }

            const ccNum = document.querySelector('#cardNum, input[name="PaymentData.cardNum"]');
            const expMonth = document.querySelector('#cardExpiryMonth, select[name*="Month"]');
            const expYear = document.querySelector('#cardExpiryYear, select[name*="Year"]');
            const cvv = document.querySelector('#cvdNumber, input[name="PaymentData.cvdNumber"]');

            if (ccNum && config.cardNumber && !filled.num) {
                if (nativeFill(ccNum, config.cardNumber)) {
                    logMsg('Filled Card Number: ' + config.cardNumber.slice(0,4) + '****');
                    filled.num = true;
                }
            }

            if (config.cardExpiry && config.cardExpiry.includes('/')) {
                const [m, y] = config.cardExpiry.split('/').map(s => s.trim());
                const fullYear = y.length === 2 ? '20' + y : y;

                if (expMonth && !filled.month) {
                    if (nativeSelectFill(expMonth, m)) {
                        logMsg('Filled Expiry Month: ' + m);
                        filled.month = true;
                    }
                }
                if (expYear && !filled.year) {
                    if (nativeSelectFill(expYear, fullYear)) {
                        logMsg('Filled Expiry Year: ' + fullYear);
                        filled.year = true;
                    }
                }
            }

            if (cvv && config.cardCvv && !filled.cvv) {
                if (nativeFill(cvv, config.cardCvv)) {
                    logMsg('Filled CVV');
                    filled.cvv = true;
                }
            }

            if (filled.num && filled.month && filled.year && filled.cvv) {
                logMsg('All secure card fields filled! Stopping interval.');
                window.parent.postMessage({ type: 'PBBOT_CARD_FILLED' }, '*');
                clearInterval(interval);
            }
        }, 1000);
    }

    // -------------------------------------------------------------------------
    // ROUTER
    // -------------------------------------------------------------------------

    setTimeout(() => {
        const path = window.location.pathname;
        const currentUrl = window.location.href;

        logMsg('Script loaded on ' + window.location.hostname + path);

        if (window.location.hostname.includes('secure-bandai.global-e.com')) {
            handlePaymentIframe();
            return;
        }

        if (window.location.hostname.includes('global-e.com')) {
            handleOrderDetailsPage();
            return;
        }

        if (currentUrl.includes('/item/')) {
            handleItemPage();
        } else if (currentUrl.includes('/cart')) {
            handleCartPage();
        } else if (currentUrl.includes('/orderdetails')) {
            handleOrderDetailsPage();
        } else {
            logMsg('Ready to run when on an item, cart, or order page.');
        }
    }, 1500);

})();
