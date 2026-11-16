import { createHash } from "node:crypto";
import { RequestHandler } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { sendError, sendSuccess } from "../../utils/api-response";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { loginUser } from "./auth.service";

const REFRESH_TOKEN_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;

export const login: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const body = res.locals.validated.body as {
      identifier?: string;
      email?: string;
      password: string;
    };
    const identifier = (body.identifier || body.email || "").trim();
    const password = body.password;

    const metadata = {
      ...(req.ip !== undefined && { ipAddress: req.ip }),
      ...(req.get("user-agent") !== undefined && {
        userAgent: req.get("user-agent")!,
      }),
    };

    const result = await loginUser(
      { identifier, password },
      metadata
    );

    if (!result) {
      return sendError(
        res,
        "Invalid credentials or inactive account",
        401
      );
    }

    // Refresh token is stored in an HttpOnly cookie.
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    const authData = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      sessionResumed: result.sessionResumed,
      user: result.user,
    };

    return res.status(200).json({
      success: true,
      message: "Login successful",
      ...authData,
      data: authData,
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser: RequestHandler = async (req:any, res:any, next:any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: {
        employee: true,
      },
    });

    if (!user) {
      return sendError(res, "User not found", 404);
    }

    const profileData = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone || "",
      role: user.role,
      status: user.status,
      subAdminId: user.employee?.assignedSubAdminId || "sub_admin_1",
      employeeProfileId: user.employee?.id || null,
      employeeId: user.employee?.id || null,
      employeeCode: user.employee?.employeeCode || null,
      employee: user.employee
        ? {
            id: user.employee.id,
            employeeCode: user.employee.employeeCode,
            department: user.employee.department,
            designation: user.employee.designation,
          }
        : null,
      createdAt: user.createdAt.toISOString(),
    };

    return res.status(200).json({
      success: true,
      message: "Current user profile",
      ...profileData,
      user: profileData,
      data: profileData,
    });
  } catch (error) {
    next(error);
  }
};

export const refreshTokens: RequestHandler = async (req:any, res:any) => {
  try {
    const token = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!token) return sendError(res, "Refresh token required", 400);

    const payload = verifyRefreshToken(token);
    const session = await prisma.refreshSession.findUnique({ where: { id: payload.sessionId } });
    const now = new Date();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    if (!session || session.userId !== payload.sub || session.revokedAt ||
        session.expiresAt <= now || session.tokenHash !== tokenHash ||
        session.lastActivityAt.getTime() <= now.getTime() - 5 * 60 * 1000) {
      if (session && !session.revokedAt) {
        const idleAt = new Date(session.lastActivityAt.getTime() + 5 * 60 * 1000);
        const expired = await prisma.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null, lastActivityAt: { lte: new Date(now.getTime() - 5 * 60 * 1000) } },
          data: { idleAt, revokedAt: now },
        });
        if (expired.count > 0) {
          await prisma.employee.updateMany({
            where: { userId: session.userId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lte: session.lastActivityAt } }] },
            data: { presenceStatus: "IDLE", idleSince: idleAt, lastActivityAt: session.lastActivityAt },
          });
        }
      }
      return sendError(res, "Refresh token is invalid, expired, or idle", 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true, role: true } });
    if (!user || user.status !== "ACTIVE") return sendError(res, "Account is inactive", 401);

    const accessToken = generateAccessToken(payload.sub, payload.role, session.id);
    const refreshToken = generateRefreshToken(payload.sub, payload.role, session.id);
    const rotated = await prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null, tokenHash, lastActivityAt: { gt: new Date(now.getTime() - 5 * 60 * 1000) } },
      data: {
        tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
        lastActivityAt: now, idleAt: null,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    if (rotated.count === 0) return sendError(res, "Session expired or revoked", 401);
    if (user.role === "EMPLOYEE") {
      await prisma.employee.updateMany({ where: { userId: payload.sub }, data: { presenceStatus: "ACTIVE", idleSince: null, lastActivityAt: now } });
    }

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax",
      path: "/api/v1/auth", maxAge: REFRESH_TOKEN_MAX_AGE,
    });
    const tokenData = { accessToken, refreshToken };
    return res.status(200).json({ success: true, message: "Token refreshed successfully", ...tokenData, data: tokenData });
  } catch (error) {
    return sendError(res, "Invalid or expired refresh token", 401);
  }
};

export const logout: RequestHandler = async (req:any, res:any) => {
  try {
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
    const bearerToken = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim() : undefined;
    try {
      const payload = refreshToken
        ? verifyRefreshToken(refreshToken)
        : bearerToken ? verifyAccessToken(bearerToken) : null;
      if (payload) {
        await prisma.refreshSession.updateMany({
          where: { id: payload.sessionId, userId: payload.sub, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // Always clear the browser cookie, even if the supplied token is invalid.
    }
    res.clearCookie("refreshToken", {
      httpOnly: true, secure: env.NODE_ENV === "production",
      sameSite: "lax", path: "/api/v1/auth",
    });
    return sendSuccess(res, "Logged out successfully", null);
  } catch (error) { next(error); }
};
function next(error: unknown) {
  throw new Error("Function not implemented.");
}

