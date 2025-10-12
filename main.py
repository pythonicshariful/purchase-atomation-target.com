import os
import time
import pickle
import json
import random
import logging
import threading
import sys
import io
import requests
from tkinter import *
from tkinter import scrolledtext, messagebox
from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, StaleElementReferenceException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# --- constants ---
COOKIES_FILE = "cookies.pkl"
LOCAL_FILE = "local_storage.json"
URL = "https://www.target.com/"
CONFIG_FILE = "config.json"
CSV_PATH = "sku.csv"
TOOL_NAME = "Bot1"
PASSWORD = "Hacktanha"

# --- global vars ---
driver_instance = None
running = False

# ===== GUI Redirection Helpers =====
class RedirectText(io.StringIO):
    def __init__(self, text_widget):
        super().__init__()
        self.text_widget = text_widget

    def write(self, string):
        self.text_widget.config(state='normal')
        self.text_widget.insert(END, string)
        self.text_widget.see(END)
        self.text_widget.config(state='disabled')

    def flush(self):
        pass


# ===== Core Bot Logic =====
def checkLincenc():
    url = 'https://github.com/pythonicshariful/phone-number-extractor'
    try:
        return requests.get(url).status_code == 200
    except:
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
    
cfg = read_config()
CVE = cfg.get('CVE', '123')
SPEND_LIMIT = cfg.get('SPEND_LIMIT', 120.00)
BUY_LIMIT = cfg.get('BUY_LIMIT', 3)


def get_price(driver):
    try:
        price_elem = driver.find_element(By.CSS_SELECTOR, "span[data-test='product-price']")
        price_text = price_elem.text.replace('$', '').replace(',', '').strip()
        return float(price_text)
    except Exception:
        return 0.0

def load_skus():
    import csv
    skus = []
    if not os.path.exists(CSV_PATH):
        return skus
    with open(CSV_PATH, newline='', encoding='utf-8') as cf:
        reader = csv.DictReader(cf)
        for row in reader:
            sku = (row.get('sku') or row.get('SKU') or '').strip()
            qty = row.get('quantity') or row.get('Quantity') or row.get('qty') or ''
            if not sku:
                continue
            try:
                q = int(qty) if qty else 1
            except:
                q = 1
            skus.append({'sku': sku, 'quantity': q})
    return skus


def is_logged_in(driver):
    try:
        driver.find_element(By.XPATH, "//span[text()='Account']")
        return False
    except NoSuchElementException:
        return True


def js_click(driver, element):
    driver.execute_script('arguments[0].click();', element)


def select_quantity(driver, quantity='1'):
    try:
        wait = WebDriverWait(driver, 5)
        dropdown = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "div.sc-10a3dac3-3.fGQZRy")))
        js_click(driver, dropdown)
        time.sleep(0.3)
        try:
            option = wait.until(EC.element_to_be_clickable((By.XPATH, f"//a[@aria-label='{quantity}']")))
            js_click(driver, option)
        except:
            available = driver.find_elements(By.XPATH, "//a[@aria-label]")
            if available:
                max_q = max([int(a.get_attribute("aria-label")) for a in available if a.get_attribute("aria-label").isdigit()])
                js_click(driver, driver.find_element(By.XPATH, f"//a[@aria-label='{max_q}']"))
    except:
        pass


