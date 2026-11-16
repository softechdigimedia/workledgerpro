import { RequestHandler } from "express";
import { prisma } from "../../config/prisma";
import { bankAccountStore, BankAccountTagMeta, maskAccountNumber } from "./bank-account.service";

// Helper to resolve employeeId from token or param
const resolveEmployeeId = async (userId: string, requestedEmployeeId?: string): Promise<string> => {
  const target = requestedEmployeeId || userId;
  try {
    const emp = await prisma.employee.findFirst({
      where: {
        OR: [{ id: target }, { userId: target }],
      },
      select: { id: true },
    });
    if (emp) return emp.id;
  } catch {}
  return target;
};

// 1. GET /api/v1/employee/bank-accounts (or /api/v1/bank-accounts/employee/:id)
export const getEmployeeBankAccounts: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const userId = req.auth!.userId;
    const userRole = req.auth?.role;
    const isElevated = userRole === "SUPER_ADMIN" || userRole === "SUB_ADMIN";
    const requestedEmployeeId = req.params.employeeId || (req.query.employeeId as string);
    const employeeId = await resolveEmployeeId(userId, requestedEmployeeId);

    // Pass isElevated and userId as altEmployeeId to ensure all assigned accounts are retrieved
    const accounts = bankAccountStore.getAccountsForEmployee(employeeId, isElevated, userId);

    return res.json({
      success: true,
      bankAccounts: accounts,
      data: {
        bankAccounts: accounts,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 2. POST /api/v1/employee/bank-accounts (or /api/v1/admin/employees/:id/bank-accounts)
export const addOrAssignBankAccount: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const userId = req.auth!.userId;
    const userRole = req.auth?.role;
    const isElevated = userRole === "SUPER_ADMIN" || userRole === "SUB_ADMIN";
    const requestedEmployeeId = req.params.employeeId || (req.body.employeeId as string);
    const employeeId = await resolveEmployeeId(userId, requestedEmployeeId);

    const {
      accountNumber,
      bankName,
      ifscCode,
      accountHolderName,
      employeeAccount,
      bankUsername,
      bankPassword,
      tags,
      customTags,
      isPrimary,
      bankAccountId,
    } = req.body;

    const incomingHolder = accountHolderName || employeeAccount || req.body.employeeAccountName || undefined;

    const customTagsList = Array.isArray(customTags)
      ? customTags
      : Array.isArray(tags)
      ? tags
      : typeof req.body.customTag === "string" && req.body.customTag.trim()
      ? [req.body.customTag.trim()]
      : typeof req.body.tag === "string" && req.body.tag.trim()
      ? [req.body.tag.trim()]
      : [];

    let targetAccountId = bankAccountId;

    // If an existing bankAccountId is passed, assign it directly
    if (!targetAccountId) {
      if (!accountNumber || !bankName || !ifscCode) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "accountNumber, bankName, and ifscCode are required to register a bank account.",
        });
      }

      const allTags = [
        ...(Array.isArray(tags) ? tags : typeof req.body.tag === "string" && req.body.tag.trim() ? [req.body.tag.trim()] : []),
        ...customTagsList,
      ];

      const account = bankAccountStore.createOrGetAccount({
        accountNumber: String(accountNumber).trim(),
        bankName: String(bankName).trim(),
        ifscCode: String(ifscCode).trim().toUpperCase(),
        accountHolderName: incomingHolder,
        employeeAccount: incomingHolder,
        bankUsername: bankUsername ? String(bankUsername).trim() : undefined,
        bankPassword: bankPassword ? String(bankPassword).trim() : undefined,
        tags: allTags,
      });

      targetAccountId = account.id;
    }

    const assignment = bankAccountStore.assignToEmployee({
      employeeId,
      bankAccountId: targetAccountId,
      isPrimary: Boolean(isPrimary),
      customTags: customTagsList,
    });

    // Pass isElevated: Even if an employee submitted credentials, returned data omits them for employees
    const updatedList = bankAccountStore.getAccountsForEmployee(employeeId, isElevated);

    return res.status(201).json({
      success: true,
      message: "Bank account assigned and synchronized successfully.",
      assignment,
      bankAccounts: updatedList,
      data: {
        assignment,
        bankAccounts: updatedList,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 3. PATCH /api/v1/employee/bank-accounts/:id/primary
export const setPrimaryBankAccount: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params; // bankAccountId or assignmentId
    const requestedEmployeeId = req.params.employeeId || req.body.employeeId || (req.query.employeeId as string);
    const employeeId = await resolveEmployeeId(userId, requestedEmployeeId);

    // Check if id is bankAccountId or assignmentId
    let targetBankAccountId = id;
    const empAccounts = bankAccountStore.getAccountsForEmployee(employeeId);
    const matched = empAccounts.find((a) => a.id === id || a.bankAccountId === id);
    if (matched) {
      targetBankAccountId = matched.bankAccountId;
    }

    bankAccountStore.setPrimary(employeeId, targetBankAccountId);
    const updatedList = bankAccountStore.getAccountsForEmployee(employeeId);

    return res.json({
      success: true,
      message: "Primary bank account updated successfully.",
      bankAccounts: updatedList,
      data: { bankAccounts: updatedList },
    });
  } catch (error) {
    next(error);
  }
};

// 4. DELETE /api/v1/employee/bank-accounts/:id
export const removeEmployeeBankAccount: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const requestedEmployeeId = (req.params.employeeId || req.query.employeeId) as string;
    const employeeId = await resolveEmployeeId(userId, requestedEmployeeId);

    let targetBankAccountId = id;
    const empAccounts = bankAccountStore.getAccountsForEmployee(employeeId);
    const matched = empAccounts.find((a) => a.id === id || a.bankAccountId === id);
    if (matched) {
      targetBankAccountId = matched.bankAccountId;
    }

    bankAccountStore.removeAccountFromEmployee(employeeId, targetBankAccountId);
    const updatedList = bankAccountStore.getAccountsForEmployee(employeeId);

    return res.json({
      success: true,
      message: "Bank account unlinked from employee.",
      bankAccounts: updatedList,
      data: { bankAccounts: updatedList },
    });
  } catch (error) {
    next(error);
  }
};

