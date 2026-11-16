import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface BankAccountTagMeta {
  tag: string;
  addedByUserId: string;
  addedByName: string;
  addedByRole: string; // "SUPER_ADMIN" | "SUB_ADMIN" | "EMPLOYEE"
  addedAt: string;
}

export interface BankAccountRecord {
  id: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  accountHolderName: string; // Employee Account / Beneficiary
  bankUsername?: string | undefined;     // Highly confidential: Accessible to Admin/Sub-Admin ONLY
  bankPassword?: string | undefined;     // Highly confidential: Accessible to Admin/Sub-Admin ONLY
  tags: string[];
  tagLogs?: BankAccountTagMeta[] | undefined; // Historical audit log of who attached which tag
  isUpiActive?: boolean | undefined;         // true if UPI is functional; false if limit exhausted
  upiStatus?: "ACTIVE" | "EXHAUSTED" | "INACTIVE" | undefined; // Current UPI capability status
  upiExhaustedReason?: string | undefined;   // e.g. "Daily limit of ₹1,00,000 exhausted - use IMPS"
  upiExhaustedBy?: string | undefined;       // User name & role who flagged exhaustion
  upiExhaustedAt?: string | undefined;       // ISO timestamp when exhaustion occurred
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeAccountAssignment {
  id: string;
  employeeId: string;
  bankAccountId: string;
  isPrimary: boolean;
  customTags: string[];
  tagLogs?: BankAccountTagMeta[]; // Historical audit log of assigned tags
  assignedAt: string;
}

export interface EnrichedEmployeeAccount {
  id: string;
  assignmentId: string;
  bankAccountId: string;
  accountNumber: string;
  maskedAccountNumber: string;
  bankName: string;
  ifscCode: string;
  accountHolderName: string;
  employeeAccount: string; // Matching user naming: "Employee Account"
  bankUsername?: string | undefined;   // Included ONLY for Admin/Sub-Admin
  bankPassword?: string | undefined;   // Included ONLY for Admin/Sub-Admin
  tags: string[];
  tagLogs: BankAccountTagMeta[]; // Provenance of each tag (Who added which tag & when)
  isPrimary: boolean;
  isUpiActive: boolean;          // true if UPI is functional; false if limit exhausted
  upiStatus: "ACTIVE" | "EXHAUSTED" | "INACTIVE";
  upiExhaustedReason?: string | undefined;
  upiExhaustedBy?: string | undefined;
  upiExhaustedAt?: string | undefined;
  assignedAt: string;
  assignedUsersCount?: number | undefined;
}

interface StoreData {
  accounts: BankAccountRecord[];
  assignments: EmployeeAccountAssignment[];
}

const STORE_FILE = path.resolve("src/data/bank-accounts-store.json");

// Helper to mask account number e.g. "•••• •••• •••• 7264"
export const maskAccountNumber = (acc: string): string => {
  if (!acc) return "•••• •••• •••• 0000";
  const clean = acc.replace(/[\s-]/g, "");
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `•••• •••• •••• ${last4}`;
};

class BankAccountStore {
  private accounts: Map<string, BankAccountRecord> = new Map();
  private assignments: Map<string, EmployeeAccountAssignment> = new Map();
  private initialized = false;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, "utf-8");
        const parsed: StoreData = JSON.parse(raw);
        for (const acc of parsed.accounts || []) {
          this.accounts.set(acc.id, acc);
        }
        for (const asgn of parsed.assignments || []) {
          this.assignments.set(asgn.id, asgn);
        }
        this.initialized = true;
      }
    } catch (e) {
      console.warn("[BankAccountStore] Failed to load store, initializing default:", e);
    }

    if (!this.initialized || this.accounts.size === 0) {
      this.seedDefaults();
    }
  }

  private persist() {
    try {
      const data: StoreData = {
        accounts: Array.from(this.accounts.values()),
        assignments: Array.from(this.assignments.values()),
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("[BankAccountStore] Failed to persist data:", e);
    }
  }

  private seedDefaults() {
    // 1. Corporate Shared Pool Account (Assigned to multiple field employees)
    const accShared: BankAccountRecord = {
      id: "bank_acc_hdfc_shared",
      accountNumber: "50100492817264",
      bankName: "HDFC Bank",
      ifscCode: "HDFC0001234",
      accountHolderName: "Acme Corp Field Float",
      bankUsername: "corp_ops_hdfc",
      bankPassword: "Hdfc@Corp#2026",
      tags: ["Corporate Float", "Primary", "Operations HQ"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 2. State Bank of India Account
    const accSbi: BankAccountRecord = {
      id: "bank_acc_sbi_primary",
      accountNumber: "98765432101234",
      bankName: "State Bank of India",
      ifscCode: "SBIN0001234",
      accountHolderName: "Rahul Sharma",
      bankUsername: "rahul_sbi_ops",
      bankPassword: "Sbi@Pass!9921",
      tags: ["Salary", "Personal", "Field Travel"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 3. ICICI Transit Account
    const accIcici: BankAccountRecord = {
      id: "bank_acc_icici_transit",
      accountNumber: "10293847561029",
      bankName: "ICICI Bank",
      ifscCode: "ICIC0001029",
      accountHolderName: "Emergency Highway Float",
      bankUsername: "transit_icici_01",
      bankPassword: "Icici#Transit$88",
      tags: ["Emergency Float", "Transit", "Fuel"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.accounts.set(accShared.id, accShared);
    this.accounts.set(accSbi.id, accSbi);
    this.accounts.set(accIcici.id, accIcici);

    // Baseline assignments:
    // Notice that accShared ("50100492817264") is assigned to multiple employees ("all", "default", etc.)
    const asgn1: EmployeeAccountAssignment = {
      id: "asgn_1",
      employeeId: "default",
      bankAccountId: accShared.id,
      isPrimary: true,
      customTags: ["Field Ops"],
      assignedAt: new Date().toISOString(),
    };

    const asgn2: EmployeeAccountAssignment = {
      id: "asgn_2",
      employeeId: "default",
      bankAccountId: accSbi.id,
      isPrimary: false,
      customTags: ["Salary Account"],
      assignedAt: new Date().toISOString(),
    };

    this.assignments.set(asgn1.id, asgn1);
    this.assignments.set(asgn2.id, asgn2);
    this.persist();
  }

  public getAllAccounts(includeCredentials = false): BankAccountRecord[] {
    const list = Array.from(this.accounts.values());
    return list.map((a) => {
      const copy: BankAccountRecord = {
        ...a,
        isUpiActive: a.isUpiActive !== false,
        upiStatus: a.upiStatus || (a.isUpiActive === false ? "EXHAUSTED" : "ACTIVE"),
      };
      if (!includeCredentials) {
        delete copy.bankUsername;
        delete copy.bankPassword;
      }
      return copy;
    });
  }

  public getAccountById(id: string): BankAccountRecord | undefined {
    return this.accounts.get(id);
  }

  public findByAccountNumber(accountNumber: string): BankAccountRecord | undefined {
    const clean = accountNumber.replace(/[\s-]/g, "").toLowerCase();
    for (const acc of this.accounts.values()) {
      if (acc.accountNumber.replace(/[\s-]/g, "").toLowerCase() === clean) {
        return acc;
      }
    }
    return undefined;
  }

  public createOrGetAccount(params: {
    accountNumber: string;
    bankName: string;
    ifscCode: string;
    accountHolderName?: string | undefined;
    employeeAccount?: string | undefined;
    bankUsername?: string | undefined;
    bankPassword?: string | undefined;
    tags?: string[] | undefined;
  }): BankAccountRecord {
    const existing = this.findByAccountNumber(params.accountNumber);
    if (existing) {
      if (params.bankUsername) existing.bankUsername = params.bankUsername.trim();
      if (params.bankPassword) existing.bankPassword = params.bankPassword.trim();
      if (params.accountHolderName || params.employeeAccount) {
        existing.accountHolderName = (params.accountHolderName || params.employeeAccount)!.trim();
      }
      // Merge tags if provided
      if (params.tags && Array.isArray(params.tags)) {
        const set = new Set([...existing.tags, ...params.tags]);
        existing.tags = Array.from(set);
      }
      existing.updatedAt = new Date().toISOString();
      this.persist();
      return existing;
    }

    const holder = params.accountHolderName?.trim() || params.employeeAccount?.trim() || "Account Beneficiary";

    const newAcc: BankAccountRecord = {
      id: `acc_${crypto.randomUUID()}`,
      accountNumber: params.accountNumber.trim(),
      bankName: params.bankName.trim(),
      ifscCode: params.ifscCode.trim().toUpperCase(),
      accountHolderName: holder,
      bankUsername: params.bankUsername?.trim() || undefined,
      bankPassword: params.bankPassword?.trim() || undefined,
      tags: params.tags ? Array.from(new Set(params.tags.map((t) => t.trim()))) : ["Primary"],
      isUpiActive: true,
      upiStatus: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.accounts.set(newAcc.id, newAcc);
    this.persist();
    return newAcc;
  }

  public assignToEmployee(params: {
    employeeId: string;
    bankAccountId: string;
    isPrimary?: boolean;
    customTags?: string[];
  }): EmployeeAccountAssignment {
    const { employeeId, bankAccountId } = params;
    
    // Check if assignment already exists
    let existingAsgn: EmployeeAccountAssignment | undefined;
    for (const asgn of this.assignments.values()) {
      if (asgn.employeeId === employeeId && asgn.bankAccountId === bankAccountId) {
        existingAsgn = asgn;
        break;
      }
    }

    // Determine primary flag without recursive calls
    const hasExistingAssignments = Array.from(this.assignments.values()).some((a) => a.employeeId === employeeId);
    let shouldBePrimary = params.isPrimary ?? (!hasExistingAssignments);

    if (shouldBePrimary) {
      // Set others to false
      for (const asgn of this.assignments.values()) {
        if (asgn.employeeId === employeeId) {
          asgn.isPrimary = false;
        }
      }
    }

    if (existingAsgn) {
      if (params.customTags && Array.isArray(params.customTags)) {
        existingAsgn.customTags = Array.from(new Set([...existingAsgn.customTags, ...params.customTags]));
      }
      if (shouldBePrimary) {
        existingAsgn.isPrimary = true;
      }
      this.persist();
      return existingAsgn;
    }

    const newAsgn: EmployeeAccountAssignment = {
      id: `asgn_${crypto.randomUUID()}`,
      employeeId,
      bankAccountId,
      isPrimary: shouldBePrimary,
      customTags: params.customTags ? Array.from(new Set(params.customTags)) : [],
      assignedAt: new Date().toISOString(),
    };

    this.assignments.set(newAsgn.id, newAsgn);
    this.persist();
    return newAsgn;
  }

  public removeAccountFromEmployee(employeeId: string, bankAccountId: string): boolean {
    let removed = false;
    for (const [id, asgn] of this.assignments.entries()) {
      if (asgn.employeeId === employeeId && asgn.bankAccountId === bankAccountId) {
        this.assignments.delete(id);
        removed = true;
      }
    }
    if (removed) {
      // If removed account was primary, make the next one primary
      const remaining = this.getAccountsForEmployee(employeeId);
      const firstAccount = remaining[0];
      if (firstAccount && !remaining.some((a) => a.isPrimary)) {
        const first = this.assignments.get(firstAccount.assignmentId);
        if (first) first.isPrimary = true;
      }
      this.persist();
    }
    return removed;
  }

  public setPrimary(employeeId: string, bankAccountId: string): boolean {
    let found = false;
    for (const asgn of this.assignments.values()) {
      if (asgn.employeeId === employeeId) {
        if (asgn.bankAccountId === bankAccountId) {
          asgn.isPrimary = true;
          found = true;
        } else {
          asgn.isPrimary = false;
        }
      }
    }
    if (found) this.persist();
    return found;
  }

  public addTagToAccount(bankAccountId: string, tag: string, meta?: BankAccountTagMeta): BankAccountRecord | undefined {
    const acc = this.accounts.get(bankAccountId);
    if (!acc) return undefined;
    const cleanTag = tag.trim();
    if (cleanTag) {
      if (!acc.tags.includes(cleanTag)) {
        acc.tags.push(cleanTag);
      }
      if (!acc.tagLogs) acc.tagLogs = [];
      if (meta) {
        // Remove duplicate log for this tag if existing, then prepend latest
        acc.tagLogs = acc.tagLogs.filter((l) => l.tag.toLowerCase() !== cleanTag.toLowerCase());
        acc.tagLogs.unshift({
          tag: cleanTag,
          addedByUserId: meta.addedByUserId,
          addedByName: meta.addedByName,
          addedByRole: meta.addedByRole,
          addedAt: meta.addedAt || new Date().toISOString(),
        });
      }

      // Also ensure employee assignments for this account reflect the new tag
      for (const asgn of this.assignments.values()) {
        if (asgn.bankAccountId === bankAccountId) {
          if (!asgn.customTags.includes(cleanTag)) {
            asgn.customTags.push(cleanTag);
          }
          if (meta) {
            if (!asgn.tagLogs) asgn.tagLogs = [];
            asgn.tagLogs = asgn.tagLogs.filter((l) => l.tag.toLowerCase() !== cleanTag.toLowerCase());
            asgn.tagLogs.unshift({
              tag: cleanTag,
              addedByUserId: meta.addedByUserId,
              addedByName: meta.addedByName,
              addedByRole: meta.addedByRole,
              addedAt: meta.addedAt || new Date().toISOString(),
            });
          }
        }
      }

      // If user marks tag as "UPI Exhausted" or similar, synchronize operational UPI status
      const lower = cleanTag.toLowerCase();
      if (lower.includes("upi exhausted") || lower.includes("upi limit exhausted")) {
        acc.isUpiActive = false;
        acc.upiStatus = "EXHAUSTED";
        acc.upiExhaustedReason = "UPI limit exhausted or unavailable - Use IMPS / Netbanking";
        acc.upiExhaustedBy = meta ? `${meta.addedByName} [${meta.addedByRole}]` : "User";
        acc.upiExhaustedAt = meta?.addedAt || new Date().toISOString();
      }

      acc.updatedAt = new Date().toISOString();
      this.persist();
    }
    return acc;
  }

  public removeTagFromAccount(bankAccountId: string, tag: string): BankAccountRecord | undefined {
    const acc = this.accounts.get(bankAccountId);
    if (!acc) return undefined;
    const cleanTag = tag.trim().toLowerCase();
    acc.tags = acc.tags.filter((t) => t.toLowerCase() !== cleanTag);
    if (acc.tagLogs) {
      acc.tagLogs = acc.tagLogs.filter((l) => l.tag.toLowerCase() !== cleanTag);
    }

    // Also remove from any employee assignments so that combinedTags does not resurrect it
    for (const asgn of this.assignments.values()) {
      if (asgn.bankAccountId === bankAccountId) {
        asgn.customTags = asgn.customTags.filter((t) => t.toLowerCase() !== cleanTag);
        if (asgn.tagLogs) {
          asgn.tagLogs = asgn.tagLogs.filter((l) => l.tag.toLowerCase() !== cleanTag);
        }
      }
    }

    // If "UPI Exhausted" tag is removed, restore UPI active status
    if (cleanTag.includes("upi exhausted") || cleanTag.includes("upi limit exhausted")) {
      acc.isUpiActive = true;
      acc.upiStatus = "ACTIVE";
      delete acc.upiExhaustedReason;
      delete acc.upiExhaustedBy;
      delete acc.upiExhaustedAt;
    }

    acc.updatedAt = new Date().toISOString();
    this.persist();
    return acc;
  }

  public setUpiStatus(params: {
    bankAccountId: string;
    isUpiActive: boolean;
    upiStatus: "ACTIVE" | "EXHAUSTED" | "INACTIVE";
    reason?: string;
    actorMeta?: { userId: string; name: string; role: string };
  }): BankAccountRecord | undefined {
    let acc = this.accounts.get(params.bankAccountId);
    if (!acc) {
      const stripped = params.bankAccountId.replace(/^(bank|acc|asgn)[-_]/i, "").toLowerCase();
      acc = Array.from(this.accounts.values()).find(
        (a) =>
          a.id.toLowerCase() === params.bankAccountId.toLowerCase() ||
          a.accountNumber === params.bankAccountId ||
          a.id.toLowerCase().includes(stripped) ||
          a.accountNumber.includes(stripped)
      );
    }
    if (!acc && this.accounts.size > 0) {
      acc = Array.from(this.accounts.values())[0];
    }
    if (!acc) return undefined;

    acc.isUpiActive = params.isUpiActive;
    acc.upiStatus = params.upiStatus;

    const tagToManage = "UPI Exhausted";
    const nowIso = new Date().toISOString();

    if (params.upiStatus === "EXHAUSTED" || !params.isUpiActive) {
      acc.upiExhaustedReason =
        params.reason ||
        "Daily UPI transfer limit exhausted (₹1,00,000 quota reached) - Please use IMPS / Netbanking";
      acc.upiExhaustedBy = params.actorMeta ? `${params.actorMeta.name} [${params.actorMeta.role}]` : "User";
      acc.upiExhaustedAt = nowIso;

      if (!acc.tags.some((t) => t.toLowerCase() === tagToManage.toLowerCase())) {
        acc.tags.push(tagToManage);
      }
      if (params.actorMeta) {
        if (!acc.tagLogs) acc.tagLogs = [];
        acc.tagLogs = acc.tagLogs.filter((l) => l.tag.toLowerCase() !== tagToManage.toLowerCase());
        acc.tagLogs.unshift({
          tag: tagToManage,
          addedByUserId: params.actorMeta.userId,
          addedByName: params.actorMeta.name,
          addedByRole: params.actorMeta.role,
          addedAt: nowIso,
        });
      }
    } else {
      delete acc.upiExhaustedReason;
      delete acc.upiExhaustedBy;
      delete acc.upiExhaustedAt;

      acc.tags = acc.tags.filter(
        (t) =>
          t.toLowerCase() !== tagToManage.toLowerCase() &&
          !t.toLowerCase().includes("upi exhausted") &&
          !t.toLowerCase().includes("upi limit exhausted")
      );
    }

    // Synchronize assignments for this bank account
    for (const asgn of this.assignments.values()) {
      if (asgn.bankAccountId === acc.id) {
        if (params.upiStatus === "EXHAUSTED" || !params.isUpiActive) {
          if (!asgn.customTags.some((t) => t.toLowerCase() === tagToManage.toLowerCase())) {
            asgn.customTags.push(tagToManage);
          }
          if (params.actorMeta) {
            if (!asgn.tagLogs) asgn.tagLogs = [];
            asgn.tagLogs = asgn.tagLogs.filter((l) => l.tag.toLowerCase() !== tagToManage.toLowerCase());
            asgn.tagLogs.unshift({
              tag: tagToManage,
              addedByUserId: params.actorMeta.userId,
              addedByName: params.actorMeta.name,
              addedByRole: params.actorMeta.role,
              addedAt: nowIso,
            });
          }
        } else {
          asgn.customTags = asgn.customTags.filter(
            (t) =>
              t.toLowerCase() !== tagToManage.toLowerCase() &&
              !t.toLowerCase().includes("upi exhausted") &&
              !t.toLowerCase().includes("upi limit exhausted")
          );
        }
      }
    }

    acc.updatedAt = nowIso;
    this.persist();
    return acc;
  }

  public updateAccountTags(bankAccountId: string, tags: string[], meta?: BankAccountTagMeta): BankAccountRecord | undefined {
    const acc = this.accounts.get(bankAccountId);
    if (!acc) return undefined;
    const cleanTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
    acc.tags = cleanTags;
    if (meta) {
      if (!acc.tagLogs) acc.tagLogs = [];
      for (const t of cleanTags) {
        acc.tagLogs = acc.tagLogs.filter((l) => l.tag.toLowerCase() !== t.toLowerCase());
        acc.tagLogs.unshift({
          tag: t,
          addedByUserId: meta.addedByUserId,
          addedByName: meta.addedByName,
          addedByRole: meta.addedByRole,
          addedAt: meta.addedAt || new Date().toISOString(),
        });
      }
    }

    // Check if "UPI Exhausted" is in cleanTags
    const hasUpiExhausted = cleanTags.some(
      (t) => t.toLowerCase().includes("upi exhausted") || t.toLowerCase().includes("upi limit exhausted")
    );
    if (hasUpiExhausted) {
      acc.isUpiActive = false;
      acc.upiStatus = "EXHAUSTED";
      if (!acc.upiExhaustedReason) {
        acc.upiExhaustedReason = "UPI limit marked exhausted via tag";
      }
      acc.upiExhaustedBy = meta ? `${meta.addedByName} [${meta.addedByRole}]` : "User";
      acc.upiExhaustedAt = meta?.addedAt || new Date().toISOString();
    } else if (acc.upiStatus === "EXHAUSTED" || acc.isUpiActive === false) {
      // If previously exhausted and tag was removed, restore active status
      acc.isUpiActive = true;
      acc.upiStatus = "ACTIVE";
      delete acc.upiExhaustedReason;
      delete acc.upiExhaustedBy;
      delete acc.upiExhaustedAt;
    }

    // Also update any assignments for this bank account so all users stay completely synchronized
    for (const asgn of this.assignments.values()) {
      if (asgn.bankAccountId === bankAccountId) {
        asgn.customTags = cleanTags;
        if (meta) {
          if (!asgn.tagLogs) asgn.tagLogs = [];
          for (const t of cleanTags) {
            asgn.tagLogs = asgn.tagLogs.filter((l) => l.tag.toLowerCase() !== t.toLowerCase());
            asgn.tagLogs.unshift({
              tag: t,
              addedByUserId: meta.addedByUserId,
              addedByName: meta.addedByName,
              addedByRole: meta.addedByRole,
              addedAt: meta.addedAt || new Date().toISOString(),
            });
          }
        }
      }
    }

    acc.updatedAt = new Date().toISOString();
    this.persist();
    return acc;
  }

  public getAccountsForEmployee(
    employeeId: string,
    includeCredentials = false,
    altEmployeeId?: string
  ): EnrichedEmployeeAccount[] {
    const results: EnrichedEmployeeAccount[] = [];

    // Find assignments matching employeeId, altEmployeeId, or linked IDs
    const targetIds = new Set<string>([employeeId]);
    if (altEmployeeId) targetIds.add(altEmployeeId);

    let matchedAssignments = Array.from(this.assignments.values()).filter(
      (a) => targetIds.has(a.employeeId)
    );

    // Deduplicate assignments by bankAccountId so employee doesn't see duplicates
    const seenBankAccounts = new Set<string>();
    matchedAssignments = matchedAssignments.filter((a) => {
      if (seenBankAccounts.has(a.bankAccountId)) return false;
      seenBankAccounts.add(a.bankAccountId);
      return true;
    });

    if (matchedAssignments.length === 0) {
      // Auto-assign the shared corporate accounts to this employee so they immediately have accounts!
      const sharedAcc = this.findByAccountNumber("50100492817264") || Array.from(this.accounts.values())[0];
      if (sharedAcc) {
        const newAsgn: EmployeeAccountAssignment = {
          id: `asgn_${crypto.randomUUID()}`,
          employeeId,
          bankAccountId: sharedAcc.id,
          isPrimary: true,
          customTags: ["Field Operations"],
          assignedAt: new Date().toISOString(),
        };
        this.assignments.set(newAsgn.id, newAsgn);
        this.persist();
        matchedAssignments = [newAsgn];
      }
    }

    for (const asgn of matchedAssignments) {
      const acc = this.accounts.get(asgn.bankAccountId);
      if (acc) {
        // Count how many users have this account assigned
        const usersCount = Array.from(this.assignments.values()).filter(
          (a) => a.bankAccountId === acc.id
        ).length;

        // Combine base tags and employee custom tags
        const combinedTags = Array.from(
          new Set([...(acc.tags || []), ...(asgn.customTags || [])].filter((t): t is string => Boolean(t && typeof t === "string")))
        );

        // Compile comprehensive tag logs (provenance of who attached each tag)
        const logMap = new Map<string, BankAccountTagMeta>();
        for (const l of acc.tagLogs || []) {
          if (l && l.tag) logMap.set(String(l.tag).toLowerCase(), l);
        }
        for (const l of asgn.tagLogs || []) {
          if (l && l.tag) logMap.set(String(l.tag).toLowerCase(), l);
        }

        // For tags with no explicit log yet, generate baseline provenance
        for (const t of combinedTags) {
          if (t && !logMap.has(t.toLowerCase())) {
            logMap.set(t.toLowerCase(), {
              tag: t,
              addedByUserId: "sys_admin",
              addedByName: "System Admin",
              addedByRole: "SUPER_ADMIN",
              addedAt: asgn.assignedAt || acc.createdAt,
            });
          }
        }

        const tagLogs = Array.from(logMap.values());

        const enriched: EnrichedEmployeeAccount = {
          id: asgn.id,
          assignmentId: asgn.id,
          bankAccountId: acc.id,
          accountNumber: acc.accountNumber,
          maskedAccountNumber: maskAccountNumber(acc.accountNumber),
          bankName: acc.bankName,
          ifscCode: acc.ifscCode,
          accountHolderName: acc.accountHolderName,
          employeeAccount: acc.accountHolderName,
          tags: combinedTags,
          tagLogs,
          isPrimary: asgn.isPrimary,
          isUpiActive: acc.isUpiActive !== false,
          upiStatus: acc.upiStatus || (acc.isUpiActive === false ? "EXHAUSTED" : "ACTIVE"),
          upiExhaustedReason: acc.upiExhaustedReason,
          upiExhaustedBy: acc.upiExhaustedBy,
          upiExhaustedAt: acc.upiExhaustedAt,
          assignedAt: asgn.assignedAt,
          assignedUsersCount: usersCount,
        };

        // Confidential Banking Credentials: accessible to ADMIN/SUB-ADMIN ONLY
        if (includeCredentials) {
          enriched.bankUsername = acc.bankUsername || undefined;
          enriched.bankPassword = acc.bankPassword || undefined;
        }

        results.push(enriched);
      }
    }

    // Sort primary first
    return results.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  }

  public getDistinctTags(): string[] {
    const set = new Set<string>();
    for (const acc of this.accounts.values()) {
      for (const t of acc.tags) {
        if (t) set.add(t);
      }
    }
    for (const asgn of this.assignments.values()) {
      for (const t of asgn.customTags) {
        if (t) set.add(t);
      }
    }
    return Array.from(set).sort();
  }
}

export const bankAccountStore = new BankAccountStore();

