import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { authHeader, authenticatedUser, cleanupTestUsers, dbDescribe, http, prisma, uniquePrefix } from "../helpers";

dbDescribe("Employee attendance lifecycle", () => {
  const prefix = uniquePrefix("attendance");
  let employee: Awaited<ReturnType<typeof authenticatedUser>>;
  beforeAll(async () => { employee = await authenticatedUser(prefix, "EMPLOYEE"); });
  afterAll(async () => cleanupTestUsers(prefix));

  it("starts the day as not checked in", async () => {
    const res = await http.get("/api/v1/employee/attendance/status").set(authHeader(employee.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.isCheckedIn ?? res.body.data?.isCheckedIn).toBe(false);
  });

  it("creates an open attendance session on check-in", async () => {
    const res = await http.post("/api/v1/employee/attendance/check-in").set(authHeader(employee.accessToken)).send({ latitude: 22.5726, longitude: 88.3639, accuracy: 12, notes: "QA check-in" });
    expect(res.status).toBe(200);
    expect(res.body.status ?? res.body.data?.status).toBe("OPEN");
    const rows = await prisma.attendanceSession.findMany({ where: { employeeId: employee.employee!.id, status: "OPEN" } });
    expect(rows).toHaveLength(1);
  });

  it("does not create a duplicate open session on repeated check-in", async () => {
    const before = await prisma.attendanceSession.count({ where: { employeeId: employee.employee!.id, status: "OPEN" } });
    const res = await http.post("/api/v1/employee/attendance/check-in").set(authHeader(employee.accessToken)).send({ notes: "repeat check-in" });
    expect(res.status).toBe(200);
    const after = await prisma.attendanceSession.count({ where: { employeeId: employee.employee!.id, status: "OPEN" } });
    expect(after).toBe(before);
  });

  it("reports the active attendance state", async () => {
    const res = await http.get("/api/v1/employee/attendance/today").set(authHeader(employee.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.isCheckedIn ?? res.body.data?.isCheckedIn).toBe(true);
  });

  it("closes the open session on check-out", async () => {
    const open = await prisma.attendanceSession.findFirst({ where: { employeeId: employee.employee!.id, status: "OPEN" } });
    const res = await http.post("/api/v1/employee/attendance/check-out").set(authHeader(employee.accessToken)).send({ latitude: 22.5727, longitude: 88.3640, notes: "QA check-out" });
    expect(res.status).toBe(200);
    const closed = await prisma.attendanceSession.findUnique({ where: { id: open!.id } });
    expect(closed?.status).toBe("COMPLETED");
    expect(closed?.checkOutAt).not.toBeNull();
  });

  it("creates a completed attendance record when check-out occurs without an open session", async () => {
    const res = await http.post("/api/v1/employee/attendance/check-out").set(authHeader(employee.accessToken)).send({ notes: "standalone checkout" });
    expect(res.status).toBe(200);
    expect(res.body.status ?? res.body.data?.status).toBe("COMPLETED");
  });

  it("validates latitude and longitude bounds", async () => {
    const res = await http.post("/api/v1/employee/attendance/check-in").set(authHeader(employee.accessToken)).send({ latitude: 120, longitude: 200 });
    expect(res.status).toBe(400);
  });

  it("returns attendance history", async () => {
    const res = await http.get("/api/v1/employee/attendance/history").set(authHeader(employee.accessToken));
    expect(res.status).toBe(200);
  });
});
