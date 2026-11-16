# WorkLedger — Enterprise Workforce & Financial Float Platform

> **Comprehensive Architecture, Deployment & Developer Onboarding Guide**  
> *Everything a new team member needs to understand, run, and develop on WorkLedger from scratch.*

---

## 1. Executive System Overview

**WorkLedger** is an enterprise-grade platform designed for managing distributed field operations, real-time GPS attendance telemetry, operational working float allocation, and instant expense settlement.

The platform consists of three core components:
1. **Backend Core Engine** (`apps/backend`): RESTful API powered by Node.js, Express, TypeScript, and Prisma ORM connecting to Supabase-hosted PostgreSQL.
2. **Admin Web Operations Portal** (`apps/admin-web`): Single Page Application built with React 19, TypeScript, Vite, and Tailwind CSS. Provides dashboards for Super Admins and Regional Sub-Admins.
3. **Employee Mobile Client** (`Android / Kotlin`): Native Android application using Retrofit and Jetpack Compose for field staff check-in/out, live float balance tracking, and instant withdrawal claims.

---

## 2. System Architecture & Component Diagram

```
┌───────────────────────┐       HTTPS / JSON       ┌───────────────────────────┐
│ Admin Web (React/Vite)│ ───────────────────────▶ │                           │
└───────────────────────┘                           │ WorkLedger Express API    │
                                                    │ /api/v1 + JWT + RBAC      │
┌───────────────────────┐       HTTPS / JSON       │                           │
│ Employee Android App  │ ───────────────────────▶ │                           │
└───────────────────────┘                           └─────────────┬─────────────┘
                                                                  │ Prisma
                                                                  ▼
                                                    ┌───────────────────────────┐
                                                    │ Supabase hosted Postgres  │
                                                    │ public schema + RLS       │
                                                    └───────────────────────────┘

Clients use the WorkLedger API, not raw Supabase PostgREST table endpoints.
```

---

## 3. Core Business Concepts & Domain Rules

