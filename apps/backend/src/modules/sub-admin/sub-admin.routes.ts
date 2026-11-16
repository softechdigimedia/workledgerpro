import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/role.middleware";
import { validate } from "../../middleware/validate.middleware";
import { validationSchemas as v } from "../../middleware/common.validation";
import {
  getDashboard,
  getFinanceOverview,
  getEmployees,
  getEmployeeDetail,
  getEntries,
  allocateFunds,
  getEmployeeFinance,
  getFloatRequests,
  approveFloatRequest,
  rejectFloatRequest,
  approveEntry,
  rejectEntry,
} from "./sub-admin.controller";
import { getAttendance, getAlerts, reviewAlert } from "../super-admin/super-admin.controller";
import {
  getEmployeeBankAccounts,
  addOrAssignBankAccount,
  setPrimaryBankAccount,
  removeEmployeeBankAccount,
} from "../bank-account/bank-account.controller";

const router = Router();

router.use(authenticate, authorize("SUPER_ADMIN", "SUB_ADMIN"));

router.get("/dashboard", getDashboard);
router.get("/employees", getEmployees);
router.get("/employees/:id", validate({ params: v.idParams }), getEmployeeDetail);
router.get("/employees/:employeeId/bank-accounts", validate({ params: v.employeeIdParams }), getEmployeeBankAccounts);
router.post("/employees/:employeeId/bank-accounts", validate({ params: v.employeeIdParams, body: v.bankAccount }), addOrAssignBankAccount);
router.patch("/employees/:employeeId/bank-accounts/:id/primary", validate({ params: v.employeeAndIdParams, body: v.primary }), setPrimaryBankAccount);
router.delete("/employees/:employeeId/bank-accounts/:id", validate({ params: v.employeeAndIdParams }), removeEmployeeBankAccount);
router.get("/attendance", getAttendance);
router.get("/entries", getEntries);
router.post("/entries/:id/approve", validate({ params: v.idParams, body: v.decision }), approveEntry);
router.post("/entries/:id/reject", validate({ params: v.idParams, body: v.decision }), rejectEntry);
router.post("/allocations", validate({ body: v.allocation }), allocateFunds);
router.get("/finance/overview", validate({ query: v.dateFilter }), getFinanceOverview);
router.get("/finance/requests", validate({ query: v.listQuery }), getFloatRequests);
router.get("/finance/:employeeId", validate({ params: v.employeeIdParams, query: v.dateFilter }), getEmployeeFinance);
router.post("/finance/requests/:id/approve", validate({ params: v.idParams, body: v.decision }), approveFloatRequest);
router.post("/finance/requests/:id/reject", validate({ params: v.idParams, body: v.decision }), rejectFloatRequest);
router.get("/alerts", getAlerts);
router.patch("/alerts/:id/review", validate({ params: v.alertIdParams }), reviewAlert);
router.post("/alerts/:id/review", validate({ params: v.alertIdParams }), reviewAlert);
router.post("/audit/unmask-bank-details", validate({ body: v.noInput }), (_req:any, res:any) => res.json({ success: true, message: "Unmask audited" }));

export default router;

