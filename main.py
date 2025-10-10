import os
import time
import pickle
import json
import random
import logging
from selenium import webdriver
from selenium.common.exceptions import WebDriverException, TimeoutException, NoSuchElementException, StaleElementReferenceException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import requests,sys

COOKIES_FILE = "cookies.pkl"
LOCAL_FILE = "local_storage.json"
URL = "https://www.target.com/"
# Config (moved to config.json)
CONFIG_FILE = "config.json"
def checkLincenc():
    url = 'https://github.com/pythonicshariful/phone-number-extractor'
    if requests.get(url).status_code == 200:
        return True
    return False

def read_config(path=CONFIG_FILE):
    """Read configuration from JSON file and return dict with defaults.

    Returns: {'CVE': str, 'SPEND_LIMIT': float, 'BUY_LIMIT': int}
    """
    defaults = {
        'CVE': '123',
        'SPEND_LIMIT': 120.00,
        'BUY_LIMIT': 3
    }
    try:
        if not os.path.exists(path):
            # create default config file
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(defaults, f, indent=2)
            return defaults
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # sanitize/validate
        cfg = {}
        cfg['CVE'] = str(data.get('CVE', defaults['CVE']))
        try:
            cfg['SPEND_LIMIT'] = float(data.get('SPEND_LIMIT', defaults['SPEND_LIMIT']))
        except Exception:
            cfg['SPEND_LIMIT'] = defaults['SPEND_LIMIT']
        try:
            cfg['BUY_LIMIT'] = int(data.get('BUY_LIMIT', defaults['BUY_LIMIT']))
        except Exception:
            cfg['BUY_LIMIT'] = defaults['BUY_LIMIT']
        return cfg
    except Exception:
        return defaults

# SKU files
SKU_JSON = "sku.json"
CSV_PATH = "sku.csv"


def load_skus():
    """Load SKUs from CSV (preferred) or JSON (fallback).

    Returns list of dicts: {'sku': str, 'quantity': int}
    """
    skus = []
    if os.path.exists(CSV_PATH):
        import csv
        with open(CSV_PATH, newline='', encoding='utf-8') as cf:
            reader = csv.DictReader(cf)
            for row in reader:
                sku = (row.get('sku') or row.get('SKU') or '').strip()
                qty = row.get('quantity') or row.get('Quantity') or row.get('qty') or ''
                if not sku:
                    continue
                try:
                    q = int(qty) if qty not in (None, '') else 1
                except Exception:
                    q = 1
                skus.append({'sku': sku, 'quantity': q})
        return skus

    # No JSON fallback: only CSV is supported now
    return skus


def is_logged_in(driver):
    try:
        driver.find_element(By.XPATH, "//span[text()='Account']")
        return False
    except NoSuchElementException:
        return True


def save_cookies(driver, path=COOKIES_FILE):
    cookies = driver.get_cookies()
    with open(path, 'wb') as f:
        pickle.dump(cookies, f)


def load_cookies(driver, path=COOKIES_FILE):
    if not os.path.exists(path):
        return
    with open(path, 'rb') as f:
        cookies = pickle.load(f)
    for c in cookies:
        if 'expiry' in c:
            try:
                c['expiry'] = int(c['expiry'])
            except Exception:
                c.pop('expiry', None)
        try:
            driver.add_cookie(c)
        except Exception:
            pass


def save_local_storage(driver, path=LOCAL_FILE):
    local_storage = driver.execute_script(
        "var items = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); items[k] = localStorage.getItem(k); } return items;"
    )
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(local_storage, f, ensure_ascii=False, indent=2)


def load_local_storage(driver, path=LOCAL_FILE):
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as f:
        local_storage = json.load(f)
    for k, v in local_storage.items():
        driver.execute_script(f"window.localStorage.setItem({json.dumps(k)}, {json.dumps(v)});")


def login_with_data(driver):
    """Prompt user to log in manually in the opened browser.

    This keeps the script simple and avoids storing credentials in this file.
    """
    # print("Please complete login in the opened browser window. After logging in, return here and press Enter to continue.")
    input("Press Enter after you've logged in and any 2FA/CAPTCHA is resolved...")


def js_click(driver, element):
    driver.execute_script('arguments[0].click();', element)


def get_price(driver):
    try:
        price_elem = driver.find_element(By.CSS_SELECTOR, "span[data-test='product-price']")
        price_text = price_elem.text.replace('$', '').replace(',', '').strip()
        return float(price_text)
    except Exception:
        return 0.0