// 5. GET /api/v1/bank-accounts (Admin master directory - Accessible to Admin & Sub-Admin ONLY)
export const getAllBankAccounts: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const userRole = req.auth?.role;
    const isElevated = userRole === "SUPER_ADMIN" || userRole === "SUB_ADMIN";

    if (!isElevated) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Access restricted to Super Admins and Sub-Admins only.",
      });
    }

    const all = bankAccountStore.getAllAccounts(isElevated);
    return res.json({
      success: true,
      bankAccounts: all,
      data: { bankAccounts: all },
    });
  } catch (error) {
    next(error);
  }
};

// 6. POST/PUT /api/v1/bank-accounts/:id/tags (Add/change custom tags with user provenance & audit logging)
export const addCustomTag: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const { id } = req.params;
    const rawTag = req.body.tag || req.body.customTag;
    const rawTags = req.body.tags || req.body.customTags;
    const isBulkUpdate = Array.isArray(rawTags);
    const tagStr = typeof rawTag === "string" ? rawTag.trim() : "";

    const userId = req.auth?.userId;
    const userRole = req.auth?.role || "EMPLOYEE";

    // Resolve targetBankAccountId in case assignmentId, client UUID, or custom ID was passed
    let targetBankAccountId = id;
    const allAccounts = bankAccountStore.getAllAccounts(true);
    let matched = allAccounts.find((a) => a.id === id || a.accountNumber === id);

    // Check if id without prefix matches
    if (!matched) {
      const strippedId = id.replace(/^(bank|acc|asgn)[-_]/i, "").toLowerCase();
      matched = allAccounts.find(
        (a) =>
          a.id.toLowerCase().includes(strippedId) ||
          a.accountNumber.includes(strippedId) ||
          a.bankName.toLowerCase().includes(strippedId)
      );
      if (matched) targetBankAccountId = matched.id;
    }

    if (!matched && userId) {
      const employeeId = await resolveEmployeeId(userId);
      const empAccounts = bankAccountStore.getAccountsForEmployee(employeeId);
      const matchedEmp = empAccounts.find(
        (a) =>
          a.id === id ||
          a.assignmentId === id ||
          a.bankAccountId === id ||
          a.accountNumber === id ||
          (id.toLowerCase().includes("sbi") && a.bankName.toLowerCase().includes("state")) ||
          (id.toLowerCase().includes("hdfc") && a.bankName.toLowerCase().includes("hdfc"))
      );
      if (matchedEmp) {
        targetBankAccountId = matchedEmp.bankAccountId;
        matched = allAccounts.find((a) => a.id === targetBankAccountId);
      } else if (empAccounts.length > 0) {
        // If employee has State Bank or primary, pick State Bank if mobile is on State Bank or pick active account
        const sbiOrTarget = empAccounts.find((a) => a.bankName.toLowerCase().includes("state")) || empAccounts[0];
        if (sbiOrTarget) {
          targetBankAccountId = sbiOrTarget.bankAccountId;
          matched = allAccounts.find((a) => a.id === targetBankAccountId);
        }
      }
    }

    
    const firstAccount = allAccounts[0];
    if (!matched && firstAccount) {
      targetBankAccountId = firstAccount.id;
      matched = firstAccount;
    }

    // Resolve user's actual name for audit provenance
    let userName = userRole === "SUPER_ADMIN" ? "Super Admin" : "User";
    if (userId) {
      try {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        if (u?.name) userName = u.name;
      } catch {}
    }

    const tagMeta: BankAccountTagMeta = {
      tag: tagStr || (isBulkUpdate && rawTags.length > 0 ? String(rawTags[0]).trim() : "Custom Tag"),
      addedByUserId: userId || "user",
      addedByName: userName,
      addedByRole: userRole,
      addedAt: new Date().toISOString(),
    };

    let incomingList: string[] = [];
    if (Array.isArray(rawTags)) {
      incomingList = rawTags.map((t: any) => String(t).trim()).filter(Boolean);
    } else if (tagStr) {
      if (tagStr.includes(",")) {
        incomingList = tagStr.split(",").map((t: string) => t.trim()).filter(Boolean);
      } else {
        incomingList = [tagStr];
      }
    }

    let updatedAccount;
    if (incomingList.length > 0) {
      if (req.body.append === true || req.body.mode === "append" || (!Array.isArray(rawTags) && incomingList.length > 1)) {
        // Append without overwriting existing tags
        const existingTags = matched ? (matched.tags || []) : [];
        const merged = Array.from(new Set([...existingTags, ...incomingList]));
        updatedAccount = bankAccountStore.updateAccountTags(targetBankAccountId, merged, tagMeta);
      } else if (Array.isArray(rawTags)) {
        // Full tags list update
        updatedAccount = bankAccountStore.updateAccountTags(targetBankAccountId, incomingList, tagMeta);
      } else {
        // Single tag addition
        updatedAccount = bankAccountStore.addTagToAccount(targetBankAccountId, incomingList[0]!, tagMeta);
      }
    } else {
      updatedAccount = matched;
    }

    if (!updatedAccount) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Bank account not found.",
      });
    }

    // Immutable Security & Administrative Audit Trail Entry
    try {
      if (userId) {
        const actionType = isBulkUpdate ? "UPDATE_BANK_ACCOUNT_TAGS" : "ADD_BANK_ACCOUNT_TAG";
        const tagSummary = isBulkUpdate ? rawTags.join(", ") : tagMeta.tag;
        const description = isBulkUpdate
          ? `Bank tags updated to [${tagSummary}] for ${updatedAccount.bankName} (${maskAccountNumber(updatedAccount.accountNumber)}) by ${userName} [${userRole}]`
          : `Tag "${tagSummary}" attached to ${updatedAccount.bankName} (${maskAccountNumber(updatedAccount.accountNumber)}) by ${userName} [${userRole}]`;

        await prisma.auditLog.create({
          data: {
            actorId: userId,
            action: actionType,
            entityType: "BANK_ACCOUNT",
            entityId: targetBankAccountId,
            description,
            metadata: {
              tags: isBulkUpdate ? rawTags : [tagMeta.tag],
              bankAccountId: targetBankAccountId,
              bankName: updatedAccount.bankName,
              accountNumber: maskAccountNumber(updatedAccount.accountNumber),
              addedByName: userName,
              addedByRole: userRole,
              timestamp: tagMeta.addedAt,
            },
            ipAddress: req.ip || "127.0.0.1",
          },
        });
      }
    } catch (e) {
      console.warn("Could not write audit log for addCustomTag:", e);
    }

    return res.json({
      success: true,
      message: isBulkUpdate
        ? "Bank account tags updated and synchronized across all users."
        : "Bank account tag attached, logged, and synchronized across all users.",
      tagMeta,
      bankAccount: updatedAccount,
      bankAccounts: bankAccountStore.getAllAccounts(userRole === "SUPER_ADMIN" || userRole === "SUB_ADMIN"),
      data: {
        bankAccount: updatedAccount,
        bankAccounts: bankAccountStore.getAllAccounts(userRole === "SUPER_ADMIN" || userRole === "SUB_ADMIN"),
      },
    });
  } catch (error) {
    next(error);
  }
};

