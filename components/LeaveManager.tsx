import React from 'react';
import { Staff, LeaveRequest, ScheduleState, StaffRole, ShiftType } from '../types';
import { getMonthDays, getChineseDayOfWeek, getRequiredLeaveDays } from '../utils/dateUtils';
import { Calendar, AlertCircle } from 'lucide-react';

interface LeaveManagerProps {
  state: ScheduleState;
  setLeaveRequests: (reqs: LeaveRequest[]) => void;
}

const LeaveManager: React.FC<LeaveManagerProps> = ({ state, setLeaveRequests }) => {
  const days = getMonthDays(state.year, state.month);
  const regularStaff = state.staff.filter(s => s.role === StaffRole.Regular);
  const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);
  const targetOffDays = getRequiredLeaveDays(state.year, state.month);

  const toggleLeave = (staffId: string, dateStr: string) => {
    const existing = state.leaveRequests.find(r => r.staffId === staffId && r.dateStr === dateStr);
    if (existing) {
      setLeaveRequests(state.leaveRequests.filter(r => r !== existing));
    } else {
      setLeaveRequests([...state.leaveRequests, { staffId, dateStr, isDesignated: true }]);
    }
  };

  const getLeaveCount = (staffId: string) => {
    return state.leaveRequests.filter(r => r.staffId === staffId).length;
  };

  const getMobileLabel = (staff: Staff) => {
      const shifts = staff.allowedShifts || [];
      const hasDay = shifts.includes(ShiftType.Day);
      const hasNight = shifts.includes(ShiftType.Night);
      
      if (hasDay && hasNight) return '早晚';
      if (hasDay) return '早';
      if (hasNight) return '晚';
      return '機';
  };

  const getBadgeClass = (label: string) => {
      if (label === '早') return 'bg-amber-100 text-amber-700 border border-amber-200';
      if (label === '晚') return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
      if (label === '早晚') return 'bg-purple-100 text-purple-700 border border-purple-200';
      return 'bg-slate-100 text-slate-500 border border-slate-200';
  };

  const renderRow = (s: Staff) => {
      const currentLeaves = getLeaveCount(s.id);
      
      let label = '';
      if (s.role === StaffRole.Regular) {
           label = s.defaultShift === ShiftType.Day ? '早' : '晚';
      } else {
           label = getMobileLabel(s);
      }

      return (
        <tr key={s.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
          <td className="p-1 border-r border-slate-200 font-medium sticky left-0 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] w-[80px] min-w-[80px] h-[34px]">
            <div className="flex items-center gap-1 overflow-hidden">
               <span className={`text-[10px] rounded px-1 shrink-0 font-bold ${getBadgeClass(label)}`}>{label}</span>
               <span className="truncate text-sm text-slate-900 font-bold">{s.name}</span>
            </div>
          </td>
          {/* Total Column */}
          <td className="p-0 border-r border-slate-200 text-center bg-white sticky left-[80px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] w-[40px] min-w-[40px]">
            <span className={`font-bold text-sm ${currentLeaves > targetOffDays ? 'text-blue-500' : currentLeaves >= targetOffDays ? 'text-green-600' : 'text-slate-600'}`}>
              {currentLeaves}
            </span>
          </td>
          {days.map(day => {
            const isOff = state.leaveRequests.some(r => r.staffId === s.id && r.dateStr === day.dateStr);
            return (
              <td 
                key={`${s.id}-${day.dateStr}`} 
                className={`p-0 border-r border-slate-100 text-center cursor-pointer transition-colors ${isOff ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'}`}
                onClick={() => toggleLeave(s.id, day.dateStr)}
              >
                {isOff && <div className="w-full h-full flex justify-center items-center text-blue-600 text-sm font-bold">休</div>}
              </td>
            );
          })}
        </tr>
      );
  };

  return (
    <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 w-full">
      <div className="flex justify-between items-center mb-2 px-1">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          指定休假
          <span className="text-sm font-normal text-slate-500 ml-2">目標: {targetOffDays}天 (含指定)</span>
        </h2>
        <div className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200 flex items-center gap-1">
             <AlertCircle className="w-3 h-3" /> 點擊格子可切換休假狀態 (藍色為指定休假)
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr>
              <th className="p-1 border-b border-r bg-slate-50 text-left w-[80px] min-w-[80px] sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs font-bold text-slate-700">人員</th>
              <th className="p-1 border-b border-r bg-slate-50 text-center w-[40px] min-w-[40px] sticky left-[80px] z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs font-bold text-slate-700">休</th>
              {days.map(day => {
                return (
                  <th 
                    key={day.dateStr} 
                    className={`p-0.5 border-b border-r min-w-[36px] w-[36px] max-w-[36px] text-center relative group ${
                        (day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600')
                    }`}
                  >
                    <div className="text-[10px] leading-tight opacity-70">{day.date.getDate()}</div>
                    <div className="text-xs font-bold leading-tight flex justify-center items-center gap-0.5">
                        {getChineseDayOfWeek(day.dayOfWeek)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {state.sites.map(site => {
                const siteStaff = regularStaff.filter(s => s.defaultSiteId === site.id);
                if (siteStaff.length === 0) return null;
                return (
                    <React.Fragment key={site.id}>
                        <tr className="bg-indigo-50 border-y border-indigo-100 h-[28px]">
                            <td className="px-2 sticky left-0 z-20 bg-indigo-50 text-indigo-900 border-r border-indigo-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] col-span-2 w-[120px]" colSpan={2}>
                                <div className="flex items-center gap-1 font-bold text-xs truncate">
                                    {site.name}
                                </div>
                            </td>
                            <td colSpan={days.length} className="bg-indigo-50"></td>
                        </tr>
                        {siteStaff.map(renderRow)}
                    </React.Fragment>
                );
            })}
            {mobileStaff.length > 0 && (
                <>
                <tr className="bg-amber-50 border-y border-amber-100 h-[28px]">
                    <td className="px-2 sticky left-0 z-20 bg-amber-50 text-amber-900 border-r border-amber-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] w-[120px]" colSpan={2}>
                         <div className="flex items-center gap-1 font-bold text-xs">
                            機動組
                        </div>
                    </td>
                    <td colSpan={days.length} className="bg-amber-50"></td>
                </tr>
                {mobileStaff.map(renderRow)}
                </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeaveManager;