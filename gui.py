import os
import sys
import subprocess
import signal
import tkinter as tk
from tkinter import ttk


class MainRunnerGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Main.py Runner")
        self.resizable(False, False)

        self.proc = None

        frm = ttk.Frame(self, padding=12)
        frm.grid()

        self.start_btn = ttk.Button(frm, text="Start", command=self.start_main)
        self.start_btn.grid(column=0, row=0, padx=6, pady=6)

        self.stop_btn = ttk.Button(frm, text="Stop", command=self.stop_main, state="disabled")
        self.stop_btn.grid(column=1, row=0, padx=6, pady=6)

        self.status = tk.StringVar(value="Stopped")
        ttk.Label(frm, textvariable=self.status).grid(column=0, row=1, columnspan=2, pady=(6,0))

        # Periodic check for process status to update buttons
        self.check_process()

    def start_main(self):
        if self.proc is not None:
            return

        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")
        if not os.path.exists(script_path):
            print(f"main.py not found at {script_path}")
            return

        print(f"Starting {script_path}...")

        # On Windows, open in a new console so you can interact with input() prompts
        creationflags = 0
        if sys.platform.startswith("win"):
            creationflags = subprocess.CREATE_NEW_CONSOLE

        try:
            self.proc = subprocess.Popen([sys.executable, script_path], cwd=os.path.dirname(script_path), creationflags=creationflags)
        except Exception as e:
            print(f"Failed to start main.py: {e}")
            self.proc = None
            return

        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="enabled")
        self.status.set(f"Running (PID {self.proc.pid})")
        print(f"Started main.py with PID {self.proc.pid}. Output and prompts appear in the new console.")

    def stop_main(self):
        if not self.proc:
            return

        pid = self.proc.pid
        print(f"Stopping main.py (PID {pid})...")
        try:
            # Try terminate first
            self.proc.terminate()
        except Exception:
            pass

        try:
            # On Windows sometimes terminate doesn't kill child processes; use kill as fallback
            self.proc.kill()
        except Exception:
            pass

        # Wait briefly for process to exit
        try:
            self.proc.wait(timeout=3)
        except Exception:
            pass

        self.proc = None
        self.start_btn.config(state="enabled")
        self.stop_btn.config(state="disabled")
        self.status.set("Stopped")
        print(f"Stopped main.py (PID {pid}).")

    def check_process(self):
        # Called periodically to detect if process exited on its own
        if self.proc:
            ret = self.proc.poll()
            if ret is not None:
                print(f"main.py exited with return code {ret}.")
                self.proc = None
                self.start_btn.config(state="enabled")
                self.stop_btn.config(state="disabled")
                self.status.set(f"Stopped (exit {ret})")

        self.after(1000, self.check_process)


def main():
    app = MainRunnerGUI()
    app.mainloop()


if __name__ == "__main__":
    main()
