# WorkLedger — Mobile Application Flow & Architecture Specification

> **Document Name**: `mobile application flow.md`  
> **Target Audience**: Android Development Team, Backend Engineering, & AI Agents  
> **Platform**: Native Android (Kotlin, Jetpack Compose, Material 3, Room SQLite, Retrofit 2, OkHttp, Moshi)  
> **Currency Unit**: Indian Rupee (`₹` / INR)  

---

## 1. Executive Summary & Core Business Rules

WorkLedger Employee Mobile App is a field employee portal built for attendance tracking, daily work entry logging, and real-time float capital management.

### Mandatory System Rules
1. **Real Server Connection (No Mock Files)**: The application connects directly to live backend REST API endpoints. All fallback fake demo data and synthetic offline generators have been removed.
2. **Mandatory Post-Login Check-In & Forced Precise Location Gate**:
   - Immediately after login, the user lands directly on the `CheckInScreen`.
   - **Precise Location Permission (`ACCESS_FINE_LOCATION`) is strictly mandatory**. Coarse/approximate location or denying location permission is **NOT ALLOWED**.
   - If location permission is denied or dismissed, the app prompts the user **again and again** via a mandatory alert dialog / settings prompt every time check-in is attempted until Precise Location is granted.
   - **Strict GPS Fix & Error Lock**: If Location Services (GPS) is turned off, or if coordinates are null/zero (`0.0, 0.0`), or if a location error is present, the Check-In and Check-Out buttons are **disabled and greyed out** (`"Acquire Live GPS Fix to Check In"` / `"GPS Fix Required to Check Out"`). Punching in or out while GPS is unacquired or errored is strictly **BLOCKED**.
   - All other app modules (Home/Dashboard, Daily Entry, Entry History, Ledger, Profile, and Bottom Navigation Bar) are completely hidden, locked, and inaccessible until Precise Location permission is granted AND live GPS check-in is confirmed.
3. **Instant Auto-Settled Withdrawals (No Approval / Rejection Concept)**:
   - When an employee submits a daily work entry, funds are immediately settled and deducted from `availableBalance`.
   - Entries go directly to the admin as logged entries (`status: SUBMITTED` / `APPROVED`).
4. **Strict Mandatory Form Fields & Assigned Bank Account Dropdown**:
   - All fields on the `DailyEntryScreen` are strictly required:
     1. **Website Details**: Valid URL containing a domain (e.g., `https://portal.client.com`).
     2. **Assigned Bank Account**: Dropdown selection displaying assigned bank accounts with multiple custom tags (e.g., `HDFC Bank (Primary Salary • Travel Float) - •••• 4281`). Tapping the dropdown automatically triggers an instant server refresh (`GET /api/v1/employee/bank-accounts`) to ensure the user always sees the latest assigned accounts and multi-tag updates.
     3. **Reference ID**: Mandatory transaction reference code.
     4. **Total Amount (`₹`)**: Mandatory positive number within available balance.
     5. **UPI Payment Screenshot**: Device image upload strictly required (no default sample fallbacks).
     6. **Remaining Balance Overview**: Non-editable field calculated as `(Available Balance - Total Amount).coerceAtLeast(0.0)`.
5. **No Cancellation Option**: Submitted entries are permanent ledger records and cannot be cancelled by the employee.
6. **Automatic Logout on Check-Out**:
   - Confirming a shift check-out executes the `POST employee/attendance/punch` endpoint, then calls `POST auth/logout`, invalidates JWT tokens, clears local session storage, and routes the user back to the `LoginScreen`.
7. **Instant Session Expiration Handling (`401 Unauthorized`)**:
   - An OkHttp interceptor monitors all HTTP responses. If any API call returns `HTTP 401 Unauthorized`, session tokens are wiped immediately from `TokenStorage` and the user is redirected to the `LoginScreen` with a *"Session expired"* notification.
8. **Production-Ready Environment (Zero Mocks / Zero Auto-Fills)**:
   - All pre-filled demo account shortcuts, hardcoded test credentials, sample unsplash image generators, and synthetic GPS coordinate injection fallbacks have been completely removed.
