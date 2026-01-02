import React, { useState, useEffect } from 'react';
import { ScheduleState, Site, Staff, LeaveRequest, ScheduleAssignment, ShiftType, StaffRole } from './types';
import SiteManager from './components/SiteManager';
import MobileStaffManager from './components/MobileStaffManager';
import LeaveManager from './components/LeaveManager';
import ScheduleView from './components/ScheduleView';
import { ShieldCheck, ChevronRight, ChevronLeft } from 'lucide-react';
import { generateScheduleRuleBased, fillEmptySlotsWithMobile, isStaffAvailable } from './services/ruleBasedScheduler';
import { optimizeScheduleWithAI } from './services/geminiService';
import { getMonthDays } from './utils/dateUtils';

// Default initial state based on current date
const INITIAL_YEAR = new Date().getFullYear();
const INITIAL_MONTH = new Date().getMonth();

function App() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  
  // Initialize with empty state for production deployment
  const [state, setState] = useState<ScheduleState>({
    year: INITIAL_YEAR,
    month: INITIAL_MONTH,
    sites: [],
    staff: [],
    leaveRequests: [],
    assignments: []
  });

  const [loading, setLoading] = useState(false);

  // Storage Key for production
  const STORAGE_KEY = 'guardShift_v1_prod';

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure data integrity for mobile staff properties
        if (parsed.staff && Array.isArray(parsed.staff)) {
            parsed.staff = parsed.staff.map((s: any) => {
                if (s.role === StaffRole.Mobile) {
                    if (!Array.isArray(s.allowedShifts)) s.allowedShifts = [ShiftType.Day, ShiftType.Night];
                    if (!Array.isArray(s.allowedSiteIds)) s.allowedSiteIds = [];
                }
                return s;
            });
        }
        setState(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to load local state", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sites: state.sites,
      staff: state.staff,
      leaveRequests: state.leaveRequests,
      year: state.year,
      month: state.month
    }));
  }, [state.sites, state.staff, state.leaveRequests, state.year, state.month]);

  const handleManualAssignment = (dateStr: string, siteId: string, shift: ShiftType, staffId: string | null) => {
    setState(prev => {
        let newAssignments = prev.assignments.filter(a => 
            !(a.dateStr === dateStr && a.siteId === siteId && a.shift === shift)
        );
        if (staffId) {
             newAssignments = newAssignments.filter(a => !(a.dateStr === dateStr && a.staffId === staffId));
             newAssignments.push({ dateStr, siteId, shift, staffId });
        }
        return { ...prev, assignments: newAssignments };
    });
  };

  const handleMobileRelocation = (dateStr: string, mobileStaffId: string, action: 'ASSIGN' | 'LEAVE' | 'EMPTY', targetSiteId?: string, targetShift?: ShiftType) => {
      setState(prev => {
          let newAssignments = [...prev.assignments];
          let newLeaveRequests = [...prev.leaveRequests];
          const currentAssignment = newAssignments.find(a => a.staffId === mobileStaffId && a.dateStr === dateStr);

          if (currentAssignment) {
              newAssignments = newAssignments.filter(a => a !== currentAssignment);
              const owner = prev.staff.find(s => s.role === StaffRole.Regular && s.defaultSiteId === currentAssignment.siteId && s.defaultShift === currentAssignment.shift);
              if (owner) {
                  const leaveReq = newLeaveRequests.find(r => r.staffId === owner.id && r.dateStr === dateStr);
                  if (leaveReq && !leaveReq.isDesignated) newLeaveRequests = newLeaveRequests.filter(r => r !== leaveReq);
              }
          }

          if (action !== 'LEAVE') newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === mobileStaffId && r.dateStr === dateStr));

          if (action === 'LEAVE') {
              if (!newLeaveRequests.some(r => r.staffId === mobileStaffId && r.dateStr === dateStr)) {
                  newLeaveRequests.push({ staffId: mobileStaffId, dateStr, isDesignated: false });
              }
          } else if (action === 'ASSIGN' && targetSiteId && targetShift) {
              const targetOwner = prev.staff.find(s => s.role === StaffRole.Regular && s.defaultSiteId === targetSiteId && s.defaultShift === targetShift);
              if (targetOwner) {
                  if (!newLeaveRequests.some(r => r.staffId === targetOwner.id && r.dateStr === dateStr)) {
                      newLeaveRequests.push({ staffId: targetOwner.id, dateStr, isDesignated: false });
                  }
                  newAssignments = newAssignments.filter(a => !(a.staffId === targetOwner.id && a.dateStr === dateStr));
              }
              newAssignments = newAssignments.filter(a => !(a.siteId === targetSiteId && a.shift === targetShift && a.dateStr === dateStr));
              newAssignments.push({ dateStr, siteId: targetSiteId, shift: targetShift, staffId: mobileStaffId });
          }
          return { ...prev, assignments: newAssignments, leaveRequests: newLeaveRequests };
      });
  };

  const handleToggleLeave = (dateStr: string, staffId: string, shouldBeLeave: boolean) => {
      setState(prev => {
          let newLeaveRequests = [...prev.leaveRequests];
          let newAssignments = [...prev.assignments];
          const staffMember = prev.staff.find(s => s.id === staffId);

          if (shouldBeLeave) {
              if (!newLeaveRequests.some(r => r.staffId === staffId && r.dateStr === dateStr)) newLeaveRequests.push({ staffId, dateStr, isDesignated: false });
              newAssignments = newAssignments.filter(a => !(a.staffId === staffId && a.dateStr === dateStr));
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                  const days = getMonthDays(prev.year, prev.month);
                  const prevDateIdx = days.findIndex(d => d.dateStr === dateStr) - 1;
                  const prevDateStr = prevDateIdx >= 0 ? days[prevDateIdx].dateStr : undefined;
                  const availableMobile = prev.staff.filter(s => s.role === StaffRole.Mobile).find(m => {
                      if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(staffMember.defaultSiteId!)) return false;
                      return isStaffAvailable(m, dateStr, staffMember.defaultShift!, newAssignments, newLeaveRequests, days, prevDateStr).available;
                  });
                  if (availableMobile) newAssignments.push({ dateStr, siteId: staffMember.defaultSiteId!, shift: staffMember.defaultShift!, staffId: availableMobile.id });
              }
          } else {
              newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === staffId && r.dateStr === dateStr));
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                   newAssignments = newAssignments.filter(a => !(a.dateStr === dateStr && a.siteId === staffMember.defaultSiteId && a.shift === staffMember.defaultShift));
                   newAssignments.push({ dateStr, siteId: staffMember.defaultSiteId!, shift: staffMember.defaultShift!, staffId: staffId });
              }
          }
          return { ...prev, leaveRequests: newLeaveRequests, assignments: newAssignments };
      });
  };
  
  const handleClearSchedule = () => setState(prev => ({ ...prev, assignments: [], leaveRequests: prev.leaveRequests.filter(r => r.isDesignated) }));
  const handleClearDesignated = () => setState(prev => ({ ...prev, leaveRequests: prev.leaveRequests.filter(r => !r.isDesignated) }));

  const handleGenerate = async () => {
    setLoading(true);
    let draftAssignments: ScheduleAssignment[] = [];
    const apiKey = process.env.guard || process.env.API_KEY;
    try {
      draftAssignments = state.assignments.length > 0 ? [...state.assignments] : await generateScheduleRuleBased(state);
      if (apiKey) {
          try {
            const optimized = await optimizeScheduleWithAI(state, draftAssignments);
            if (optimized.length > 0) draftAssignments = optimized;
          } catch (e) { console.warn("AI optimization fallback", e); }
      }
      draftAssignments = fillEmptySlotsWithMobile(state, draftAssignments);
      const days = getMonthDays(state.year, state.month);
      const finalLeaves = state.leaveRequests.filter(r => r.isDesignated);
      state.staff.forEach(staff => {
          if (staff.role === StaffRole.Regular && staff.defaultSiteId && staff.defaultShift) {
               days.forEach(day => {
                   if (finalLeaves.some(r => r.staffId === staff.id && r.dateStr === day.dateStr)) return;
                   const working = draftAssignments.some(a => a.staffId === staff.id && a.dateStr === day.dateStr);
                   if (working) return;
                   const filledByOther = draftAssignments.find(a => a.siteId === staff.defaultSiteId && a.shift === staff.defaultShift && a.dateStr === day.dateStr);
                   if (filledByOther?.staffId) finalLeaves.push({ staffId: staff.id, dateStr: day.dateStr, isDesignated: false });
               });
          }
      });
      setState(prev => ({ ...prev, assignments: draftAssignments, leaveRequests: finalLeaves }));
    } catch (error) {
      alert("排班失敗: " + error);
    } finally {
      setLoading(false);
    }
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => setState(prev => ({ ...prev, year: parseInt(e.target.value), assignments: [] }));
  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => setState(prev => ({ ...prev, month: parseInt(e.target.value), assignments: [] }));
  const nextStep = () => { if (currentStep < 3) setCurrentStep(prev => (prev + 1) as 1 | 2 | 3); };
  const prevStep = () => { if (currentStep > 1) setCurrentStep(prev => (prev - 1) as 1 | 2 | 3); };

  const apiKeySet = !!(process.env.guard || process.env.API_KEY);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-10">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="w-full px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight hidden md:block">GuardShift <span className="text-primary">Auto</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <select value={state.year} onChange={handleYearChange} className="bg-slate-100 border-none rounded-lg py-1 px-2 text-sm font-medium focus:ring-2 focus:ring-primary cursor-pointer hover:bg-slate-200 transition">
              {Array.from({ length: 5 }, (_, i) => (
                <option key={i} value={new Date().getFullYear() + i}>{new Date().getFullYear() + i}年</option>
              ))}
            </select>
            <select value={state.month} onChange={handleMonthChange} className="bg-slate-100 border-none rounded-lg py-1 px-2 text-sm font-medium focus:ring-2 focus:ring-primary cursor-pointer hover:bg-slate-200 transition">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>{i + 1}月</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 py-2 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-100 -z-0"></div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all duration-500 -z-0" style={{ width: `${((currentStep - 1) / 2) * 100}%` }}></div>
            <div className="relative z-10 flex flex-col items-center gap-1 cursor-pointer" onClick={() => setCurrentStep(1)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 1 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-50'}`}>1</div>
              <span className={`text-[10px] font-bold ${currentStep >= 1 ? 'text-primary' : 'text-slate-400'}`}>案場與人員</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-1 cursor-pointer" onClick={() => setCurrentStep(2)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 2 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-50'}`}>2</div>
              <span className={`text-[10px] font-bold ${currentStep >= 2 ? 'text-primary' : 'text-slate-400'}`}>指定休假</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-1 cursor-pointer" onClick={() => setCurrentStep(3)}>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 3 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-50'}`}>3</div>
              <span className={`text-[10px] font-bold ${currentStep >= 3 ? 'text-primary' : 'text-slate-400'}`}>自動排班</span>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full px-1 md:px-4 py-4">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {currentStep === 1 && (
            <div className="space-y-6">
               <div className="grid lg:grid-cols-2 gap-6">
                <SiteManager sites={state.sites} staff={state.staff} setSites={(sites) => setState(s => ({ ...s, sites }))} setStaff={(staff) => setState(s => ({ ...s, staff }))} />
                <MobileStaffManager staff={state.staff} sites={state.sites} setStaff={(staff) => setState(s => ({ ...s, staff }))} />
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-200">
                 <button onClick={nextStep} className="bg-primary text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg hover:bg-blue-800 transition flex items-center gap-2">下一步：設定休假 <ChevronRight className="w-5 h-5" /></button>
              </div>
            </div>
          )}
          {currentStep === 2 && (
            <div className="space-y-4">
              <LeaveManager state={state} setLeaveRequests={(leaveRequests) => setState(s => ({ ...s, leaveRequests }))} />
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <button onClick={prevStep} className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-base hover:bg-slate-300 transition flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> 上一步</button>
                <button onClick={nextStep} className="bg-primary text-white px-6 py-2 rounded-lg font-bold text-base shadow-lg hover:bg-blue-800 transition flex items-center gap-1">下一步：預覽排班 <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
          {currentStep === 3 && (
            <div className="space-y-4">
              <ScheduleView state={state} loading={loading} onGenerate={handleGenerate} onClear={handleClearSchedule} onClearDesignated={handleClearDesignated} onUpdateAssignment={handleManualAssignment} onToggleLeave={handleToggleLeave} onMobileRelocation={handleMobileRelocation} apiKeySet={apiKeySet} />
              <div className="flex justify-start pt-2 border-t border-slate-200">
                <button onClick={prevStep} className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-base hover:bg-slate-300 transition flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> 上一步</button>
              </div>
            </div>
          )}
        </div>
      </main>
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-slate-400 text-xs mt-auto">
        <p>&copy; {new Date().getFullYear()} GuardShift Auto.</p>
      </footer>
    </div>
  );
}

export default App;
