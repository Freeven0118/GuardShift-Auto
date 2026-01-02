import React, { useState, useEffect } from 'react';
import { ScheduleState, ShiftType, StaffRole, Staff, LeaveRequest } from '../types';
import { getMonthDays, getChineseDayOfWeek } from '../utils/dateUtils';
import { AlertTriangle, Check, Loader2, CalendarRange, LayoutGrid, Users, Sun, Moon, MapPin, Truck, User, Zap, Info, Play, Sparkles, Edit2, X, AlertCircle, Plus, RefreshCw, Layers, Trash2, Eraser } from 'lucide-react';
import { isStaffAvailable } from '../services/ruleBasedScheduler';

interface ScheduleViewProps {
  state: ScheduleState;
  loading: boolean;
  onGenerate: () => void;
  onClear: () => void;
  onClearDesignated: () => void;
  onUpdateAssignment: (dateStr: string, siteId: string, shift: ShiftType, staffId: string | null) => void;
  onToggleLeave: (dateStr: string, staffId: string, shouldBeLeave: boolean) => void;
  onMobileRelocation: (dateStr: string, mobileStaffId: string, action: 'ASSIGN' | 'LEAVE' | 'EMPTY', targetSiteId?: string, targetShift?: ShiftType) => void;
  apiKeySet: boolean;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({ state, loading, onGenerate, onClear, onClearDesignated, onUpdateAssignment, onToggleLeave, onMobileRelocation, apiKeySet }) => {
  const [viewMode, setViewMode] = useState<'site' | 'staff'>('site');
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [editingSlot, setEditingSlot] = useState<{ dateStr: string, siteId: string, shift: ShiftType, defaultStaffId: string } | null>(null);

  const days = getMonthDays(state.year, state.month);

  useEffect(() => {
    if (state.sites.length > 0 && (!activeSiteId || !state.sites.find(s => s.id === activeSiteId))) {
      setActiveSiteId(state.sites[0].id);
    }
  }, [state.sites, activeSiteId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (loading) {
      setProgress(0);
      setTimeLeft(60);
      timer = setInterval(() => {
        setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
        setProgress((prev) => (prev >= 99 ? 99 : prev + 1.66));
      }, 1000);
    } else {
      setProgress(100);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [loading]);

  const getStaffAssignmentForDay = (staffId: string, dateStr: string) => {
    const assignment = state.assignments.find(a => a.staffId === staffId && a.dateStr === dateStr);
    if (!assignment) return null;
    const site = state.sites.find(s => s.id === assignment.siteId);
    return { siteName: site ? site.name : '', siteId: assignment.siteId, shift: assignment.shift };
  };

  const getAssignmentForSlot = (siteId: string, shift: ShiftType, dateStr: string) => {
    const assignment = state.assignments.find(a => a.siteId === siteId && a.shift === shift && a.dateStr === dateStr);
    if (!assignment) return null;
    return state.staff.find(s => s.id === assignment.staffId);
  };

  const getLeaveRequest = (staffId: string, dateStr: string): LeaveRequest | undefined => {
      return state.leaveRequests.find(req => req.staffId === staffId && req.dateStr === dateStr);
  };

  const activeSite = state.sites.find(s => s.id === activeSiteId);
  const siteRegulars = activeSite 
    ? state.staff.filter(s => s.defaultSiteId === activeSite.id && s.role === StaffRole.Regular).sort((a, b) => (a.defaultShift === ShiftType.Day ? -1 : 1))
    : [];
  const allMobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);

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

  const handleRegularCellClick = (staff: Staff, dateStr: string) => {
      const leaveReq = getLeaveRequest(staff.id, dateStr);
      if (leaveReq && leaveReq.isDesignated) return;
      const currentAssignment = getAssignmentForSlot(staff.defaultSiteId!, staff.defaultShift!, dateStr);
      const isWorking = currentAssignment?.id === staff.id;
      const isLeave = !!leaveReq;
      if (isWorking) { onToggleLeave(dateStr, staff.id, true); }
      else if (isLeave) { onToggleLeave(dateStr, staff.id, false); onUpdateAssignment(dateStr, staff.defaultSiteId!, staff.defaultShift!, null); }
      else { onUpdateAssignment(dateStr, staff.defaultSiteId!, staff.defaultShift!, staff.id); }
  };

  const handleMobileCellClick = (staff: Staff, dateStr: string) => {
      const currentAssignment = getStaffAssignmentForDay(staff.id, dateStr);
      const leaveReq = getLeaveRequest(staff.id, dateStr);
      if (leaveReq && leaveReq.isDesignated) return;
      const allowedSites = state.sites.filter(site => !staff.allowedSiteIds || staff.allowedSiteIds.length === 0 || staff.allowedSiteIds.includes(site.id));
      const sortedSites = allowedSites.sort((a, b) => (a.id === activeSiteId ? -1 : b.id === activeSiteId ? 1 : 0));
      const candidateSlots: string[] = [];
      sortedSites.forEach(site => {
           [ShiftType.Day, ShiftType.Night].forEach(shift => {
               if (staff.allowedShifts && !staff.allowedShifts.includes(shift)) return;
               const assignedPerson = getAssignmentForSlot(site.id, shift, dateStr);
               if (!assignedPerson || assignedPerson.id === staff.id) { candidateSlots.push(`${site.id}|${shift}`); }
           });
      });
      const currentSiteSlots = candidateSlots.filter(s => s.startsWith(activeSiteId + '|'));
      const otherSiteSlots = candidateSlots.filter(s => !s.startsWith(activeSiteId + '|'));
      const cycleOptions = [...currentSiteSlots, 'LEAVE', 'EMPTY', ...otherSiteSlots];
      let currentStateStr = 'EMPTY';
      if (!!leaveReq) { currentStateStr = 'LEAVE'; } else if (currentAssignment) { currentStateStr = `${currentAssignment.siteId}|${currentAssignment.shift}`; }
      let nextIndex = cycleOptions.indexOf(currentStateStr) + 1;
      if (nextIndex >= cycleOptions.length) nextIndex = 0;
      const nextStateStr = cycleOptions[nextIndex];
      if (nextStateStr === 'LEAVE') { onMobileRelocation(dateStr, staff.id, 'LEAVE'); }
      else if (nextStateStr === 'EMPTY') { onMobileRelocation(dateStr, staff.id, 'EMPTY'); }
      else {
          const [targetSiteId, targetShiftStr] = nextStateStr.split('|');
          onMobileRelocation(dateStr, staff.id, 'ASSIGN', targetSiteId, targetShiftStr as ShiftType);
      }
  };

  const renderMobileRows = () => {
      if (allMobileStaff.length === 0) return null;
      return (
          <>
             <tr className="bg-slate-50 border-y border-slate-200 h-[28px]">
                <td className="px-2 sticky left-0 z-10 bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <span className="text-xs font-bold text-slate-500">機動人員</span>
                </td>
                <td colSpan={days.length} className="bg-slate-50"></td>
            </tr>
            {allMobileStaff.map(staff => {
                const label = getMobileLabel(staff);
                return (
                <tr key={staff.id} className="hover:bg-green-50/50 bg-green-50/10 transition-colors border-b border-slate-100">
                    <td className="p-1 border-r border-slate-200 bg-green-50/30 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] h-[34px]">
                        <div className="flex items-center gap-1 overflow-hidden">
                             <span className={`text-[10px] rounded px-1 shrink-0 font-bold ${getBadgeClass(label)}`}>{label}</span>
                            <span className="truncate text-sm font-bold text-slate-700">{staff.name}</span>
                        </div>
                    </td>
                    {days.map(day => {
                        const work = getStaffAssignmentForDay(staff.id, day.dateStr);
                        const leaveReq = getLeaveRequest(staff.id, day.dateStr);
                        const isLeave = !!leaveReq;
                        const isDesignated = leaveReq?.isDesignated;
                        const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                        let content = null;
                        if (work) {
                            const isWorkingHere = activeSiteId && work.siteId === activeSiteId;
                            if (isWorkingHere) {
                                const isDay = work.shift === ShiftType.Day;
                                content = (
                                    <div className={`w-full h-full flex items-center justify-center leading-none border-b-2 ${isDay ? 'bg-amber-100 border-amber-200' : 'bg-indigo-100 border-indigo-200'}`}>
                                         <span className={`text-sm font-extrabold ${isDay ? 'text-amber-800' : 'text-indigo-800'}`}>{isDay ? '早' : '晚'}</span>
                                    </div>
                                );
                            } else {
                                content = (
                                    <div className="w-full h-full flex items-center justify-center leading-none border-b-2 bg-slate-100 border-slate-200" title={`支援: ${work.siteName}`}>
                                         <span className="text-xs font-bold text-slate-400">他</span>
                                    </div>
                                );
                            }
                        } else if (isLeave) {
                             content = <span className={`text-sm ${isDesignated ? 'text-blue-600' : 'text-red-600'} font-bold block w-full h-full pt-1.5 ${isDesignated ? 'bg-blue-50' : 'bg-red-50'}`}>休</span>;
                        } else {
                             content = <div className="w-full h-full flex items-center justify-center group"><div className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover:bg-slate-300"></div></div>;
                        }
                        return <td key={day.dateStr} className={`p-0 border-r border-slate-100 text-center align-middle cursor-pointer hover:bg-slate-100 transition-colors select-none ${isWeekend ? 'bg-red-50/20' : ''}`} onClick={() => handleMobileCellClick(staff, day.dateStr)}>{content}</td>;
                    })}
                </tr>
            )})}
          </>
      );
  };

  const renderStaffView = () => {
    const groupedStaff: { siteName: string; staff: Staff[] }[] = [];
    state.sites.forEach(site => {
        const siteStaff = state.staff.filter(s => s.role === StaffRole.Regular && s.defaultSiteId === site.id).sort((a, b) => (a.defaultShift === ShiftType.Day ? -1 : 1));
        if (siteStaff.length > 0) groupedStaff.push({ siteName: site.name, staff: siteStaff });
    });
    const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);
    const renderStaffRow = (staff: Staff, roleLabel: string, rowBgColor: string, stickyBgColor: string) => (
        <tr key={staff.id} className={`${rowBgColor} hover:brightness-95 transition-colors border-b border-slate-100`}>
            <td className={`p-1 border-r border-slate-200 ${stickyBgColor} sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] h-[34px]`}>
                <div className="flex items-center gap-1 overflow-hidden">
                    <span className={`text-[10px] rounded px-1 shrink-0 font-bold ${getBadgeClass(roleLabel)}`}>{roleLabel}</span>
                    <span className="truncate text-sm font-bold text-slate-700">{staff.name}</span>
                </div>
            </td>
            {days.map(day => {
                const work = getStaffAssignmentForDay(staff.id, day.dateStr);
                const leaveReq = getLeaveRequest(staff.id, day.dateStr);
                const isLeave = !!leaveReq;
                const isDesignated = leaveReq?.isDesignated;
                const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                let content = null;
                const clickHandler = staff.role === StaffRole.Regular ? () => handleRegularCellClick(staff, day.dateStr) : () => handleMobileCellClick(staff, day.dateStr);
                if (work) {
                    const isDay = work.shift === ShiftType.Day;
                    content = (
                        <div className={`w-full h-full flex ${staff.role === StaffRole.Mobile ? 'flex-col' : ''} items-center justify-center leading-none border-b-2 ${isDay ? 'bg-amber-100 border-amber-200' : 'bg-indigo-100 border-indigo-200'}`} title={work.siteName}>
                             {staff.role === StaffRole.Mobile && <span className={`text-[9px] font-bold ${isDay ? 'text-amber-800' : 'text-indigo-800'} opacity-80 truncate w-full px-0.5`}>{work.siteName.slice(0,2)}</span>}
                             <span className={`text-sm font-extrabold ${isDay ? 'text-amber-800' : 'text-indigo-800'}`}>{isDay ? '早' : '晚'}</span>
                        </div>
                    );
                } else if (isLeave) {
                     content = <span className={`text-sm ${isDesignated ? 'text-blue-600' : 'text-red-600'} font-bold block w-full h-full pt-1.5 ${isDesignated ? 'bg-blue-50' : 'bg-red-50'}`}>休</span>;
                } else {
                     content = <span className="text-slate-300 text-xs">-</span>;
                }
                return <td key={day.dateStr} className={`p-0 border-r border-slate-100 text-center align-middle cursor-pointer hover:bg-black/5 transition-colors select-none ${isWeekend ? 'bg-red-50/30' : ''}`} onClick={clickHandler}>{content}</td>;
            })}
        </tr>
    );

    return (
        <>
            {groupedStaff.map(group => (
                <React.Fragment key={group.siteName}>
                    <tr className="bg-slate-200 border-y border-slate-300 h-[26px]">
                         <td className="px-2 sticky left-0 z-10 bg-slate-200 border-r border-slate-300 text-xs font-bold text-slate-700 shadow-sm">{group.siteName}</td>
                         <td colSpan={days.length} className="bg-slate-200"></td>
                    </tr>
                    {group.staff.map(s => renderStaffRow(s, s.defaultShift === ShiftType.Day ? '早' : '晚', 'bg-white', 'bg-white'))}
                </React.Fragment>
            ))}
            {mobileStaff.length > 0 && (
                <>
                    <tr className="bg-amber-100 border-y border-amber-200 h-[26px]">
                         <td className="px-2 sticky left-0 z-10 bg-amber-100 border-r border-amber-200 text-xs font-bold text-amber-900 shadow-sm">機動組</td>
                         <td colSpan={days.length} className="bg-amber-100"></td>
                    </tr>
                    {mobileStaff.map(s => renderStaffRow(s, getMobileLabel(s), 'bg-amber-50/30', 'bg-amber-50'))}
                </>
            )}
        </>
    );
  };

  return (
    <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 w-full relative">
      {loading && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center animate-in zoom-in-95 duration-200">
            <div className="relative mb-6">
               <div className="w-20 h-20 rounded-full border-4 border-slate-100 border-t-primary animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center"><Sparkles className="w-8 h-8 text-primary animate-pulse" /></div>
            </div>
            <h3 className="text-xl font-extrabold text-slate-800 mb-2">AI 智能排班中</h3>
            <p className="text-slate-500 text-sm text-center mb-6 leading-relaxed">正在分析人員班表、休假規則與人力配置...<br/>這可能需要一點時間</p>
            <div className="w-full bg-slate-100 rounded-full h-4 mb-3 overflow-hidden"><div className="bg-primary h-full rounded-full transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }}></div></div>
            <div className="flex justify-between w-full text-xs font-bold text-slate-400"><span>進度: {Math.floor(progress)}%</span><span>預計剩餘: {timeLeft} 秒</span></div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-2">
        <div><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CalendarRange className="w-5 h-5 text-primary" />排班表</h2></div>
        <div className="flex gap-2 w-full md:w-auto items-center flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 mr-2">
            <button onClick={() => setViewMode('site')} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'site' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700'}`}><LayoutGrid className="w-3 h-3" />案場班表</button>
            <button onClick={() => setViewMode('staff')} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'staff' ? 'bg-white text-primary shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700'}`}><Users className="w-3 h-3" />人員休假表</button>
          </div>
          <button onClick={onClearDesignated} disabled={loading} className="px-3 py-2 rounded-lg text-orange-600 bg-orange-50 border border-orange-200 font-bold text-sm hover:bg-orange-100 transition-all flex items-center gap-1 whitespace-nowrap"><Eraser className="w-4 h-4" />清除指定休假</button>
          <button onClick={onClear} disabled={loading} className="px-3 py-2 rounded-lg text-red-600 bg-red-50 border border-red-200 font-bold text-sm hover:bg-red-100 transition-all flex items-center gap-1 whitespace-nowrap"><Trash2 className="w-4 h-4" />清除班表</button>
          <button
            onClick={onGenerate}
            disabled={loading}
            className={`px-6 py-2 rounded-lg text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 ${loading ? 'bg-slate-400 cursor-not-allowed opacity-70' : 'bg-gradient-to-r from-primary to-blue-600 hover:from-blue-700 hover:to-primary active:scale-95'}`}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />排班中...</> : <><Play className="w-4 h-4 fill-current" />自動排班</>}
          </button>
        </div>
      </div>

      <>
            {viewMode === 'site' && (
                <div className="flex border-b border-slate-200 mb-0 overflow-x-auto hide-scrollbar">
                    {state.sites.map(site => (
                        <button key={site.id} onClick={() => setActiveSiteId(site.id)} className={`px-4 py-2 font-bold text-sm border-b-2 whitespace-nowrap ${activeSiteId === site.id ? 'border-primary text-primary bg-slate-50' : 'border-transparent text-slate-500'}`}>{site.name}</button>
                    ))}
                </div>
            )}
            <div className="overflow-x-auto border border-t-0 rounded-b max-h-[70vh] overflow-y-auto relative bg-white w-full">
                <table className="w-full text-sm border-collapse table-fixed">
                    <thead className="sticky top-0 z-20 shadow-sm bg-slate-50">
                    <tr>
                        <th className="p-1 border-r border-b bg-slate-50 text-left w-[100px] min-w-[100px] sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"><span className="text-xs font-bold text-slate-700">{viewMode === 'site' ? '人員 / 日期' : '員工姓名'}</span></th>
                        {days.map(day => <th key={day.dateStr} className={`p-0.5 border-r border-b text-center w-[36px] min-w-[36px] max-w-[36px] relative ${(day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600')}`}><div className="text-[10px] leading-tight opacity-70">{day.dateStr.slice(8)}</div><div className="text-xs font-bold leading-tight">{getChineseDayOfWeek(day.dayOfWeek)}</div></th>)}
                    </tr>
                    </thead>
                    <tbody>
                    {viewMode === 'site' && activeSite && (
                        <>
                            {siteRegulars.map(staff => {
                                const isDayShift = staff.defaultShift === ShiftType.Day;
                                return (
                                <tr key={staff.id} className={`${isDayShift ? 'bg-amber-50/40 hover:bg-amber-50' : 'bg-indigo-50/40 hover:bg-indigo-50'} transition-colors border-b border-slate-100`}>
                                    <td className={`p-1 border-r border-slate-200 ${isDayShift ? 'bg-amber-50' : 'bg-indigo-50'} sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] h-[34px]`}>
                                        <div className="flex items-center gap-1 overflow-hidden">
                                            <span className={`text-[10px] rounded px-1 shrink-0 font-bold ${isDayShift ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>{isDayShift ? '早' : '晚'}</span>
                                            <span className="truncate text-sm font-bold text-slate-700">{staff.name}</span>
                                        </div>
                                    </td>
                                    {days.map(day => {
                                        const assignedStaff = getAssignmentForSlot(activeSite.id, staff.defaultShift!, day.dateStr);
                                        const leaveReq = getLeaveRequest(staff.id, day.dateStr);
                                        const isLeave = !!leaveReq;
                                        const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                                        return (
                                            <td key={day.dateStr} className={`p-0 border-r border-slate-100 text-center align-middle transition-colors group select-none ${leaveReq?.isDesignated ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer'} ${isWeekend ? 'bg-red-50/20' : ''}`} onClick={() => handleRegularCellClick(staff, day.dateStr)}>
                                                {isLeave ? <span className={`text-sm font-bold block w-full h-full pt-1.5 ${leaveReq?.isDesignated ? 'text-blue-600' : 'text-red-600 bg-red-50'}`}>休</span> : (assignedStaff?.id === staff.id ? <span className="text-sm font-bold text-black block w-full h-full pt-1.5">{isDayShift ? '早' : '晚'}</span> : <div className="w-full h-full flex items-center justify-center group-hover:bg-slate-100"><Plus className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" /></div>)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            )})}
                            {renderMobileRows()}
                        </>
                    )}
                    {viewMode === 'staff' && renderStaffView()}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs font-bold px-2 py-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2"><span className="text-black text-sm">早/晚</span><span className="text-slate-600">: 正常上班</span></div>
                <div className="flex items-center gap-2"><span className="text-red-600 text-sm">休</span><span className="text-slate-600">: 排休</span></div>
                <div className="flex items-center gap-2"><Plus className="w-3 h-3 text-slate-400" /><span className="text-slate-600">: 空班</span></div>
                <div className="flex items-center gap-2"><span className="text-blue-600 text-sm">休</span><span className="text-slate-600">: 指定休假 (鎖定)</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-slate-100 border border-slate-200 flex items-center justify-center"><span className="text-[10px] text-slate-400 font-bold">他</span></div><span className="text-slate-600">: 支援其他案場</span></div>
            </div>
      </>
    </div>
  );
};

export default ScheduleView;