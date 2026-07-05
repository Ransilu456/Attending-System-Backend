# 👌 WELCOME TO 😊

     █████╗ ██████╗     █████╗ ████████╗████████╗███████╗███╗   ██╗██████╗ ███████╗███╗   ██╗ ██████╗███████╗
    ██╔══██╗██╔══██╗   ██╔══██╗╚══██╔══╝╚══██╔══╝██╔════╝████╗  ██║██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝
    ██║  ██║██████╔╝   ███████║   ██║      ██║   █████╗  ██╔██╗ ██║██║  ██║█████╗  ██╔██╗ ██║██║     █████╗  
    ██║ █╗█║██╔══██╗   ██╔══██║   ██║      ██║   ██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  
    ╚█████╔╝██║  ██║   ██║  ██║   ██║      ██║   ███████╗██║ ╚████║██████╔╝███████╗██║ ╚████║╚██████╗███████╗
     ╚═══╝╚╝╚═╝  ╚═╝   ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
    


# 🧠 Attending-System Backend

![Node.js](https://img.shields.io/badge/Node.js-18.x-brightgreen?logo=node.js)
![Express](https://img.shields.io/badge/Express.js-black?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-brightgreen?logo=mongodb)
![License](https://img.shields.io/badge/License-MIT-blue)

> ⚡ Advanced attendance backend built with **Node.js**, **Express**, and **MongoDB**, enhanced with C++ and Python clients for an immersive local UX experience.

---

## 🚀 Overview

**Attending-System Backend** powers an intelligent, secure, and real-time attendance tracking platform.  
It features:
- Robust API architecture with modular routing.  
- Optimized CORS & middleware configuration.  
- MongoDB connectivity with graceful shutdown & error handling.  
- Integrated scheduler service for background tasks.  
- Cross-platform client launch via C++ and Python executables.

---


## 🧩 Directory Structure
```js
📦 Attending-System-Backend
 ┣ 📂 routes/
 ┃ ┣ 📜 students.routes.js
 ┃ ┣ 📜 admin.routes.js
 ┃ ┣ 📜 qrScanner.routes.js
 ┃ ┗ 📜 attendance.routes.js
 ┣ 📂 services/
 ┃ ┗ 📜 schedulerService.js
 ┣ 📂 middleware/
 ┃ ┗ 📜 authMiddleware.js
 ┣ 📂 config/
 ┃ ┗ 📜 database.js
 ┣ 📂 utils/
 ┃ ┗ 📜 terminal.js
 ┣ 📂 public/
 ┃ ┗ 📜 qr-codes/
 ┣ 📜 server.js
 ┣ 📜 main.py
 ┣ 📜 launcher.cpp
 ┗ 📜 .env


```
 ---
 
## 🖼️ ASCII Banner

The server proudly displays a custom banner when launched:

```js
console.log(chalk.cyanBright(`
     █████╗ ██████╗     █████╗ ████████╗████████╗███████╗███╗   ██╗██████╗ ███████╗███╗   ██╗ ██████╗███████╗
    ██╔══██╗██╔══██╗   ██╔══██╗╚══██╔══╝╚══██╔══╝██╔════╝████╗  ██║██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝
    ██║  ██║██████╔╝   ███████║   ██║      ██║   █████╗  ██╔██╗ ██║██║  ██║█████╗  ██╔██╗ ██║██║     █████╗  
    ██║ █╗█║██╔══██╗   ██╔══██║   ██║      ██║   ██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  
    ╚█████╔╝██║  ██║   ██║  ██║   ██║      ██║   ███████╗██║ ╚████║██████╔╝███████╗██║ ╚████║╚██████╗███████╗
     ╚═══╝╚╝╚═╝  ╚═╝   ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
    
`));
```

---

# 💻 C++ and Python Launchers

**🐍 Python Launcher**
Simple subprocess-based launcher with graceful exit.

```python
import subprocess, os, signal

def main():
    script_path = r"path"
    command = ["node", script_path]

    process = subprocess.Popen(command, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    print("✅ Node.js server running. Press ENTER or Ctrl+C to stop.")

    try:
        input()
    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
    finally:
        os.kill(process.pid, signal.CTRL_BREAK_EVENT)
        print("✅ Node.js server stopped cleanly.")

if __name__ == "__main__":
    main()

```

**💠 C++ Launcher**
Native Windows executable for instant backend launch.

```c++
#include <windows.h>
#include <iostream>
#include <string>

int main() {
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    std::string command = "file_path";

    if (CreateProcessA(NULL, &command[0], NULL, NULL, FALSE, CREATE_NEW_PROCESS_GROUP, NULL, NULL, &si, &pi)) {
        std::cout << "✅ Node.js backend running. Press ENTER to stop..." << std::endl;
        std::cin.get();
        GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, pi.dwProcessId);
        WaitForSingleObject(pi.hProcess, 5000);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        std::cout << "🛑 Server stopped cleanly." << std::endl;
    } else {
        std::cerr << "❌ Failed to start Node.js process." << std::endl;
    }
    return 0;
}

```
---

# 📦 Tech Stack

| Category       | Technology                 |
| -------------- | -------------------------- |
| **Runtime**    | Node.js 18+                |
| **Framework**  | Express.js                 |
| **Database**   | MongoDB + Mongoose         |
| **Scheduler**  | Custom Service Worker      |
| **Launchers**  | Python & C++ Native        |
| **Logger**     | Chalk + Custom Terminal UI |
| **Env Config** | dotenv                     |


---

# 🧑‍💻 Author

**Keshan**
💼 Full-stack Developer
🔗 Building fusion systems combining Node.js, Python, and C++ for next-gen backend UX.

---

# 🪪 License

This project is released under the MIT License.
You’re not free to use, modify, and distribute — with attribution.
