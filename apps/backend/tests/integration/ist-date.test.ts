import { getIstDateString, getIstDayRange } from "../../src/utils/ist-date";

describe("IST day range", () => {
  it("defaults to the Asia/Kolkata calendar date", () => {
    const value = new Date("2026-11-12T19:00:00.000Z"); // 13 Nov in IST
    expect(getIstDateString(value)).toBe("2026-11-13");
  });

  it("returns an inclusive start and exclusive end for an IST date", () => {
    const range = getIstDayRange("2026-11-13");
    expect(range.start.toISOString()).toBe("2026-11-12T18:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-13T18:30:00.000Z");
    expect(range.previousDate).toBe("2026-11-12");
  });

  it("rejects impossible calendar dates", () => {
    expect(() => getIstDayRange("2026-02-30")).toThrow("Date is invalid");
  });
});
