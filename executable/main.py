import subprocess
import os
import signal

def main():
    script_path = r"E:\DO NOT TOUCH\System\Attending-System-V8-Backend\server.js"
    command = ["node", script_path]

    process = None

    try:
        process = subprocess.Popen(command, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
        print("✅ Node.js server is running. Press ENTER or Ctrl+C to stop it...")

        input()

    except KeyboardInterrupt:
        print("\n🛑 Keyboard interrupt detected. Stopping Node.js server...")

    finally:
        if process and process.poll() is None: 
            try:
                os.kill(process.pid, signal.CTRL_BREAK_EVENT)
                process.wait(timeout=5)
            except Exception:
                process.terminate()
        print("✅ Node.js server stopped cleanly.")

if __name__ == "__main__":
    main()
