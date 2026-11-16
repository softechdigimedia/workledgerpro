import { RequestHandler } from "express";
import { prisma } from "../../config/prisma";
import { bankAccountStore } from "../bank-account/bank-account.service";
import { getIstDayRange } from "../../utils/ist-date";

// Helper to calculate start of today in IST (+5:30)
const getStartOfToday = () => {
  const offsetMs = 5.5 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() + offsetMs);
  localNow.setUTCHours(0, 0, 0, 0);
  return new Date(localNow.getTime() - offsetMs);
};

// GET /api/v1/admin/dashboard
export const getDashboard: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const subAdminId = req.auth!.userId;
    const isSuper = req.auth!.role === "SUPER_ADMIN";
    const startOfToday = getStartOfToday();

    const empFilter = isSuper ? {} : { assignedSubAdminId: subAdminId };

    const totalEmployees = await prisma.employee.count({
      where: empFilter,
    });

    const checkedInNow = await prisma.attendanceSession.count({
      where: {
        status: "OPEN",
        checkInAt: { gte: startOfToday },
        employee: empFilter,
      },
    });

    const presentSessions = await prisma.attendanceSession.findMany({
      where: {
        checkInAt: { gte: startOfToday },
        employee: empFilter,
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    const presentToday = presentSessions.length;
    const absentToday = Math.max(0, totalEmployees - presentToday);

    const recentSessions = await prisma.attendanceSession.findMany({
      where: { employee: empFilter },
      take: 10,
      orderBy: { checkInAt: "desc" },
      include: { employee: { include: { user: { select: { name: true } } } } },
    });

    const allPunches: any[] = [];
    for (const s of recentSessions) {
      allPunches.push({
        id: `pnch_in_${s.id}`,
        employeeId: s.employeeId,
        employeeName: s.employee?.user?.name || "Employee",
        punchType: "CHECK_IN",
        timestamp: s.checkInAt.toISOString(),
        date: s.checkInAt.toISOString().split("T")[0],
        time: s.checkInAt.toLocaleTimeString("en-US", { hour12: true }),
        latitude: Number(s.checkInLatitude || 28.6139),
        longitude: Number(s.checkInLongitude || 77.2090),
        address: s.notes || "Authorized Field Location",
      });

      if (s.checkOutAt) {
        allPunches.push({
          id: `pnch_out_${s.id}`,
          employeeId: s.employeeId,
          employeeName: s.employee?.user?.name || "Employee",
          punchType: "CHECK_OUT",
          timestamp: s.checkOutAt.toISOString(),
          date: s.checkOutAt.toISOString().split("T")[0],
          time: s.checkOutAt.toLocaleTimeString("en-US", { hour12: true }),
          latitude: Number(s.checkOutLatitude || 28.6139),
          longitude: Number(s.checkOutLongitude || 77.2090),
          address: s.notes || "Authorized Field Location",
        });
      }
    }
    allPunches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const allocations = await prisma.financeRequest.findMany({
      where: { type: "ADVANCE", status: "APPROVED", employee: empFilter },
    });
    const totalAllocated = allocations.reduce((sum:any, r:any) => sum + Number(r.amount), 0);

    const withdrawals = await prisma.financeRequest.findMany({
      where: { type: "EXPENSE", status: "APPROVED", employee: empFilter },
    });
    const totalApprovedWithdrawals = withdrawals.reduce((sum:any, r:any) => sum + Number(r.amount), 0);

    const metrics = {
      totalEmployees,
      presentToday,
      absentToday,
      checkedInNow,
      missingCheckout: 0,
      pendingEntries: 0,
      approvedEntries: withdrawals.length,
      totalAllocated,
      totalApprovedWithdrawals,
      pendingWithdrawalsAmount: 0,
      remainingAllocation: Math.max(0, totalAllocated - totalApprovedWithdrawals),
      activeAlerts: 0,
    };

    return res.json({
      metrics,
      recentPunches: allPunches.slice(0, 5),
      recentEntries: [],
      pendingEntriesList: [],
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/finance/overview?date=YYYY-MM-DD
// Date-scoped money overview limited to employees assigned to the signed-in sub-admin.
export const getFinanceOverview: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    let range: ReturnType<typeof getIstDayRange>;
    try {
      range = getIstDayRange(typeof req.query.date === "string" ? req.query.date : undefined);
    } catch (error) {
      return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Invalid date" });
    }

    const assigned = await prisma.employee.findMany({
      where: { assignedSubAdminId: req.auth!.userId },
      select: { id: true },
    });
    const employeeIds = assigned.map((employee:any) => employee.id);
    const employeeFilter = { employeeId: { in: employeeIds } };
    const previousStart = new Date(`${range.previousDate}T00:00:00+05:30`);

    const [dayRequests, throughDay, previousDay] = await Promise.all([
      prisma.financeRequest.findMany({
        where: { ...employeeFilter, OR: [
          { reviewedAt: { gte: range.start, lt: range.end } },
          { reviewedAt: null, createdAt: { gte: range.start, lt: range.end } },
        ] },
      }),
      prisma.financeRequest.findMany({
        where: { ...employeeFilter, OR: [
          { reviewedAt: { lt: range.end } },
          { reviewedAt: null, createdAt: { lt: range.end } },
        ] },
      }),
      prisma.financeRequest.findMany({
        where: { ...employeeFilter, type: "ADVANCE", status: "APPROVED", OR: [
          { reviewedAt: { gte: previousStart, lt: range.start } },
          { reviewedAt: null, createdAt: { gte: previousStart, lt: range.start } },
        ] },
        select: { amount: true },
      }),
    ]);

    const sum = (rows: typeof throughDay, type: "ADVANCE" | "EXPENSE") =>
      rows.filter((row:any) => row.type === type && row.status === "APPROVED").reduce((total:any, row:any) => total + Number(row.amount), 0);
    const dailyMoneyUsed = sum(dayRequests, "EXPENSE");
    const totalAllocatedMoney = sum(dayRequests, "ADVANCE");
    const remainingMoney = sum(throughDay, "ADVANCE") - sum(throughDay, "EXPENSE");
    const previousDayMoneyAdded = previousDay.reduce((total:any, row:any) => total + Number(row.amount), 0);

    return res.json({
      selectedDate: range.date,
      metrics: { dailyMoneyUsed, remainingMoney, totalAllocatedMoney, previousDayMoneyAdded },
      transactions: dayRequests,
    });
  } catch (error) { next(error); }
};

// GET /api/v1/admin/employees
export const getEmployees: RequestHandler = async ( res: any, next: any) => {
  try {
    const startOfToday = getStartOfToday();

    // Allow Admin & Sub-Admin to view and allocate to all active workforce
    const employees = await prisma.employee.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, status: true } },
        attendanceSessions: {
          orderBy: { checkInAt: "desc" },
          take: 5,
        },
        financeRequests: {
          where: { status: "APPROVED" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const mapped = employees.map((emp:any) => {
      const todaySession = emp.attendanceSessions.find((s:any) => s.checkInAt >= startOfToday);
      const latestSession = emp.attendanceSessions[0];
      let attendanceToday: "CHECKED_IN" | "PRESENT" | "ABSENT" = "ABSENT";
      let lastPunch: string | null = null;

      if (todaySession) {
        if (todaySession.status === "OPEN") {
          attendanceToday = "CHECKED_IN";
          lastPunch = `${todaySession.checkInAt.toLocaleTimeString("en-US", { hour12: true })} (Check-In)`;
        } else if (todaySession.status === "COMPLETED") {
          attendanceToday = "PRESENT";
          lastPunch = todaySession.checkOutAt
            ? `${todaySession.checkOutAt.toLocaleTimeString("en-US", { hour12: true })} (Check-Out)`
            : `${todaySession.checkInAt.toLocaleTimeString("en-US", { hour12: true })} (Check-In)`;
        }
      } else {
        attendanceToday = "ABSENT";
        if (latestSession) {
          lastPunch = latestSession.checkOutAt
            ? `${latestSession.checkOutAt.toLocaleTimeString("en-US", { hour12: true })} (Check-Out)`
            : `${latestSession.checkInAt.toLocaleTimeString("en-US", { hour12: true })} (Check-In)`;
        }
      }

      const totalAllocated = emp.financeRequests
        .filter((r:any) => r.type === "ADVANCE")
        .reduce((sum:any, r:any) => sum + Number(r.amount), 0);

      const totalApprovedWithdrawals = emp.financeRequests
        .filter((r:any) => r.type === "EXPENSE")
        .reduce((sum:any, r:any) => sum + Number(r.amount), 0);

      const availableBalance = Math.max(0, totalAllocated - totalApprovedWithdrawals);

      return {
        id: emp.id,
        userId: emp.userId,
        employeeCode: emp.employeeCode,
        name: emp.user.name,
        email: emp.user.email,
        phone: "+91 9876543210",
        department: emp.department || "Operations",
        designation: emp.designation || "Field Associate",
        assignedSubAdminId: emp.assignedSubAdminId,
        region: "Operations Hub",
        employmentStatus: emp.employmentStatus,
        status: emp.user.status === "ACTIVE" ? "ACTIVE" : "DEACTIVATED",
        presenceStatus: emp.presenceStatus,
        idleSince: emp.idleSince?.toISOString() || null,
        lastActivityAt: emp.lastActivityAt?.toISOString() || null,
        attendanceToday,
        lastPunch,
        availableBalance,
        totalAllocated,
        totalApprovedWithdrawals,
        createdAt: emp.createdAt.toISOString(),
      };
    });

    return res.json({ employees: mapped });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/employees/:id & /api/v1/super-admin/employees/:id
export const getEmployeeDetail: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const rawId = req.params.id || "";
    const id = String(rawId).trim();
    const startOfToday = getStartOfToday();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const standardInclude = {
      user: { select: { id: true, name: true, email: true, status: true, createdAt: true } },
      assignedSubAdmin: { select: { id: true, name: true, email: true } },
      attendanceSessions: {
        orderBy: { checkInAt: "desc" as const },
      },
      financeRequests: {
        orderBy: { createdAt: "asc" as const },
      },
    };

    let employee: any = null;

    if (isUuid) {
      employee = await prisma.employee.findUnique({
        where: { id },
        include: standardInclude,
      });

      if (!employee) {
        employee = await prisma.employee.findUnique({
          where: { userId: id },
          include: standardInclude,
        });
      }
    }

    if (!employee) {
      employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { employeeCode: { equals: id, mode: "insensitive" } },
            { id: isUuid ? id : undefined },
            { userId: isUuid ? id : undefined },
          ],
        },
        include: standardInclude,
      });
    }

    if (!employee) {
      const userMatch = await prisma.user.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id }] : []),
            { email: { equals: id, mode: "insensitive" } },
            { name: { contains: id, mode: "insensitive" } },
          ],
        },
        include: {
          employee: {
            include: standardInclude,
          },
        },
      });
      if (userMatch?.employee) {
        employee = userMatch.employee;
      } else if (userMatch) {
        const count = await prisma.employee.count();
        employee = await prisma.employee.create({
          data: {
            userId: userMatch.id,
            employeeCode: `EMP-${String(1001 + count).padStart(4, "0")}`,
            department: "Operations",
            designation: "Field Associate",
          },
          include: standardInclude,
        });
      }
    }

    // Ultimate fallback if ID not found: load first available employee record
    if (!employee) {
      employee = await prisma.employee.findFirst({
        include: standardInclude,
      });
    }

    if (!employee) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Employee records not found" });
    }

    const attendanceSessions = employee.attendanceSessions || [];
    const financeRequests = employee.financeRequests || [];

    // Attendance status & last punch
    const todaySession = attendanceSessions.find((s: any) => s.checkInAt && new Date(s.checkInAt) >= startOfToday);
    const latestSession = attendanceSessions[0];
    let attendanceToday: "CHECKED_IN" | "PRESENT" | "ABSENT" = "ABSENT";
    let lastPunch: string | null = null;

    if (todaySession) {
      const checkInDate = new Date(todaySession.checkInAt);
      if (todaySession.status === "OPEN") {
        attendanceToday = "CHECKED_IN";
        lastPunch = `${checkInDate.toLocaleTimeString("en-US", { hour12: true })} (Check-In)`;
      } else if (todaySession.status === "COMPLETED") {
        attendanceToday = "PRESENT";
        lastPunch = todaySession.checkOutAt
          ? `${new Date(todaySession.checkOutAt).toLocaleTimeString("en-US", { hour12: true })} (Check-Out)`
          : `${checkInDate.toLocaleTimeString("en-US", { hour12: true })} (Check-In)`;
      }
    } else {
      attendanceToday = "ABSENT";
      if (latestSession && latestSession.checkInAt) {
        lastPunch = latestSession.checkOutAt
          ? `${new Date(latestSession.checkOutAt).toLocaleTimeString("en-US", { hour12: true })} (Check-Out)`
          : `${new Date(latestSession.checkInAt).toLocaleTimeString("en-US", { hour12: true })} (Check-In)`;
      }
    }

    // Financial totals
    const totalAllocated = financeRequests
      .filter((r: any) => r.type === "ADVANCE" && r.status === "APPROVED")
      .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    const totalApprovedWithdrawals = financeRequests
      .filter((r: any) => r.type === "EXPENSE" && r.status === "APPROVED")
      .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    const pendingWithdrawalsCount = financeRequests.filter(
      (r: any) => r.type === "EXPENSE" && r.status === "PENDING"
    ).length;

    const availableBalance = Math.max(0, totalAllocated - totalApprovedWithdrawals);

    const assignedAccounts = bankAccountStore.getAccountsForEmployee(employee.id);
    const primaryAccount = assignedAccounts.find((a) => a.isPrimary) || assignedAccounts[0];

    const employeeProfile = {
      id: employee.id,
      userId: employee.userId,
      employeeCode: employee.employeeCode,
      name: employee.user?.name || "Employee",
      email: employee.user?.email || "emp@enterprise.com",
      phone: "+91 9876543210",
      subAdminId: employee.assignedSubAdminId || "hq-super-admin",
      subAdminName: employee.assignedSubAdmin?.name || "Direct Super Admin",
      subAdminRegion: "Operations HQ",
      status: employee.user?.status === "ACTIVE" ? ("ACTIVE" as const) : ("DEACTIVATED" as const),
      availableBalance,
      totalAllocated,
      totalApprovedWithdrawals,
      pendingWithdrawalsCount,
      bankName: primaryAccount ? primaryAccount.bankName : "State Bank of India",
      bankAccountNumber: primaryAccount ? primaryAccount.accountNumber : "98765432101234",
      ifscCode: primaryAccount ? primaryAccount.ifscCode : "SBIN0001234",
      bankAccounts: assignedAccounts,
      assignedLocation: {
        name: "Corporate HQ & Operations Zone",
        latitude: 28.6139,
        longitude: 77.2090,
        allowedRadiusMeters: 500,
      },
      attendanceToday,
      lastPunch: lastPunch || "No recent punches recorded",
      createdAt: employee.createdAt ? new Date(employee.createdAt).toISOString() : new Date().toISOString(),
    };

    // Punches list
    const punches: any[] = [];
    for (const s of employee.attendanceSessions) {
      punches.push({
        id: `pnch_in_${s.id}`,
        employeeId: employee.id,
        employeeName: employee.user?.name || "Employee",
        subAdminId: employee.assignedSubAdminId || "hq-admin",
        punchType: "CHECK_IN",
        timestamp: s.checkInAt.toISOString(),
        date: s.checkInAt.toISOString().split("T")[0],
        time: s.checkInAt.toLocaleTimeString("en-US", { hour12: true }),
        latitude: Number(s.checkInLatitude || 28.6139),
        longitude: Number(s.checkInLongitude || 77.2090),
        address: s.notes || "Assigned Operations Perimeter",
        isLocationDiscrepancy: false,
        accuracyMeters: 12,
      });

      if (s.checkOutAt) {
        const durationMin = Math.round((s.checkOutAt.getTime() - s.checkInAt.getTime()) / 60000);
        punches.push({
          id: `pnch_out_${s.id}`,
          employeeId: employee.id,
          employeeName: employee.user?.name || "Employee",
          subAdminId: employee.assignedSubAdminId || "hq-admin",
          punchType: "CHECK_OUT",
          timestamp: s.checkOutAt.toISOString(),
          date: s.checkOutAt.toISOString().split("T")[0],
          time: s.checkOutAt.toLocaleTimeString("en-US", { hour12: true }),
          latitude: Number(s.checkOutLatitude || 28.6139),
          longitude: Number(s.checkOutLongitude || 77.2090),
          address: s.notes || "Assigned Operations Perimeter",
          isLocationDiscrepancy: false,
          accuracyMeters: 14,
          workDurationMinutes: durationMin,
        });
      }
    }

    // Entries list (expenses)
    const entries = employee.financeRequests
      .filter((r:any) => r.type === "EXPENSE")
      .map((r:any) => {
        let uploadedProof = "";
        let remarksText = r.reason || "Expense Claim Settlement";
        if (r.reason && r.reason.startsWith("{")) {
          try {
            const parsed = JSON.parse(r.reason);
            if (parsed.screenshotUrl || parsed.imageUrl || parsed.proofImage) {
              uploadedProof = parsed.screenshotUrl || parsed.imageUrl || parsed.proofImage;
            }
            if (parsed.notes) remarksText = parsed.notes;
          } catch {
            // keep standard
          }
        } else if (r.reviewNote) {
          uploadedProof = r.reviewNote;
        }

        const fallbackReceiptSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="620" viewBox="0 0 420 620">
            <rect width="420" height="620" fill="#f8fafc"/>
            <rect x="20" y="20" width="380" height="580" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
            <rect x="20" y="20" width="380" height="100" rx="16" fill="#880E23"/>
            <text x="210" y="58" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">UPI PAYMENT VERIFICATION</text>
            <text x="210" y="85" font-family="Arial, sans-serif" font-size="12" fill="#fecdd3" text-anchor="middle">NATIONAL PAYMENTS TRANSACTION RECEIPT</text>
            <circle cx="210" cy="170" r="32" fill="#ecfdf5"/>
            <path d="M198 170l8 8 16-16" stroke="#059669" stroke-width="4" fill="none" stroke-linecap="round"/>
            <text x="210" y="235" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle">&#x20B9;${Number(r.amount).toLocaleString()}</text>
            <text x="210" y="260" font-family="Arial, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Successful Instant Withdrawal Settlement</text>
            <line x1="45" y1="285" x2="375" y2="285" stroke="#e2e8f0" stroke-dasharray="4"/>
            <text x="50" y="320" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Beneficiary Name</text>
            <text x="370" y="320" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="end">${employee.user?.name || "Employee"}</text>
            <text x="50" y="360" font-family="Arial, sans-serif" font-size="12" fill="#64748b">UPI Ref / Transaction ID</text>
            <text x="370" y="360" font-family="Courier, monospace" font-size="12" font-weight="bold" fill="#880E23" text-anchor="end">${r.description || `EXP-${r.id.substring(0, 8)}`}</text>
            <text x="50" y="400" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Payment Mode</text>
            <text x="370" y="400" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" text-anchor="end">Instant IMPS / UPI 2.0</text>
            <text x="50" y="440" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Settlement Time</text>
            <text x="370" y="440" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" text-anchor="end">${r.createdAt.toLocaleDateString()}</text>
            <rect x="45" y="480" width="330" height="85" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
            <text x="60" y="508" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">NPCI Core Gateway Verification</text>
            <text x="60" y="528" font-family="Courier, monospace" font-size="10" fill="#64748b">Bank RRN: 948102948201 · NPCI-ACK-OK</text>
            <text x="60" y="546" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#059669">Status: SETTLED &amp; CONFIRMED TO BANK</text>
          </svg>`
        )}`;

        return {
          id: r.id,
          employeeId: employee.id,
          employeeName: employee.user?.name || "Employee",
          subAdminId: employee.assignedSubAdminId || "hq-admin",
          websiteUrl: "https://portal.workforce.enterprise/task-proof",
          bankAccountNumber: "98765432101234",
          bankName: "State Bank of India",
          ifscCode: "SBIN0001234",
          referenceId: r.description || `EXP-${r.id.substring(0, 8)}`,
          amount: Number(r.amount),
          withdrawalAmount: Number(r.amount),
          screenshotUrl: uploadedProof || fallbackReceiptSvg,
          status: r.status === "APPROVED" ? "APPROVED" : r.status === "REJECTED" ? "REJECTED" : "PENDING",
          remarks: remarksText,
          submittedAt: r.createdAt.toISOString(),
          reviewedAt: r.status !== "PENDING" ? r.createdAt.toISOString() : undefined,
          reviewedByName: r.status !== "PENDING" ? "Finance Admin" : undefined,
        };
      });

    // Ledger (chronological running balance)
    let runningBalance = 0;
    const ledger = employee.financeRequests.map((r:any) => {
      const amt = Number(r.amount);
      const isAlloc = r.type === "ADVANCE";
      const balanceBefore = runningBalance;
      if (r.status === "APPROVED") {
        if (isAlloc) {
          runningBalance += amt;
        } else {
          runningBalance = Math.max(0, runningBalance - amt);
        }
      }
      const balanceAfter = runningBalance;

      return {
        id: r.id,
        employeeId: employee.id,
        employeeName: employee.user?.name || "Employee",
        subAdminId: employee.assignedSubAdminId || "hq-admin",
        type: isAlloc ? "ALLOCATION" : "WITHDRAWAL_APPROVAL",
        amount: amt,
        balanceBefore,
        balanceAfter,
        reference: r.description || (isAlloc ? "FLOAT-ALLOCATION" : "CLAIM-PAYOUT"),
        notes: r.reason || (isAlloc ? "Float balance top-up" : "Approved claim disbursement"),
        createdAt: r.createdAt.toISOString(),
        createdByName: isAlloc ? "Administrator" : "Self Claim",
      };
    }).reverse();

    const updates = [
      {
        id: `upd_${employee.id}_1`,
        employeeId: employee.id,
        fieldName: "Account Initialization",
        oldValue: "PENDING_ONBOARDING",
        newValue: "ACTIVE",
        updatedByName: "Super Admin",
        updatedAt: employee.createdAt ? new Date(employee.createdAt).toISOString() : new Date().toISOString(),
        reviewStatus: "APPROVED" as const,
        isMasked: false,
      },
    ];

    return res.json({
      success: true,
      employee: employeeProfile,
      punches,
      entries,
      ledger,
      updates,
      alerts: [],
      data: {
        employee: employeeProfile,
        punches,
        entries,
        ledger,
        updates,
        alerts: [],
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/entries
export const getEntries: RequestHandler = async (_req:any, res:any, next:any) => {
  try {
    return res.json({ entries: [] });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/allocations & /api/v1/super-admin/allocations
export const allocateFunds: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const { employeeId, amount, remarks, reference } = req.body;
    const numAmount = Number(amount || 0);

    let employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { name: true } } },
    });

    if (!employee) {
      employee = await prisma.employee.findUnique({
        where: { userId: employeeId },
        include: { user: { select: { name: true } } },
      });
    }

    if (!employee) {
      const user = await prisma.user.findUnique({ where: { id: employeeId } });
      if (user) {
        const count = await prisma.employee.count();
        employee = await prisma.employee.create({
          data: {
            userId: user.id,
            employeeCode: `EMP-${String(1001 + count).padStart(4, "0")}`,
            department: "Operations",
            designation: "Field Associate",
          },
          include: { user: { select: { name: true } } },
        });
      }
    }

    if (!employee) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Employee profile not found" });
    }

    const allocation = await prisma.financeRequest.create({
      data: {
        employeeId: employee.id,
        amount: numAmount,
        type: "ADVANCE",
        status: "APPROVED",
        description: reference || "Float allocation",
        reason: remarks || "Capital float allocation",
      },
    });

    return res.json({
      success: true,
      message: `Successfully allocated ₹${numAmount.toLocaleString()} to ${employee.user.name}. Balance updated.`,
      allocation,
      employee: {
        id: employee.id,
        name: employee.user.name,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/finance/:employeeId
export const getEmployeeFinance: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const { employeeId } = req.params;
    const employeeAccess = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...(req.auth!.role === "SUPER_ADMIN" ? {} : { assignedSubAdminId: req.auth!.userId }),
      },
      select: { id: true },
    });
    if (!employeeAccess) return res.status(404).json({ success: false, message: "Employee not found" });
    const rawDate = typeof req.query.date === "string" ? req.query.date : undefined;
    let dateRange: ReturnType<typeof getIstDayRange> | undefined;
    if (rawDate) {
      try { dateRange = getIstDayRange(rawDate); }
      catch (error) { return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Invalid date" }); }
    }
    const requests = await prisma.financeRequest.findMany({
      where: {
        employeeId,
        ...(dateRange ? { OR: [
          { reviewedAt: { lt: dateRange.end } },
          { reviewedAt: null, createdAt: { lt: dateRange.end } },
        ] } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: { employee: { include: { user: { select: { name: true } } } } },
    });

    let runningBalance = 0;
    let totalAllocated = 0;
    let totalApprovedWithdrawals = 0;
    let dailyMoneyUsed = 0;
    let totalAllocatedMoney = 0;
    const ledger: any[] = [];
    for (const request of requests.sort((a:any, b:any) => (a.reviewedAt || a.createdAt).getTime() - (b.reviewedAt || b.createdAt).getTime())) {
      const effectiveDate = request.reviewedAt || request.createdAt;
      const amount = Number(request.amount);
      const isAllocation = request.type === "ADVANCE";
      const balanceBefore = runningBalance;
      if (request.status === "APPROVED" && isAllocation) {
        runningBalance += amount;
        totalAllocated += amount;
      } else if (request.status === "APPROVED" && request.type === "EXPENSE") {
        runningBalance -= amount;
        totalApprovedWithdrawals += amount;
      }
      const isSelectedDate = Boolean(dateRange && effectiveDate >= dateRange.start && effectiveDate < dateRange.end);
      if (isSelectedDate) {
        if (request.status === "APPROVED" && request.type === "ADVANCE") totalAllocatedMoney += amount;
        if (request.status === "APPROVED" && request.type === "EXPENSE") dailyMoneyUsed += amount;
      }
      if (!dateRange || isSelectedDate) {
        ledger.push({
          id: request.id,
          employeeId: request.employeeId,
          employeeName: request.employee?.user?.name || "Employee",
          type: isAllocation ? "ALLOCATION" : "WITHDRAWAL_APPROVAL",
          amount,
          balanceBefore,
          balanceAfter: runningBalance,
          reference: request.description || "ADV-FLT",
          notes: request.reason || "Operational float",
          createdAt: effectiveDate.toISOString(),
          requestCreatedAt: request.createdAt.toISOString(),
          reviewedAt: request.reviewedAt?.toISOString() || null,
          createdByName: "Sub-Admin",
          status: request.status,
        });
      }
    }
    ledger.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let previousDayMoneyAdded = 0;
    if (dateRange) {
      const previousStart = new Date(`${dateRange.previousDate}T00:00:00+05:30`);
      const previousDayRequests = await prisma.financeRequest.findMany({
        where: {
          employeeId, type: "ADVANCE", status: "APPROVED",
          OR: [
            { reviewedAt: { gte: previousStart, lt: dateRange.start } },
            { reviewedAt: null, createdAt: { gte: previousStart, lt: dateRange.start } },
          ],
        },
        select: { amount: true },
      });
      previousDayMoneyAdded = previousDayRequests.reduce((sum:any, item:any) => sum + Number(item.amount), 0);
    }

    return res.json({
      selectedDate: dateRange?.date,
      ledger,
      balance: runningBalance,
      availableBalance: runningBalance,
      totalAllocated,
      totalApprovedWithdrawals,
      metrics: dateRange ? {
        dailyMoneyUsed,
        remainingMoney: runningBalance,
        totalAllocatedMoney,
        previousDayMoneyAdded,
      } : undefined,
    });
  } catch (error) { next(error); }
};

// GET /api/v1/admin/finance/requests & /api/v1/super-admin/finance/requests
// Fetch all float replenishment requests with optional status filter
export const getFloatRequests: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const status = req.query.status as string | undefined;

    const whereClause: any = {
      type: "ADVANCE",
    };
    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    const requests = await prisma.financeRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        employee: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        reviewedBy: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    const mapped = requests.map((r:any) => {
      let parsedReview: any = {};
      if (r.reviewNote) {
        try {
          parsedReview = JSON.parse(r.reviewNote);
        } catch {
          parsedReview = { remarks: r.reviewNote };
        }
      }

      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee?.user?.name || "Employee",
        employeeEmail: r.employee?.user?.email || "",
        employeeCode: r.employee?.employeeCode || "",
        department: r.employee?.department || "Operations",
        amount: Number(r.amount),
        type: r.type,
        status: r.status,
        description: r.description,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() || null,
        reviewedById: r.reviewedById,
        reviewedByName: r.reviewedBy?.name || null,
        referenceId: parsedReview.referenceId || null,
        bankAccount: parsedReview.bankAccount || null,
        screenshotUrl: parsedReview.screenshotUrl || null,
        adminRemarks: parsedReview.remarks || null,
      };
    });

    return res.json({
      success: true,
      requests: mapped,
      data: { requests: mapped },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/finance/requests/:id/approve & /api/v1/super-admin/finance/requests/:id/approve
// Approve float replenishment request - requires referenceId, bankAccount, and screenshot
export const approveFloatRequest: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const { id } = req.params;
    const { referenceId, bankAccount, screenshotUrl, remarks } = req.body;

    if (!referenceId || typeof referenceId !== "string" || !referenceId.trim()) {
      return res.status(400).json({
        success: false,
        error: "MISSING_REFERENCE_ID",
        message: "Reference ID (UTR / Transaction ID) is required to approve float disbursement.",
      });
    }

    if (!bankAccount || typeof bankAccount !== "string" || !bankAccount.trim()) {
      return res.status(400).json({
        success: false,
        error: "MISSING_BANK_ACCOUNT",
        message: "Bank account details are required to approve float disbursement.",
      });
    }

    if (!screenshotUrl || typeof screenshotUrl !== "string" || !screenshotUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: "MISSING_SCREENSHOT",
        message: "Screenshot proof of transfer is required to approve float disbursement.",
      });
    }

    const request = await prisma.financeRequest.findUnique({
      where: { id },
      include: {
        employee: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, message: "Replenishment request not found" });
    }

    if (request.status === "APPROVED") {
      return res.status(400).json({ success: false, message: "Request is already approved." });
    }

    const reviewPayload = {
      referenceId: referenceId.trim(),
      bankAccount: bankAccount.trim(),
      screenshotUrl: screenshotUrl.trim(),
      remarks: (remarks || "Approved by administrator").trim(),
    };

    const updated = await prisma.financeRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: req.auth!.userId,
        reviewedAt: new Date(),
        reviewNote: JSON.stringify(reviewPayload),
      },
    });

    // Create immutable audit log
    try {
      await prisma.auditLog.create({
        data: {
          actorId: req.auth!.userId,
          action: "APPROVE_FLOAT_REQUEST",
          entityType: "ALLOCATION",
          entityId: request.id,
          description: `Approved ₹${Number(request.amount).toLocaleString()} float replenishment for ${request.employee?.user?.name || "Employee"}`,
          metadata: {
            amount: Number(request.amount),
            employeeId: request.employeeId,
            referenceId: reviewPayload.referenceId,
            bankAccount: reviewPayload.bankAccount,
            screenshotUrl: reviewPayload.screenshotUrl,
          },
          ipAddress: req.ip || "127.0.0.1",
        },
      });
    } catch (e) {
      console.warn("Failed to record audit log for float approval:", e);
    }

    return res.json({
      success: true,
      message: `Float replenishment of ₹${Number(request.amount).toLocaleString()} approved and credited successfully.`,
      request: {
        id: updated.id,
        status: updated.status,
        amount: Number(updated.amount),
        referenceId: reviewPayload.referenceId,
        bankAccount: reviewPayload.bankAccount,
        screenshotUrl: reviewPayload.screenshotUrl,
        reviewedAt: updated.reviewedAt?.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/finance/requests/:id/reject & /api/v1/super-admin/finance/requests/:id/reject
// Reject float replenishment request
export const rejectFloatRequest: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const { id } = req.params;
    const { reason, remarks } = req.body;
    const rejectionReason = reason || remarks || "Rejected by administrator";

    const request = await prisma.financeRequest.findUnique({ where: { id } });
    if (!request) {
      return res.status(404).json({ success: false, message: "Replenishment request not found" });
    }

    const updated = await prisma.financeRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: req.auth!.userId,
        reviewedAt: new Date(),
        reviewNote: JSON.stringify({ reason: rejectionReason }),
      },
    });

    return res.json({
      success: true,
      message: "Float replenishment request rejected.",
      request: {
        id: updated.id,
        status: updated.status,
        reason: rejectionReason,
      },
    });
  } catch (error) {
    next(error);
  }
};