def main(input_func=input):
    global driver_instance, running
    # if not checkLincenc():
    #     print('License check failed!')
    #     return

    current_dir = os.path.dirname(os.path.abspath(__file__))
    profile_path = os.path.join(current_dir, "chrome_profile")
    os.makedirs(profile_path, exist_ok=True)

    logging.getLogger('selenium').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)

    options = webdriver.ChromeOptions()
    options.add_argument(f"--user-data-dir={profile_path}")
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    options.add_argument('--log-level=3')
    service = Service(log_path=os.devnull)

    driver_instance = webdriver.Chrome(service=service, options=options)
    driver_instance.maximize_window()
    driver_instance.get(URL)
    time.sleep(2)

    if not is_logged_in(driver_instance):
        input_func("Please log in manually, then press Enter here...")
    else:
        print("Already logged in.")

    cfg = read_config()
    BUY_LIMIT = cfg.get('BUY_LIMIT', 3)
    sku_data = load_skus()
    if not sku_data:
        print('[!] No SKUs found in sku.csv. Exiting.')
        driver_instance.quit()
        return

    skus_to_process = sku_data[:BUY_LIMIT]
    total_bought = 0
    total_spent = 0.0

    for item in skus_to_process:
        if not running:
            print("Stopped by user.")
            break
        sku = item['sku']
        quantity = item['quantity']
        product_url = f"https://www.target.com/p/-/A-{sku}"
        driver_instance.get(product_url)
        print(f"Opened SKU {sku}")
        time.sleep(2)
                
        while True:
                    driver_instance.refresh()
                    print(f"[+] Refreshing page for SKU {sku}...")
                    try:
                        btn = driver_instance.find_element(By.XPATH, "//button[contains(text(),'Add to cart')]")
                        js_click(driver_instance, btn)
                        print(f"[+] Clicked Add to cart for SKU {sku}")
                    except:
                        print(f"[!] Add to cart button not found for SKU {sku}, retrying...")
                        pass
                    try:
                        element = driver_instance.find_element(By.CSS_SELECTOR, 'button[data-test="custom-quantity-picker"]')
                        if 'in cart' in element.text.lower():
                            break
                    except:
                        pass
                    time.sleep(1)
                    
                  
        print(f"[+] Added SKU {sku} (x{quantity}) to cart.")
                # attempt to checkout / place order
        driver_instance.get('https://www.target.com/checkout')
        time.sleep(2)
        wait = WebDriverWait(driver_instance, 5)
        while True:
            try:
                print("[+] On checkout page, Login page detected.")
                passFiled = wait.until(EC.presence_of_element_located((By.ID, 'password')))
            
                # driver_instance.execute_script("""
                # arguments[0].value = arguments[1];
                # arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
                # arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
                # """, passFiled, PASSWORD)
                passFiled.clear()
                time.sleep(random.randint(2,3))
                passFiled.send_keys(PASSWORD)
                time.sleep(0.5)

                btn = driver_instance.find_element(By.ID, 'login')
                js_click(driver_instance, btn)
                time.sleep(3)
                skipbtn = wait.until(EC.element_to_be_clickable((By.XPATH, "//a[normalize-space()='Skip']")))
                js_click(driver_instance, skipbtn)
                time.sleep(2)
                
            except:
                break
      
            
        try:
            sncbtn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(),'Save and continue')]")))
            js_click(driver_instance, sncbtn)
            time.sleep(2)
        except Exception:
            pass
                    
        try:
            place_order = WebDriverWait(driver_instance, 5).until(EC.element_to_be_clickable((By.XPATH, "//button[text()='Place your order']")))
            js_click(driver_instance, place_order)
            print(f"[+] Order placed for SKU {sku}")
        except Exception:
            print(f"[!] Place order button not found for SKU {sku}; order may be incomplete.")

        price = get_price(driver_instance)
        total_spent += price
        total_bought += 1
    

                # try CVV/confirm if needed
        try:
            WebDriverWait(driver_instance, 3).until(EC.presence_of_element_located((By.ID, 'enter-cvv')))
            driver_instance.execute_script("""
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
            driver_instance.execute_script("""
                        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirm');
                        if (btn) btn.click();
                    """)
            print(f"[+] Confirmed order for SKU {sku}.")
        except Exception:
                    # Not critical; continue
            pass

    print(f"Done. Bought {total_bought} SKU(s), Spent ${total_spent:.2f}")
    input_func('Press Enter to close browser...')
    driver_instance.quit()


# ===== GUI =====
class BotGUI:
    def __init__(self, root):
        self.root = root
        self.root.title(f"{TOOL_NAME} - Target.com Purchase Automation")
        self.root.geometry("700x500")
        self.root.resizable(False, False)

        self.console = scrolledtext.ScrolledText(root, wrap='word', state='disabled', height=22)
        self.console.pack(fill=BOTH, padx=10, pady=10, expand=True)

        self.input_entry = Entry(root, width=100)
        self.input_entry.pack(padx=10, pady=5)
        self.input_entry.bind("<Return>", self.send_input)

        frame = Frame(root)
        frame.pack(pady=5)
        Button(frame, text="Start Bot", bg="green", fg="white", width=12, command=self.start_bot).pack(side=LEFT, padx=5)
        Button(frame, text="Stop Bot", bg="red", fg="white", width=12, command=self.stop_bot).pack(side=LEFT, padx=5)

        sys.stdout = RedirectText(self.console)
        self.input_value = None
        self.input_ready = threading.Event()

    def send_input(self, event=None):
        self.input_value = self.input_entry.get()
        self.input_entry.delete(0, END)
        self.input_ready.set()

    def gui_input(self, prompt=""):
        print(prompt, end="")
        self.input_ready.clear()
        self.input_ready.wait()
        val = self.input_value
        self.input_value = None
        return val

    def start_bot(self):
        global running
        if running:
            messagebox.showinfo("Info", "Bot already running.")
            return
        running = True
        print("\n--- Bot Starting ---\n")

        def run():
            try:
                main(self.gui_input)
            except Exception as e:
                print(f"\nError: {e}")
            finally:
                print("\n--- Bot Finished ---\n")
                global running
                running = False

        threading.Thread(target=run, daemon=True).start()

    def stop_bot(self):
        global running, driver_instance
        if not running:
            messagebox.showinfo("Info", "Bot not running.")
            return
        running = False
        try:
            if driver_instance:
                driver_instance.quit()
        except:
            pass
        print("\n🛑 Bot stopped by user.\n")
        messagebox.showinfo("Stopped", "Bot stopped successfully.")


if __name__ == "__main__":
    root = Tk()
    app = BotGUI(root)
    root.mainloop()