9. **Bank Account Provisioning, Tag Reflection & Security Privacy Lock**:
   - Provisioning a bank account requires 6 fields: `Employee Account Name`, `Account Number`, `IFSC Code`, `Bank Name`, `Bank Username`, and `Bank Password`.
   - **Bi-Directional Custom Tag Reflection**: Any custom tag assigned or updated by the employee (`PUT /api/v1/employee/bank-accounts/:id/tags`) immediately synchronizes to PostgreSQL and **reflects on the Web Operations Portal for Sub-Admins and Super Admins** (`/super-admin/finance`, `/admin/money`, `/admin/employees`).
   - **Privacy Security Lock**: Raw sensitive credentials (`Bank Username` & `Bank Password`) are encrypted and transmitted directly to the server (`POST /api/v1/employee/bank-accounts`). Raw credentials are NEVER saved on the mobile device or stored in Room SQLite, and are NEVER returned or accessible to the employee. Mobile clients only receive masked representations (`•••• •••• 1234`, `••••••••`). Unmasking is strictly restricted to Admin Web Portal audits (`POST /admin/audit/unmask-bank-details`).
10. **"UPI Exhausted" Status Tagging & Disburse Team Sync**:
   - If an employee's UPI limit is exhausted or bank transfer is unavailable, the account can be tagged as `UPI Exhausted` (`PATCH /api/v1/employee/bank-accounts/:id/tag`).
   - The status tag immediately reflects across all users and admin views:
     - On **Android App**: Field 2 dropdown displays `HDFC Bank (Primary) • ⚠️ UPI Exhausted` with an amber warning badge.
     - On **Web Portal**: Sub-Admins and Super Admins see `⚠️ UPI Exhausted`, notifying the team to disburse float capital using alternative payment methods (e.g. NEFT, IMPS, RTGS, or an active secondary bank account).

---

## 2. Architecture & Tech Stack

```
[Jetpack Compose UI & ViewModels]
               │
               ▼
   [WorkLedgerRepository]
       │             │
       ▼             ▼
[Room SQLite DB]  [Retrofit API Client]
                     │
                     ▼
          [Node.js Express API]
```

- **UI System**: Jetpack Compose with Material 3 components and custom state management (`StateFlow`, `collectAsStateWithLifecycle`).
- **Networking**: Retrofit 2 + OkHttp 4 with JSON logging interceptor and Bearer Token Authorization header interceptor.
- **JSON Serialization**: Moshi with Kotlin Reflection Adapter. All DTO models use default parameter values (`= ""`, `= null`) for fail-safe parsing.
- **Local Persistence**: Room SQLite database (`AppDatabase`) caching attendance sessions, allocations, entries, and financial transaction streams.

---

## 3. Screen Navigation Lifecycle & User Flows

```
                          ┌──────────────┐
                          │ Splash Screen│
                          └──────┬───────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [Not Authenticated]                [Authenticated]
                 │                               │
                 ▼                               ▼
          ┌──────────────┐             ┌──────────────────┐
          │ Login Screen │             │ Check Attendance │
          └──────┬───────┘             └────────┬─────────┘
                 │                              │
                 ▼              ┌───────────────┴───────────────┐
         [Sign In Success]      ▼                               ▼
                 │        [No Shift]                       [On Shift]
                 │              │                               │
                 └──────────────┼───────────────────────────────┤
                                ▼                               ▼
                     ┌────────────────────┐           ┌────────────────────┐
                     │   Check-In Screen  │           │  Dashboard (Home)  │
                     └─────────┬──────────┘           └─────────┬──────────┘
                               │                                │
                       [GPS Confirmed]                          │
                               │                                │
                               └────────────────────────────────┤
                                                                │
                 ┌───────────────────┬──────────────────────────┴──────────────────────────┐
                 ▼                   ▼                                                     ▼
       ┌──────────────────┐ ┌─────────────────┐                                  ┌──────────────────┐
       │ Daily Entry Form │ │ Entry History   │                                  │ Profile & Config │
       └─────────┬────────┘ └─────────────────┘                                  └─────────┬────────┘
                 │                                                                         │
          [Submit Entry]                                                              [Click Logout]
                 │                                                                         │
                 ▼                                                                         ▼
       [Instant Balance Sync]                                                    [POST auth/logout]
                 │                                                                         │
                 └─────────────────────────────────────────────────────────────────────────┤
                                                                                           ▼
                                                                                 ┌──────────────────┐
                                                                                 │   Login Screen   │
                                                                                 └──────────────────┘
```

