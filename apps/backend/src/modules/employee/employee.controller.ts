import { RequestHandler } from "express";
import { prisma } from "../../config/prisma";
import { bankAccountStore, maskAccountNumber } from "../bank-account/bank-account.service";

// Helper to calculate employee float balances directly from database allocations
async function getEmployeeBalances(employeeId: string) {
  const allocations = await prisma.financeRequest.findMany({
    where: { employeeId, type: "ADVANCE", status: "APPROVED" },
  });
  const totalAllocated = allocations.reduce((sum:any, r:any) => sum + Number(r.amount), 0);

  const withdrawals = await prisma.financeRequest.findMany({
    where: { employeeId, type: "EXPENSE", status: "APPROVED" },
  });
  const totalApprovedWithdrawals = withdrawals.reduce((sum:any, r:any) => sum + Number(r.amount), 0);

  const availableBalance = Math.max(0, totalAllocated - totalApprovedWithdrawals);

  return { totalAllocated, totalApprovedWithdrawals, availableBalance };
}

// GET /api/v1/employee/dashboard
export const getDashboard: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;

    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    if (!employee) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Employee profile not found" });
    }

    const { totalAllocated, totalApprovedWithdrawals, availableBalance } = await getEmployeeBalances(employee.id);

    const employeeData = {
      id: employee.id,
      name: employee.user.name,
      employeeCode: employee.employeeCode,
      availableBalance,
      totalAllocated,
      totalApprovedWithdrawals,
      pendingWithdrawalsCount: 0,
      isFloatAllocated: totalAllocated > 0,
      hasActiveFloat: availableBalance > 0,
    };

    return res.json({
      success: true,
      employee: employeeData,
      recentEntries: [],
      lastPunch: null,
      data: {
        employee: employeeData,
        recentEntries: [],
        lastPunch: null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/employee/finance
export const getFinance: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;

    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    if (!employee) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Employee not found" });
    }

    const { totalAllocated, totalApprovedWithdrawals, availableBalance } = await getEmployeeBalances(employee.id);

    // Retrieve all finance requests sorted chronologically (oldest to newest) to compute running balance
    const requests = await prisma.financeRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "asc" },
    });

    let runningBalance = 0;
    const ledger = requests.map((r: any) => {
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
        // Transaction Type & Categorization
        type: isAlloc ? "ALLOCATION" : "WITHDRAWAL_APPROVAL",
        direction: isAlloc ? "CREDIT" : "DEBIT",
        sign: isAlloc ? "+" : "-",
        isAllocation: isAlloc,
        source: isAlloc ? "ADMIN_ALLOCATION" : "EMPLOYEE_WITHDRAWAL",
        createdByName: isAlloc ? "Admin / Supervisor" : "Self (Mobile Claim)",
        amount: amt,
        balanceBefore,
        balanceAfter,
        reference: r.description || (isAlloc ? "FLOAT-ALLOCATION" : "WD-INSTANT"),
        notes: r.reason || (isAlloc ? "Operational float allocated by Admin" : "Instant withdrawal claim"),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      };
    }).reverse();

    const assignedAccounts = bankAccountStore.getAccountsForEmployee(employee.id, false, userId);
    const primaryAccount = assignedAccounts.find((a) => a.isPrimary) || assignedAccounts[0];

    const employeeSummary = {
      id: employee.id,
      name: employee.user.name,
      employeeCode: employee.employeeCode,
      availableBalance,
      totalAllocated,
      totalApprovedWithdrawals,
      pendingWithdrawalsCount: 0,
      isFloatAllocated: totalAllocated > 0,
      hasActiveFloat: availableBalance > 0,
      bankName: primaryAccount ? primaryAccount.bankName : "State Bank of India",
      bankAccountNumber: primaryAccount ? primaryAccount.maskedAccountNumber : "•••• •••• 4281",
      ifscCode: primaryAccount ? primaryAccount.ifscCode : "SBIN0001234",
      bankAccounts: assignedAccounts,
      assignedBankAccounts: assignedAccounts,
      accounts: assignedAccounts,
    };

    return res.json({
      success: true,
      employee: employeeSummary,
      bankAccounts: assignedAccounts,
      assignedBankAccounts: assignedAccounts,
      accounts: assignedAccounts,
      ledger,
      data: {
        employee: employeeSummary,
        bankAccounts: assignedAccounts,
        assignedBankAccounts: assignedAccounts,
        accounts: assignedAccounts,
        ledger,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/employee/entries (Instant withdrawal auto-settled)
export const submitEntry: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const amount = Number(req.body.withdrawalAmount || req.body.amount || 0);
    const reference = req.body.referenceId || req.body.reference || `TX-${Date.now()}`;
    const remarks = req.body.remarks || "Direct instant withdrawal";
    const uploadedProof = req.body.screenshotUrl || req.body.imageUrl || req.body.proofImage || null;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(422).json({ success: false, message: "Amount must be a positive valid number." });
    }
    if (uploadedProof !== null) {
      if (typeof uploadedProof !== "string" || uploadedProof.length > 7_000_000) {
        return res.status(413).json({ success: false, message: "Payment proof is invalid or exceeds the 5 MB limit." });
      }
      const isAllowedDataImage = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(uploadedProof);
      const isHttpUrl = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(uploadedProof);
      if (!isAllowedDataImage && !isHttpUrl) {
        return res.status(422).json({ success: false, message: "Upload a valid JPG, PNG, or WEBP image, or provide an HTTPS proof URL." });
      }
    }
    const bankAccountId = req.body.bankAccountId;
    let selectedBankAccount = req.body.bankAccountNumber || req.body.bankAccount || "";
    let selectedBankName = req.body.bankName || "";

    if (bankAccountId) {
      const acc = bankAccountStore.getAccountById(bankAccountId);
      if (acc) {
        selectedBankAccount = acc.accountNumber;
        selectedBankName = acc.bankName;
      }
    }

    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true } },
      },
    });

    if (!employee) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Employee not found" });
    }

    // If no bank account specified, fallback to primary assigned bank account
    if (!selectedBankAccount) {
      const empAccs = bankAccountStore.getAccountsForEmployee(employee.id);
      const prim = empAccs.find((a) => a.isPrimary) || empAccs[0];
      if (prim) {
        selectedBankAccount = prim.accountNumber;
        selectedBankName = prim.bankName;
      }
    }

    const { availableBalance } = await getEmployeeBalances(employee.id);
    if (amount > availableBalance) {
      return res.status(422).json({
        success: false,
        error: "INSUFFICIENT_FUNDS",
        message: `Insufficient balance. Available: ₹${availableBalance.toLocaleString()}, Requested: ₹${amount.toLocaleString()}.`,
      });
    }

    const metadataPayload = {
      notes: remarks,
      screenshotUrl: uploadedProof,
      bankAccountId: bankAccountId || undefined,
      bankAccountNumber: selectedBankAccount,
      bankName: selectedBankName,
    };

    const reasonData = JSON.stringify(metadataPayload);

    // Auto-settle: create finance request record
    const request = await prisma.financeRequest.create({
      data: {
        employeeId: employee.id,
        amount,
        type: "EXPENSE",
        status: "APPROVED",
        description: reference || "Direct instant withdrawal",
        reason: reasonData,
        reviewNote: uploadedProof || undefined,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Withdrawal settled successfully. Your balance has been updated.",
      data: {
        id: request.id,
        employeeId: employee.id,
        employeeName: employee.user.name,
        referenceId: reference,
        withdrawalAmount: amount,
        amount,
        bankAccountId: bankAccountId || null,
        bankAccountNumber: selectedBankAccount,
        bankName: selectedBankName,
        screenshotUrl: uploadedProof,
        status: "APPROVED",
        createdAt: request.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/employee/entries
export const getEntries: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return res.json({ success: true, data: { entries: [] } });

    const requests = await prisma.financeRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
    });

    const mapped = requests.map((r:any) => {
      let uploadedProof = "";
      let remarksText = r.reason || "Direct withdrawal";
      let bankAccountNumber = "";
      let bankName = "";
      let bankAccountId = "";

      if (r.reason && r.reason.startsWith("{")) {
        try {
          const parsed = JSON.parse(r.reason);
          if (parsed.screenshotUrl) uploadedProof = parsed.screenshotUrl;
          if (parsed.notes) remarksText = parsed.notes;
          if (parsed.bankAccountNumber) bankAccountNumber = parsed.bankAccountNumber;
          if (parsed.bankName) bankName = parsed.bankName;
          if (parsed.bankAccountId) bankAccountId = parsed.bankAccountId;
        } catch {
          // ignore
        }
      } else if (r.reviewNote) {
        uploadedProof = r.reviewNote;
      }

      return {
        id: r.id,
        employeeId: employee.id,
        amount: Number(r.amount),
        withdrawalAmount: Number(r.amount),
        referenceId: r.description || `EXP-${r.id.substring(0, 8)}`,
        remarks: remarksText,
        bankAccountId: bankAccountId || null,
        bankAccountNumber: bankAccountNumber || "•••• •••• 4281",
        bankName: bankName || "State Bank of India",
        screenshotUrl: uploadedProof,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return res.json({
      success: true,
      data: {
        entries: mapped,
      },
      entries: mapped,
    });
  } catch (error) {
    next(error);
  }
};

// Helper to calculate start of today in IST (+5:30)
export const getStartOfToday = () => {
  const offsetMs = 5.5 * 60 * 60 * 1000;
  const localNow = new Date(Date.now() + offsetMs);
  localNow.setUTCHours(0, 0, 0, 0);
  return new Date(localNow.getTime() - offsetMs);
};

// POST /api/v1/employee/punches & /attendance/punch
export const submitPunch: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const { punchType, latitude, longitude, address, notes, accuracy, accuracyMeters } = req.body;

    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: { user: { select: { name: true } } },
    });

    if (!employee) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Employee profile not found" });
    }

    const now = new Date();
    const isCheckIn = punchType === "CHECK_IN";
    const startOfToday = getStartOfToday();

    let session: any;

    if (isCheckIn) {
      // Find open session
      session = await prisma.attendanceSession.findFirst({
        where: { employeeId: employee.id, status: "OPEN" },
        orderBy: { checkInAt: "desc" },
      });

      // Auto-close previous day stale session if any
      if (session && session.checkInAt < startOfToday) {
        await prisma.attendanceSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            checkOutAt: new Date(session.checkInAt.getTime() + 8 * 3600 * 1000),
          },
        });
        session = null;
      }

      if (!session) {
        session = await prisma.attendanceSession.create({
          data: {
            employeeId: employee.id,
            status: "OPEN",
            checkInAt: now,
            ...(latitude !== undefined && { checkInLatitude: latitude }),
            ...(longitude !== undefined && { checkInLongitude: longitude }),
            ...(accuracy || accuracyMeters ? { checkInAccuracy: accuracy || accuracyMeters } : {}),
            notes: address || notes || "Mobile check-in",
          },
        });
      }
    } else {
      // CHECK_OUT
      session = await prisma.attendanceSession.findFirst({
        where: { employeeId: employee.id, status: "OPEN" },
        orderBy: { checkInAt: "desc" },
      });

      if (session) {
        session = await prisma.attendanceSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            checkOutAt: now,
            ...(latitude !== undefined && { checkOutLatitude: latitude }),
            ...(longitude !== undefined && { checkOutLongitude: longitude }),
            ...(accuracy || accuracyMeters ? { checkOutAccuracy: accuracy || accuracyMeters } : {}),
            notes: address || notes || session.notes || "Mobile check-out",
          },
        });
      } else {
        session = await prisma.attendanceSession.create({
          data: {
            employeeId: employee.id,
            status: "COMPLETED",
            checkInAt: new Date(now.getTime() - 5 * 60 * 1000),
            checkOutAt: now,
            ...(latitude !== undefined && { checkOutLatitude: latitude }),
            ...(longitude !== undefined && { checkOutLongitude: longitude }),
            ...(accuracy || accuracyMeters ? { checkOutAccuracy: accuracy || accuracyMeters } : {}),
            notes: address || notes || "Mobile check-out",
          },
        });
      }
    }

    const punchData = {
      id: `pun_${session.id}_${isCheckIn ? "in" : "out"}`,
      sessionId: session.id,
      employeeId: employee.id,
      employeeName: employee.user.name,
      punchType: isCheckIn ? "CHECK_IN" : "CHECK_OUT",
      status: session.status,
      timestamp: (isCheckIn ? session.checkInAt : (session.checkOutAt || now)).toISOString(),
      date: (isCheckIn ? session.checkInAt : (session.checkOutAt || now)).toISOString().split("T")[0],
      time: (isCheckIn ? session.checkInAt : (session.checkOutAt || now)).toLocaleTimeString("en-US", { hour12: true }),
      latitude: Number(latitude || (isCheckIn ? session.checkInLatitude : session.checkOutLatitude) || 28.6139),
      longitude: Number(longitude || (isCheckIn ? session.checkInLongitude : session.checkOutLongitude) || 77.2090),
      address: address || notes || "Authorized Field Location",
      isCheckedIn: isCheckIn,
    };

    return res.status(201).json({
      success: true,
      message: `${isCheckIn ? "Check-In" : "Check-Out"} recorded successfully.`,
      ...punchData,
      data: punchData,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/employee/punches
export const getPunches: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: { user: { select: { name: true } } },
    });

    if (!employee) {
      return res.json({ success: true, punches: [], data: { punches: [] } });
    }

    const sessions = await prisma.attendanceSession.findMany({
      where: { employeeId: employee.id },
      orderBy: { checkInAt: "desc" },
      take: 50,
    });

    const punches: any[] = [];
    for (const s of sessions) {
      punches.push({
        id: `pun_in_${s.id}`,
        employeeId: s.employeeId,
        employeeName: employee.user.name,
        punchType: "CHECK_IN",
        timestamp: s.checkInAt.toISOString(),
        date: s.checkInAt.toISOString().split("T")[0],
        time: s.checkInAt.toLocaleTimeString("en-US", { hour12: true }),
        latitude: Number(s.checkInLatitude || 28.6139),
        longitude: Number(s.checkInLongitude || 77.2090),
        address: s.notes || "Authorized Field Location",
      });
      if (s.checkOutAt) {
        punches.push({
          id: `pun_out_${s.id}`,
          employeeId: s.employeeId,
          employeeName: employee.user.name,
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

    punches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.json({
      success: true,
      punches,
      data: { punches },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/employee/attendance/check-in
export const checkIn: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const { latitude, longitude, accuracy, accuracyMeters, notes } = req.body;

    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    const startOfToday = getStartOfToday();
    const now = new Date();

    let session = await prisma.attendanceSession.findFirst({
      where: { employeeId: employee.id, status: "OPEN" },
      orderBy: { checkInAt: "desc" },
    });

    // Auto-close stale session from prior date
    if (session && session.checkInAt < startOfToday) {
      await prisma.attendanceSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          checkOutAt: new Date(session.checkInAt.getTime() + 8 * 3600 * 1000),
          notes: (session.notes || "") + " (Auto-closed)",
        },
      });
      session = null;
    }

    if (!session) {
      session = await prisma.attendanceSession.create({
        data: {
          employeeId: employee.id,
          status: "OPEN",
          checkInAt: now,
          ...(latitude !== undefined && { checkInLatitude: latitude }),
          ...(longitude !== undefined && { checkInLongitude: longitude }),
          ...(accuracy || accuracyMeters ? { checkInAccuracy: accuracy || accuracyMeters } : {}),
          notes: notes || "Mobile check-in",
        },
      });
    }

    const sessionData = {
      id: session.id,
      sessionId: session.id,
      employeeId: employee.id,
      status: session.status,
      checkInAt: session.checkInAt.toISOString(),
      isCheckedIn: true,
    };

    return res.status(200).json({
      success: true,
      message: "Checked in successfully",
      ...sessionData,
      data: sessionData,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/employee/attendance/check-out
export const checkOut: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const { latitude, longitude, accuracy, accuracyMeters, notes } = req.body;

    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    let session = await prisma.attendanceSession.findFirst({
      where: { employeeId: employee.id, status: "OPEN" },
      orderBy: { checkInAt: "desc" },
    });

    const now = new Date();

    if (session) {
      session = await prisma.attendanceSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          checkOutAt: now,
          ...(latitude !== undefined && { checkOutLatitude: latitude }),
          ...(longitude !== undefined && { checkOutLongitude: longitude }),
          ...(accuracy || accuracyMeters ? { checkOutAccuracy: accuracy || accuracyMeters } : {}),
          ...(notes ? { notes } : {}),
        },
      });
    } else {
      session = await prisma.attendanceSession.create({
        data: {
          employeeId: employee.id,
          status: "COMPLETED",
          checkInAt: new Date(now.getTime() - 5 * 60 * 1000),
          checkOutAt: now,
          ...(latitude !== undefined && { checkOutLatitude: latitude }),
          ...(longitude !== undefined && { checkOutLongitude: longitude }),
          ...(accuracy || accuracyMeters ? { checkOutAccuracy: accuracy || accuracyMeters } : {}),
          notes: notes || "Mobile check-out",
        },
      });
    }

    const sessionData = {
      id: session.id,
      sessionId: session.id,
      employeeId: employee.id,
      status: session.status,
      checkInAt: session.checkInAt.toISOString(),
      checkOutAt: (session.checkOutAt || now).toISOString(),
      isCheckedIn: false,
    };

    return res.status(200).json({
      success: true,
      message: "Checked out successfully",
      ...sessionData,
      data: sessionData,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/employee/attendance/status or /today
export const getAttendanceStatus: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    const startOfToday = getStartOfToday();

    const openSession = await prisma.attendanceSession.findFirst({
      where: { employeeId: employee.id, status: "OPEN", checkInAt: { gte: startOfToday } },
      orderBy: { checkInAt: "desc" },
    });

    const isCheckedIn = Boolean(openSession);

    const statusData = {
      isCheckedIn,
      status: openSession ? "OPEN" : "COMPLETED",
      currentSession: openSession
        ? {
            id: openSession.id,
            checkInAt: openSession.checkInAt.toISOString(),
            status: openSession.status,
          }
        : null,
    };

    return res.status(200).json({
      success: true,
      ...statusData,
      data: statusData,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/employee/finance/request & /employee/requests
// Submit float replenishment request when balance is exhausted
export const requestFloatReplenishment: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const amount = Number(req.body.amount || req.body.requestedAmount || 0);
    const reason = req.body.reason || req.body.remarks || "Float replenishment requested (balance exhausted)";
    const bankAccount = req.body.bankAccount || req.body.bankAccountNumber || "";

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_AMOUNT",
        message: "Please enter a valid replenishment amount greater than zero.",
      });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: { user: { select: { name: true, email: true } } },
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    const fullReason = bankAccount ? `${reason} | Target Bank: ${bankAccount}` : reason;

    const request = await prisma.financeRequest.create({
      data: {
        employeeId: employee.id,
        amount,
        type: "ADVANCE",
        status: "PENDING",
        description: "Float Replenishment Request",
        reason: fullReason,
      },
    });

    const responsePayload = {
      id: request.id,
      employeeId: employee.id,
      employeeName: employee.user.name,
      employeeCode: employee.employeeCode,
      amount: Number(request.amount),
      status: request.status,
      type: request.type,
      description: request.description,
      reason: request.reason,
      createdAt: request.createdAt.toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: `Float replenishment request for ₹${amount.toLocaleString()} submitted successfully. Awaiting supervisor approval.`,
      request: responsePayload,
      data: responsePayload,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/employee/finance/requests & /employee/requests
// List employee's own replenishment requests
export const getFloatRequests: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile not found" });
    }

    const requests = await prisma.financeRequest.findMany({
      where: {
        employeeId: employee.id,
        type: "ADVANCE",
      },
      orderBy: { createdAt: "desc" },
      include: {
        reviewedBy: { select: { id: true, name: true, role: true } },
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
        amount: Number(r.amount),
        status: r.status,
        description: r.description,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() || null,
        reviewedBy: r.reviewedBy?.name || null,
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


// PATCH /api/v1/employee/profile - profile fields persisted in Supabase Postgres
export const updateProfile: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : undefined;
    if (phone !== undefined && phone.length > 30) {
      return res.status(422).json({ success: false, message: "Phone number is too long." });
    }
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: phone === undefined ? {} : { phone },
      include: { employee: true },
    });
    const profile = {
      id: user.id, name: user.name, email: user.email, phone: user.phone || "",
      role: user.role, status: user.status, employeeId: user.employee?.id || null,
      employeeCode: user.employee?.employeeCode || null,
      employee: user.employee ? { id: user.employee.id, employeeCode: user.employee.employeeCode, department: user.employee.department, designation: user.employee.designation } : null,
    };
    return res.json({ success: true, data: profile, user: profile, ...profile });
  } catch (error) { next(error); }
};

// GET /api/v1/employee/finance/balance
export const getFinanceBalance: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { userId: req.auth!.userId } });
    if (!employee) return res.status(404).json({ success: false, message: "Employee profile not found" });
    const { totalAllocated, totalApprovedWithdrawals, availableBalance } = await getEmployeeBalances(employee.id);
    const summary = { totalAllocated, totalWithdrawn: totalApprovedWithdrawals, availableBalance };
    return res.json({ success: true, data: summary, ...summary });
  } catch (error) { next(error); }
};

