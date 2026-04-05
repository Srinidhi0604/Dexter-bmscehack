"""
TrafficLab 3D — Web Launcher
Starts both the FastAPI backend and Vite React frontend with one command.

Usage:
    python start_web.py
"""

import os
import sys
import subprocess
import signal
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")

def main():
    print("\n" + "=" * 60)
    print("  TrafficLab 3D — Starting Web Services")
    print("=" * 60)

    # Use venv python if available
    venv_py = os.path.join(ROOT, ".venv310", "Scripts", "python.exe")
    py = venv_py if os.path.exists(venv_py) else sys.executable

    procs = []

    # 1. Start FastAPI backend
    print("\n[1/2] Starting FastAPI backend on port 8000...")
    api_proc = subprocess.Popen(
        [py, "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
        cwd=ROOT,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    procs.append(api_proc)
    time.sleep(2)

    # 2. Start Vite dev server
    print("[2/2] Starting Vite frontend on port 5173...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    vite_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=WEB_DIR,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    procs.append(vite_proc)
    time.sleep(2)

    print("\n" + "-" * 60)
    print("  READY!")
    print("  Frontend : http://localhost:5173")
    print("  API      : http://localhost:8000")
    print("  API Docs : http://localhost:8000/docs")
    print("-" * 60)
    print("  Press Ctrl+C to stop both servers\n")

    try:
        while True:
            for p in procs:
                if p.poll() is not None:
                    print(f"\n  Process {p.pid} exited. Shutting down...")
                    raise KeyboardInterrupt
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n  Shutting down...")
        for p in procs:
            try:
                if os.name == "nt":
                    p.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    p.terminate()
            except Exception:
                pass
        for p in procs:
            try:
                p.wait(timeout=5)
            except Exception:
                p.kill()
        print("  Done.\n")

if __name__ == "__main__":
    main()