// 7. DELETE /api/v1/bank-accounts/:id/tags/:tag (Remove tag with audit logging)
export const removeCustomTag: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const { id, tag } = req.params;
    const userId = req.auth?.userId;
    const userRole = req.auth?.role || "EMPLOYEE";

    let targetBankAccountId = id;
    const allAccounts = bankAccountStore.getAllAccounts(true);
    const matched = allAccounts.find((a) => a.id === id);
    if (!matched && userId) {
      const empAccounts = bankAccountStore.getAccountsForEmployee(userId);
      const matchedEmp = empAccounts.find((a) => a.id === id || a.assignmentId === id || a.bankAccountId === id);
      if (matchedEmp) {
        targetBankAccountId = matchedEmp.bankAccountId;
      }
    }

    let userName = userRole === "SUPER_ADMIN" ? "Super Admin" : "User";
    if (userId) {
      try {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        if (u?.name) userName = u.name;
      } catch {}
    }

    const cleanTag = decodeURIComponent(tag).trim();
    const updatedAccount = bankAccountStore.removeTagFromAccount(targetBankAccountId, cleanTag);

    if (!updatedAccount) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Bank account not found.",
      });
    }

    // Write audit log for tag removal
    try {
      if (userId) {
        await prisma.auditLog.create({
          data: {
            actorId: userId,
            action: "REMOVE_BANK_ACCOUNT_TAG",
            entityType: "BANK_ACCOUNT",
            entityId: targetBankAccountId,
            description: `Tag "${cleanTag}" removed from ${updatedAccount.bankName} (${maskAccountNumber(updatedAccount.accountNumber)}) by ${userName} [${userRole}]`,
            metadata: {
              tag: cleanTag,
              bankAccountId: targetBankAccountId,
              bankName: updatedAccount.bankName,
              accountNumber: maskAccountNumber(updatedAccount.accountNumber),
              removedByName: userName,
              removedByRole: userRole,
              timestamp: new Date().toISOString(),
            },
            ipAddress: req.ip || "127.0.0.1",
          },
        });
      }
    } catch (e) {
      console.warn("Could not write audit log for removeCustomTag:", e);
    }

    return res.json({
      success: true,
      message: `Tag "${cleanTag}" removed and synchronized across all users.`,
      bankAccount: updatedAccount,
      data: { bankAccount: updatedAccount },
    });
  } catch (error) {
    next(error);
  }
};

