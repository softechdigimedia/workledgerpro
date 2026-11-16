import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { Prisma } from "@prisma/client";
import { authenticatedUser, cleanupTestUsers, dbDescribe, http, uniquePrefix, prisma } from "../helpers";

const prefix = uniquePrefix("finance-date");

dbDescribe("GET /api/v1/super-admin/finance date filter", () => {
  let admin: Awaited<ReturnType<typeof authenticatedUser>>;
  let subAdmin: Awaited<ReturnType<typeof authenticatedUser>>;
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;

  beforeAll(async () => {
    admin = await authenticatedUser(prefix, "SUPER_ADMIN");
    subAdmin = await authenticatedUser(prefix, "SUB_ADMIN");
    employee = await authenticatedUser(prefix, "EMPLOYEE");
    const employeeId = employee.employee!.id;
    await prisma.employee.update({ where: { id: employeeId }, data: { assignedSubAdminId: subAdmin.user.id } });

    await prisma.financeRequest.createMany({
      data: [
        {
          employeeId,
          type: "ADVANCE",
          status: "APPROVED",
          amount: new Prisma.Decimal("200.00"),
          description: "Previous day allocation",
          createdAt: new Date("2026-11-12T06:00:00.000Z"),
        },
        {
          employeeId,
          type: "ADVANCE",
          status: "APPROVED",
          amount: new Prisma.Decimal("300.00"),
          description: "Allocation approved on selected date",
          createdAt: new Date("2026-11-12T08:00:00.000Z"),
          reviewedAt: new Date("2026-11-13T04:00:00.000Z"),
          reviewedById: admin.user.id,
        },
        {
          employeeId,
          type: "EXPENSE",
          status: "APPROVED",
          amount: new Prisma.Decimal("50.00"),
          description: "Selected day expense",
          createdAt: new Date("2026-11-13T05:00:00.000Z"),
        },
        {
          employeeId,
          type: "EXPENSE",
          status: "APPROVED",
          amount: new Prisma.Decimal("20.00"),
          description: "Previous day expense",
          createdAt: new Date("2026-11-12T07:00:00.000Z"),
        },
        {
          employeeId,
          type: "ADVANCE",
          status: "APPROVED",
          amount: new Prisma.Decimal("999.00"),
          description: "Future allocation excluded",
          createdAt: new Date("2026-11-14T05:00:00.000Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    if (employee?.employee?.id) {
      await prisma.financeRequest.deleteMany({ where: { employeeId: employee.employee.id } });
    }
    await cleanupTestUsers(prefix);
  });

  it("defaults to a validated date and returns the four selected-day money metrics", async () => {
    const response = await http
      .get("/api/v1/super-admin/finance?date=2026-11-13")
      .set("Authorization", `Bearer ${admin.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.selectedDate).toBe("2026-11-13");
    expect(response.body.metrics).toMatchObject({
      dailyMoneyUsed: 50,
      remainingMoney: 430,
      totalAllocatedMoney: 300,
      previousDayMoneyAdded: 200,
    });
    expect(response.body.transactions).toHaveLength(2);
    expect(response.body.transactions.map((row: { reference: string }) => row.reference)).not.toContain("Future allocation excluded");
  });

  it("returns only the selected employee's transactions and cumulative balance to the assigned sub-admin", async () => {
    const response = await http
      .get(`/api/v1/admin/finance/${employee.employee!.id}?date=2026-11-13`)
      .set("Authorization", `Bearer ${subAdmin.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.ledger).toHaveLength(2);
    expect(response.body.balance).toBe(430);
    expect(response.body.metrics).toMatchObject({
      dailyMoneyUsed: 50,
      remainingMoney: 430,
      totalAllocatedMoney: 300,
      previousDayMoneyAdded: 200,
    });
  });

  it("rejects malformed or impossible date filters", async () => {
    const malformed = await http
      .get("/api/v1/super-admin/finance?date=13-11-2026")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(malformed.status).toBe(400);

    const impossible = await http
      .get("/api/v1/super-admin/finance?date=2026-02-30")
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(impossible.status).toBe(400);
  });
});
