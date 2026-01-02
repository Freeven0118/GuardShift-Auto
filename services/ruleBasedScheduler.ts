
import { ScheduleState, ShiftType, StaffRole, Staff, ScheduleAssignment, DayInfo } from "../types";
import { getMonthDays, getRequiredLeaveDays } from "../utils/dateUtils";

/**
 * Checks if a staff member is available for a specific shift on a specific date.
 * Enforces:
 * 1. Role constraints (Mobile allowed sites/shifts).
 * 2. Designated Leave requests.
 * 3. No Double Booking (already assigned elsewhere that day).
 * 4. NO Night-to-Day rotation: Cannot work Day shift on Date X if worked Night shift on Date X-1.
 * 5. MAX CONSECUTIVE DAYS: Cannot work more than 6 days in a row.
 */
export const isStaffAvailable = (
  staff: Staff,
  currentDateStr: string,
  shift: ShiftType,
  allAssignments: ScheduleAssignment[],
  leaveRequests: { staffId: string; dateStr: string }[],
  days: DayInfo[],
  prevDateStr?: string,
  ignoreAssignmentId?: { siteId: string, shift: ShiftType } // New: Ignore current slot when checking double booking (for editing)
): { available: boolean; reason?: string } => {
  // 1. Check Mobile Constraints
  if (staff.role === StaffRole.Mobile) {
    if (staff.allowedShifts && !staff.allowedShifts.includes(shift)) {
      return { available: false, reason: "班別限制" };
    }
    // Site check is usually done at the calling level, but we can assume checked or filtered by UI
  }

  // 2. Check Leaves
  if (leaveRequests.some(r => r.staffId === staff.id && r.dateStr === currentDateStr)) {
    return { available: false, reason: "排休中" };
  }

  // 3. Check Double Booking (Already working ANY site on this specific date)
  // We allow re-assigning to the SAME slot (if we are editing), but UI handles that logic usually.
  // Here we check if they are assigned elsewhere.
  const existingAssignment = allAssignments.find(a => a.staffId === staff.id && a.dateStr === currentDateStr);
  if (existingAssignment) {
    // If specific ignore params provided (for checking availability of a specific slot we are editing)
    if (ignoreAssignmentId && existingAssignment.siteId === ignoreAssignmentId.siteId && existingAssignment.shift === ignoreAssignmentId.shift) {
        // This is the assignment we are potentially overwriting, so it's not a conflict with ITSELF.
    } else {
        return { available: false, reason: "已有排班" };
    }
  }

  // 4. Critical: Night-to-Day Constraint
  // If requesting DAY shift, check if they worked NIGHT shift on PREVIOUS day.
  if (shift === ShiftType.Day && prevDateStr) {
    const workedLastNight = allAssignments.some(
      a => a.staffId === staff.id && a.dateStr === prevDateStr && a.shift === ShiftType.Night
    );
    if (workedLastNight) return { available: false, reason: "接續夜班" };
  }

  // 5. MAX 6 Consecutive Days Check
  // Note: For manual UI validation, this might be too strict, but good for warnings.
  // We will return true but maybe user should be warned. For now, strict rule.
  if (hasWorkedLast6Days(staff.id, currentDateStr, allAssignments, days)) {
      return { available: false, reason: "連七禁令" };
  }

  return { available: true };
};

// Helper: Check if staff has worked the previous 6 days straight
const hasWorkedLast6Days = (
  staffId: string,
  currentDateStr: string,
  assignments: ScheduleAssignment[],
  days: DayInfo[]
): boolean => {
  const currentIndex = days.findIndex(d => d.dateStr === currentDateStr);
  
  // If less than 6 days have passed in this month, we assume they are fresh (or we don't have prev month data)
  // In a real production app, we would load previous month's tail.
  if (currentIndex < 6) return false; 

  // Check indices i-1 to i-6
  for (let i = 1; i <= 6; i++) {
    const checkDate = days[currentIndex - i].dateStr;
    const worked = assignments.some(a => a.staffId === staffId && a.dateStr === checkDate);
    if (!worked) return false; // Found a break
  }
  
  return true; // Worked all 6 previous days
};

// Structure for tracking consecutive work days
interface WorkStreak {
  startDateStr: string;
  endDateStr: string;
  startIndex: number;
  length: number;
  assignments: ScheduleAssignment[];
}

