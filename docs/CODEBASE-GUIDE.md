# Backend codebase guide

This guide describes how the backend modules fit together and where the main application behavior lives. The backend is an ES-module Node.js/Express application. MongoDB is the authoritative database; Firebase is limited to student authentication and a quota-gated student-data mirror/fallback.

## Start, configure, and test

From `Backend`:

```powershell
npm install
npm start
npm test
```

`npm run dev` starts the server with Nodemon, watching Node.js source files only. Runtime Firebase quota and change-stream state are JSON files, so they are intentionally excluded from the restart cycle. Set the database, JWT, Firebase, CORS, and quota variables in `.env` using `.env.example` as the template. Keep service-account keys and `.env` files private. See the backend [README](../README.md#firebase-student-fallback-and-mongodb-mirror) for Firebase project setup and student migration.

The Postman collection is in [`postman/`](../postman/). Import both the collection and its environment, use a disposable/test database, run **Fetch CSRF token** before state-changing calls, and supply valid IDs and credentials only in a private local environment. Delete and attendance-changing requests are disabled by default. The environment template intentionally contains no credentials or tokens.

## Request lifecycle

`server.js` loads environment values, creates the Express app, applies security headers, CORS, global rate limiting, JSON parsing, request logging, CSRF validation, versioned and compatibility API routes, and error handling. `/api/v1` is the primary API prefix; `/api` remains mounted for older clients. Health and readiness endpoints are registered separately.

`routes/` declares URL paths, HTTP methods, validation, access control, and endpoint-specific rate limits. Controllers in `controllers/` implement the behavior. `middleware/` provides authentication/authorization, request validation, CSRF protection, and centralized error responses. A state-changing request must carry the CSRF token and session ID issued by `/api/v1/csrf-token`.

## Backend modules

| Location | Responsibility |
| --- | --- |
| `server.js` | Express setup, CORS/security middleware, API mounting, health checks, MongoDB startup, scheduler/mirror lifecycle, and graceful shutdown |
| `config/database.js` | Mongoose connection and shutdown helpers |
| `config/firebase.js` | Lazy Firebase Admin initialization from application-default credentials, a service-account file, or configured service-account JSON |
| `models/` | Mongoose schemas for students, administrators, and CSRF records; student schema methods also maintain attendance-related fields |
| `routes/` | URL definitions and composition of middleware with controller handlers |
| `controllers/admin.controller.js` | Admin account lifecycle, student CRUD/listing, QR administration, and recent-attendance responses |
| `controllers/students.controller.js` | Student login, self-service profile/attendance, public QR lookup/download, and quota-gated Firebase fallback handlers |
| `controllers/attendance.controller.js` | Attendance queries, attendance history maintenance, and automatic-checkout configuration/actions |
| `controllers/qrScanner.controller.js` | QR attendance scanning and student QR persistence |
| `controllers/messaging.controller.js` | Notification-link and messaging integrations used by attendance operations |
| `middleware/authMiddleware.js` | JWT/Firebase token checks, role/ownership authorization, and centralized error handling |
| `middleware/csrfMiddleware.js` | Issues paired CSRF/session values and blocks unsafe requests that lack a valid pair |
| `middleware/validationMiddleware.js` | Express-validator rules for IDs, dates, login, profiles, student input, and passwords |
| `services/schedulerService.js` | Startup attendance catch-up, scheduled attendance processing, and Firebase reconciliation coordination |
| `services/autoAttendanceService.js` | Automatic attendance/checkout operations used by scheduler tasks |
| `services/firebaseMirrorService.js` | MongoDB student change stream, startup reconciliation, Firebase Auth metadata sync, and resume-token management |
| `services/firebaseQuotaService.js` | Serialized per-process daily Firestore budget reservations, persisted counters, student-document cache, and Firestore operation wrappers |
| `utils/attendanceStats.js` | Session-date cache and attendance-rate/stat calculations |
| `utils/dbAvailability.js` | Distinguishes MongoDB availability failures from application errors |
| `utils/idMask.js` and `utils/idConverter.js` | Student ID masking, ID resolution, and QR-compatible numeric ID conversion |
| `utils/qrGenerator.js` | QR image/data generation |
| `utils/terminal.js` | Consistent terminal status, progress, and error output |
| `utils/scripts/` | Operational scripts, including MongoDB-to-Firebase student migration |
| `tests/` | Node built-in test-runner tests for isolated backend behavior |
| `firestore.rules` | Allows UID-scoped student reads and restricted profile-edit requests; publish this file in the Firebase console separately |

## Main data flows

### Admin and teacher requests

1. The frontend sends a request to `/api/v1` with its admin JWT and CSRF/session headers when the method changes state.
2. Authentication middleware verifies the JWT and role. Route-level validation rejects malformed inputs before controllers run.
3. Controllers read or modify MongoDB models and return JSON. MongoDB remains authoritative for attendance and student records.
4. MongoDB change events update student mirror documents and Firebase Auth metadata when Firebase is configured.

### Student portal reads and edits

Student identity is authenticated with Firebase Auth in Firebase-enabled frontend deployments. The frontend sends the student's Firebase ID token to backend endpoints. The backend prefers MongoDB; only when MongoDB is unavailable does it read the matching student's Firestore mirror through the quota service. If the backend cannot be reached, no browser-side Firestore bypass is attempted.

Student profile edits are backend/MongoDB writes. The MongoDB change stream mirrors those changes to Firestore while the configured daily write budget permits. Admin and teacher records/routes are not mirrored.

For Postman, the standard `/students/me` routes accept a backend student JWT or an eligible Firebase ID token. The explicit `/students/me/firebase...` fallback routes require a Firebase ID token with the student claim. Keep these tokens in separate variables; the legacy phone-based login returns a backend JWT, not a Firebase token.

### Daily quota and change-stream behavior

The default app-level ceilings are 40,000 reads and 18,000 writes per UTC date. `FIREBASE_DAILY_READ_LIMIT`, `FIREBASE_DAILY_WRITE_LIMIT`, and `FIREBASE_QUOTA_USAGE_PATH` configure them. The counter is persisted across process restarts, but it only includes operations routed through this one backend instance. It cannot account for Firebase Console traffic, other apps/service accounts, or other backend instances.

When the mirror reaches the write ceiling, it retains the unprocessed MongoDB change-stream resume position and waits until the next UTC day before retrying. This is an application safety budget, not a project-wide Firebase quota meter.

## API route map

All routes below are mounted at `/api/v1`; the legacy `/api` prefix exposes the same routers.

| Router | Routes |
| --- | --- |
| System | `GET /health`, `GET /ready`, `GET /csrf-token` |
| Admin auth/profile | `POST /admin/register`, `POST /admin/login`, `POST /admin/logout`, `POST /admin/forgot-password`, `POST /admin/reset-password/:token`, `POST /admin/update-password`, `PATCH /admin/profile`, `GET /admin/me` |
| Admin students | `GET /admin/students`, `GET /admin/students/all`, `POST /admin/students`, `PUT /admin/students/:id`, `PATCH /admin/students/:id`, `DELETE /admin/students/:id`, `GET /admin/students/:id/qr-code`, `GET /admin/students/qr-code/:indexNumber`, `GET /admin/attendance/recent` |
| Student self-service | `POST /students/login`, `GET /students/me`, `PATCH /students/me`, `GET /students/me/attendance`, `GET /students/me/firebase`, `GET /students/me/firebase/attendance`, `GET /students/me/firebase/qr`, `POST /students/me/verify-enrollment` |
| Public student QR | `GET /students/search-qr`, `GET /students/download-qr-code` |
| Attendance admin | `POST /attendance/auto-checkout/configure`, `GET /attendance/auto-checkout/settings`, `POST /attendance/auto-checkout/run`, `GET /attendance/today`, `GET /attendance/date/:date`, `GET /attendance/:date`, `GET /attendance/student/:studentId/history`, `DELETE /attendance/student/:studentId/clear`, `DELETE /attendance/student/:studentId/record/:recordId` |
| QR scanner/admin | `POST /qr/attendance`, `POST /qr/markAttendanceQR` (compatibility alias), `GET /qr/student/:studentId`, `POST /qr/student/:studentId` |

Protected routes require the appropriate bearer token and role. Firebase fallback routes specifically require a valid Firebase student token. Check route files for exact validation rules and authorization middleware for each operation.

## Change policy

Do not delete backup data, built executables, or tracked frontend build files merely because they are generated-looking. Treat those as potentially intentional deployment artifacts until their owner confirms they are disposable. Build output and local state are ignored for new files by the app-specific `.gitignore` rules.
