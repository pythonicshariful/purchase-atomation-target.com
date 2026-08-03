// ==UserScript==
// @name         Target Auto Buyer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto buy from target.com (equivalent to Python bot)
// @author       Pythonic Shariful
// @match        https://www.target.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // Hook console.log to print to UI
    const originalConsoleLog = console.log;
    console.log = function(...args) {
        originalConsoleLog.apply(console, args);
        const logArea = document.getElementById('bot-log-area');
        if (logArea) {
            const message = args.join(' ');
            const time = new Date().toLocaleTimeString();
            logArea.textContent += `[${time}] ${message}\n`;
            logArea.scrollTop = logArea.scrollHeight;
        }
    };

    // 1. UI Creation
    function createUI() {
        if (document.getElementById('target-bot-ui')) return;
        
        const ui = document.createElement('div');
        ui.id = 'target-bot-ui';
        ui.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; background: #fff; border: 2px solid #cc0000; padding: 15px; z-index: 999999; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-family: Arial, sans-serif; width: 270px;">
                <h3 style="margin: 0 0 10px 0; color: #cc0000; text-align: center; font-size: 16px;">Target Auto Buyer</h3>
                
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block;">Quantity:</label>
                    <input type="number" id="bot-qty" min="1" max="10" value="${GM_getValue('qty', '1')}" style="width: 100%; box-sizing: border-box; padding: 5px; margin-top: 3px;" />
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block;">CVV:</label>
                    <input type="text" id="bot-cvv" value="${GM_getValue('cvv', '123')}" style="width: 100%; box-sizing: border-box; padding: 5px; margin-top: 3px;" />
                </div>

                <div style="margin-bottom: 10px; display: flex; gap: 5px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block;">Min Delay (ms):</label>
                        <input type="number" id="bot-min-delay" value="${GM_getValue('minDelay', '3000')}" style="width: 100%; box-sizing: border-box; padding: 5px; margin-top: 3px;" />
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 12px; display: block;">Max Delay (ms):</label>
                        <input type="number" id="bot-max-delay" value="${GM_getValue('maxDelay', '5000')}" style="width: 100%; box-sizing: border-box; padding: 5px; margin-top: 3px;" />
                    </div>
                </div>

                <div style="margin-bottom: 10px;">
                    <span style="font-size: 12px; font-weight: bold;">Status: </span>
                    <span id="bot-status" style="font-size: 12px; color: ${GM_getValue('botRunning', false) ? 'green' : 'red'};">${GM_getValue('botRunning', false) ? 'Running' : 'Stopped'}</span>
                </div>

                <div style="margin-bottom: 10px;">
                    <label style="font-size: 12px; display: block; font-weight: bold; margin-bottom: 3px;">Logs:</label>
                    <div id="bot-log-area" style="width: 100%; height: 120px; border: 1px solid #ccc; background: #f9f9f9; font-family: monospace; font-size: 10px; overflow-y: scroll; padding: 5px; box-sizing: border-box; white-space: pre-wrap;"></div>
                </div>

                <div style="display: flex; justify-content: space-between;">
                    <button id="bot-start" style="background: #008000; color: #fff; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; flex: 1; margin-right: 5px;">Start</button>
                    <button id="bot-stop" style="background: #cc0000; color: #fff; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; flex: 1; margin-left: 5px;">Stop</button>
                </div>
            </div>
        `;
        document.body.appendChild(ui);

        document.getElementById('bot-start').addEventListener('click', () => {
            GM_setValue('qty', document.getElementById('bot-qty').value);
            GM_setValue('cvv', document.getElementById('bot-cvv').value);
            GM_setValue('minDelay', document.getElementById('bot-min-delay').value);
            GM_setValue('maxDelay', document.getElementById('bot-max-delay').value);
            GM_setValue('botRunning', true);
            document.getElementById('bot-status').innerText = 'Running';
            document.getElementById('bot-status').style.color = 'green';
            runBot();
        });

        document.getElementById('bot-stop').addEventListener('click', () => {
            GM_setValue('botRunning', false);
            document.getElementById('bot-status').innerText = 'Stopped';
            document.getElementById('bot-status').style.color = 'red';
            clearTimeout(window.botTimeout);
        });
    }

    // Node selector helper
    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    // State machine logic
    function runBot() {
        if (!GM_getValue('botRunning', false)) return;

        const currentUrl = window.location.href;
        
        if (currentUrl.includes('target.com/p/')) {
            handleProductPage();
        } else if (currentUrl.includes('/checkout') || currentUrl.includes('/co-')) {
            handleCheckoutPage();
        } else {
            console.log("Target Bot: Waiting for user to navigate to a product page...");
        }
    }

    function handleProductPage() {
        console.log("Target Bot: Handling product page...");
        
        // 1. Check and set Quantity if present
        const targetQty = GM_getValue('qty', '1');
        const qtyBtn = document.querySelector('button[id^="select-"]') || getElementByXpath("//button[contains(., 'Qty')]");
        
        if (qtyBtn) {
            const qtyTextDiv = qtyBtn.querySelector('div');
            const currentQty = qtyTextDiv ? qtyTextDiv.innerText.trim() : "";
            if (currentQty && currentQty !== targetQty) {
                console.log(`Target Bot: Current quantity is ${currentQty}, target is ${targetQty}. Updating...`);
                const optionLink = document.querySelector(`ul.Options_styles_options__UapY8 a[aria-label="${targetQty}"]`) || 
                                   document.querySelector(`ul a[aria-label="${targetQty}"]`);
                if (optionLink) {
                    optionLink.click();
                    console.log(`Target Bot: Clicked quantity option ${targetQty}`);
                } else {
                    qtyBtn.click();
                    console.log("Target Bot: Clicked quantity selector dropdown");
                }
                // Delay a bit and re-run handleProductPage
                setTimeout(handleProductPage, 500);
                return;
            }
        }
        
        // Look for Add to cart or Preorder
        const addToCartBtn = document.querySelector('button[data-test="shippingButton"]') ||
                             document.querySelector('button[id^="addToCartButtonOrTextIdFor"]') ||
                             getElementByXpath("//button[contains(text(),'Add to cart')]") ||
                             getElementByXpath("//button[text()='Preorder']");
        
        if (addToCartBtn) {
            console.log("Target Bot: Found Add to Cart/Preorder button! Clicking...");
            addToCartBtn.click();
            
            // Wait for it to be added to cart, then navigate to checkout
            let checkCartInterval = setInterval(() => {
                if (!GM_getValue('botRunning', false)) {
                    clearInterval(checkCartInterval);
                    return;
                }
                const picker = document.querySelector('button[data-test="custom-quantity-picker"]');
                const viewCartBtn = getElementByXpath("//a[contains(text(),'View cart')]") || 
                                    getElementByXpath("//button[contains(text(),'View cart')]");

                if ((picker && picker.innerText.toLowerCase().includes('in cart')) || viewCartBtn) {
                    console.log("Target Bot: Item is in cart. Proceeding to checkout...");
                    clearInterval(checkCartInterval);
                    window.location.href = "https://www.target.com/checkout";
                }
            }, 1000);
        } else {
            const minDelay = parseInt(GM_getValue('minDelay', '3000'), 10);
            const maxDelay = parseInt(GM_getValue('maxDelay', '5000'), 10);
            const waitTime = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            console.log(`Target Bot: Add to cart not found. Refreshing in ${(waitTime / 1000).toFixed(1)} seconds...`);
            window.botTimeout = setTimeout(() => {
                if (GM_getValue('botRunning', false)) {
                    window.location.reload();
                }
            }, waitTime);
        }
    }

    function handleCheckoutPage() {
        console.log("Target Bot: Handling checkout page...");

        let checkoutLoop = setInterval(() => {
            if (!GM_getValue('botRunning', false)) {
                clearInterval(checkoutLoop);
                return;
            }

            // 1. Handle Login if present
            const passwordField = document.getElementById('password');
            if (passwordField) {
                console.log("Target Bot: Login page detected. Entering password...");
                const pass = GM_getValue('password', 'Hacktanha');
                
                // Set value and trigger React events
                const lastValue = passwordField.value;
                passwordField.value = pass;
                const event = new Event('input', { bubbles: true });
                const tracker = passwordField._valueTracker;
                if (tracker) tracker.setValue(lastValue);
                passwordField.dispatchEvent(event);
                
                setTimeout(() => {
                    const loginBtn = document.getElementById('login');
                    if (loginBtn) {
                        loginBtn.click();
                        console.log("Target Bot: Clicked Login");
                    }
                }, 1000);
                return;
            }

            // 2. Skip button (mobile number etc)
            const skipBtn = getElementByXpath("//a[normalize-space()='Skip']") ||
                            getElementByXpath("//button[normalize-space()='Skip']");
            if (skipBtn) {
                console.log("Target Bot: Clicking Skip");
                skipBtn.click();
                return;
            }

            // 3. Save and continue button
            const sncBtn = getElementByXpath("//button[contains(text(),'Save and continue')]");
            if (sncBtn) {
                console.log("Target Bot: Clicking Save and Continue");
                sncBtn.click();
                return;
            }

            // 4. CVV Input if needed (slides open after Place Order sometimes)
            const cvvField = document.getElementById('enter-cvv');
            if (cvvField && !cvvField.disabled && cvvField.getBoundingClientRect().width > 0) {
                console.log("Target Bot: Entering CVV...");
                const cvv = GM_getValue('cvv', '123');
                
                // Set value and trigger React events
                const lastValue = cvvField.value || "";
                cvvField.value = cvv;
                const event = new Event('input', { bubbles: true });
                const tracker = cvvField._valueTracker;
                if (tracker) tracker.setValue(lastValue);
                cvvField.dispatchEvent(event);
                
                setTimeout(() => {
                    const confirmBtn = document.querySelector('button[data-test="confirm-button"]');
                    if (confirmBtn) {
                        confirmBtn.click();
                        console.log("Target Bot: Clicked Confirm CVV");
                        
                        setTimeout(() => {
                            GM_setValue('botRunning', false);
                            const statusEl = document.getElementById('bot-status');
                            if(statusEl) statusEl.innerText = 'Finished';
                            clearInterval(checkoutLoop);
                        }, 3000);
                    }
                }, 1000);
                return;
            }

            // 5. Place order button
            const placeOrderBtn = document.querySelector('button[data-test="placeOrderButton"]');
            if (placeOrderBtn && !placeOrderBtn.disabled && !window.botPlaceOrderClicked) {
                console.log("Target Bot: Clicking Place Order!");
                placeOrderBtn.click();
                window.botPlaceOrderClicked = true;
                
                // Keep the loop running because the CVV panel might slide open!
                // We will auto-stop after 15 seconds if nothing else happens.
                setTimeout(() => {
                    if (GM_getValue('botRunning', false)) {
                        GM_setValue('botRunning', false);
                        const statusEl = document.getElementById('bot-status');
                        if (statusEl) statusEl.innerText = 'Finished';
                        clearInterval(checkoutLoop);
                    }
                }, 15000);
            }

        }, 2000);
    }

    // Wait for the page to load, then initialize UI and logic
    window.addEventListener('load', () => {
        setTimeout(() => {
            createUI();
            if (GM_getValue('botRunning', false)) {
                runBot();
            }
        }, 1000); // slight delay to let Target's react elements render
    });

})();
