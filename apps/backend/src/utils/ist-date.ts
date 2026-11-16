export interface IstDayRange { start: Date; end: Date; date: string; previousDate: string }

export function getIstDateString(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getIstDayRange(date?: string): IstDayRange {
  const selected = date || getIstDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selected)) throw new Error("Date must be YYYY-MM-DD");
  const [year, month, day] = selected.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error("Date is invalid");
  const start = new Date(`${selected}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const previousDate = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  return { start, end, date: selected, previousDate };
}