### Detailed Screen Descriptions

#### A. Splash Screen (`SplashScreen`)
- Displays animated WorkLedger branding logo.
- Validates token session in `TokenStorage`.
- Auto-routes to `LoginScreen` if unauthenticated, `CheckInScreen` if logged in without active shift, or `DashboardScreen` if logged in with active shift.

#### B. Login Screen (`LoginScreen`)
- Clean form requiring **Employee Email / ID** and **Password** (inputs start blank, no auto-filled demo shortcuts).
- Password visibility toggle.
- On submit: calls `POST auth/login` returning JWT access & refresh tokens and user profile details.
- Title-cases raw backend usernames (e.g. `"testing"` -> `"Testing"`).

#### C. Check-In Screen (`CheckInScreen`)
- Displays current shift status (`NOT CHECKED IN`).
- Requests location permissions (`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`).
- Runs GPS calibration meter (`High Accuracy ±Xm`).
- Tapping **Confirm GPS Check-In** calls `POST employee/attendance/punch` (with `punchType: "CHECK_IN"`, coordinates, accuracy).
- Upon success, starts shift timer and navigates to `DashboardScreen`.

#### D. Dashboard Screen (`DashboardScreen`)
- **Header**: Displays `Hello, <Formatted Name>` and `ID: <Employee Code>` (e.g., `EMP-1001`).
- **Available Balance Hero Card (`₹`)**:
  - Main balance text: `₹<Available Balance>` (e.g. `₹5,968.00`).
  - Ledger breakdown bar: `Allocated (₹) - Total Withdrawn (₹) = Available (₹)`.
- **Shift Status Chip**: Displays live running timer (`ON SHIFT (00:15:30)`).
- **Quick Action Cards**: `Check Out`, `Daily Entry`, `Ledger`.
- **Recent Daily Entries Feed**: Real-time list of submitted entries.

#### E. Daily Entry Form (`DailyEntryScreen`)
- **Balance Notice**: Displays live available withdrawal balance limit.
- **Fields**:
  1. *Website Details*: Input website URL.
  2. *Bank Account Number*: Input digits (shows masked preview `•••• •••• XXXX`).
  3. *Reference ID*: Input reference code.
  4. *Total Amount (`₹`)*: Input monetary amount.
  5. *UPI Payment Screenshot*: Attach image from gallery.
  6. *Remaining Balance Overview*: Non-editable field displaying `(Available Balance - Total Amount).coerceAtLeast(0.0)`.
- On submit: shows confirmation modal -> calls `POST employee/entries` -> updates balance -> routes to `EntryHistoryScreen`.

#### F. Entry History Screen (`EntryHistoryScreen`)
- Lists chronological history of submitted entries.
- Displays Ref ID, submission timestamp, website URL, masked bank account, Total Amount (`₹`), screenshot preview button, and green `SUBMITTED` status badge.
- Cancellations are disabled.

#### G. Financial Ledger Screen (`FinanceHistoryScreen`)
- Hero Card: Current Available Balance (`₹`).
- Formula Explanation: `Formula: Available = Total Allocated - Total Withdrawn`.
- Breakdown Cards: `Total Allocated`, `Total Withdrawn`, `Available Balance`.
- **Financial Ledger Transactions**:
  - **Admin Allocations (`CREDIT`)**: Rendered with green downward arrow icon, green background, and positive sign (**`+ ₹6,000.00`**).
  - **Employee Withdrawals (`DEBIT`)**: Rendered with upward arrow icon and minus sign (**`- ₹12.00`**).

#### H. Profile Screen (`ProfileScreen`)
- User avatar, title-cased name, employee code (`EMP-1001`), role badge.
- Backend Base URL Configuration (e.g., `http://192.168.29.104:5000/api/v1/`).
- Health Check Ping test button.
- **Logout Button**: Triggers `POST auth/logout`, clears session, and routes to `LoginScreen`.

---

## 4. Complete API Endpoints Reference Specification (`/api/v1/`)

