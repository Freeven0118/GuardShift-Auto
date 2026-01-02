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

export const isBigMonth = (year: number, month: number): boolean => {
  return getDaysInMonth(new Date(year, month)) === 31;
};

export const getRequiredLeaveDays = (year: number, month: number): number => {
  return isBigMonth(year, month) ? 7 : 6;
};

export const getChineseDayOfWeek = (dayIndex: number): string => {
  const map = ['日', '一', '二', '三', '四', '五', '六'];
  return map[dayIndex];
};