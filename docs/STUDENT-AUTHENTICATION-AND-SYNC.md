# Student password, Firebase session, and data synchronization

## Password setup and sign-in

Student passwords are managed by Firebase Authentication; neither MongoDB nor
Firestore stores a second password copy. A student visits `/student/create-password`
once, verifies the registered email, phone number, and MongoDB ID or index
number, and changes the temporary phone-number password to a private password.
The verification screen only changes the Firebase password; it does not create a
student record.

After setup, students use `/student/login` with that email and password. The
Firebase client SDK authenticates the student directly; the student login,
portal, and Firebase session restoration do not call the teacher backend.
Firestore rules allow a student to read only `students/{their Firebase UID}`
and submit allowlisted profile-edit requests for that same student.

## Firebase student session

Firebase Authentication uses the SDK's browser-local persistence. This lets a
student reload the portal or reopen the browser without contacting the teacher
API; Firebase refreshes its own short-lived ID tokens. The app does not
manually store the password or Firebase ID token. Signing out calls Firebase
Auth and clears the SDK-managed browser session.

This is not a seven-day HTTP-only cookie: direct browser-to-Firebase sign-in
allows the student portal to work without the teacher backend, while Firebase
browser persistence can keep the student signed in until they sign out or the
account is disabled/revoked. An HTTP-only cookie with a fixed seven-day
expiration would require exchanging Firebase credentials/tokens with a trusted
server and relying on that server to restore the session, which would make
student authentication depend on a backend. Shared-device users should sign
out after use. Secure this flow with HTTPS, Firebase Authentication account
protections, and the published Firestore rules. Never grant students broad
collection access or allow them to write attendance, status, or the mirrored
student document.

The backend's `/students/session` endpoints remain available for integrations
that explicitly use server-managed sessions, but the student frontend no longer
uses those endpoints. MongoDB session records do not control the Firebase
student portal session.

## Firebase and MongoDB synchronization

MongoDB remains authoritative for complete student records, attendance history,
last-attendance dates, status, and teacher-managed changes. Firebase is the
student-facing authentication provider and Firestore read mirror. Student
profile changes made while the teacher backend is offline are submitted as
restricted Firestore edit requests; they are not direct edits to the mirrored
student document.

After MongoDB connects, startup reconciliation runs in this order:

1. Drain pending Firebase profile-edit requests in batches of 50. Each edit is
   revalidated and applied to MongoDB only if its `updatedAt` still matches the
   version the student edited. Invalid, stale, or deleted-record requests are
   marked rejected/conflicted.
2. Scan MongoDB students and reconcile each full student document to Firebase.
   This updates Firestore with the authoritative MongoDB attendance history,
   `lastAttendance`, and current profile fields. The existing mirror excludes
   the legacy `messages` field.
3. Start the MongoDB change stream and the continuing pending-profile-edit
   polling service.

Thus queued profile edits are accepted into MongoDB before the Firebase mirror
replaces Firestore's student document. For conflicts, MongoDB wins except for
validated profile-edit requests that pass the compare-and-set check. Students
cannot write attendance or last-attendance data under the published Firestore
rules. Notification history is not currently retained in the student portal;
the legacy `messages` array is intentionally not mirrored.

If startup reconciliation fails, the backend logs the error and retries. When
the configured daily Firebase quota is reached, it waits for the next UTC day
before retrying. The MongoDB change watcher does not start until the full
reconciliation succeeds, avoiding live mirroring over an incomplete startup
pass.

The MongoDB change stream needs Atlas or a replica set. Its resume token is
saved at `FIREBASE_SYNC_TOKEN_PATH`; the default is
`.firebase-sync-token.json` in the backend working directory. The backend
creates this runtime file automatically after successfully processing the
first change-stream event; you do not need to create it or set the environment
variable. Firestore quota counters are likewise stored automatically in
`.firebase-quota-usage.json`; `FIREBASE_QUOTA_USAGE_PATH` is only an optional
path override. Keep generated runtime files on the backend machine between
restarts and outside source control. More on data direction and sync state is in
[How MongoDB and Firebase communicate](./DATABASE-COMMUNICATION.md).

## Configuration and rollout

1. Set `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` on the
   backend. Keep the service-account JSON outside the repository.
2. Configure `MONGODB_URI` and a restricted `CLIENT_URL`.
3. Configure the frontend Firebase Web App values. `VITE_API_URL` is optional
   for the student portal and is needed only by teacher/admin API features.
   Rebuild the frontend after changing Vite environment settings.
4. Serve the production frontend over HTTPS. The student portal connects
   directly to Firebase; the frontend only needs the teacher API URL for
   teacher/admin features. Use HTTPS for any deployed teacher API.
5. Restart the backend and inspect startup logs for a successful Firebase
   reconciliation. Resolve logged skipped student data issues before relying on
   the mirror.

## Sinhala and English

Student login, password setup, and the student navigation support English and
Sinhala. The preference is saved as the non-sensitive `student_language` value
in localStorage and defaults to Sinhala. It is separate from authentication
credentials. Add or revise labels in
`Frontend/frontend/src/i18n/studentLanguage.js`; Sinhala text uses Unicode and
the system font fallback includes Noto Sans Sinhala / Iskoola Pota. Analytics
and detailed tab copy may still contain English text.

## Relevant endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| Firebase Auth SDK | `signInWithEmailAndPassword` | Student email/password sign-in; no teacher API call |
| Cloud Firestore | `students/{uid}` | Read the signed-in student's mirrored profile, attendance, and QR data |
| Cloud Firestore | `studentProfileEdits/{uid}/requests` | Submit and view allowed profile-edit requests |
| `POST` | `/api/v1/students/session` | Optional server-managed session exchange for non-portal integrations |
| `GET` | `/api/v1/students/session` | Optional server-managed session validation |
| `POST` | `/api/v1/students/logout` | Revoke an optional server-managed session |

## Verification

From `Backend`, run `npm test`. From `Frontend/frontend`, run
`npm test -- --run` and `npm run build`. Test Firebase email/password sign-in,
browser reload restoration, sign-out, inactive students, Firestore owner-only
rules, a stale profile-edit request, and startup synchronization with test
data before deploying. Student portal authentication and data reads should
continue to work when the teacher API is stopped.