### 3.1 Role-Based Access Control (RBAC)
- **`SUPER_ADMIN`**: Global enterprise master access. Can create Sub-Admins and Employees, allocate float directly to any employee, configure geofences, reset/change passwords for any user across the platform, and inspect the master audit trail.
- **`SUB_ADMIN`**: Regional hub supervisor. Can oversee workforce attendance, review field entries, and disburse working float directly to any employee. *(Note: Sub-Admins do NOT hold float wallets; they act as supervisors and cannot change other users' passwords).*
- **`EMPLOYEE`**: Mobile app user. Can perform GPS check-in/out, view available working capital, and submit instant withdrawal claims.

### 3.2 Float & Financial Architecture
1. **Float is allocated ONLY to Employees**:
   - Super Admins and Sub-Admins allocate capital float directly to an employee's wallet.
   - The transaction is recorded in `finance_requests` as `type: "ADVANCE"` and `status: "APPROVED"`.
2. **Employee Available Balance**:
   $$\text{Available Balance} = \sum(\text{Approved Allocations}) - \sum(\text{Approved Withdrawals})$$
3. **Instant Auto-Settled Withdrawals**:
   - Employees claim funds via the mobile app (`POST /api/v1/employee/entries`).
   - The backend strictly verifies that $\text{Claim Amount} \le \text{Available Balance}$.
   - If insufficient, the request is rejected with `422 INSUFFICIENT_FUNDS`.
   - If sufficient, the claim is auto-approved and deducted immediately from the employee's float.
4. **Ledger Transaction Direction**:
   - `ALLOCATION`: Credit (`+`), `isAllocation: true`, Source: `ADMIN_ALLOCATION`.
   - `WITHDRAWAL_APPROVAL`: Debit (`-`), `isAllocation: false`, Source: `EMPLOYEE_WITHDRAWAL`.

### 3.3 Attendance Telemetry
- Check-In and Check-Out are recorded per session (`attendance_sessions`).
- Each punch captures: `checkInAt`, `checkOutAt`, `latitude`, `longitude`, `accuracy`, and `notes`.
- An active shift has `status: "OPEN"`. Once checked out, `status: "COMPLETED"`.
- If an employee checks out without an existing session, an auto-closed 5-minute shift is registered to guarantee no data loss.

---

## 4. Quick Start: Running on a New Machine

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+)
- [Git](https://git-scm.com/)
- A Supabase project (hosted PostgreSQL)
- Optional for local tool inspection: [Node.js](https://nodejs.org/) v20+

### Step-by-Step Setup

1. Clone the repository and enter `WorkLedger_validation`.
2. Create a Supabase project and copy `apps/backend/.env.example` to `apps/backend/.env`.
3. Set `DATABASE_URL` to the Supabase Transaction Pooler connection string and `DIRECT_URL` to the Supabase Direct or Session Pooler connection string. Configure unique JWT secrets and the Admin Web origin.
4. From `apps/backend`, run `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`, and (after reviewing the seed file and credentials) `npm run db:seed`.
5. Start the backend with `npm run dev`, or run the backend-only Docker Compose file at `Android/employee-android/infrastructure/docker/docker-compose.yml`.
6. Configure Admin Web `VITE_API_BASE_URL` and Android `WORKLEDGER_API_BASE_URL` to the deployed WorkLedger API URL.

The production database is Supabase; there is no bundled production PostgreSQL container. The local PostgreSQL services in `docker-compose.test.yml` and GitHub Actions are isolated test databases only.

| Service | URL / configuration |
|---|---|
| Supabase Studio | Supabase Dashboard for your project |
| WorkLedger API | `https://api.example.com/api/v1` |
| Admin Web | `https://admin.example.com` (deploy separately) |
| Employee Android | Build with `WORKLEDGER_API_BASE_URL=https://api.example.com/api/v1/` |

See [SUPABASE_MIGRATION_MAP.md](./SUPABASE_MIGRATION_MAP.md) for the migration order, schema mapping, connection pooling, and client endpoint wiring.

## 5. Live Development & Hot-Reload

For local development, run the backend with `npm run dev` from `apps/backend` and the Admin Web with `npm run dev:vite` from `apps/admin-web`. Vite proxies `/api/v1` to the backend; set `E2E_API_TARGET` when the API is hosted elsewhere.

### Inspecting Container Logs
```bash
# Follow backend API logs in real time
docker logs -f workledger-backend

# Supabase database health, migrations, backups and SQL inspection are managed in Supabase Dashboard.
```

---

## 6. Mobile Application Integration (Android)

Android emulators and physical devices connect to localhost differently:

| Connection Mode | Backend Base URL | Setup Required |
| :--- | :--- | :--- |
| **Android Studio Emulator** | `http://10.0.2.2:5000/api/v1` | None (`10.0.2.2` automatically aliases host `127.0.0.1`) |
| **Physical Phone (USB Cable)** | `http://localhost:5000/api/v1` | Run `adb reverse tcp:5000 tcp:5000` |
| **Physical Phone (Wi-Fi)** | `http://<YOUR_LAN_IP>:5000/api/v1` | Phone and PC must be on the same Wi-Fi network |

### Cleartext Traffic Requirement
Android 9.0+ disables plain HTTP by default. Ensure `app/src/main/AndroidManifest.xml` contains:
```xml
<application
    android:usesCleartextTraffic="true"
    ... >
```

> **Detailed API Contract**: See [`ANDROID_API_ENDPOINTS.md`](./ANDROID_API_ENDPOINTS.md) for full Kotlin data models, request/response JSON samples, and error payloads for Retrofit.

---

## 7. Key API Endpoints Reference

### 7.1 Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/login`: Authenticate with email/employeeCode and password. Returns JWT `accessToken` & `refreshToken` in dual-compatible format (`{ ...authData, data: authData }`).
- `GET /api/v1/auth/me`: Fetch authenticated user profile.
- `POST /api/v1/auth/refresh`: Rotate and issue new access token.

### 7.2 Super Admin Operations (`/api/v1/super-admin`)
- `GET /api/v1/super-admin/dashboard`: Global turnouts, attendance counts, and financial totals.
- `GET /api/v1/super-admin/users`: List all platform user accounts.
- `POST /api/v1/super-admin/users`: Onboard new User/Employee.
- `POST /api/v1/super-admin/users/:id/change-password`: Super Admin exclusive password reset for any user with bcrypt 10-round hashing and immutable audit logging.
- `GET /api/v1/super-admin/employees`: Global employee directory with live balance and attendance.
- `GET /api/v1/super-admin/employees/:id`: 6-tab deep employee detail modal data (Overview, Profile, Attendance, Entries, Financial History, Update History).
- `POST /api/v1/super-admin/allocations`: Inject operational float directly to an employee.
- `GET /api/v1/super-admin/finance`: Master ledger stream and employee float breakdown.
- `GET /api/v1/super-admin/audit-logs`: Real-time immutable platform audit trail.
- `GET /api/v1/super-admin/alerts`: Active system anomalies and depleted float warnings.

### 7.3 Sub-Admin Operations (`/api/v1/admin`)
- `GET /api/v1/admin/dashboard`: Hub operations KPIs and active punch stream.
- `GET /api/v1/admin/employees`: Workforce directory with live balances.
- `GET /api/v1/admin/employees/:id`: Detailed 6-tab employee modal.
- `POST /api/v1/admin/allocations`: Disburse working capital to any employee.
- `GET /api/v1/admin/finance/:employeeId`: Fetch specific employee transaction ledger.

### 7.4 Employee Operations (`/api/v1/employee`)
- `GET /api/v1/employee/dashboard`: Personal balance and shift summary.
- `GET /api/v1/employee/finance`: Live available balance and categorized credit/debit ledger.
- `POST /api/v1/employee/entries`: Submit instant withdrawal claim (validated against float).
- `GET /api/v1/employee/entries`: History of submitted payout claims.
- `POST /api/v1/employee/attendance/check-in`: Record GPS check-in punch.
- `POST /api/v1/employee/attendance/check-out`: Record GPS check-out punch.
- `GET /api/v1/employee/punches`: Complete attendance shift history.

---

## 8. Database Management & Prisma CLI

Database operations use the Supabase project connection configured in `apps/backend/.env`. From `apps/backend`, run `npx prisma studio` for inspection, `npx prisma migrate dev --name <migration_name>` for development schema changes, `npx prisma migrate deploy` for deployment, and `npm run db:seed` after reviewing seed credentials. Use Supabase Studio / SQL Editor for hosted database inspection. See `SUPABASE_MIGRATION_MAP.md`.

---

## 9. Project Directory Structure

```
workledger-main/
├── README.md                      # This architecture & onboarding documentation
├── ANDROID_API_ENDPOINTS.md       # Complete mobile Retrofit/Compose contract
├── MOBILE_FLOW_SPECIFICATION.md   # Mobile UX flow & state machine spec
├── supabase/                      # Supabase CLI config and mirrored SQL migrations
├── SUPABASE_MIGRATION_MAP.md      # Supabase schema, migration and client wiring guide
│
├── apps/
│   ├── backend/                   # Node.js API Service
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Relational schema (Users, Employees, Finance, Attendance)
│   │   │   └── seed.ts            # Admin user initial seeding script
│   │   └── src/
│   │       ├── server.ts          # Entry point
│   │       ├── app.ts             # Express middleware configuration
│   │       ├── config/            # Prisma client & Environment validation
│   │       ├── middleware/        # JWT Authentication & RBAC role guards
│   │       ├── modules/
│   │       │   ├── auth/          # Authentication & token rotation
│   │       │   ├── super-admin/   # Master administration & audit logs
│   │       │   ├── sub-admin/     # Hub supervision & float allocation
│   │       │   └── employee/      # Mobile GPS attendance & personal finance
│   │       └── routes/            # Centralized API router
│   │
│   └── admin-web/                 # React 19 Admin Operations Portal
│       ├── Dockerfile
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx            # Route configuration & Auth guards
│           ├── types/             # TypeScript shared interfaces
│           ├── services/api.ts    # Axios client with interceptors
│           ├── layouts/           # Sidebar & Brand layout wrapper
│           ├── components/
│           │   └── common/        # Modals, StatCards, StatusBadges, EmployeeDetailModal
│           └── pages/
│               ├── auth/          # Login screen
│               ├── super-admin/   # Master administration screens
│               ├── sub-admin/     # Hub supervisor screens
│               └── employee/      # Web self-service screens
│
├── flow.md                        # Master Unified Platform Flow (Web Portal + Mobile App)
├── ANDROID_API_ENDPOINTS.md       # Android DTOs & Retrofit Endpoint Specs
└── docker-compose.yml             # Orchestration for DB, API, and Web
```

---

## 10. Master Architecture & Flow Specification
For full end-to-end screen navigation, state transitions, modal specifications, and API contracts for both the **Web Operations Portal** and **Android Mobile Application**, see:
- 📖 [Master Platform Flow Specification (`flow.md`)](file:///d:/Projects/worklegder-main/worklegder-main/flow.md)
- 📱 [Android API Contracts & DTOs (`ANDROID_API_ENDPOINTS.md`)](file:///d:/Projects/worklegder-main/worklegder-main/ANDROID_API_ENDPOINTS.md)

---

## 11. Common Troubleshooting & FAQs

### Port Already in Use (e.g. 5000)
If another local service (e.g., local Postgres or another web server) is occupying ports:
1. Change the backend host port mapping from `5000:5000` to `5001:5000` in the backend Compose file.
2. Update `VITE_API_BASE_URL` and Android `WORKLEDGER_API_BASE_URL` to match the new API port. Supabase is hosted and does not consume a local PostgreSQL port.

### Resetting the Database
Production data lives in Supabase and is not reset by Docker Compose. Do not reset or drop a production Supabase project to troubleshoot. Use a separate Supabase staging project or the isolated test database in `docker-compose.test.yml` for destructive migration testing.

### Frontend Shows Blank Screen or Network Error
Ensure the backend is healthy:
1. Open [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health) in your browser. It should respond with `{"success":true,"message":"WorkLedger API is running"}`.
2. Check browser console (`F12`) for any CORS or token expiration warnings.



## Supabase deployment

See [SUPABASE_MIGRATION_MAP.md](./SUPABASE_MIGRATION_MAP.md) for the Supabase database connection, migration mapping, and Admin Web / Android API configuration.