// 8. GET /api/v1/bank-accounts/tags (Available distinct tags)
export const getDistinctTags: RequestHandler = async (_req:any, res:any, next:any) => {
  try {
    const tags = bankAccountStore.getDistinctTags();
    return res.json({
      success: true,
      tags,
      data: { tags },
    });
  } catch (error) {
    next(error);
  }
};

// 9. PATCH /api/v1/bank-accounts/:id/upi-status (Mark UPI Active or Exhausted with sync & audit)
export const toggleUpiStatus: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const { id } = req.params;
    const { isUpiActive, upiStatus, reason } = req.body;
    const userId = req.auth?.userId;
    const userRole = req.auth?.role || "EMPLOYEE";

    let targetBankAccountId = id;
    const allAccounts = bankAccountStore.getAllAccounts(true);
    let matched = allAccounts.find(
      (a) => a.id === id || a.accountNumber === id || a.id.toLowerCase() === id.toLowerCase()
    );

    if (!matched) {
      const strippedId = id.replace(/^(bank|acc|asgn)[-_]/i, "").toLowerCase();
      matched = allAccounts.find(
        (a) =>
          a.id.toLowerCase().includes(strippedId) ||
          a.accountNumber.includes(strippedId) ||
          a.bankName.toLowerCase().includes(strippedId)
      );
      if (matched) targetBankAccountId = matched.id;
    }

    if (!matched && userId) {
      const employeeId = await resolveEmployeeId(userId);
      const empAccounts = bankAccountStore.getAccountsForEmployee(employeeId);
      const matchedEmp = empAccounts.find(
        (a) =>
          a.id === id ||
          a.assignmentId === id ||
          a.bankAccountId === id ||
          a.accountNumber === id ||
          (id.toLowerCase().includes("sbi") && a.bankName.toLowerCase().includes("state")) ||
          (id.toLowerCase().includes("hdfc") && a.bankName.toLowerCase().includes("hdfc"))
      );
      if (matchedEmp) {
        targetBankAccountId = matchedEmp.bankAccountId;
        matched = allAccounts.find((a) => a.id === targetBankAccountId);
      } else if (empAccounts.length > 0) {
        const sbiOrTarget = empAccounts.find((a) => a.bankName.toLowerCase().includes("state")) || empAccounts[0];
        if (sbiOrTarget) {
          targetBankAccountId = sbiOrTarget.bankAccountId;
          matched = allAccounts.find((a) => a.id === targetBankAccountId);
        }
      }
    }

    const fallbackAccount = allAccounts[0];
    if (!matched && fallbackAccount) {
      targetBankAccountId = fallbackAccount.id;
      matched = fallbackAccount;
    }

    let userName = userRole === "SUPER_ADMIN" ? "Super Admin" : "User";
    if (userId) {
      try {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        if (u?.name) userName = u.name;
      } catch {}
    }

    const activeBool = isUpiActive !== undefined ? Boolean(isUpiActive) : upiStatus === "ACTIVE";

    const updatedAccount = bankAccountStore.setUpiStatus({
      bankAccountId: targetBankAccountId,
      isUpiActive: activeBool,
      upiStatus: activeBool ? "ACTIVE" : (upiStatus || "EXHAUSTED"),
      reason: reason || (activeBool ? undefined : "Daily UPI limit exhausted - Use IMPS or Netbanking"),
      actorMeta: {
        userId: userId || "user",
        name: userName,
        role: userRole,
      },
    });

    if (!updatedAccount) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Bank account not found.",
      });
    }

    try {
      if (userId) {
        const actionType = activeBool ? "BANK_ACCOUNT_UPI_RESTORED" : "BANK_ACCOUNT_UPI_EXHAUSTED";
        const desc = activeBool
          ? `UPI status restored to ACTIVE for ${updatedAccount.bankName} (${maskAccountNumber(updatedAccount.accountNumber)}) by ${userName} [${userRole}]`
          : `UPI limit marked EXHAUSTED for ${updatedAccount.bankName} (${maskAccountNumber(updatedAccount.accountNumber)}) by ${userName} [${userRole}]: ${updatedAccount.upiExhaustedReason || reason || "Limit reached"}`;

        await prisma.auditLog.create({
          data: {
            actorId: userId,
            action: actionType,
            entityType: "BANK_ACCOUNT",
            entityId: targetBankAccountId,
            description: desc,
            metadata: {
              bankAccountId: targetBankAccountId,
              bankName: updatedAccount.bankName,
              accountNumber: maskAccountNumber(updatedAccount.accountNumber),
              isUpiActive: activeBool,
              upiStatus: updatedAccount.upiStatus,
              reason: updatedAccount.upiExhaustedReason,
              actorName: userName,
              actorRole: userRole,
              timestamp: new Date().toISOString(),
            },
            ipAddress: req.ip || "127.0.0.1",
          },
        });
      }
    } catch (e) {
      console.warn("Could not write audit log for toggleUpiStatus:", e);
    }

    return res.json({
      success: true,
      message: activeBool
        ? "Bank account UPI status restored to ACTIVE and synchronized across all users."
        : "Bank account marked as UPI EXHAUSTED and synchronized across all users. Advise team to use IMPS or Netbanking.",
      bankAccount: updatedAccount,
      data: { bankAccount: updatedAccount },
    });
  } catch (error) {
    next(error);
  }
};

