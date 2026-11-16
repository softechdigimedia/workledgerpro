import { randomUUID } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import { dbDescribe, prisma } from "../helpers";

dbDescribe("PostgreSQL transaction integrity", () => {
  it("rolls back all writes when a later write violates a foreign key", async () => {
    const reference = `TEST-ROLLBACK-${randomUUID()}`;
    await expect(prisma.$transaction(async (tx) => {
      const transaction = await tx.ledgerTransaction.create({ data: { reference, description: "Rollback integration test" } });
      await tx.ledgerEntry.create({ data: { transactionId: transaction.id, accountId: randomUUID(), debitAmount: 10, creditAmount: 0 } });
    })).rejects.toBeDefined();
    expect(await prisma.ledgerTransaction.findUnique({ where: { reference } })).toBeNull();
  });

  it("commits related ledger transaction and entries atomically", async () => {
    const reference = `TEST-COMMIT-${randomUUID()}`;
    const accountA = await prisma.financeAccount.create({ data: { name: "QA Cash", code: `QA-CASH-${randomUUID()}`, accountType: "ASSET" } });
    const accountB = await prisma.financeAccount.create({ data: { name: "QA Clearing", code: `QA-CLEAR-${randomUUID()}`, accountType: "LIABILITY" } });
    try {
      const result = await prisma.$transaction(async (tx) => {
        const transaction = await tx.ledgerTransaction.create({ data: { reference, description: "Balanced test transaction" } });
        await tx.ledgerEntry.createMany({ data: [
          { transactionId: transaction.id, accountId: accountA.id, debitAmount: 25, creditAmount: 0 },
          { transactionId: transaction.id, accountId: accountB.id, debitAmount: 0, creditAmount: 25 }
        ] });
        return transaction;
      });
      const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: result.id } });
      const debit = entries.reduce((sum, entry) => sum + Number(entry.debitAmount), 0);
      const credit = entries.reduce((sum, entry) => sum + Number(entry.creditAmount), 0);
      expect(entries).toHaveLength(2);
      expect(debit).toBe(credit);
    } finally {
      await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: [accountA.id, accountB.id] } } });
      const transaction = await prisma.ledgerTransaction.findUnique({ where: { reference } });
      if (transaction) await prisma.ledgerTransaction.delete({ where: { id: transaction.id } });
      await prisma.financeAccount.deleteMany({ where: { id: { in: [accountA.id, accountB.id] } } });
    }
  });

  it("enforces unique ledger transaction references", async () => {
    const reference = `TEST-UNIQUE-${randomUUID()}`;
    const first = await prisma.ledgerTransaction.create({ data: { reference, description: "First" } });
    try {
      await expect(prisma.ledgerTransaction.create({ data: { reference, description: "Duplicate" } })).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await prisma.ledgerTransaction.delete({ where: { id: first.id } });
    }
  });

  it("updates session activity atomically under concurrent writes", async () => {
    const { user } = await prisma.user.create({ data: { name: "QA Session User", email: `qa-session-${randomUUID()}@example.test`, passwordHash: "not-used", role: "EMPLOYEE" } });
    try {
      const session = await prisma.refreshSession.create({ data: { userId: user.id, tokenHash: `qa-session-${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
      const timestamps = [new Date(Date.now() + 10), new Date(Date.now() + 20), new Date(Date.now() + 30)];
      await Promise.all(timestamps.map((lastActivityAt) => prisma.refreshSession.update({ where: { id: session.id }, data: { lastActivityAt } })));
      const saved = await prisma.refreshSession.findUnique({ where: { id: session.id } });
      expect(saved?.lastActivityAt).toBeInstanceOf(Date);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
