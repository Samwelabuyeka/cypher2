export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function calculateNextRecurringDate(
  currentDate: Date,
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly',
  dayOfWeek?: number,
  dayOfMonth?: number
): Date {
  const next = new Date(currentDate);
  
  switch (frequency) {
    case 'daily':
      return addDays(next, 1);
    case 'weekly':
      return addDays(next, 7);
    case 'biweekly':
      return addDays(next, 14);
    case 'monthly':
      return addMonths(next, 1);
    default:
      return next;
  }
}