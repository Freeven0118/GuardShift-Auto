import React, { useState, useEffect } from 'react';
import { ScheduleState, Site, Staff, LeaveRequest, ScheduleAssignment, ShiftType, StaffRole } from './types';
import SiteManager from './components/SiteManager';
import MobileStaffManager from './components/MobileStaffManager';
import LeaveManager from './components/LeaveManager';
import ScheduleView from './components/ScheduleView';
import { Calendar as CalendarIcon, Users, Settings, BarChart3, ShieldCheck, ChevronRight, ChevronLeft } from 'lucide-react';
import { generateScheduleRuleBased, fillEmptySlotsWithMobile, isStaffAvailable } from './services/ruleBasedScheduler';
import { optimizeScheduleWithAI } from './services/geminiService';
import { getMonthDays } from './utils/dateUtils';

// Default initial state
const INITIAL_YEAR = new Date().getFullYear();
const INITIAL_MONTH = new Date().getMonth();

// Cleared for production launch
const DEMO_SITES: Site[] = [];

const DEMO_STAFF: Staff[] = [];

function App() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  
  // Initialize with empty state for production
  const [state, setState] = useState<ScheduleState>({
    year: INITIAL_YEAR,
    month: INITIAL_MONTH,
    sites: DEMO_SITES,
    staff: DEMO_STAFF,
    leaveRequests: [],
    assignments: []
  });

  const [loading, setLoading] = useState(false);

  // Storage Key
  const STORAGE_KEY = 'guardShiftState_prod_v1';

  // Load from local storage with migration logic
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        if (parsed.staff && Array.isArray(parsed.staff)) {
            parsed.staff = parsed.staff.map((s: any) => {
                if (s.role === 'Mobile') {
                    if (typeof s.allowedShifts === 'string') {
                        if (s.allowedShifts === 'Both') {
                            s.allowedShifts = [ShiftType.Day, ShiftType.Night];
                        } else if (s.allowedShifts === 'Day') {
                            s.allowedShifts = [ShiftType.Day];
                        } else if (s.allowedShifts === 'Night') {
                            s.allowedShifts = [ShiftType.Night];
                        } else {
                            s.allowedShifts = [ShiftType.Day, ShiftType.Night];
                        }
                    } else if (!Array.isArray(s.allowedShifts)) {
                        s.allowedShifts = [ShiftType.Day, ShiftType.Night];
                    }
                    if (!s.allowedSiteIds) {
                        s.allowedSiteIds = [];
                    }
                }
                return s;
            });
        }

        setState(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }
  }, []);

  // Save to local storage
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

  const handleMobileRelocation = (
      dateStr: string, 
      mobileStaffId: string, 
      action: 'ASSIGN' | 'LEAVE' | 'EMPTY',
      targetSiteId?: string,
      targetShift?: ShiftType
  ) => {
      setState(prev => {
          let newAssignments = [...prev.assignments];
          let newLeaveRequests = [...prev.leaveRequests];

          const currentAssignment = newAssignments.find(a => a.staffId === mobileStaffId && a.dateStr === dateStr);

          if (currentAssignment) {
              newAssignments = newAssignments.filter(a => a !== currentAssignment);
              const owner = prev.staff.find(s => 
                  s.role === StaffRole.Regular && 
                  s.defaultSiteId === currentAssignment.siteId && 
                  s.defaultShift === currentAssignment.shift
              );
              if (owner) {
                  const leaveReq = newLeaveRequests.find(r => r.staffId === owner.id && r.dateStr === dateStr);
                  if (leaveReq && !leaveReq.isDesignated) {
                      newLeaveRequests = newLeaveRequests.filter(r => r !== leaveReq);
                  }
              }
          }

          if (action !== 'LEAVE') {
             newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === mobileStaffId && r.dateStr === dateStr));
          }

          if (action === 'LEAVE') {
              if (!newLeaveRequests.some(r => r.staffId === mobileStaffId && r.dateStr === dateStr)) {
                  newLeaveRequests.push({ staffId: mobileStaffId, dateStr, isDesignated: false });
              }
          } else if (action === 'ASSIGN' && targetSiteId && targetShift) {
              const targetOwner = prev.staff.find(s => 
                  s.role === StaffRole.Regular && 
                  s.defaultSiteId === targetSiteId && 
                  s.defaultShift === targetShift
              );
              if (targetOwner) {
                  if (!newLeaveRequests.some(r => r.staffId === targetOwner.id && r.dateStr === dateStr)) {
                      newLeaveRequests.push({ staffId: targetOwner.id, dateStr, isDesignated: false });
                  }
                  newAssignments = newAssignments.filter(a => !(a.staffId === targetOwner.id && a.dateStr === dateStr));
              }
              newAssignments = newAssignments.filter(a => 
                  !(a.siteId === targetSiteId && a.shift === targetShift && a.dateStr === dateStr)
              );
              newAssignments.push({
                  dateStr,
                  siteId: targetSiteId,
                  shift: targetShift,
                  staffId: mobileStaffId
              });
          }

          return {
              ...prev,
              assignments: newAssignments,
              leaveRequests: newLeaveRequests
          };
      });
  };

  const handleToggleLeave = (dateStr: string, staffId: string, shouldBeLeave: boolean) => {
      setState(prev => {
          let newLeaveRequests = [...prev.leaveRequests];
          let newAssignments = [...prev.assignments];
          const staffMember = prev.staff.find(s => s.id === staffId);

          if (shouldBeLeave) {
              if (!newLeaveRequests.some(r => r.staffId === staffId && r.dateStr === dateStr)) {
                  newLeaveRequests.push({ staffId, dateStr, isDesignated: false });
              }
              newAssignments = newAssignments.filter(a => !(a.staffId === staffId && a.dateStr === dateStr));
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                  const targetSiteId = staffMember.defaultSiteId;
                  const targetShift = staffMember.defaultShift;
                  const mobileStaff = prev.staff.filter(s => s.role === StaffRole.Mobile);
                  const days = getMonthDays(prev.year, prev.month);
                  const prevDateIdx = days.findIndex(d => d.dateStr === dateStr) - 1;
                  const prevDateStr = prevDateIdx >= 0 ? days[prevDateIdx].dateStr : undefined;
                  const availableMobile = mobileStaff.find(m => {
                      if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(targetSiteId)) return false;
                      const result = isStaffAvailable(m, dateStr, targetShift, newAssignments, newLeaveRequests, days, prevDateStr);
                      return result.available;
                  });
                  if (availableMobile) {
                      newAssignments.push({
                          dateStr,
                          siteId: targetSiteId,
                          shift: targetShift,
                          staffId: availableMobile.id
                      });
                  }
              }
          } else {
              newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === staffId && r.dateStr === dateStr));
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                   newAssignments = newAssignments.filter(a => !(
                       a.dateStr === dateStr && 
                       a.siteId === staffMember.defaultSiteId && 
                       a.shift === staffMember.defaultShift
                   ));
                   newAssignments.push({
                       dateStr,
                       siteId: staffMember.defaultSiteId!,
                       shift: staffMember.defaultShift!,
                       staffId: staffId
                   });
              }
          }
          return { ...prev, leaveRequests: newLeaveRequests, assignments: newAssignments };
      });
  };
  
  const handleClearSchedule = () => {
    setState(prev => ({
        ...prev,
        assignments: [],
        leaveRequests: prev.leaveRequests.filter(r => r.isDesignated)
    }));
  };

  const handleClearDesignated = () => {
    setState(prev => ({
        ...prev,
        leaveRequests: prev.leaveRequests.filter(r => !r.isDesignated)
    }));
  };

  const handleGenerate = async () => {
    setLoading(true);
    let draftAssignments: ScheduleAssignment[] = [];
    try {
      if (state.assignments.length > 0) {
          draftAssignments = [...state.assignments];
      } else {
          draftAssignments = await generateScheduleRuleBased(state);
      }
      if (process.env.API_KEY) {
          try {
            const optimizedAssignments = await optimizeScheduleWithAI(state, draftAssignments);
            if (Array.isArray(optimizedAssignments) && optimizedAssignments.length > 0) {
                draftAssignments = optimizedAssignments;
            }
          } catch (aiError) {
            console.warn("AI Optimization failed. Fallback to rule-based.", aiError);
          }
      }
      draftAssignments = fillEmptySlotsWithMobile(state, draftAssignments);
      const days = getMonthDays(state.year, state.month);
      const finalLeaveRequests = state.leaveRequests.filter(r => r.isDesignated);
      state.staff.forEach(staff => {
          if (staff.role === StaffRole.Regular && staff.defaultSiteId && staff.defaultShift) {
               days.forEach(day => {
                   if (finalLeaveRequests.some(r => r.staffId === staff.id && r.dateStr === day.dateStr)) return;
                   const amIWorking = draftAssignments.some(a => a.staffId === staff.id && a.dateStr === day.dateStr);
                   if (amIWorking) return;
                   const assignmentInMySlot = draftAssignments.find(a => 
                       a.siteId === staff.defaultSiteId && a.shift === staff.defaultShift && a.dateStr === day.dateStr
                   );
                   if (assignmentInMySlot && assignmentInMySlot.staffId) {
                       finalLeaveRequests.push({ staffId: staff.id, dateStr: day.dateStr, isDesignated: false });
                   }
               });
          }
      });
      setState(prev => ({ ...prev, assignments: draftAssignments, leaveRequests: finalLeaveRequests }));
    } catch (error) {
      alert("排班生成失敗: " + error);
    } finally {
      setLoading(false);
    }
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState(prev => ({ ...prev, year: parseInt(e.target.value), assignments: [] }));
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState(prev => ({ ...prev, month: parseInt(e.target.value), assignments: [] }));
  };

  const nextStep = () => { if (currentStep < 3) setCurrentStep(prev => (prev + 1) as 1 | 2 | 3); };
  const prevStep = () => { if (currentStep > 1) setCurrentStep(prev => (prev - 1) as 1 | 2 | 3); };

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
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 1 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-500 border-white'}`}>1</div>
              <span className={`text-[10px] font-bold ${currentStep >= 1 ? 'text-primary' : 'text-slate-400'}`}>人員與案場設定</span>
            </div>
            <div className={`relative z-10 flex flex-col items-center gap-1 cursor-pointer`} onClick={() => setCurrentStep(2)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 2 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-500 border-white'}`}>2</div>
              <span className={`text-[10px] font-bold ${currentStep >= 2 ? 'text-primary' : 'text-slate-400'}`}>指定休假設定</span>
            </div>
            <div className={`relative z-10 flex flex-col items-center gap-1 cursor-pointer`} onClick={() => setCurrentStep(3)}>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 3 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-500 border-white'}`}>3</div>
              <span className={`text-[10px] font-bold ${currentStep >= 3 ? 'text-primary' : 'text-slate-400'}`}>手動 / AI 排班</span>
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
                 <button onClick={nextStep} className="bg-primary text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg hover:bg-blue-800 transition flex items-center gap-2">下一步：指定休假設定 <ChevronRight className="w-5 h-5" /></button>
              </div>
            </div>
          )}
          {currentStep === 2 && (
            <div className="space-y-4">
              <LeaveManager state={state} setLeaveRequests={(leaveRequests) => setState(s => ({ ...s, leaveRequests }))} />
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <button onClick={prevStep} className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-base hover:bg-slate-300 transition flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> 上一步</button>
                <button onClick={nextStep} className="bg-primary text-white px-6 py-2 rounded-lg font-bold text-base shadow-lg hover:bg-blue-800 transition flex items-center gap-1">下一步：手動 / AI 排班 <ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
          {currentStep === 3 && (
            <div className="space-y-4">
              <ScheduleView state={state} loading={loading} onGenerate={handleGenerate} onClear={handleClearSchedule} onClearDesignated={handleClearDesignated} onUpdateAssignment={handleManualAssignment} onToggleLeave={handleToggleLeave} onMobileRelocation={handleMobileRelocation} apiKeySet={!!process.env.API_KEY} />
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
