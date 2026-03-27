export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getDateRange(days: number, ref: Date = new Date()): { start: Date; end: Date } {
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}

export function eachDayInRange(startStr: string, endStr: string): string[] {
  const start = parseDateString(startStr);
  const end = parseDateString(endStr);
  const days: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}
