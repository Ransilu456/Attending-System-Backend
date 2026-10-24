# How MongoDB and Firebase communicate

## What each service does

- **MongoDB is the main student database.** The teacher backend uses it for
  student profiles, attendance history, last-attendance information, and
  teacher-managed changes.
- **Firebase Authentication manages student email/password credentials.**
  Passwords are not copied into MongoDB or Firestore.
- **Cloud Firestore is a student-facing mirror of MongoDB student records.**
  It also receives a limited queue of student profile-edit requests when the
  teacher backend cannot accept a change.
- **The Node.js backend is the bridge.** It connects to MongoDB with Mongoose
  and to Firebase using the Firebase Admin SDK and the server-only service
  account. Browser clients never receive the service-account key.

## Data flow

```text
Teacher/admin change
        |
        v
Backend API ---> MongoDB (authoritative student and attendance data)
                      |
                      | MongoDB change stream
                      v
                Backend mirror worker ---> Cloud Firestore

Student sign-in ---> Firebase Authentication
        |                    |
        | Firebase SDK       | verifies email/password
        v                    v
Student portal ---> Firestore (only this student's record and edit queue)

Teacher/admin changes ---> Backend API ---> MongoDB
                                |
                                +-- MongoDB change stream --> Firestore mirror
```

Student authentication, portal reads, attendance, QR data, and queued student
profile edits use Firebase directly from the browser. The student portal does
not require the teacher backend to sign in, restore Firebase authentication, or
load its mirrored student record. Firebase Authentication persists its own
session in browser-managed storage; the app does not manually save Firebase ID
tokens or passwords. Firestore rules restrict each student to their own record
and profile-edit queue. The backend remains necessary for teacher/admin
operations and for synchronizing authoritative MongoDB changes to Firestore.

## Synchronization direction and conflict policy

MongoDB wins for complete student records. After MongoDB connects on backend
startup, the backend:

1. Reads pending profile-edit requests from Firestore and applies only allowed,
   current-version requests to MongoDB.
2. Reconciles MongoDB student records into Firestore, including attendance
   history and last-attendance data.
3. Starts a MongoDB change stream to mirror later student inserts, updates,
   and deletes into Firestore, and polls for new profile-edit requests.

Profile edits made by a student are requests, not direct edits to the mirrored
student document. The backend checks the request's allowed fields and its `updatedAt` version
before applying it to MongoDB. If unrelated MongoDB changes make that version
stale, the backend checks the requested fields against the Firestore mirror and
rebases the edit only when those fields have not changed. Attendance and last
attendance are teacher/backend-managed and flow from MongoDB to Firestore.
Legacy `messages`/notification history is not currently mirrored.

The backend needs MongoDB Atlas or a replica set for change streams. If Firebase
sync is not configured, MongoDB API operations still work, but the Firestore
mirror and Firebase-backed student sign-in/session restoration are not
available.

## Runtime state files: no manual setup required

`FIREBASE_SYNC_TOKEN_PATH` and `FIREBASE_QUOTA_USAGE_PATH` are optional
environment-variable overrides, not credentials and not files you must create.
When they are unset, the backend uses these defaults in its current working
directory (normally `Backend` when started from that folder):

| Runtime file | Purpose | When it appears |
| --- | --- | --- |
| `.firebase-sync-token.json` | Saves the MongoDB change-stream resume token so mirroring can resume after a restart. | After the first change-stream event has been processed and mirrored successfully. |
| `.firebase-quota-usage.json` | Saves the backend's per-UTC-day Firestore read/write counters. | Before the first backend-counted Firestore operation. |

The backend creates the files and their parent folders automatically. A fresh
installation with neither file is expected: quota counters start at zero, and
the change stream starts without a saved resume token after the startup
reconciliation. Keep the generated files on the backend machine between
restarts; do not commit, share, or copy them as configuration. They are ignored
by `Backend/.gitignore`.

Set the variables only if you want to put runtime state somewhere else, such
as a persistent data directory:

```dotenv
FIREBASE_SYNC_TOKEN_PATH=C:\AttendanceData\.firebase-sync-token.json
FIREBASE_QUOTA_USAGE_PATH=C:\AttendanceData\.firebase-quota-usage.json
```

Use a writable, persistent path accessible to the Windows account running the
backend. Do not point multiple backend instances at separate quota files and
assume that their combined Firebase use is controlled; these counters are
local to one instance and do not represent Google's project-wide usage.

## Teacher API connectivity

The student portal does not require the teacher API for sign-in or Firestore
reads. If a separate teacher/admin feature reports a network error, the browser
received no HTTP response from the configured API. It does **not** prove that
the device's internet connection is down. Common causes include a stopped
backend, the wrong `VITE_API_URL`, a firewall or unavailable host, a CORS
origin mismatch, or an HTTPS page trying to call an HTTP API.

The local frontend example uses:

```dotenv
VITE_API_URL=http://localhost:5001/api
```

This address is only used for teacher/admin API calls and is correct only
when the browser and backend run on the same computer. For hosted teacher
features, configure `VITE_API_URL` to the reachable teacher API address,
allow the exact frontend origin in backend `CLIENT_URL`, use HTTPS for both
deployed frontend and API, and rebuild/redeploy the frontend after changing
its Vite environment variables.

For local troubleshooting, start the backend from `Backend` with `npm start`,
then open `http://localhost:5001/api/v1/health` on the same computer. A response
with `"status":"ok"` confirms the API process is answering; check the
`services.database.status` field separately for MongoDB connectivity. This
health check does not verify Firebase Authentication or Firestore rules.

## Related details

See [Student authentication and synchronization](./STUDENT-AUTHENTICATION-AND-SYNC.md)
for password setup, Firebase session behavior, endpoints, and deployment
requirements. Student portal error codes are documented in the frontend
[error-code catalog](../../Frontend/frontend/docs/STUDENT-PORTAL-ERROR-CODES.md).
See [Firebase setup](../../FIREBASE-SETUP.md) for credential setup and
migration instructions.