### 4.1 Health Check
- **URL**: `GET /api/v1/health`
- **Auth**: None
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "WorkLedger API is running"
}
```

### 4.2 Employee Login
- **URL**: `POST /api/v1/auth/login`
- **Auth**: None
- **Request Payload**:
```json
{
  "identifier": "employee@enterprise.com",
  "password": "password123"
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "4caba8ec-56d7-4fc6-8826-f615eda4fc71",
    "email": "testing@gmail.com",
    "name": "testing",
    "role": "EMPLOYEE",
    "status": "ACTIVE",
    "employeeCode": "EMP-1001"
  },
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

### 4.3 Refresh Token
- **URL**: `POST /api/v1/auth/refresh`
- **Auth**: None
- **Request Payload**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 4.4 Logout
- **URL**: `POST /api/v1/auth/logout`
- **Auth**: `Bearer <accessToken>`
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 4.5 Get Current Employee Profile (`/me`)
- **URL**: `GET /api/v1/auth/me`
- **Auth**: `Bearer <accessToken>`
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "id": "4caba8ec-56d7-4fc6-8826-f615eda4fc71",
    "email": "testing@gmail.com",
    "name": "testing",
    "role": "EMPLOYEE",
    "status": "ACTIVE",
    "employeeCode": "EMP-1001"
  }
}
```

### 4.6 Get Finance Float Balance & Personal Ledger Stream
- **URL**: `GET /api/v1/employee/finance`
- **Auth**: `Bearer <accessToken>`
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "employee": {
    "id": "9a946413-312a-4774-921d-240d85a75837",
    "name": "testing_2",
    "employeeCode": "EMP-1002",
    "availableBalance": 5968,
    "totalAllocated": 6000,
    "totalApprovedWithdrawals": 32,
    "pendingWithdrawalsCount": 0,
    "isFloatAllocated": true,
    "hasActiveFloat": true,
    "bankName": "State Bank of India",
    "bankAccountNumber": "•••• •••• 4281",
    "ifscCode": "SBIN0001234"
  },
  "ledger": [
    {
      "id": "51c812e6-ce02-437a-9e13-9fc43da4756f",
      "employeeId": "9a946413-312a-4774-921d-240d85a75837",
      "type": "WITHDRAWAL_APPROVAL",
      "direction": "DEBIT",
      "sign": "-",
      "isAllocation": false,
      "source": "EMPLOYEE_WITHDRAWAL",
      "createdByName": "Self (Mobile Claim)",
      "amount": 12,
      "balanceBefore": 5980,
      "balanceAfter": 5968,
      "reference": "WD-INSTANT",
      "notes": "Instant withdrawal",
      "createdAt": "2026-11-07T21:39:21.238Z"
    },
    {
      "id": "b5dff9bb-15b5-486c-830b-f66da7583b22",
      "employeeId": "9a946413-312a-4774-921d-240d85a75837",
      "type": "ALLOCATION",
      "direction": "CREDIT",
      "sign": "+",
      "isAllocation": true,
      "source": "ADMIN_ALLOCATION",
      "createdByName": "Admin / Supervisor",
      "amount": 6000,
      "balanceBefore": 0,
      "balanceAfter": 6000,
      "reference": "FLOAT-ALLOCATION",
      "notes": "Operational float allocated by Admin",
      "createdAt": "2026-11-07T21:32:31.045Z"
    }
  ]
}
```

### 4.7 Request Float Money / Capital Top-Up from Admin
- **URL**: `POST /api/v1/employee/finance/request`
- **Auth**: `Bearer <accessToken>`
- **Request Payload**:
```json
{
  "requestedAmount": 5000,
  "reason": "Exhausted available working capital float for client disbursements"
}
```
- **Success Response (`200 OK` / `201 Created`)**:
```json
{
  "success": true,
  "message": "Float money request submitted successfully to Admin.",
  "data": {
    "requestId": "req_1001",
    "requestedAmount": 5000,
    "reason": "Exhausted available working capital float for client disbursements",
    "status": "PENDING",
    "createdAt": "2026-11-08T12:00:00.000Z"
  }
}
```

