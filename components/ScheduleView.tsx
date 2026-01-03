
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScheduleState, ShiftType, StaffRole, Staff, LeaveRequest, ScheduleAssignment, SitePost } from '../types';
import { getMonthDays, getChineseDayOfWeek, getRequiredLeaveDays } from '../utils/dateUtils';
import { LayoutGrid, Users, Loader2, Trash2, Sparkles, X, Briefcase, Palmtree, UserCog, Ban, Sun, Moon, MousePointerClick, Zap, Search, Hand } from 'lucide-react';

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
  readOnly?: boolean;
  isExporting?: boolean;
}

interface QuickMenuProps {
    x: number;
    y: number;
    staff: Staff;
    dateStr: string;
    onClose: () => void;
    onSelect: (action: 'ASSIGN' | 'LEAVE' | 'EMPTY', siteId?: string, shift?: ShiftType) => void;
    sites: { id: string; name: string }[];
}

const QuickActionMenu: React.FC<QuickMenuProps> = ({ x, y, staff, dateStr, onClose, onSelect, sites }) => {
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const options = useMemo(() => {
        const list: { id: string; label: string; action: 'ASSIGN' | 'LEAVE' | 'EMPTY'; siteId?: string; shift?: ShiftType; color: string }[] = [];
        list.push({ id: 'opt-leave', label: '休假', action: 'LEAVE', color: 'bg-red-100 text-red-700 border-red-300' });
        list.push({ id: 'opt-empty', label: '空班', action: 'EMPTY', color: 'bg-slate-100 text-slate-500 border-slate-300' });
        if (staff.role === StaffRole.Mobile) {
            const allowedShifts = staff.allowedShifts && staff.allowedShifts.length > 0 ? staff.allowedShifts : [ShiftType.Day, ShiftType.Night];
            const allowedSiteIds = staff.allowedSiteIds || [];
            const validSites = sites.filter(s => allowedSiteIds.length === 0 || allowedSiteIds.includes(s.id));
            validSites.forEach(site => {
                if (allowedShifts.includes(ShiftType.Day)) {
                    list.push({ id: `opt-${site.id}-day`, label: `${site.name.substring(0,2)} (早)`, action: 'ASSIGN', siteId: site.id, shift: ShiftType.Day, color: 'bg-yellow-300 text-slate-900 border-yellow-400' });
                }
                if (allowedShifts.includes(ShiftType.Night)) {
                    list.push({ id: `opt-${site.id}-night`, label: `${site.name.substring(0,2)} (晚)`, action: 'ASSIGN', siteId: site.id, shift: ShiftType.Night, color: 'bg-blue-300 text-slate-900 border-blue-400' });
                }
            });
        }
        return list;
    }, [staff, sites]);

    useEffect(() => {
        const handleMove = (clientX: number, clientY: number) => {
            const elements = document.elementsFromPoint(clientX, clientY);
            const target = elements.find(el => el.hasAttribute('data-opt-id'));
            if (target) { setHighlightedId(target.getAttribute('data-opt-id')); } else { setHighlightedId(null); }
        };
        const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
        const onTouchMove = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); };
        const onUp = () => {
             const el = document.querySelector(`[data-opt-id="${highlightedId}"]`);
             if (highlightedId && el) { const opt = options.find(o => o.id === highlightedId); if (opt) { onSelect(opt.action, opt.siteId, opt.shift); } }
             onClose();
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
        };
    }, [highlightedId, options, onSelect, onClose]);

    const leaveOpt = options.find(o => o.id === 'opt-leave');
    const emptyOpt = options.find(o => o.id === 'opt-empty');
    const siteOpts = options.filter(o => o.id !== 'opt-leave' && o.id !== 'opt-empty');
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
             <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"></div>
             <div ref={menuRef} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex flex-col items-center justify-center gap-6 animate-in zoom-in-95 duration-200">
                {leaveOpt && ( <div data-opt-id={leaveOpt.id} className={`w-24 h-24 rounded-full flex items-center justify-center font-bold text-lg shadow-2xl border-4 transition-transform scale-100 ${highlightedId === leaveOpt.id ? 'scale-110 z-50 ring-4 ring-white' : ''} ${leaveOpt.color}`}>{leaveOpt.label}</div>)}
                <div className="flex items-center gap-8">
                    {siteOpts.length > 0 && (
                        <div className="grid grid-cols-2 gap-4 max-w-[320px]">
                            {siteOpts.map(opt => (<div key={opt.id} data-opt-id={opt.id} className={`px-5 py-4 rounded-xl font-bold text-base text-center shadow-xl border-2 transition-transform ${highlightedId === opt.id ? 'scale-105 z-50 ring-2 ring-white' : 'scale-100'} ${opt.color}`}>{opt.label}</div>))}
                        </div>
                    )}
                </div>
                {emptyOpt && (<div data-opt-id={emptyOpt.id} className={`w-20 h-20 rounded-full flex items-center justify-center font-bold text-base shadow-xl border-4 transition-transform scale-100 ${highlightedId === emptyOpt.id ? 'scale-110 z-50 ring-4 ring-white' : ''} ${emptyOpt.color}`}>{emptyOpt.label}</div>)}
                <div className="absolute top-full mt-4 text-xs text-white/90 font-bold bg-black/60 px-3 py-1.5 rounded-full pointer-events-none">滑動至選項後放開</div>
             </div>
        </div>
    );
};

