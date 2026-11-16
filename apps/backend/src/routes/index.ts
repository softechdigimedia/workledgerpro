import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import authRoutes from "../modules/auth/auth.routes";
import superAdminRoutes from "../modules/super-admin/super-admin.routes";
import subAdminRoutes from "../modules/sub-admin/sub-admin.routes";
import employeeRoutes from "../modules/employee/employee.routes";
import bankAccountRoutes from "../modules/bank-account/bank-account.routes";

const router = Router();

router.get("/health", (_req:any, res:any) => {
  res.json({
    success: true,
    message: "WorkLedger API is running",
  });
});

router.use("/auth", authRoutes);
router.use("/super-admin", superAdminRoutes);
router.use("/admin", subAdminRoutes);
router.use("/employee", employeeRoutes);
router.use("/bank-accounts", bankAccountRoutes);

// Any authenticated user
router.get(
  "/test/auth",
  authenticate,
  (_req:any, res:any) => {
    res.json({ message: "Authentication successful" });
  }
);

// Super admin only
router.get(
  "/test/super-admin",
  authenticate,
  authorize("SUPER_ADMIN"),
  (_req:any, res:any) => {
    res.json({ message: "Super admin access granted" });
  }
);

// Sub-admin and super-admin
router.get(
  "/test/admin",
  authenticate,
  authorize("SUPER_ADMIN", "SUB_ADMIN"),
  (_req:any, res:any) => {
    res.json({ message: "Admin access granted" });
  }
);

export default router;