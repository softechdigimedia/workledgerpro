import { describe, expect, it } from "@jest/globals";
import { dbDescribe, prisma } from "../helpers";

dbDescribe("Prisma migration verification", () => {
  it("has applied the session idle-tracking migration", async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      SELECT migration_name, finished_at
      FROM _prisma_migrations
      WHERE migration_name = '20261113000000_add_session_idle_tracking'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].finished_at).not.toBeNull();
  });

  it("has the lastActivityAt and idleAt columns in refresh_sessions", async () => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'refresh_sessions'
        AND column_name IN ('lastActivityAt', 'idleAt')
    `;
    expect(rows.map((row) => row.column_name).sort()).toEqual(["idleAt", "lastActivityAt"].sort());
  });

  it("has the expected refresh-session activity index", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'refresh_sessions'
    `;
    expect(rows.map((row) => row.indexname).join(" ")).toMatch(/userId_revokedAt_lastActivityAt_idx/);
  });

  it("does not contain failed or rolled-back migrations", async () => {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM _prisma_migrations
      WHERE rolled_back_at IS NOT NULL OR (finished_at IS NULL AND logs IS NOT NULL)
    `;
    expect(Number(rows[0].count)).toBe(0);
  });
});