const getShiftStyle = (shift: ShiftType) => shift === ShiftType.Day ? 'bg-yellow-300 text-slate-900' : 'bg-blue-300 text-slate-900';
const getLeaveStyle = (isDesignated: boolean) => isDesignated ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

const ScheduleView: React.FC<ScheduleViewProps> = ({ state, loading, onGenerate, onClear, onUpdateAssignment, onToggleLeave, onMobileRelocation, readOnly = false, isExporting = false }) => {
  const [viewMode, setViewMode] = useState<'site' | 'staff'>('site');
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickMenu, setQuickMenu] = useState<{ x: number; y: number; staff: Staff; dateStr: string } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const isLongPress = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);

  const days = getMonthDays(state.year, state.month);
  const targetLeaves = getRequiredLeaveDays(state.year, state.month);
  const allMobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);

  useEffect(() => { if (state.sites.length > 0 && (!activeSiteId || !state.sites.find(s => s.id === activeSiteId))) { setActiveSiteId(state.sites[0].id); } }, [state.sites, activeSiteId]);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (loading) {
      setProgress(0); setTimeLeft(60);
      timer = setInterval(() => { setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1)); setProgress((prev) => (prev >= 99 ? 99 : prev + 1.66)); }, 1000);
    } else { setProgress(100); }
    return () => { if (timer) clearInterval(timer); };
  }, [loading]);

  const getStaffAssignmentForDay = (staffId: string, dateStr: string) => {
    const assignment = state.assignments.find(a => a.staffId === staffId && a.dateStr === dateStr);
    if (!assignment) return null;
    const site = state.sites.find(s => s.id === assignment.siteId);
    return { siteName: site ? site.name : '', siteId: assignment.siteId, shift: assignment.shift };
  };

  const getLeaveRequest = (staffId: string, dateStr: string): LeaveRequest | undefined => state.leaveRequests.find(req => req.staffId === staffId && req.dateStr === dateStr);
  const getAllowedShifts = (staff: Staff): ShiftType[] => staff.allowedShifts && staff.allowedShifts.length > 0 ? staff.allowedShifts : [ShiftType.Day, ShiftType.Night];
  const filteredSites = useMemo(() => searchTerm ? state.sites.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())) : state.sites, [state.sites, searchTerm]);

  useEffect(() => { if (searchTerm && filteredSites.length > 0 && !filteredSites.find(s => s.id === activeSiteId)) { setActiveSiteId(filteredSites[0].id); } }, [searchTerm, filteredSites, activeSiteId]);

  const activeSite = state.sites.find(s => s.id === activeSiteId);
  const activeSitePosts = activeSite ? (activeSite.posts || []) : [];
  const activeSiteStaff = state.staff.filter(s => s.defaultSiteId === activeSiteId && s.role === StaffRole.Regular);
  const filteredStaffView = useMemo(() => searchTerm ? state.staff.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())) : state.staff, [state.staff, searchTerm]);

  const stickyClass = isExporting ? '' : 'sticky left-0 z-10';
  const headerStickyClass = isExporting ? '' : 'sticky left-0 z-10';
  const firstColBg = isExporting ? 'bg-transparent' : 'bg-white';
  const containerClass = isExporting ? 'overflow-visible w-fit' : 'overflow-x-auto';
  const tableLayoutClass = isExporting ? 'w-auto min-w-[1200px]' : 'w-full min-w-[1200px] table-fixed';
  
  const handlePointerDown = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent, staff: Staff, dateStr: string) => {
      if (readOnly || isExporting) return;
      isLongPress.current = false;
      const leave = getLeaveRequest(staff.id, dateStr);
      if (leave?.isDesignated) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      startPos.current = { x: clientX, y: clientY };
      longPressTimer.current = window.setTimeout(() => { isLongPress.current = true; setQuickMenu({ x: clientX, y: clientY, staff, dateStr }); }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!startPos.current || !longPressTimer.current) return;
      const dist = Math.hypot(e.clientX - startPos.current.x, e.clientY - startPos.current.y);
      if (dist > 10) { clearTimeout(longPressTimer.current); longPressTimer.current = null; startPos.current = null; }
  };

  const handlePointerCancel = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } startPos.current = null; isLongPress.current = false; };
  const handlePointerUp = (staff: Staff, dateStr: string, assignment: any, isLeave: any) => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      startPos.current = null;
      if (!isLongPress.current && !quickMenu) { if (staff.role === StaffRole.Regular) { handleRegularCellClick(staff, dateStr, assignment, isLeave); } else { handleMobileCellClick(staff, dateStr, assignment, isLeave); } }
      setTimeout(() => { isLongPress.current = false; }, 100);
  };

  const handleRegularCellClick = (staff: Staff, dateStr: string, assignment: ScheduleAssignment | undefined, isLeave: LeaveRequest | undefined) => {
    if (readOnly || isExporting || isLeave?.isDesignated) return;
    const targetSiteId = staff.defaultSiteId || activeSiteId;
    if (!targetSiteId || !staff.defaultShift) return;
    if (isLeave) { onToggleLeave(dateStr, staff.id, false); onUpdateAssignment(dateStr, targetSiteId, staff.defaultShift, null); return; }
    if (assignment && assignment.staffId === staff.id) { onToggleLeave(dateStr, staff.id, true); return; }
    onToggleLeave(dateStr, staff.id, false); onUpdateAssignment(dateStr, targetSiteId, staff.defaultShift, staff.id);
  };

  const handleMobileCellClick = (staff: Staff, dateStr: string, assignment: ScheduleAssignment | undefined, isLeave: LeaveRequest | undefined) => {
      if (readOnly || isExporting || isLeave?.isDesignated) return;
      const options: any[] = [];
      const allowedShifts = getAllowedShifts(staff);
      const allowedSiteIds = staff.allowedSiteIds || [];
      const sortedSites = [...state.sites].sort((a, b) => a.id === activeSiteId ? -1 : b.id === activeSiteId ? 1 : 0).filter(s => allowedSiteIds.length === 0 || allowedSiteIds.includes(s.id));
      sortedSites.forEach(site => { allowedShifts.forEach(shift => { options.push({ type: 'WORK', siteId: site.id, shift: shift }); }); });
      options.push({ type: 'LEAVE' }, { type: 'EMPTY' });
      let currentIndex = isLeave ? options.findIndex((o:any) => o.type === 'LEAVE') : assignment ? options.findIndex((o:any) => o.type === 'WORK' && o.siteId === assignment.siteId && o.shift === assignment.shift) : options.findIndex((o:any) => o.type === 'EMPTY');
      if (currentIndex === -1) currentIndex = options.length - 1;
      const nextOption = options[(currentIndex + 1) % options.length];
      if (nextOption.type === 'LEAVE') { onMobileRelocation(dateStr, staff.id, 'LEAVE'); } else if (nextOption.type === 'EMPTY') { onMobileRelocation(dateStr, staff.id, 'EMPTY'); } else if (nextOption.type === 'WORK' && nextOption.siteId && nextOption.shift) { onMobileRelocation(dateStr, staff.id, 'ASSIGN', nextOption.siteId, nextOption.shift); }
  };

  const getCellContentAndStyle = (staff: Staff, dateStr: string, assignment: ScheduleAssignment | undefined | null, isLeave: LeaveRequest | undefined, currentViewContext: 'site' | 'staff'): { content: React.ReactNode; bgClass: string } => {
      if (isLeave) return { content: <span className={`${isLeave.isDesignated ? 'text-green-700' : 'text-red-700'} font-bold text-sm`}>休</span>, bgClass: getLeaveStyle(isLeave.isDesignated) };
      if (assignment) {
          const isDay = assignment.shift === ShiftType.Day;
          const assignedSite = state.sites.find(s => s.id === assignment.siteId);
          const siteAbbr = assignedSite ? assignedSite.name.substring(0, 2) : "他";
          const isLocalSite = assignment.siteId === activeSiteId; 
          const styleClass = getShiftStyle(assignment.shift);
          if (currentViewContext === 'site') {
              if (isLocalSite) return { content: <span className="font-bold text-sm text-slate-900">{isDay ? '早' : '晚'}</span>, bgClass: styleClass };
              return { content: (<div className="flex flex-col items-center justify-center leading-none"><span className="text-[10px] font-bold opacity-70 mb-0.5">{siteAbbr}</span><span className="text-[10px] font-bold">{isDay ? '早' : '晚'}</span></div>), bgClass: 'bg-slate-200 text-slate-600' };
          }
          return { content: (<div className="flex flex-col items-center justify-center leading-none"><span className="text-[10px] font-bold opacity-70 mb-0.5">{siteAbbr}</span><span className="text-[10px] font-bold text-slate-900">{isDay ? '早' : '晚'}</span></div>), bgClass: styleClass };
      }
      return staff.role === StaffRole.Regular ? { content: <span className="text-red-300 text-xs">缺</span>, bgClass: 'bg-white' } : { content: <span className="text-slate-200 text-xs">●</span>, bgClass: 'bg-white' };
  };

  const renderCell = (staff: Staff, dateStr: string, currentViewContext: 'site' | 'staff') => {
      const assignment = currentViewContext === 'site' ? state.assignments.find(a => a.staffId === staff.id && a.dateStr === dateStr) : getStaffAssignmentForDay(staff.id, dateStr); 
      const isLeave = getLeaveRequest(staff.id, dateStr);
      const { content, bgClass } = getCellContentAndStyle(staff, dateStr, assignment, isLeave, currentViewContext);
      const isLocked = isLeave?.isDesignated;
      const interactionClass = (!readOnly && !isExporting && !isLocked) ? "cursor-pointer hover:opacity-90 active:scale-[0.98] touch-manipulation" : "cursor-default";
      return (
          <div className={`h-full min-h-[3rem] border-r border-b border-slate-100 flex items-center justify-center select-none transition-all ${bgClass} ${interactionClass}`} onPointerDown={(e) => handlePointerDown(e, staff, dateStr)} onPointerMove={handlePointerMove} onPointerUp={() => handlePointerUp(staff, dateStr, assignment, isLeave)} onPointerCancel={handlePointerCancel} onContextMenu={(e) => e.preventDefault()} onPointerLeave={() => { if (longPressTimer.current && !isLongPress.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } startPos.current = null; }}>
              {content}
          </div>
      );
  };

  return (
    <div className="space-y-6 relative">
      {quickMenu && !isExporting && (<QuickActionMenu x={quickMenu.x} y={quickMenu.y} staff={quickMenu.staff} dateStr={quickMenu.dateStr} sites={state.sites} onClose={() => setQuickMenu(null)} onSelect={(action, siteId, shift) => { onMobileRelocation(quickMenu.dateStr, quickMenu.staff.id, action, siteId, shift); }} />)}
      {!isExporting && (
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4 w-full lg:w-auto flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
            <button onClick={() => setViewMode('site')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all duration-200 active:scale-95 ${viewMode === 'site' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><LayoutGrid className="w-4 h-4" /> 案場班表</button>
            <button onClick={() => setViewMode('staff')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all duration-200 active:scale-95 ${viewMode === 'staff' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Users className="w-4 h-4" /> 人員休假表</button>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden lg:block"></div>
          <div className="relative group min-w-[200px]"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500" /><input type="text" placeholder="搜尋案場或人員..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" /></div>
          {!readOnly && (<div className="flex gap-2 shrink-0"><button onClick={onClear} disabled={loading} className="px-3 py-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg font-bold text-sm flex items-center gap-2 transition-all duration-200 active:scale-95 border border-transparent hover:border-red-100" title="清除所有排班"><Trash2 className="w-4 h-4" /></button></div>)}
        </div>
        {!readOnly && (<button onClick={onGenerate} disabled={loading} className={`w-full lg:w-auto px-8 py-3 rounded-xl font-black text-lg shadow-lg flex items-center justify-center gap-2 transition-all duration-300 ${loading ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 hover:-translate-y-1 hover:shadow-xl active:scale-95'}`}>{loading ? (<><Loader2 className="w-5 h-5 animate-spin" />自動排班中...</>) : (<><Sparkles className="w-5 h-5" />自動排班</>)}</button>)}
      </div>
      )}
      {loading && !isExporting && (<div className="bg-white p-6 rounded-xl border border-blue-100 shadow-lg animate-in fade-in slide-in-from-top-4"><div className="flex justify-between text-sm font-bold text-slate-500 mb-2"><span>AI 正在運算...</span><span>預計 {timeLeft} 秒</span></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div></div></div>)}
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col ${containerClass}`}>
        {viewMode === 'site' && (
            <>
                <div className={`flex border-b border-slate-100 p-1 bg-slate-50/50 ${isExporting ? 'flex-wrap' : 'overflow-x-auto'}`}>
                    {filteredSites.map(site => (<button key={site.id} onClick={() => !isExporting && setActiveSiteId(site.id)} className={`px-5 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all duration-200 ${activeSiteId === site.id ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500'} ${!isExporting ? 'hover:text-slate-700 hover:bg-slate-100 active:scale-95' : ''}`}>{site.name}</button>))}
                    {filteredSites.length === 0 && (<div className="p-3 text-sm text-slate-400">無符合搜尋條件的案場</div>)}
                </div>
                {activeSite && (
                    <div className={containerClass}>
                        <table className={`border-collapse ${tableLayoutClass}`}>
                            <thead>
                                <tr>
                                    <th className={`w-32 p-2 bg-slate-50 border-r border-b border-slate-200 text-left text-sm font-bold text-slate-600 pl-4 ${headerStickyClass}`}>崗位 / 人員 / 日期</th>
                                    <th className="w-16 min-w-[4rem] p-1 border-r border-b border-slate-200 text-center bg-slate-50"><div className="text-xs font-bold text-slate-600">休假</div><div className="text-[10px] text-slate-400">/{targetLeaves}</div></th>
                                    {days.map(day => (<th key={day.dateStr} className={`w-14 min-w-[3.5rem] p-1 border-r border-b border-slate-200 text-center ${day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'bg-red-50/50' : 'bg-slate-50'}`}><div className={`text-sm font-bold ${day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'text-red-500' : 'text-slate-700'}`}>{day.date.getDate()}</div><div className={`text-[10px] ${day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'text-red-400' : 'text-slate-400'}`}>{getChineseDayOfWeek(day.dayOfWeek)}</div></th>))}
                                </tr>
                            </thead>
                            <tbody>
                                {activeSitePosts.length > 0 ? (
                                    [...activeSitePosts].sort((a,b) => (a.shift === ShiftType.Day ? -1 : 1)).map(post => {
                                        const staff = activeSiteStaff.find(s => s.defaultPostId === post.id) || activeSiteStaff.find(s => !s.defaultPostId && s.defaultShift === post.shift);
                                        if (!staff) {
                                            return (<tr key={post.id} className="bg-slate-50/30"><td className={`p-3 border-r border-b border-slate-100 ${firstColBg} ${stickyClass}`}><div className="flex flex-col"><div className="flex items-center gap-2 mb-1"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${post.shift === ShiftType.Day ? 'bg-yellow-300 text-slate-900' : 'bg-blue-300 text-slate-900'}`}>{post.name}</span></div><span className="text-xs text-red-300 italic">未指派人員</span></div></td><td colSpan={days.length + 1} className="p-2 border-r border-b border-slate-100 text-center text-slate-300 text-sm">請至案場設置指派人員</td></tr>);
                                        }
                                        const isDay = staff.defaultShift === ShiftType.Day;
                                        const badgeColor = isDay ? 'bg-yellow-300 text-slate-900' : 'bg-blue-300 text-slate-900';
                                        const rowBg = isDay ? 'bg-yellow-50/20' : 'bg-blue-50/20';
                                        const leaveCount = state.leaveRequests.filter(l => l.staffId === staff.id).length;
                                        return (<tr key={post.id} className={rowBg}><td className={`p-3 border-r border-b border-slate-100 ${firstColBg} ${stickyClass}`}><div className="flex flex-col"><div className="flex items-center gap-2 mb-1"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>{post.name}</span></div><span className="font-bold text-sm text-slate-700 pl-1">{staff.name}</span></div></td><td className="p-0 border-r border-b border-slate-100 text-center bg-white/50"><span className={`font-bold text-sm ${leaveCount >= targetLeaves ? 'text-green-600' : 'text-red-400'}`}>{leaveCount}</span></td>{days.map(day => (<td key={`${staff.id}-${day.dateStr}`} className="p-0 border-r border-b border-slate-100 text-center">{renderCell(staff, day.dateStr, 'site')}</td>))}</tr>);
                                    })
                                ) : (<tr><td colSpan={days.length + 2} className="p-8 text-center text-slate-400">此案場尚未設定任何崗位</td></tr>)}
                                <tr><td colSpan={days.length + 2} className="bg-slate-50 p-2 border-y border-slate-200"><span className="text-xs font-bold text-slate-500 pl-2">機動人員</span></td></tr>
                                {allMobileStaff.map(staff => {
                                    const allowed = getAllowedShifts(staff);
                                    let badgeText = "全", badgeClass = "bg-slate-100 text-slate-600";
                                    const leaveCount = state.leaveRequests.filter(l => l.staffId === staff.id).length;
                                    if (allowed.length === 1) { if (allowed[0] === ShiftType.Day) { badgeText = "早"; badgeClass = "bg-yellow-300 text-slate-900"; } else if (allowed[0] === ShiftType.Night) { badgeText = "晚"; badgeClass = "bg-blue-300 text-slate-900"; } }
                                    return (<tr key={staff.id}><td className={`p-3 border-r border-b border-slate-100 ${firstColBg} ${stickyClass}`}><div className="flex items-center gap-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeClass}`}>{badgeText}</span><span className="font-bold text-sm text-slate-600">{staff.name}</span></div></td><td className="p-0 border-r border-b border-slate-100 text-center bg-white/50"><span className={`font-bold text-sm ${leaveCount >= targetLeaves ? 'text-green-600' : 'text-red-400'}`}>{leaveCount}</span></td>{days.map(day => (<td key={`${staff.id}-${day.dateStr}`} className="p-0 border-r border-b border-slate-100 text-center">{renderCell(staff, day.dateStr, 'site')}</td>))}</tr>)
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </>
        )}
        {viewMode === 'staff' && (
             <div className={containerClass}><table className={`border-collapse ${tableLayoutClass}`}><thead><tr><th className={`w-32 p-2 bg-slate-50 border-r border-b border-slate-200 text-left text-xs font-bold text-slate-500 pl-4 ${headerStickyClass}`}>人員</th><th className="w-16 min-w-[4rem] p-1 border-r border-b border-slate-200 text-center bg-slate-50"><div className="text-xs font-bold text-slate-600">休假</div><div className="text-[10px] text-slate-400">/{targetLeaves}</div></th>{days.map(day => (<th key={day.dateStr} className={`w-14 min-w-[3.5rem] p-1 border-r border-b border-slate-200 text-center ${day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'bg-red-50/50' : 'bg-slate-50'}`}><div className="text-sm font-bold text-slate-700">{day.date.getDate()}</div><div className={`text-[10px] ${day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'text-red-400' : 'text-slate-400'}`}>{getChineseDayOfWeek(day.dayOfWeek)}</div></th>))}</tr></thead><tbody>{filteredStaffView.map(staff => { const leaveCount = state.leaveRequests.filter(l => l.staffId === staff.id).length; return (<tr key={staff.id}><td className={`p-2 border-r border-b border-slate-100 ${firstColBg} font-bold text-sm ${stickyClass}`}>{staff.name}</td><td className="p-0 border-r border-b border-slate-100 text-center bg-white/50"><span className={`font-bold text-sm ${leaveCount >= targetLeaves ? 'text-green-600' : 'text-red-400'}`}>{leaveCount}</span></td>{days.map(day => (<td key={day.dateStr} className="p-0 border-r border-b border-slate-100 text-center">{renderCell(staff, day.dateStr, 'staff')}</td>))}</tr>) })}</tbody></table></div>
        )}
      </div>
      {!readOnly && !isExporting && (<div className="bg-white border border-slate-200 p-4 rounded-lg flex flex-col gap-2 text-sm"><div className="flex flex-wrap gap-6"><div className="flex items-center gap-2"><span className="font-bold text-slate-900 bg-yellow-300 px-2 py-0.5 rounded">早</span><span className="font-bold text-slate-900 bg-blue-300 px-2 py-0.5 rounded">晚</span><span className="text-slate-500">: 正常排班</span></div><div className="flex items-center gap-2"><span className="font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">休</span><span className="text-slate-500">: 指定休假 (綠色/鎖定)</span></div><div className="flex items-center gap-2"><span className="font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">休</span><span className="text-slate-500">: 手動排休 (紅色)</span></div></div><div className="flex flex-col sm:flex-row gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3 mt-1 font-medium"><div className="flex items-center gap-2"><MousePointerClick className="w-4 h-4 text-blue-500" /><span><strong className="text-slate-700">正班點擊：</strong>循環切換 (上班 ➝ 休假 ➝ 空缺 ➝ 上班)。<span className="text-blue-600 font-bold ml-1">(自動排入代班)</span></span></div><div className="flex items-center gap-2 sm:border-l sm:border-slate-200 sm:pl-3"><Hand className="w-4 h-4 text-amber-500" /><span><strong className="text-slate-700">機動長按：</strong>固定選單 (紅色=休、下方=空、左右=案場)。</span></div></div></div>)}
    </div>
  );
};
export default ScheduleView;