# def select_quantity(driver, quantity='1'):
#     try:
#         wait = WebDriverWait(driver, 5)
#         dropdown = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "div.sc-10a3dac3-3.fGQZRy")))
#         js_click(driver, dropdown)
#         time.sleep(0.3)
#         option = wait.until(EC.element_to_be_clickable((By.XPATH, f"//a[@aria-label='{quantity}']")))
#         js_click(driver, option)
#     except Exception:
#         pass
def select_quantity(driver, quantity='1'):
    try:
        wait = WebDriverWait(driver, 5)
        # Open the quantity dropdown
        dropdown = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "div.sc-10a3dac3-3.fGQZRy")))
        js_click(driver, dropdown)
        time.sleep(0.3)

        # Try selecting the desired quantity
        try:
            option = wait.until(EC.element_to_be_clickable((By.XPATH, f"//a[@aria-label='{quantity}']")))
            js_click(driver, option)
        except Exception:
            # If not available, find all available quantities
            available_options = driver.find_elements(By.XPATH, "//a[@aria-label]")
            if available_options:
                # Get the highest number label
                max_quantity = max([int(opt.get_attribute("aria-label")) for opt in available_options if opt.get_attribute("aria-label").isdigit()])
                max_option = driver.find_element(By.XPATH, f"//a[@aria-label='{max_quantity}']")
                js_click(driver, max_option)
    except Exception:
        pass



def wait_until_available(driver, poll_interval=1):
    wait = WebDriverWait(driver, 5)
    while True:
        try:
            btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(),'Add to cart')]") ),)
            if btn:
                return True
        except Exception:
            try:
                banner = driver.find_element(By.CSS_SELECTOR, "div[data-test='form-error-bucket']")
                if banner and 'Item not available' in banner.text:
                    time.sleep(poll_interval)
                    try:
                        driver.refresh()
                    except Exception:
                        pass
                    continue
            except Exception:
                time.sleep(poll_interval)
                try:
                    driver.refresh()
                except Exception:
                    pass
                continue


def main():
    if not checkLincenc():
        print('License check failed!')
        sys.exit(1) 
    logging.getLogger('selenium').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)

    options = webdriver.ChromeOptions()
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    options.add_argument('--log-level=3')
    service = Service(log_path=os.devnull)

    driver = webdriver.Chrome(service=service, options=options)
    driver.maximize_window()
    driver.get(URL)
    time.sleep(2)

    if os.path.exists(COOKIES_FILE):
        load_cookies(driver)
        driver.refresh()
        time.sleep(1)
    if os.path.exists(LOCAL_FILE):
        load_local_storage(driver)
        driver.refresh()
        time.sleep(1)

    if not is_logged_in(driver):
        login_with_data(driver)
        time.sleep(3)
        if is_logged_in(driver):
            save_cookies(driver)
            save_local_storage(driver)

    # load runtime config
    cfg = read_config()
    CVE = cfg.get('CVE', '123')
    SPEND_LIMIT = cfg.get('SPEND_LIMIT', 120.00)
    BUY_LIMIT = cfg.get('BUY_LIMIT', 3)

    wait = WebDriverWait(driver, 15)

    sku_data = load_skus()
    if not sku_data:
        print('[!] No SKUs found in sku.csv. Exiting.')
        driver.quit()
        return

    # Prepare SKUs to process (limit by BUY_LIMIT)
    skus_to_process = []
    for item in sku_data:
        if len(skus_to_process) >= BUY_LIMIT:
            break
        sku = item.get('sku')
        qty = item.get('quantity', 1)
        if sku:
            skus_to_process.append({'sku': str(sku), 'quantity': int(qty)})

    # Open tabs: open a new tab for each SKU and capture its window handle in order
    handles = []
    if skus_to_process:
        for item in skus_to_process:
            product_url = f"https://www.target.com/p/-/A-{item['sku']}"
            # record handles before opening a new tab
            before = set(driver.window_handles)
            # open a new tab and load the product page immediately
            driver.execute_script("window.open(arguments[0], '_blank');", product_url)
            # small pause to allow browser to register the new tab
            time.sleep(0.2)
            after = set(driver.window_handles)
            new = list(after - before)
            if new:
                # new[0] is the handle for the newly opened tab
                handles.append(new[0])
            else:
                # fallback: use the last handle
                handles.append(driver.window_handles[-1])

    # Non-blocking round-robin monitor: each tab is polled independently
    total_spent = 0.0
    total_bought = 0

    # Map handles to SKU info in the same order
    tab_infos = []
    for i, item in enumerate(skus_to_process):
        handle = handles[i] if i < len(handles) else None
        tab_infos.append({
            'handle': handle,
            'sku': item['sku'],
            'quantity': str(item.get('quantity', 1)),
            'state': 'pending'  # pending, processing, done, failed
        })

    def find_add_to_cart_nonblocking(drv, timeout=2):
        # Instead of returning a WebElement (which can become stale), return
        # the locator (by, selector) for a visible Add-to-cart control. The
        # caller will re-find the element immediately before clicking and
        # retry on StaleElementReferenceException.
        end_time = time.time() + float(timeout)
        locators = [
            (By.XPATH, "//button[normalize-space(.)='Add to cart']"),
            (By.XPATH, "//button[contains(.,'Add to cart') ]"),
            (By.CSS_SELECTOR, "button[data-test='add-to-cart']"),
            (By.CSS_SELECTOR, "button[aria-label*='Add to cart']"),
            (By.XPATH, "//a[contains(@aria-label,'Add to cart')]")
        ]

        while time.time() < end_time:
            for by, sel in locators:
                try:
                    elems = drv.find_elements(by, sel)
                    for e in elems:
                        try:
                            if e.is_displayed():
                                return (by, sel)
                        except Exception:
                            # element may be stale or detached; try next
                            continue
                except Exception:
                    continue

            time.sleep(0.15)

        return None

    # Continue until all tabs are processed or buy limit reached
    while any(info['state'] == 'pending' for info in tab_infos) and total_bought < BUY_LIMIT:
        for idx, info in enumerate(tab_infos):
            if info['state'] != 'pending':
                continue

            if not info['handle']:
                info['state'] = 'failed'
                continue

            try:
                driver.switch_to.window(info['handle'])
            except Exception:
                info['state'] = 'failed'
                continue

            sku = info['sku']
            quantity = info['quantity']
            print(f"Checking SKU {sku} in tab {idx+1} (state={info['state']})")

            locator = find_add_to_cart_nonblocking(driver, timeout=2)
            if not locator:
                # not available right now; refresh and move on
                try:
                    driver.refresh()
                except Exception:
                    pass
                # small delay to avoid hammering
                time.sleep(1)
                continue

            # Found availability in this tab — mark it as processing so other
            # tabs pause and we immediately attempt to purchase this one.
            info['state'] = 'processing'
            # After we begin processing, break out of the per-tab for-loop so
            # we handle the purchase right away in the next iteration of the
            # outer while loop (which still checks the same tab first).
            # We'll fall through to the purchase logic below by not skipping
            # the rest of this block (purchase code expects to run here).

            # Found Add to cart locator — attempt to purchase this SKU.
            # Re-find the element right before clicking and retry if it becomes stale.
            try:
                select_quantity(driver, quantity)
                # by, sel = locator
                # click_attempts = 0
                # clicked = False
                # while click_attempts < 3 and not clicked:
                #     try:
                #         elems = driver.find_elements(by, sel)
                #         # prefer the first visible element
                #         target = None
                #         for e in elems:
                #             try:
                #                 if e.is_displayed():
                #                     target = e
                #                     break
                #             except Exception:
                #                 continue
                #         if not target:
                #             raise Exception('Add-to-cart element not found on re-check')

                #         js_click(driver, target)
                #         clicked = True
                #     except StaleElementReferenceException:
                #         click_attempts += 1
                #         time.sleep(0.15)
                #         continue
                #     except Exception as e:
                #         # Give up this SKU if clicking fails repeatedly
                
                #         raise
                time.sleep(2)
                
                while True:
                    try:
                        btn = driver.find_element(By.XPATH, "//button[contains(text(),'Add to cart')]")
                        js_click(driver, btn)
                        print(f"[+] Clicked Add to cart for SKU {sku}")
                    except:
                        pass
                    try:
                        element = driver.find_element(By.CSS_SELECTOR, 'button[data-test="custom-quantity-picker"]')
                        if 'in cart' in element.text.lower():
                            break
                    except:
                        pass
                    time.sleep(0.5)
                    
                  
                print(f"[+] Added SKU {sku} (x{quantity}) to cart.")

                # attempt to checkout / place order
                driver.get('https://www.target.com/checkout')
                time.sleep(2)
                try:
                    sncbtn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(),'Save and continue')]")))
                    js_click(driver, sncbtn)
                    time.sleep(2)
                except Exception:
                    pass
                    
                try:
                    place_order = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.XPATH, "//button[text()='Place your order']")))
                    js_click(driver, place_order)
                    print(f"[+] Order placed for SKU {sku}")
                except Exception:
                    print(f"[!] Place order button not found for SKU {sku}; order may be incomplete.")

                price = get_price(driver)
                total_spent += price
                total_bought += 1
                info['state'] = 'done'

                # try CVV/confirm if needed
                try:
                    WebDriverWait(driver, 3).until(EC.presence_of_element_located((By.ID, 'enter-cvv')))
                    driver.execute_script("""
                        const cvv = document.getElementById('enter-cvv');
                        if (cvv) {
                            const lastValue = cvv.value;
                            cvv.value = arguments[0];
                            const event = new Event('input', { bubbles: true });
                            const tracker = cvv._valueTracker;
                            if (tracker) tracker.setValue(lastValue);
                            cvv.dispatchEvent(event);
                        }
                    """, CVE)
                    driver.execute_script("""
                        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirm');
                        if (btn) btn.click();
                    """)
                    print(f"[+] Confirmed order for SKU {sku}.")
                except Exception:
                    # Not critical; continue
                    pass

            except Exception as e:
                print(f"[!] Error while processing SKU {sku}: {e}")
                info['state'] = 'failed'

            # small cooldown between processing tabs
            time.sleep(0.5)

            # We processed (or attempted) this tab — break out of the per-tab
            # loop so other tabs are not polled until we re-enter the outer
            # while loop. This ensures we handle one available product at a
            # time and don't hammer other tabs while a purchase is in-flight.
            break

    print(f"Done. Bought {total_bought} SKU(s), Spent ${total_spent:.2f}")
    input('Press Enter to close browser...')
    driver.quit()


if __name__ == '__main__':
    main()
