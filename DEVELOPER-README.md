# Developer System — Smart Attendance Management System

> A developer-only layer added to the LMS backend for monitoring, tracking, and managing the system from the terminal or API.

---

## What Is This?

The **Developer System** is a restricted access layer separate from the admin panel. It provides:

- **Request tracking** — log every API call (method, URL, status, identity, browser, OS, device, IP, duration)
- **System monitoring** — view DB status, memory, uptime, student/admin counts
- **CLI tools** — manage everything from your terminal without touching the frontend
- **File persistence** — logs are saved as JSON files in the `logs/` directory

---

## Roles

The system has **3 roles**:

| Role | Access | Description |
|------|--------|-------------|
| `admin` | Admin dashboard | Can manage students, attendance, view reports |
| `superadmin` | Admin dashboard + admin management | Can create/delete other admins |
| `developer` | CLI + API endpoints only | Cannot access admin dashboard. Monitors the system. |

> **Important:** `isAdmin` middleware **blocks** the `developer` role. Developers cannot log into the admin panel. Developers have their own separate routes.

---

## Project Structure

```
Backend/
├── models/
│   └── admin.model.js          # Role enum: ['admin', 'superadmin', 'developer']
├── middleware/
│   ├── authMiddleware.js        # protect, restrictTo, verifyStudent, isAdmin, isDeveloper
│   ├── requestLogger.js         # Opt-in tracking middleware (OFF by default)
│   └── validationMiddleware.js  # Validates 'developer' role in admin creation
├── routes/
│   ├── developer.routes.js      # All developer API endpoints
│   └── admin.routes.js          # Activity routes removed (developer handles this)
├── logs/                        # Auto-created. Stores tracking config + daily logs
│   ├── tracking.json            # { enabled: true/false, updatedAt: "..." }
│   ├── requests-2026-07-17.json # Today's logs
│   └── requests-2026-07-16.json # Yesterday's logs
├── server.js                    # Wires developer routes, inits logger on boot
├── dev-cli.js                   # CLI tool for developers
└── change-role.js               # Script to change any admin's role via email+password
```

---

## How Tracking Works

### Design Philosophy: Opt-In (OFF by default)

The request logger is **disabled by default**. A developer must explicitly enable it. This means:

- No performance overhead in production
- No disk writes unless you want them
- No privacy concerns until you consciously turn it on

### What Gets Logged

Every API request (except `/api/developer/*`) is captured with:

```json
{
  "id": 1,
  "timestamp": "2026-07-17T10:30:00.000Z",
  "method": "POST",
  "url": "/api/admin/students",
  "statusCode": 201,
  "duration": "45ms",
  "durationMs": 45,
  "identity": {
    "type": "admin",
    "name": "John Doe",
    "email": "john@dp.lk",
    "id": "6650abc123...",
    "role": "admin"
  },
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0 ...",
  "browser": "Chrome 126.0",
  "os": "Windows 10/11",
  "device": "Desktop",
  "contentType": "application/json",
  "referer": "https://dp-qr.netlify.app",
  "origin": "https://dp-qr.netlify.app"
}
```

### Identity Detection

The logger extracts the user from the JWT token:

- **Admin/Superadmin/Developer** → decoded from `Authorization: Bearer <token>`
- **Student** → decoded from student JWT
- **Anonymous** → no token provided

### File Persistence

| File | Content |
|------|---------|
| `logs/tracking.json` | Config: `{ enabled: true/false }` |
| `logs/requests-YYYY-MM-DD.json` | All logs for that date |

- Logs flush to disk every **10 seconds**
- Max **5,000 logs** in memory (circular buffer — oldest removed when full)
- On server restart, existing logs for today are loaded back into memory
- On disable, remaining logs are flushed to disk

---

## API Endpoints

All developer endpoints are under `/api/developer`.

### Authentication

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/developer/login` | `{ email, password }` | Login as developer (checks `role === 'developer'`) |

Returns: `{ token, developer: { _id, name, email, role } }`

### Tracking Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/developer/tracking/status` | Check if tracking is enabled |
| POST | `/api/developer/tracking/enable` | Turn on request logging |
| POST | `/api/developer/tracking/disable` | Turn off + flush logs to disk |

### Logs

| Method | Endpoint | Query Params | Description |
|--------|----------|-------------|-------------|
| GET | `/api/developer/logs` | `limit`, `offset`, `method`, `statusCode`, `identityType`, `search`, `today` | Get filtered logs |
| GET | `/api/developer/logs/stats` | — | Get summary statistics |
| DELETE | `/api/developer/logs` | — | Clear all in-memory logs |

