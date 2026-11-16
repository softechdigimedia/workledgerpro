import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/role.middleware";
import { validate } from "../../middleware/validate.middleware";
import { validationSchemas as v } from "../../middleware/common.validation";
import {
  getDashboard,
  getFinance,
  submitEntry,
  getEntries,
  submitPunch,
  getPunches,
  checkIn,
  checkOut,
  getAttendanceStatus,
  requestFloatReplenishment,
  getFloatRequests,
  updateProfile,
  getFinanceBalance,
  getFinanceHistory,
  getEntryById,
  cancelEntry,
} from "./employee.controller";
import { getCurrentUser } from "../auth/auth.controller";
import {
  getEmployeeBankAccounts,
  addOrAssignBankAccount,
  setPrimaryBankAccount,
  removeEmployeeBankAccount,
  addCustomTag,
  removeCustomTag,
  toggleUpiStatus,
} from "../bank-account/bank-account.controller";

const router = Router();

// Allow authenticated EMPLOYEE (and SUPER_ADMIN / SUB_ADMIN for testing)
router.use(authenticate, authorize("EMPLOYEE", "SUPER_ADMIN", "SUB_ADMIN"));

router.get("/profile", getCurrentUser);
router.patch("/profile", updateProfile);
router.get("/dashboard", getDashboard);
router.get("/finance", getFinance);
router.get("/finance/balance", getFinanceBalance);
router.get("/finance/history", getFinanceHistory);
router.post("/finance/request", validate({ body: v.floatRequest }), requestFloatReplenishment);
router.get("/finance/requests", getFloatRequests);
router.post("/requests", validate({ body: v.floatRequest }), requestFloatReplenishment);
router.get("/requests", getFloatRequests);
router.post("/entries", validate({ body: v.employeeEntry }), submitEntry);
router.get("/entries", getEntries);
router.get("/entries/:id", validate({ params: v.idParams }), getEntryById);
router.post("/entries/:id/cancel", validate({ params: v.idParams }), cancelEntry);
router.post("/punches", validate({ body: v.punch }), submitPunch);
router.get("/punches", getPunches);

// Bank Accounts & Dropdown Selection endpoints
router.get("/bank-accounts", getEmployeeBankAccounts);
router.post("/bank-accounts", validate({ body: v.bankAccount }), addOrAssignBankAccount);
router.patch("/bank-accounts/:id/primary", validate({ params: v.idParams, body: v.primary }), setPrimaryBankAccount);
router.delete("/bank-accounts/:id", validate({ params: v.idParams }), removeEmployeeBankAccount);
router.post("/bank-accounts/:id/tags", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.patch("/bank-accounts/:id/tags", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.put("/bank-accounts/:id/tags", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.post("/bank-accounts/:id/tag", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.patch("/bank-accounts/:id/tag", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.put("/bank-accounts/:id/tag", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.delete("/bank-accounts/:id/tags/:tag", validate({ params: v.idAndTagParams }), removeCustomTag);
router.delete("/bank-accounts/:id/tag/:tag", validate({ params: v.idAndTagParams }), removeCustomTag);
router.patch("/bank-accounts/:id/upi-status", validate({ params: v.idParams, body: v.upiStatus }), toggleUpiStatus);
router.post("/bank-accounts/:id/upi-status", validate({ params: v.idParams, body: v.upiStatus }), toggleUpiStatus);

// Attendance & Check-in / Check-out endpoints
router.post("/attendance/check-in", validate({ body: v.attendance }), checkIn);
router.post("/attendance/check-out", validate({ body: v.attendance }), checkOut);
router.post("/attendance/punch", validate({ body: v.punch }), submitPunch);
router.get("/attendance/status", getAttendanceStatus);
router.get("/attendance/today", getAttendanceStatus);
router.get("/attendance/history", getPunches);
router.get("/attendance", getPunches);

export default router;

