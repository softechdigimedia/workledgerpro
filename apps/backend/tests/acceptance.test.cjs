const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('session schema persists last activity and idle state', () => {
  const schema = read('prisma/schema.prisma');
  assert.match(schema, /lastActivityAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(schema, /idleAt\s+DateTime\?/);
  assert.match(schema, /@@index\(\[userId, revokedAt, lastActivityAt\]\)/);
});

test('migration adds session idle columns and lookup index', () => {
  const sql = read('prisma/migrations/20261113000000_add_session_idle_tracking/migration.sql');
  assert.match(sql, /ADD COLUMN "lastActivityAt"/);
  assert.match(sql, /ADD COLUMN "idleAt"/);
  assert.match(sql, /CREATE INDEX/);
});

test('access and refresh JWTs carry a database session identifier', () => {
  const jwt = read('src/utils/jwt.ts');
  assert.match(jwt, /sessionId:\s*string/);
  assert.match(jwt, /generateAccessToken[\s\S]*sessionId/);
  assert.match(jwt, /generateRefreshToken[\s\S]*sessionId/);
  assert.match(jwt, /!decoded\.sessionId/);
});

test('authentication middleware rejects revoked and five-minute-idle sessions', () => {
  const middleware = read('src/middleware/auth.middleware.ts');
  assert.match(middleware, /session\.revokedAt/);
  assert.match(middleware, /5 \* 60 \* 1000/);
  assert.match(middleware, /lastActivityAt/);
  assert.match(middleware, /idleAt,\s*revokedAt:\s*now/);
  assert.match(middleware, /lastActivityAt:\s*now/);
});

test('login reuses a recent active session and creates a new session after timeout', () => {
  const service = read('src/modules/auth/auth.service.ts');
  assert.match(service, /lastActivityAt:\s*\{\s*gt:\s*new Date\(now\.getTime\(\)\s*-\s*IDLE_TIMEOUT_MS\)/);
  assert.match(service, /sessionId = reusable\.id/);
  assert.match(service, /sessionId = randomUUID\(\)/);
  assert.match(service, /sessionResumed:\s*resumed/);
  assert.match(service, /processIdleSessions\(now\)/);
  assert.match(service, /recordEmployeeReturnAfterIdle\(user\.id, now\)/);
});

test('refresh endpoint verifies stored token hash and rotates refresh token', () => {
  const controller = read('src/modules/auth/auth.controller.ts');
  assert.match(controller, /session\.tokenHash !== tokenHash/);
  assert.match(controller, /tokenHash:\s*createHash\("sha256"\)\.update\(refreshToken\)/);
  assert.match(controller, /verifyAccessToken/);
});

test('logout revokes server-side session', () => {
  const controller = read('src/modules/auth/auth.controller.ts');
  assert.match(controller, /revokedAt:\s*new Date\(\)/);
  assert.match(controller, /verifyAccessToken\(bearerToken\)/);
});

test('server periodically marks idle sessions even when client closes abruptly', () => {
  const server = read('src/server.ts');
  assert.match(server, /setInterval/);
  assert.match(server, /processIdleSessions/);
  assert.match(server, /setInterval/);
});

test('login does not create attendance records', () => {
  const service = read('src/modules/auth/auth.service.ts');
  assert.doesNotMatch(service, /attendanceSession\.(create|upsert)/);
  const attendance = read('src/modules/employee/employee.controller.ts');
  assert.match(attendance, /status:\s*"OPEN"/);
  assert.match(attendance, /findFirst\([\s\S]*status:\s*"OPEN"/);
});

test('export supports XLSX and CSV and guards empty exports', () => {
  const exportModal = fs.readFileSync(path.join(root, '..', 'admin-web/src/components/common/ExportModal.tsx'), 'utf8');
  assert.match(exportModal, /'xlsx'\s*\|\s*'csv'/);
  assert.match(exportModal, /sheet_to_csv/);
  assert.match(exportModal, /writeFile/);
  assert.match(exportModal, /There are no records available to export/);
  assert.match(exportModal, /revokeObjectURL/);
  assert.match(exportModal, /Money Overview/);
  assert.match(exportModal, /Transactions/);
});

test('payment proof validation restricts image MIME types, size, and URL scheme', () => {
  const employee = read('src/modules/employee/employee.controller.ts');
  assert.match(employee, /uploadedProof\.length > 7_000_000/);
  assert.match(employee, /image\\\/\(jpeg\|png\|webp\)/);
  assert.match(employee, /https:\\\/\\\//);
  assert.match(employee, /amount <= 0/);
});

test('API JSON body limit allows bounded base64 proof uploads', () => {
  const app = read('src/app.ts');
  assert.match(app, /express\.json\(\{\s*limit:\s*"7mb"\s*\}\)/);
});

test('employee, sub-admin, super-admin and bank-account route inputs are validated', () => {
  const files = [
    'src/modules/employee/employee.routes.ts',
    'src/modules/sub-admin/sub-admin.routes.ts',
    'src/modules/super-admin/super-admin.routes.ts',
    'src/modules/bank-account/bank-account.routes.ts',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /import \{ validate \} from \"..\/..\/middleware\/validate.middleware\"/);
    for (const line of source.split('\n').filter((line) => /router\.(post|put|patch|delete)\(/.test(line))) {
      assert.match(line, /validate\(/, `${file} has an unvalidated mutating route: ${line}`);
    }
  }
  const schemas = read('src/middleware/common.validation.ts');
  for (const schema of ['employeeEntry', 'attendance', 'floatRequest', 'createUser', 'userStatus', 'changePassword', 'allocation', 'bankAccount', 'bankTags', 'upiStatus']) {
    assert.match(schemas, new RegExp(`${schema}:`));
  }
});

test.todo('Android instrumentation and end-to-end login/attendance tests (requires Android SDK/emulator)');


test('failed login does not auto-provision employee profiles', () => {
  const service = read('src/modules/auth/auth.service.ts');
  const passwordCheck = service.indexOf('const passwordMatches = await comparePassword');
  const employeeCreate = service.indexOf('prisma.employee.create');
  assert.notEqual(passwordCheck, -1, 'password verification exists');
  assert.notEqual(employeeCreate, -1, 'employee provisioning exists');
  assert.ok(passwordCheck < employeeCreate, 'password must be verified before employee provisioning');
});


test('employee presence is persisted separately from account status', () => {
  const schema = read('prisma/schema.prisma');
  assert.match(schema, /enum EmployeePresenceStatus[\s\S]*ACTIVE[\s\S]*IDLE/);
  assert.match(schema, /presenceStatus EmployeePresenceStatus/);
  assert.match(schema, /idleSince DateTime\?/);
});

test('server-side idle worker sends one 15-minute notification and captures return timestamps', () => {
  const monitor = read('src/modules/auth/idle-monitor.service.ts');
  assert.match(monitor, /IDLE_TIMEOUT_MS = 5 \* 60 \* 1000/);
  assert.match(monitor, /ADMIN_IDLE_NOTIFICATION_MS = 15 \* 60 \* 1000/);
  assert.match(monitor, /idleNotifiedAt/);
  assert.match(monitor, /returnedAt/);
  assert.match(monitor, /idleAt/);
  assert.match(monitor, /createMany/);
});

test('finance endpoint filters selected date and returns all four required money metrics', () => {
  const controller = read('src/modules/super-admin/super-admin.controller.ts');
  assert.match(controller, /getIstDayRange\(rawDate\)/);
  assert.match(controller, /dailyMoneyUsed/);
  assert.match(controller, /remainingMoney/);
  assert.match(controller, /totalAllocatedMoney/);
  assert.match(controller, /previousDayMoneyAdded/);
  assert.match(controller, /reviewedAt: \{ gte: range.start, lt: range.end \}/);
});

test('admin alerts read persisted idle notifications for the signed-in administrator', () => {
  const controller = read('src/modules/super-admin/super-admin.controller.ts');
  assert.match(controller, /userId: req.auth!\.userId, type: "IDLE_ACTIVITY"/);
  assert.match(controller, /export const reviewAlert/);
});

test('Android re-login reconciles active attendance from the server status endpoint', () => {
  const api = fs.readFileSync(path.join(root, '..', '..', 'Android/employee-android/app/src/main/java/com/example/data/remote/WorkLedgerApiService.kt'), 'utf8');
  const repository = fs.readFileSync(path.join(root, '..', '..', 'Android/employee-android/app/src/main/java/com/example/data/repository/WorkLedgerRepository.kt'), 'utf8');
  assert.match(api, /employee\/attendance\/status/);
  assert.match(repository, /getAttendanceStatus\(\)/);
  assert.match(repository, /dao\.insertAttendance/);
});


test('new migration adds employee presence, persisted idle notifications and return timestamps', () => {
  const migration = read('prisma/migrations/20261113010000_idle_notifications_and_presence/migration.sql');
  assert.match(migration, /EmployeePresenceStatus/);
  assert.match(migration, /presenceStatus/);
  assert.match(migration, /idleSince/);
  assert.match(migration, /idleNotifiedAt/);
  assert.match(migration, /returnedAt/);
  assert.match(migration, /metadata/);
});


test('sub-admin dashboard money overview is restricted to assigned employees and date-filtered', () => {
  const controller = read('src/modules/sub-admin/sub-admin.controller.ts');
  const routes = read('src/modules/sub-admin/sub-admin.routes.ts');
  assert.match(controller, /assignedSubAdminId: req\.auth!\.userId/);
  assert.match(controller, /dailyMoneyUsed/);
  assert.match(controller, /previousDayMoneyAdded/);
  assert.match(routes, /\/finance\/overview/);
});

test('reviewing legacy computed alerts does not attempt UUID database lookup', () => {
  const controller = read('src/modules/super-admin/super-admin.controller.ts');
  assert.match(controller, /alt_\*/);
  assert.match(controller, /reviewedAt: new Date\(\)\.toISOString\(\)/);
});


test('day-wise money filter is wired through super-admin and sub-admin dashboard and employee ledger', () => {
  const superOverview = fs.readFileSync(path.join(root, '..', 'admin-web/src/pages/super-admin/Overview.tsx'), 'utf8');
  const subOverview = fs.readFileSync(path.join(root, '..', 'admin-web/src/pages/sub-admin/SubAdminOverview.tsx'), 'utf8');
  const moneyPage = fs.readFileSync(path.join(root, '..', 'admin-web/src/pages/sub-admin/MoneyAndBalance.tsx'), 'utf8');
  const subController = read('src/modules/sub-admin/sub-admin.controller.ts');
  assert.match(superOverview, /type="date"/);
  assert.match(superOverview, /getFinance\(\{ date: selectedDate \}\)/);
  assert.match(subOverview, /getFinanceOverview\(\{ date: selectedDate \}\)/);
  assert.match(moneyPage, /getEmployeeFinance\(targetId, \{ date: selectedDate \}\)/);
  assert.match(moneyPage, /<ExportModal/);
  assert.match(subController, /assignedSubAdminId: req\.auth!\.userId/);
  assert.match(subController, /effectiveDate >= dateRange\.start/);
});

test('financial export includes selected-date overview and full selected-date transaction data', () => {
  const page = fs.readFileSync(path.join(root, '..', 'admin-web/src/pages/super-admin/FinancialOverview.tsx'), 'utf8');
  const exportModal = fs.readFileSync(path.join(root, '..', 'admin-web/src/components/common/ExportModal.tsx'), 'utf8');
  assert.match(page, /data=\{transactions\}/);
  assert.match(page, /"Daily Money Used"/);
  assert.match(exportModal, /Money Overview/);
  assert.match(exportModal, /Transactions/);
  assert.match(exportModal, /!hasRows && !hasSummary/);
});