### Developer Management

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/developer/developers` | — | List all developer accounts |
| POST | `/api/developer/create` | `{ name, email, password }` | Create a new developer account |
| DELETE | `/api/developer/developers/:id` | — | Deactivate a developer account |
| POST | `/api/developer/developers/:id/reactivate` | — | Reactivate a developer account |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/developer/system` | Server info: uptime, memory, DB, counts, tracking status |

---

## CLI Tool (`dev-cli.js`)

A standalone Node.js script for terminal use. No frontend required.

### Setup

```bash
cd Backend
node dev-cli.js
```

### Commands

```bash
# Login first (required for all other commands)
node dev-cli.js login

# Tracking
node dev-cli.js tracking status
node dev-cli.js tracking enable
node dev-cli.js tracking disable

# Logs (with filters)
node dev-cli.js logs
node dev-cli.js logs --limit 50
node dev-cli.js logs --method POST
node dev-cli.js logs --status 404
node dev-cli.js logs --identity student
node dev-cli.js logs --search "john@dp.lk"
node dev-cli.js logs --today

# Statistics
node dev-cli.js stats

# System info
node dev-cli.js system

# Developer management
node dev-cli.js create
node dev-cli.js developers
node dev-cli.js deactivate <developer-id>
node dev-cli.js reactivate <developer-id>

# Clear logs
node dev-cli.js clear
```

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:5001` | Backend URL |

---

## Role Management

### Changing Admin Roles (`change-role.js`)

A standalone script to change any admin's role using their email and password.

```bash
cd Backend
node change-role.js
```

The script will:
1. Ask for the admin's email
2. Ask for their password (to verify identity)
3. Ask for the new role (`admin`, `superadmin`, `developer`)
4. Update the role in MongoDB

### Creating a Developer Account

**Method 1: Standalone script (no credentials needed)**

```bash
cd Backend
node create-developer.js
```

This script connects directly to MongoDB and creates a developer account. No login required. Use this for bootstrapping the first developer.

**Method 2: From the terminal (requires existing developer login)**

```bash
cd Backend
node dev-cli.js login
node dev-cli.js create
```

**Method 3: From API (requires existing developer login)**

```bash
POST /api/developer/create
{
  "name": "John Dev",
  "email": "dev@dp.lk",
  "password": "DevPass123"
}
```

**Method 4: Via MongoDB directly**

Insert into the `admins` collection with `role: "developer"`.

### Creating a Superadmin

Same as above but set role to `superadmin`.

---

## Middleware

### `isAdmin`
- Blocks `developer` role
- Only allows `admin` and `superadmin`
- Used on all `/api/admin/*` routes

### `isDeveloper`
- Only allows `developer` role
- Used on developer-specific routes

### `protect`
- Generic JWT verification
- Used by `isAdmin` and `verifyStudent`

### `requestLogger`
- Attached as Express middleware in `server.js`
- Skips if tracking is disabled
- Skips `/api/developer/*` routes (avoids recursive logging)
- Hooks into `res.end()` to capture response data

---

## Server Integration

In `server.js`:

```javascript
import { requestLogger, initRequestLogger, shutdownRequestLogger } from './middleware/requestLogger.js';
import developerRoutes from './routes/developer.routes.js';

// Request logger middleware (runs on every request)
app.use(requestLogger);

// Developer routes
app.use('/api/developer', developerRoutes);

// On boot — load tracking config from disk
initRequestLogger();

// On shutdown — flush logs to disk
shutdownRequestLogger();
```

---

## Security Notes

- Developer routes have their **own JWT verification** (`verifyDeveloper`) — not using `protect` or `isAdmin`
- `isAdmin` explicitly **blocks** developers from admin endpoints
- The `role` field in `admin.model.js` only accepts `['admin', 'superadmin', 'developer']`
- `validateAdminInput` middleware validates the `developer` role during admin creation
- Tracking is opt-in — no data is collected unless a developer explicitly enables it
- Log files are stored locally in `logs/` — never sent to external services

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "This account is not a developer account" | The email belongs to an admin/superadmin. Use `change-role.js` to change the role. |
| "Tracking is not enabled" | Run `POST /api/developer/tracking/enable` or `node dev-cli.js tracking enable` |
| Logs file not created | Tracking must be enabled first. Logs only persist when tracking is ON. |
| "Account is locked" | Too many failed login attempts. Wait 30 minutes or manually reset `failedLoginAttempts` in MongoDB. |
| Port already in use | Another instance of the server is running. Kill it or change the port. |

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **Logs:** In-memory buffer + JSON file persistence
- **CLI:** readline (built-in Node.js)