const getWorkStreaks = (
  staffId: string,
  assignments: ScheduleAssignment[],
  days: DayInfo[]
): WorkStreak[] => {
  const streaks: WorkStreak[] = [];
  let currentStreak: ScheduleAssignment[] = [];
  let startIndex = -1;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const assignment = assignments.find(a => a.staffId === staffId && a.dateStr === day.dateStr);

    if (assignment) {
      if (currentStreak.length === 0) startIndex = i;
      currentStreak.push(assignment);
    } else {
      if (currentStreak.length > 0) {
        streaks.push({
          startDateStr: currentStreak[0].dateStr,
          endDateStr: currentStreak[currentStreak.length - 1].dateStr,
          startIndex,
          length: currentStreak.length,
          assignments: [...currentStreak]
        });
        currentStreak = [];
        startIndex = -1;
      }
    }
  }

  // Capture final streak if exists
  if (currentStreak.length > 0) {
    streaks.push({
      startDateStr: currentStreak[0].dateStr,
      endDateStr: currentStreak[currentStreak.length - 1].dateStr,
      startIndex,
      length: currentStreak.length,
      assignments: [...currentStreak]
    });
  }

  return streaks;
};

/**
 * Post-processing step: Scans the entire schedule for empty slots and tries to fill them
 * with any available mobile staff.
 */
export const fillEmptySlotsWithMobile = (
  state: ScheduleState,
  currentAssignments: ScheduleAssignment[]
): ScheduleAssignment[] => {
  const assignments = [...currentAssignments];
  const days = getMonthDays(state.year, state.month);
  const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);
  const requiredLeave = getRequiredLeaveDays(state.year, state.month);
  const maxWorkDays = days.length - requiredLeave;
  
  // Helper to get previous date string
  const getPrevDateStr = (currentDateStr: string) => {
    const idx = days.findIndex(d => d.dateStr === currentDateStr);
    if (idx > 0) return days[idx - 1].dateStr;
    return undefined;
  };

  for (const day of days) {
    const prevDateStr = getPrevDateStr(day.dateStr);

    for (const site of state.sites) {
      for (const shift of [ShiftType.Day, ShiftType.Night]) {
        // 1. Is slot filled?
        const existing = assignments.find(a => a.dateStr === day.dateStr && a.siteId === site.id && a.shift === shift);
        
        if (!existing) {
          // 2. Try to find Mobile Staff
          const availableMobile = mobileStaff.find(m => {
             // A. Check Max Work Days Constraint (Excel Formula Style)
             // STRICT RULE: If mobile staff has already worked max days, they cannot be assigned more.
             const currentWorkCount = assignments.filter(a => a.staffId === m.id).length;
             if (currentWorkCount >= maxWorkDays) {
                 return false;
             }

             // B. Check Site Allow List
             if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(site.id)) {
                 return false;
             }
             // C. Check Availability (includes Shift limit, double booking, leaves, consecutive days)
             const avail = isStaffAvailable(m, day.dateStr, shift, assignments, state.leaveRequests, days, prevDateStr);
             return avail.available;
          });

          if (availableMobile) {
            assignments.push({
              dateStr: day.dateStr,
              siteId: site.id,
              shift: shift,
              staffId: availableMobile.id
            });
          }
        }
      }
    }
  }
  
  return assignments;
};