// GET /api/v1/employee/finance/history
export const getFinanceHistory: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { userId: req.auth!.userId } });
    if (!employee) return res.status(404).json({ success: false, message: "Employee profile not found" });
    const requests = await prisma.financeRequest.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } });
    const transactions = requests.map((r: any) => ({
      id: r.id, employeeId: employee.id, referenceId: r.description || r.id,
      type: r.type === "ADVANCE" ? "ALLOCATION_CREDIT" : (r.status === "APPROVED" ? "WITHDRAWAL_APPROVED" : "WITHDRAWAL_SUBMITTED"),
      amount: Number(r.amount), status: r.status, description: r.reason || r.description, timestamp: r.createdAt.toISOString(),
    }));
    return res.json({ success: true, data: transactions, transactions });
  } catch (error) { next(error); }
};

// GET /api/v1/employee/entries/:id
export const getEntryById: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { userId: req.auth!.userId } });
    if (!employee) return res.status(404).json({ success: false, message: "Employee profile not found" });
    const entry = await prisma.financeRequest.findFirst({ where: { id: req.params.id, employeeId: employee.id } });
    if (!entry) return res.status(404).json({ success: false, message: "Entry not found" });
    let metadata: any = {};
    try { metadata = entry.reason?.startsWith("{") ? JSON.parse(entry.reason) : {}; } catch { metadata = {}; }
    const data = { id: entry.id, employeeId: employee.id, amount: Number(entry.amount), withdrawalAmount: Number(entry.amount), referenceId: entry.description, remarks: metadata.notes || entry.reason || "", screenshotUrl: metadata.screenshotUrl || entry.reviewNote || null, status: entry.status, createdAt: entry.createdAt.toISOString() };
    return res.json({ success: true, data, entry: data });
  } catch (error) { next(error); }
};

// POST /api/v1/employee/entries/:id/cancel - only pending requests can be cancelled
export const cancelEntry: RequestHandler = async (req: any, res: any, next: any) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { userId: req.auth!.userId } });
    if (!employee) return res.status(404).json({ success: false, message: "Employee profile not found" });
    const entry = await prisma.financeRequest.findFirst({ where: { id: req.params.id, employeeId: employee.id } });
    if (!entry) return res.status(404).json({ success: false, message: "Entry not found" });
    if (entry.status !== "PENDING") return res.status(409).json({ success: false, message: "Only pending entries can be cancelled" });
    const updated = await prisma.financeRequest.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });
    const data = { id: updated.id, employeeId: employee.id, amount: Number(updated.amount), withdrawalAmount: Number(updated.amount), referenceId: updated.description, status: updated.status, createdAt: updated.createdAt.toISOString() };
    return res.json({ success: true, message: "Entry cancelled", data, entry: data });
  } catch (error) { next(error); }
};
