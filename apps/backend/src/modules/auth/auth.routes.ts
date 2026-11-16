
import { Router } from "express";

import { login, getCurrentUser, logout, refreshTokens } from "./auth.controller";
import { loginSchema } from "./auth.validation";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.post(
  "/login",
  validate({ body: loginSchema }),
  login
);

router.post(
  "/refresh",
  refreshTokens
);

router.get(
  "/me",
  authenticate,
  getCurrentUser
);

router.post(
  "/logout",
  logout
);

export default router;
