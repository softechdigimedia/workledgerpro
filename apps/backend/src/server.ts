import app from "./app.js";
import { env } from "./config/env.js";
import { processIdleSessions } from "./modules/auth/idle-monitor.service.js";

const server = app.listen(env.PORT, () => {
  console.log(
    `WorkLedger API running at http://localhost:${env.PORT}`
  );
});

// Runs independently of Android app lifecycle. Uses server-side timestamps and
// persists IDLE state at the five-minute boundary, then alerts administrators
// after a further fifteen minutes of continuous idle time.
const runIdleSweep = async () => {
  try {
    await processIdleSessions(new Date());
  } catch (error) {
    console.error("Idle session/notification sweep failed:", error);
  }
};
void runIdleSweep();
const idleSessionSweep = setInterval(() => { void runIdleSweep(); }, 15_000);
idleSessionSweep.unref();

const shutdown = (signal: string) => {
  clearInterval(idleSessionSweep);
  console.log(`${signal} received. Shutting down server...`);

  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));