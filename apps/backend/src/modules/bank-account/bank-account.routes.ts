import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { validationSchemas as v } from "../../middleware/common.validation";
import {
  getAllBankAccounts,
  getEmployeeBankAccounts,
  addOrAssignBankAccount,
  setPrimaryBankAccount,
  removeEmployeeBankAccount,
  addCustomTag,
  removeCustomTag,
  getDistinctTags,
  toggleUpiStatus,
} from "./bank-account.controller";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Master accounts directory & tags
router.get("/", getAllBankAccounts);
router.get("/tags", getDistinctTags);
router.post("/:id/tags", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.patch("/:id/tags", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.put("/:id/tags", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.post("/:id/tag", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.patch("/:id/tag", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.put("/:id/tag", validate({ params: v.idParams, body: v.bankTags }), addCustomTag);
router.delete("/:id/tags/:tag", validate({ params: v.idAndTagParams }), removeCustomTag);
router.delete("/:id/tag/:tag", validate({ params: v.idAndTagParams }), removeCustomTag);

// UPI Exhaustion & Availability status toggle (Multi-user sync)
router.patch("/:id/upi-status", validate({ params: v.idParams, body: v.upiStatus }), toggleUpiStatus);
router.post("/:id/upi-status", validate({ params: v.idParams, body: v.upiStatus }), toggleUpiStatus);

// Employee specific bank accounts
router.get("/employee/:employeeId", validate({ params: v.employeeIdParams, query: v.bankAccountQuery }), getEmployeeBankAccounts);
router.post("/employee/:employeeId", validate({ params: v.employeeIdParams, body: v.bankAccount }), addOrAssignBankAccount);
router.patch("/employee/:employeeId/primary/:id", validate({ params: v.employeeAndIdParams, body: v.primary }), setPrimaryBankAccount);
router.delete("/employee/:employeeId/:id", validate({ params: v.employeeAndIdParams }), removeEmployeeBankAccount);

export default router;

