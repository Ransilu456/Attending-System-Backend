# 👌 WELCOME TO 😊

     █████╗ ██████╗     █████╗ ████████╗████████╗███████╗███╗   ██╗██████╗ ███████╗███╗   ██╗ ██████╗███████╗
    ██╔══██╗██╔══██╗   ██╔══██╗╚══██╔══╝╚══██╔══╝██╔════╝████╗  ██║██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝
    ██║  ██║██████╔╝   ███████║   ██║      ██║   █████╗  ██╔██╗ ██║██║  ██║█████╗  ██╔██╗ ██║██║     █████╗  
    ██║ █╗█║██╔══██╗   ██╔══██║   ██║      ██║   ██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  
    ╚█████╔╝██║  ██║   ██║  ██║   ██║      ██║   ███████╗██║ ╚████║██████╔╝███████╗██║ ╚████║╚██████╗███████╗
     ╚═══╝╚╝╚═╝  ╚═╝   ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
    


# 🧠 Attending-System Backend

For a source/module guide, API route map, data-flow explanation, and test instructions, see [`docs/CODEBASE-GUIDE.md`](./docs/CODEBASE-GUIDE.md). For importable API smoke tests, use the [`postman/`](./postman/) collection and local environment template.

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

---

## Firebase student fallback and MongoDB mirror

For full frontend/backend setup, environment files, Firebase student authentication, Sinhala support, and sync details, see [STUDENT-AUTHENTICATION-AND-SYNC.md](./docs/STUDENT-AUTHENTICATION-AND-SYNC.md), [How MongoDB and Firebase communicate](./docs/DATABASE-COMMUNICATION.md), and the [Firebase + MongoDB Setup guide](../FIREBASE-SETUP.md).

Only student records are copied from MongoDB into Firebase; admin documents, credentials, and admin routes are not migrated or hosted in Firebase. The teacher's MongoDB remains authoritative for teacher-managed student and attendance writes. Students sign in directly with Firebase email/password and read their own Firestore mirror without the teacher API. Firebase Auth uses SDK-managed browser-local persistence. The backend synchronizes MongoDB changes into Firestore and applies validated queued profile edits when it is online.

After MongoDB connects, the scheduler catches up on unfinished past attendance and recalculates attendance rates and expected sessions. Startup synchronization applies pending Firebase profile edits first, mirrors all MongoDB student records (including attendance history and last-attendance dates) to Firestore, then starts the change stream and profile-edit polling. MongoDB is authoritative except for validated, version-matched profile-edit requests. Startup sync failures are logged and retried; quota exhaustion waits until the next UTC day. At 12:00 AM and 6:30 AM in the server's local time zone, attendance processing repeats; resulting MongoDB changes are mirrored incrementally. The existing automatic checkout and student-status task remains scheduled for 6:45 PM. Each MongoDB student change reads that student's Firestore document for comparison, and writes it only if the mirrored data changed.

Firestore operations made by this backend are capped at 40,000 reads and 18,000 writes per UTC day by default. Configure `FIREBASE_DAILY_READ_LIMIT`, `FIREBASE_DAILY_WRITE_LIMIT`, and optionally `FIREBASE_QUOTA_USAGE_PATH`; persistent counters live in `.firebase-quota-usage.json` and are excluded from Git. The backend creates this quota file and `.firebase-sync-token.json` automatically; the corresponding path variables are optional overrides. These are per-backend-instance app counters, not Firebase's project-wide usage meter. Run only one backend instance using the quota file, and retain headroom for Console activity and other services. Transient Windows file locks during quota-file replacement are retried; if the file remains locked, startup reconciliation fails explicitly and retries. At the write limit the change stream pauses without advancing its resume token and retries after UTC midnight.

### Configure Firebase

1. Create a Firebase project and enable **Authentication → Email/Password** and **Cloud Firestore**.
2. From the repository root, deploy the Firestore rules and required profile-edit index with `firebase deploy --only firestore:rules,firestore:indexes --project <your-project-id>`. The root [`firebase.json`](../firebase.json) points to [`firestore.rules`](./firestore.rules) and [`firestore.indexes.json`](./firestore.indexes.json). Startup applies pending student profile edits before mirroring MongoDB records; the `requests.status` collection-group index is required for that queue query.
3. Create a service-account key for the backend. Keep it private and out of source control.
4. Configure the backend environment:

   ```dotenv
   FIREBASE_PROJECT_ID=your-firebase-project-id
   GOOGLE_APPLICATION_CREDENTIALS=C:\secure\path\firebase-service-account.json
   MONGODB_URI=mongodb://...
   FIREBASE_DAILY_READ_LIMIT=40000
   FIREBASE_DAILY_WRITE_LIMIT=18000
   # Optional path overrides; the backend creates the runtime files by default
   # FIREBASE_QUOTA_USAGE_PATH=C:\AttendanceData\.firebase-quota-usage.json
   # FIREBASE_SYNC_TOKEN_PATH=C:\AttendanceData\.firebase-sync-token.json
   CLIENT_URL=https://your-frontend-domain.example
   ```

   `FIREBASE_SERVICE_ACCOUNT` containing the service-account JSON is also supported, but a protected credential file is preferred. Do not put service-account credentials in the frontend.

