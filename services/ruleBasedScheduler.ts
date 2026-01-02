
import { ScheduleState, ShiftType, StaffRole, Staff, ScheduleAssignment, DayInfo } from "../types";
import { getMonthDays, getRequiredLeaveDays } from "../utils/dateUtils";

export const isStaffAvailable = (
  staff: Staff,
  currentDateStr: string,
  shift: ShiftType,
  allAssignments: ScheduleAssignment[],
  leaveRequests: { staffId: string; dateStr: string }[],
  days: DayInfo[],
  prevDateStr?: string
): { available: boolean; reason?: string } => {
  if (staff.role === StaffRole.Mobile) {
    if (staff.allowedShifts && staff.allowedShifts.length > 0 && !staff.allowedShifts.includes(shift)) {
      return { available: false, reason: "班別限制" };
    }
  }

  if (leaveRequests.some(r => r.staffId === staff.id && r.dateStr === currentDateStr)) {
    return { available: false, reason: "排休中" };
  }

  const existingAssignment = allAssignments.find(a => a.staffId === staff.id && a.dateStr === currentDateStr);
  if (existingAssignment) {
      return { available: false, reason: "已有排班" };
  }

  if (shift === ShiftType.Day && prevDateStr) {
    const workedLastNight = allAssignments.some(a => a.staffId === staff.id && a.dateStr === prevDateStr && a.shift === ShiftType.Night);
    if (workedLastNight) return { available: false, reason: "接續夜班" };
  }

  if (hasWorkedLast6Days(staff.id, currentDateStr, allAssignments, days)) {
      return { available: false, reason: "連七禁令" };
  }

  return { available: true };
};

const hasWorkedLast6Days = (staffId: string, currentDateStr: string, assignments: ScheduleAssignment[], days: DayInfo[]): boolean => {
  const currentIndex = days.findIndex(d => d.dateStr === currentDateStr);
  if (currentIndex < 6) return false; 
  for (let i = 1; i <= 6; i++) {
    const worked = assignments.some(a => a.staffId === staffId && a.dateStr === days[currentIndex - i].dateStr);
    if (!worked) return false; 
  }
  return true; 
};

interface WorkStreak {
  startDateStr: string;
  endDateStr: string;
  startIndex: number;
  length: number;
  assignments: ScheduleAssignment[];
}

const getWorkStreaks = (staffId: string, assignments: ScheduleAssignment[], days: DayInfo[]): WorkStreak[] => {
  const streaks: WorkStreak[] = [];
  let currentStreak: ScheduleAssignment[] = [];
  let startIndex = -1;

  for (let i = 0; i < days.length; i++) {
    const assignment = assignments.find(a => a.staffId === staffId && a.dateStr === days[i].dateStr);
    if (assignment) {
      if (currentStreak.length === 0) startIndex = i;
      currentStreak.push(assignment);
    } else {
      if (currentStreak.length > 0) {
        streaks.push({ startDateStr: currentStreak[0].dateStr, endDateStr: currentStreak[currentStreak.length - 1].dateStr, startIndex, length: currentStreak.length, assignments: [...currentStreak] });
        currentStreak = []; startIndex = -1;
      }
    }
  }
  if (currentStreak.length > 0) streaks.push({ startDateStr: currentStreak[0].dateStr, endDateStr: currentStreak[currentStreak.length - 1].dateStr, startIndex, length: currentStreak.length, assignments: [...currentStreak] });
  return streaks;
};

export const fillEmptySlotsWithMobile = (state: ScheduleState, currentAssignments: ScheduleAssignment[]): ScheduleAssignment[] => {
  const assignments = [...currentAssignments];
  const days = getMonthDays(state.year, state.month);
  const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);
  const requiredLeave = getRequiredLeaveDays(state.year, state.month);
  const maxWorkDays = days.length - requiredLeave;
  
  for (const day of days) {
    const idx = days.indexOf(day);
    const prevDateStr = idx > 0 ? days[idx - 1].dateStr : undefined;
    for (const site of state.sites) {
      for (const shift of [ShiftType.Day, ShiftType.Night]) {
        const existing = assignments.find(a => a.dateStr === day.dateStr && a.siteId === site.id && a.shift === shift);
        if (!existing) {
          const availableMobile = mobileStaff.find(m => {
             const currentWorkCount = assignments.filter(a => a.staffId === m.id).length;
             if (currentWorkCount >= maxWorkDays) return false;
             if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(site.id)) return false;
             return isStaffAvailable(m, day.dateStr, shift, assignments, state.leaveRequests, days, prevDateStr).available;
          });
          if (availableMobile) assignments.push({ dateStr: day.dateStr, siteId: site.id, shift: shift, staffId: availableMobile.id });
        }
      }
    }
  }
  return assignments;
};

export const generateScheduleRuleBased = async (state: ScheduleState): Promise<ScheduleAssignment[]> => {
  const days = getMonthDays(state.year, state.month);
  const targetOffDays = getRequiredLeaveDays(state.year, state.month);
  const maxWorkDays = days.length - targetOffDays;
  const assignments: ScheduleAssignment[] = [];
  const regularStaff = state.staff.filter(s => s.role === StaffRole.Regular);
  const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);

  // Phase 1: 預設排班
  for (const day of days) {
    const idx = days.indexOf(day);
    const prevDateStr = idx > 0 ? days[idx - 1].dateStr : undefined;
    for (const site of state.sites) {
        [ShiftType.Day, ShiftType.Night].forEach(st => {
            const staff = regularStaff.find(s => s.defaultSiteId === site.id && s.defaultShift === st);
            if (staff) {
                const hasLeave = state.leaveRequests.some(r => r.staffId === staff.id && r.dateStr === day.dateStr);
                const maxReached = hasWorkedLast6Days(staff.id, day.dateStr, assignments, days);
                if (!hasLeave && !maxReached) assignments.push({ dateStr: day.dateStr, siteId: site.id, shift: st, staffId: staff.id });
            }
        });
    }
  }

  // Phase 2: 強制插入休假以達成目標天數
  for (const staff of regularStaff) {
    let daysAssigned = assignments.filter(a => a.staffId === staff.id).length;
    let daysOff = days.length - daysAssigned;
    let daysNeeded = targetOffDays - daysOff;
    let attempts = 0;
    while (daysNeeded > 0 && attempts < 100) {
      attempts++;
      const streaks = getWorkStreaks(staff.id, assignments, days).sort((a,b) => b.length - a.length);
      let replaced = false;
      for (const streak of streaks) {
        if (replaced) break;
        const breakPoints = [streak.startIndex + 4, streak.startIndex + 3, streak.startIndex + 2];
        for (const dp of breakPoints) {
           if (dp >= days.length) continue;
           const targetDate = days[dp].dateStr;
           const asgn = assignments.find(a => a.staffId === staff.id && a.dateStr === targetDate);
           if (!asgn) continue;
           const rep = mobileStaff.find(m => {
                if (assignments.filter(a => a.staffId === m.id).length >= maxWorkDays) return false;
                if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(asgn.siteId)) return false;
                const idx = days.findIndex(d => d.dateStr === targetDate);
                return isStaffAvailable(m, targetDate, asgn.shift, assignments, state.leaveRequests, days, idx > 0 ? days[idx-1].dateStr : undefined).available;
           });
           if (rep) {
               assignments.splice(assignments.indexOf(asgn), 1);
               assignments.push({ dateStr: asgn.dateStr, siteId: asgn.siteId, shift: asgn.shift, staffId: rep.id });
               daysNeeded--; replaced = true; break;
           }
        }
      }
      if (!replaced) break;
    }
  }
  return assignments;
};
