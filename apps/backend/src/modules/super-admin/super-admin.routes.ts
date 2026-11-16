import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/role.middleware";
import { validate } from "../../middleware/validate.middleware";
import { validationSchemas as v } from "../../middleware/common.validation";
import {
  getDashboard,
  getUsers,
  createUser,
  toggleUserStatus,
  changeUserPassword,
  getSubAdmins,
  getAllEmployees,
  assignEmployee,
  getAttendance,
  getFinance,
  getAuditLogs,
  getAlerts,
  reviewAlert,
  getReports,
  getSettings,
  updateSettings,
} from "./super-admin.controller";
import {
  allocateFunds,
  getEmployeeDetail,
  getFloatRequests,
  approveFloatRequest,
  rejectFloatRequest,
} from "../sub-admin/sub-admin.controller";
import {
  getEmployeeBankAccounts,
  addOrAssignBankAccount,
  setPrimaryBankAccount,
  removeEmployeeBankAccount,
} from "../bank-account/bank-account.controller";

const router = Router();

// Require authenticated SUPER_ADMIN for all routes in this module
router.use(authenticate, authorize("SUPER_ADMIN"));

router.get("/dashboard", getDashboard);
router.get("/users", validate({ query: v.listQuery }), getUsers);
router.post("/users", validate({ body: v.createUser }), createUser);
router.patch("/users/:id/status", validate({ params: v.idParams, body: v.userStatus }), toggleUserStatus);
router.patch("/users/:id", validate({ params: v.idParams, body: v.userStatus }), toggleUserStatus);
router.post("/users/:id/change-password", validate({ params: v.idParams, body: v.changePassword }), changeUserPassword);
router.patch("/users/:id/password", validate({ params: v.idParams, body: v.changePassword }), changeUserPassword);
router.post("/employees/:id/change-password", validate({ params: v.idParams, body: v.changePassword }), changeUserPassword);

router.get("/sub-admins", getSubAdmins);
router.get("/employees", getAllEmployees);
router.get("/employees/:id", validate({ params: v.idParams }), getEmployeeDetail);
router.get("/employees/:employeeId/bank-accounts", validate({ params: v.employeeIdParams }), getEmployeeBankAccounts);
router.post("/employees/:employeeId/bank-accounts", validate({ params: v.employeeIdParams, body: v.bankAccount }), addOrAssignBankAccount);
router.patch("/employees/:employeeId/bank-accounts/:id/primary", validate({ params: v.employeeAndIdParams, body: v.primary }), setPrimaryBankAccount);
router.delete("/employees/:employeeId/bank-accounts/:id", validate({ params: v.employeeAndIdParams }), removeEmployeeBankAccount);
router.post("/employees", validate({ body: v.createUser }), createUser);
router.post("/assignments", validate({ body: v.assignment }), assignEmployee);
router.post("/allocations", validate({ body: v.allocation }), allocateFunds);
router.get("/finance/requests", validate({ query: v.listQuery }), getFloatRequests);
router.post("/finance/requests/:id/approve", validate({ params: v.idParams, body: v.decision }), approveFloatRequest);
router.post("/finance/requests/:id/reject", validate({ params: v.idParams, body: v.decision }), rejectFloatRequest);

router.get("/attendance", getAttendance);
router.get("/finance", validate({ query: v.dateFilter }), getFinance);
router.get("/audit-logs", getAuditLogs);
router.get("/alerts", getAlerts);
router.patch("/alerts/:id/review", validate({ params: v.alertIdParams }), reviewAlert);
router.get("/reports", getReports);
router.post("/audit/unmask-bank-details", validate({ body: v.noInput }), (_req:any, res:any) => res.json({ success: true, message: "Unmask audited" }));

router.get("/settings", getSettings);
router.put("/settings", validate({ body: v.settings }), updateSettings);

export default router;

