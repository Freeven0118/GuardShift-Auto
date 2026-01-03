
import { format, getDaysInMonth, startOfMonth, addDays, getDay } from 'date-fns';
import { DayInfo } from '../types';

export const getMonthDays = (year: number, month: number): DayInfo[] => {
  const startDate = startOfMonth(new Date(year, month));
  const daysInMonth = getDaysInMonth(startDate);
  const days: DayInfo[] = [];

  for (let i = 0; i < daysInMonth; i++) {
    const date = addDays(startDate, i);
    days.push({
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      dayOfWeek: getDay(date),
    });
  }
  return days;
};

// 嚴格定義大月：1, 3, 5, 7, 8, 10, 12 (Javascript Month Index: 0, 2, 4, 6, 7, 9, 11)
export const isBigMonth = (year: number, month: number): boolean => {
  const bigMonthIndices = [0, 2, 4, 6, 7, 9, 11];
  return bigMonthIndices.includes(month);
};

// 大月(31天)休7天，小月(30天以下)休6天
export const getRequiredLeaveDays = (year: number, month: number): number => {
  return isBigMonth(year, month) ? 7 : 6;
};

export const getChineseDayOfWeek = (dayIndex: number): string => {
  const map = ['日', '一', '二', '三', '四', '五', '六'];
  return map[dayIndex];
};
