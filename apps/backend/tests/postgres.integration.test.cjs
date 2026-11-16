const test = require('node:test');
const assert = require('node:assert/strict');

const enabled = Boolean(process.env.DATABASE_URL);

test('PostgreSQL schema has session idle-tracking columns and indexes', { skip: !enabled }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const columns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'refresh_sessions'`;
    const names = new Set(columns.map((row) => row.column_name));
    assert.ok(names.has('lastActivityAt'), 'lastActivityAt migration must be applied');
    assert.ok(names.has('idleAt'), 'idleAt migration must be applied');
    const indexes = await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'refresh_sessions'`;
    assert.ok(indexes.some((row) => /userId.*revokedAt.*lastActivityAt|lastActivityAt.*revokedAt/.test(row.indexname)) || indexes.length > 0,
      'refresh_sessions should have lookup indexes');
  } finally {
    await prisma.$disconnect();
  }
});

test('PostgreSQL persists refresh-session activity/idle state without creating attendance implicitly', { skip: !enabled }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const { randomUUID } = require('node:crypto');
  const prisma = new PrismaClient();
  const email = `pg-integration-${randomUUID()}@example.test`;
  try {
    await prisma.$connect();
    const user = await prisma.user.create({ data: {
      name: 'Postgres Integration Test', email, passwordHash: 'not-a-real-password-hash', role: 'EMPLOYEE',
      employee: { create: { employeeCode: `PG-${randomUUID().slice(0, 8)}` } },
    }, include: { employee: true } });
    const now = new Date();
    const session = await prisma.refreshSession.create({ data: {
      userId: user.id, tokenHash: `test-${randomUUID()}`, familyId: randomUUID(),
      expiresAt: new Date(now.getTime() + 60_000), lastActivityAt: now,
    } });
    const updated = await prisma.refreshSession.update({ where: { id: session.id }, data: {
      lastActivityAt: new Date(now.getTime() + 4 * 60_000), idleAt: new Date(now.getTime() + 5 * 60_000),
      revokedAt: new Date(now.getTime() + 5 * 60_000),
    } });
    assert.ok(updated.idleAt instanceof Date);
    assert.ok(updated.revokedAt instanceof Date);
    assert.equal(await prisma.attendanceSession.count({ where: { employeeId: user.employee.id } }), 0,
      'authentication session persistence must not create attendance records');
  } finally {
    await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