### 4.8 Submit Instant Withdrawal / Daily Work Entry
- **URL**: `POST /api/v1/employee/entries`
- **Auth**: `Bearer <accessToken>`
- **Request Payload**:
```json
{
  "withdrawalAmount": 2500,
  "amount": 2500,
  "referenceId": "UPI-9948271654",
  "websiteUrl": "https://portal.enterprise-pay.in/tx/TX-9921",
  "bankAccountNumber": "50100492817264",
  "remarks": "Field client travel float disbursement",
  "screenshotUrl": "https://s3.region.amazonaws.com/uploads/proof.jpg",
  "screenshotDataUrl": "https://s3.region.amazonaws.com/uploads/proof.jpg"
}
```
- **Success Response (`200 OK` / `201 Created`)**:
```json
{
  "success": true,
  "message": "Withdrawal settled successfully. Your balance has been updated.",
  "data": {
    "id": "ent_1731001234",
    "employeeId": "emp_101",
    "referenceId": "UPI-9948271654",
    "withdrawalAmount": 2500,
    "amount": 2500,
    "status": "APPROVED",
    "submittedAt": "2026-11-08T00:35:00.000Z",
    "remarks": "Field client travel float disbursement"
  }
}
```
- **Error Response — Insufficient Balance (`422 Unprocessable Entity`)**:
```json
{
  "success": false,
  "error": "INSUFFICIENT_FUNDS",
  "message": "Requested amount (₹2,500.00) exceeds current available balance (₹1,500.00)."
}
```

### 4.8 List Employee Submitted Work Entries
- **URL**: `GET /api/v1/employee/entries`
- **Auth**: `Bearer <accessToken>`
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "ent_1731001234",
      "referenceId": "UPI-9948271654",
      "websiteUrl": "https://portal.enterprise-pay.in/tx/TX-9921",
      "withdrawalAmount": 2500,
      "amount": 2500,
      "status": "APPROVED",
      "submittedAt": "2026-11-08T00:35:00.000Z"
    }
  ]
}
```

### 4.9 Attendance Check-In / Check-Out Punch
- **URL**: `POST /api/v1/employee/attendance/punch`
- **Auth**: `Bearer <accessToken>`
- **Request Payload**:
```json
{
  "punchType": "CHECK_IN",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "accuracyMeters": 8.5,
  "address": "Connaught Place, New Delhi, India",
  "notes": "Starting morning field shift"
}
```
*(For ending shift, pass `"punchType": "CHECK_OUT"`).*
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Check-in recorded successfully",
  "data": {
    "id": "pnch_1009",
    "punchType": "CHECK_IN",
    "time": "09:02:14",
    "date": "2026-11-08",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "address": "Connaught Place, New Delhi, India"
  }
}
```

### 4.10 Get Attendance History
- **URL**: `GET /api/v1/employee/attendance`
- **Auth**: `Bearer <accessToken>`
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "todayStatus": "PRESENT",
    "punches": [
      {
        "id": "pnch_1009",
        "punchType": "CHECK_IN",
        "time": "09:02:14",
        "date": "2026-11-08",
        "address": "Connaught Place, New Delhi, India"
      }
    ]
  }
}
```

### 4.11 Get Presigned S3 Upload URL
- **URL**: `POST /api/v1/employee/uploads/presign`
- **Auth**: `Bearer <accessToken>`
- **Request Payload**:
```json
{
  "fileName": "upi_screenshot_01.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 1048576
}
```
- **Success Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.region.amazonaws.com/bucket/key?signature=...",
    "publicUrl": "https://s3.region.amazonaws.com/bucket/key",
    "fileKey": "uploads/2026/upi_screenshot_01.jpg"
  }
}
```

---

## 5. Summary of Data Transformations & Fixes

1. **Dual Response Object Compatibility**:
   - `AuthResponse` and `FinanceResponseData` extract payload properties whether returned directly at root level or inside the `"data"` JSON wrapper.
2. **Robust Moshi Fail-Safe Parsing**:
   - All DTO properties have Kotlin default parameter values (`= ""`, `= null`). Omitted server fields never throw `Required value missing` exceptions.
3. **Credit vs. Debit Ledger Categorization**:
   - `FinanceLedgerItemDto.isCreditTransaction` identifies Admin Allocations (`isAllocation == true` or `direction == "CREDIT"`) and formats them as positive green credits (**`+ ₹6,000.00`**).
4. **UI Layout Resiliency**:
   - Bound transaction item columns with `Modifier.weight(1f)` and `TextOverflow.Ellipsis` to prevent vertical text wrapping issues on transaction amounts.