export const generateScheduleRuleBased = async (
  state: ScheduleState
): Promise<ScheduleAssignment[]> => {
  // Simulate async delay for UI feel
  await new Promise(resolve => setTimeout(resolve, 800));

  const days = getMonthDays(state.year, state.month);
  const targetOffDays = getRequiredLeaveDays(state.year, state.month);
  const maxWorkDays = days.length - targetOffDays; // Cap for Mobile Staff
  const assignments: ScheduleAssignment[] = [];
  
  // Separate staff
  const regularStaff = state.staff.filter(s => s.role === StaffRole.Regular);
  const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);

  // Helper to get previous date string
  const getPrevDateStr = (currentDateStr: string) => {
    const idx = days.findIndex(d => d.dateStr === currentDateStr);
    if (idx > 0) return days[idx - 1].dateStr;
    return undefined;
  };

  // --- Phase 1: Initialize Assignments & Apply Designated Leaves ---
  // For every site, day, and shift, try to assign the Default Regular Staff.
  // Enforces Designated Leaves AND Max Consecutive Working Days.
  
  for (const day of days) {
    const prevDateStr = getPrevDateStr(day.dateStr);

    for (const site of state.sites) {
      // Helper to process a shift assignment
      const processShift = (shiftType: ShiftType) => {
          const defaultStaff = regularStaff.find(s => s.defaultSiteId === site.id && s.defaultShift === shiftType);
          
          if (defaultStaff) {
              const hasLeave = state.leaveRequests.some(r => r.staffId === defaultStaff.id && r.dateStr === day.dateStr);
              // Also check consecutive work limit
              const maxConsecutiveReached = hasWorkedLast6Days(defaultStaff.id, day.dateStr, assignments, days);

              if (!hasLeave && !maxConsecutiveReached) {
                   assignments.push({ dateStr: day.dateStr, siteId: site.id, shift: shiftType, staffId: defaultStaff.id });
              } else {
                   // Slot is open (Leave or Forced Rest)
              }
          }
      };

      processShift(ShiftType.Day);
      processShift(ShiftType.Night);
    }
  }

  // --- Phase 2: Optimize Off Days (3-4 Days Work -> 1 Day Off Pattern) ---
  // Instead of random removal, we analyze streaks and break them strategically.
  
  for (const staff of regularStaff) {
    let daysAssigned = assignments.filter(a => a.staffId === staff.id).length;
    let daysOff = days.length - daysAssigned;
    let daysNeeded = targetOffDays - daysOff;

    let attemptCount = 0;
    const MAX_ATTEMPTS = 50; // Safety break

    while (daysNeeded > 0 && attemptCount < MAX_ATTEMPTS) {
      attemptCount++;
      const streaks = getWorkStreaks(staff.id, assignments, days);
      
      // Sort streaks by length (descending) to break longest streaks first
      streaks.sort((a, b) => b.length - a.length);

      let replaced = false;

      // Try to break streaks
      for (const streak of streaks) {
        if (replaced) break;
        if (streak.length <= 1) continue; // Don't break tiny streaks if possible

        // Determine ideal break point (Prefer 4th or 5th day of work)
        // If streak is [0,1,2,3,4,5], indices are 0-5.
        // We want to remove index 3 (Day 4) or 4 (Day 5).
        
        const candidateIndicesToCheck = [];
        
        // Priority 1: Day 4 (Work 3, Rest 1) or Day 5 (Work 4, Rest 1)
        // Note: streak.startIndex is the index in the 'days' array
        if (streak.length >= 5) candidateIndicesToCheck.push(streak.startIndex + 4); 
        if (streak.length >= 4) candidateIndicesToCheck.push(streak.startIndex + 3);
        
        // Fallback: Just cut in half or trim end if streak is smaller but we still need to remove days
        if (streak.length === 3) candidateIndicesToCheck.push(streak.startIndex + 2);
        
        // Try each candidate
        for (const dayIndex of candidateIndicesToCheck) {
           if (dayIndex >= days.length) continue;
           const targetDateStr = days[dayIndex].dateStr;
           
           const assignment = assignments.find(a => a.staffId === staff.id && a.dateStr === targetDateStr);
           if (!assignment) continue; // Should exist if logic is correct

           const prevDateStr = getPrevDateStr(targetDateStr);

           // Find Replacement
           const replacement = mobileStaff.find(m => {
                // A. Check Max Work Days Constraint (Excel Formula Style)
                const currentWorkCount = assignments.filter(a => a.staffId === m.id).length;
                if (currentWorkCount >= maxWorkDays) {
                    return false;
                }

                // B. Check allowed sites
                if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(assignment.siteId)) {
                    return false;
                }
                const avail = isStaffAvailable(m, assignment.dateStr, assignment.shift, assignments, state.leaveRequests, days, prevDateStr);
                return avail.available;
           });

           if (replacement) {
               // Perform Swap
               const index = assignments.indexOf(assignment);
               if (index > -1) {
                   assignments.splice(index, 1);
                   assignments.push({
                       dateStr: assignment.dateStr,
                       siteId: assignment.siteId,
                       shift: assignment.shift,
                       staffId: replacement.id
                   });
                   daysNeeded--;
                   replaced = true;
                   break; // Break inner loop, re-evaluate streaks
               }
           }
        }
      }
      
      // If we couldn't find ANY replacement in ANY streak, we might be stuck due to mobile shortage
      if (!replaced) break; 
    }
  }

  // --- Phase 3: Fill Remaining Gaps with Mobile Staff (Internal Call) ---
  // Reuse the exported function to ensure logic consistency
  return fillEmptySlotsWithMobile(state, assignments);
};
