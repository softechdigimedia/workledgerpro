import { RequestHandler } from "express";
import { prisma } from "../config/prisma";
import { verifyAccessToken } from "../utils/jwt";
import { sendError } from "../utils/api-response";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const authenticate: RequestHandler = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return sendError(res, "Authentication token is required", 401);
  const token = authorization.slice(7).trim();
  if (!token) return sendError(res, "Invalid authentication token", 401);

  let payload;
  try { payload = verifyAccessToken(token); }
  catch { return sendError(res, "Invalid or expired access token", 401); }

  try {
    const now = new Date();
    const session = await prisma.refreshSession.findUnique({ where: { id: payload.sessionId } });

    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= now) {
      return sendError(res, "Session expired or revoked. Please sign in again.", 401);
    }

    if (session.lastActivityAt.getTime() <= now.getTime() - IDLE_TIMEOUT_MS) {
      const idleAt = new Date(session.lastActivityAt.getTime() + IDLE_TIMEOUT_MS);
      const expired = await prisma.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null, lastActivityAt: { lte: new Date(now.getTime() - IDLE_TIMEOUT_MS) } },
        data: { idleAt, revokedAt: now },
      });
      if (expired.count > 0) {
        await prisma.employee.updateMany({
          where: { userId: session.userId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lte: session.lastActivityAt } }] },
          data: { presenceStatus: "IDLE", idleSince: idleAt, lastActivityAt: session.lastActivityAt },
        });
      }
      return sendError(res, "Session expired after five minutes of inactivity. Please sign in again.", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") return sendError(res, "Your account is inactive or unavailable", 401);

    // Every successful authenticated request renews the inactivity window.
    const activityUpdate = await prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastActivityAt: now, idleAt: null },
    });
    if (activityUpdate.count === 0) {
      return sendError(res, "Session expired or revoked. Please sign in again.", 401);
    }
    if (user.role === "EMPLOYEE") {
      await prisma.employee.updateMany({
        where: { userId: user.id },
        data: { presenceStatus: "ACTIVE", idleSince: null, lastActivityAt: now },
      });
    }

    req.auth = { userId: user.id, role: user.role };
    next();
  } catch (error) { next(error); }
};
