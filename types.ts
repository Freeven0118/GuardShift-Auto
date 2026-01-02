
export enum ShiftType {
  Day = 'Day',
  Night = 'Night',
}

export enum StaffRole {
  Regular = 'Regular',
  Mobile = 'Mobile',
}

export interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  defaultSiteId?: string;
  defaultShift?: ShiftType; 
  allowedShifts?: ShiftType[];
  allowedSiteIds?: string[];
}

export interface Site {
  id: string;
  name: string;
  requiredStaffPerShift: number;
}

export interface LeaveRequest {
  staffId: string;
  dateStr: string;
  isDesignated: boolean;
}

export interface ScheduleAssignment {
  dateStr: string;
  siteId: string;
  shift: ShiftType;
  staffId: string | null;
}

export interface ScheduleState {
  userId?: string; // Ownership
  year: number;
  month: number;
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
