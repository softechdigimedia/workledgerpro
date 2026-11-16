const path = require("node:path");
const dotenv = require("dotenv");

// Load only the dedicated test env file. Never inherit a normal .env database URL.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: false });
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET ||= "workledger-test-access-secret-change-me-123456";
process.env.JWT_REFRESH_SECRET ||= "workledger-test-refresh-secret-change-me-123456";
process.env.CLIENT_URL ||= "http://127.0.0.1:5173";

if (process.env.TEST_DATABASE_URL) {
  let parsed;
  try { parsed = new URL(process.env.TEST_DATABASE_URL); }
  catch { throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL."); }
  const databaseName = parsed.pathname.toLowerCase();
  if (!/(test|ci)/.test(databaseName)) {
    throw new Error("TEST_DATABASE_URL must point to a database whose name contains 'test' or 'ci'.");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
} else {
  // Keep non-DB tests isolated even if a developer has a production DATABASE_URL
  // in their shell. Database suites remain skipped unless TEST_DATABASE_URL exists.
  process.env.DATABASE_URL = "postgresql://disabled:disabled@127.0.0.1:5433/workledger_test?schema=public";
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}
