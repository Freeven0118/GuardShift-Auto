export enum ShiftType {
  Day = 'Day',
  Night = 'Night',
}

export enum StaffRole {
  Regular = 'Regular',
  Mobile = 'Mobile', // 機動
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  // If Regular, they belong to a site and a specific shift type by default
  defaultSiteId?: string;
  defaultShift?: ShiftType; 
  
  // Mobile specific settings
  allowedShifts?: ShiftType[]; // Changed to array for multi-select
  allowedSiteIds?: string[]; // IDs of sites they can cover. If undefined/empty, assumed all.
}

export interface Site {
  id: string;
  name: string;
  requiredStaffPerShift: number; // Usually 1 for simple cases
}

export interface LeaveRequest {
  staffId: string;
  dateStr: string; // YYYY-MM-DD
  isDesignated: boolean; // True if user specifically requested this
}

export interface ScheduleAssignment {
  dateStr: string;
  siteId: string;
  shift: ShiftType;
  staffId: string | null; // null means unfilled
}

export interface ScheduleState {
  year: number;
  month: number; // 0-11
  sites: Site[];
  staff: Staff[];
  leaveRequests: LeaveRequest[];
  assignments: ScheduleAssignment[];
}

export interface DayInfo {
  date: Date;
  dateStr: string;
  dayOfWeek: number;
}