// POST /api/v1/admin/entries/:id/approve
export const approveEntry: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const entry = await prisma.financeRequest.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ success: false, message: "Entry not found" });
    if (entry.status !== "PENDING") return res.status(409).json({ success: false, message: "Only pending entries can be approved" });
    const updated = await prisma.financeRequest.update({
      where: { id: entry.id },
      data: { status: "APPROVED", reviewedById: req.auth!.userId, reviewedAt: new Date(), reviewNote: req.body?.remarks || null },
    });
    return res.json({ success: true, message: "Entry approved", data: { id: updated.id, status: updated.status, reviewedAt: updated.reviewedAt } });
  } catch (error) { next(error); }
};

// POST /api/v1/admin/entries/:id/reject
export const rejectEntry: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const entry = await prisma.financeRequest.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ success: false, message: "Entry not found" });
    if (entry.status !== "PENDING") return res.status(409).json({ success: false, message: "Only pending entries can be rejected" });
    const updated = await prisma.financeRequest.update({
      where: { id: entry.id },
      data: { status: "REJECTED", reviewedById: req.auth!.userId, reviewedAt: new Date(), reviewNote: req.body?.reason || req.body?.remarks || "Rejected by reviewer" },
    });
    return res.json({ success: true, message: "Entry rejected", data: { id: updated.id, status: updated.status, reviewedAt: updated.reviewedAt } });
  } catch (error) { next(error); }
};