5. Configure the frontend environment:

   ```dotenv
   VITE_API_URL=http://localhost:5001/api
   VITE_FIREBASE_API_KEY=your-web-api-key
   VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
   VITE_FIREBASE_APP_ID=your-web-app-id
   VITE_FIREBASE_AUTH_DOMAIN=your-firebase-project-id.firebaseapp.com
   ```

   `VITE_FIREBASE_STORAGE_BUCKET` is optional. The web API key and app ID identify the Firebase project; Firestore rules and Auth—not secrecy of these values—protect student records.

`VITE_API_URL` is required only for teacher/admin API features. Student login and portal reads connect directly to Firebase. If remote teachers use the API, point `VITE_API_URL` to a reachable backend address, configure the exact frontend origin in `CLIENT_URL`, and use HTTPS for deployed frontend and API.

### Migrate students

Run the migration from the `Backend` directory:

```powershell
npm run migrate:firebase -- --limit=10000
```

The script preserves each MongoDB `_id` as the Firebase Auth UID and Firestore `students/{uid}` document ID, so identifiers embedded in existing QR codes do not change. For student accounts it uses the registered email plus the normalized `parent_telephone` as a temporary Firebase Auth password. Students can use **Student registration** to verify email, phone, and Mongo `_id` or index number, then set their own Firebase password (at least 6 characters). Firebase Authentication manages the credential; the password is not stored as a separate credential in Firestore or MongoDB (the contact number remains part of the mirrored student profile). Phone numbers are guessable and only suitable as a temporary password. The phone number must contain 10-15 digits and cannot be a zero placeholder.

The migration prints the last successfully migrated ID and a command for the next batch. Continue with that `--after=<id>` value. Batches are capped at 10,000 to help stay within Firebase's daily quotas. Each student uses one Firestore document read and one write, plus an Auth lookup/create. Mongo inserts and updates each use one Firestore document read and one write; deletes use one Firestore write. Each Firebase profile or attendance fetch reads one student document (attendance is embedded in that document). On plans with the commonly listed daily allowance of 50,000 document reads and 20,000 writes, migrating 10,000 students consumes about 20% of reads and 50% of writes before other use and ongoing sync. Treat quotas and billing as project/region dependent and confirm the current Firebase console limits before a large migration; Auth account creation has separate limits. Do not treat “50k” as a guaranteed number of students or operations. Students without a valid email, a usable phone number, or whose records exceed Firestore's 1 MiB document limit stop the current batch with an error.

### Keep Firebase current

After startup reconciliation, the backend watches the `students` collection and mirrors inserts, updates, and deletes. A local resume token is stored at `.firebase-sync-token.json` (override with `FIREBASE_SYNC_TOKEN_PATH`) so processed changes can resume after a restart. Keep the token file with the teacher server's local data and do not delete it casually.

The mirror deliberately excludes the MongoDB `messages` field; the current student portal does not retain notification history. Existing mirrored documents are replaced without that field during migration or sync. The MongoDB messaging data remains unchanged.

MongoDB change streams require a replica set (including a single-node replica set) or a MongoDB Atlas deployment. A standalone MongoDB server cannot provide reliable change notifications; configure a replica set before relying on automatic mirror updates. Firebase sync failures are logged and the change token is not advanced until the failed change is mirrored.

Permanent per-student data problems (for example, an index shorter than six characters, an email conflict, or a document over the size limit) are logged and skipped so they do not block other students; fix the MongoDB record to emit a new change and retry that student. If MongoDB reports an expired change-stream history token, stop the backend, rerun the full migration, remove the saved token file, and restart.

Firestore rules allow each Firebase student to read only their own mirrored student document and submit restricted profile-edit requests. The backend polls requests and applies validated changes to MongoDB when the teacher server is running; MongoDB remains authoritative and its change stream mirrors accepted updates back to Firestore. Direct browser reads and request writes are outside the backend's daily Firestore quota counters. Admin accounts and teacher/admin workflows continue to use the protected MongoDB API and are not provided Firebase student access by this setup.

All API request bodies and query values are checked for emoji, control/bidi
characters, executable markup, and unsafe Mongo-style object keys before route
handlers run. Mongoose schemas and Firestore rules validate persisted student
text again. Browser text fields block emoji and executable markup as immediate
feedback. These checks reject operator-shaped object keys such as `$where`;
they do not blacklist ordinary words like `select` or `drop`. Database queries
must continue to use fixed query structures and validated values.

### Versioned API

The current API prefix is `/api/v1` (for example, `/api/v1/students/login`, `/api/v1/qr/attendance`, and `/api/v1/attendance/date/2026-10-20`). The previous `/api/...` routes remain as compatibility aliases. Legacy paths `/qr/markAttendanceQR` and `/attendance/:date` also remain available during migration. Frontend API requests use the versioned prefix and canonical paths automatically.
