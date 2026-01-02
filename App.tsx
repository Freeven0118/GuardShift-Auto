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
const INITIAL_YEAR = 2026;
const INITIAL_MONTH = 0; // January

// Demo Data Configuration
const DEMO_SITES: Site[] = [
  { id: 'site-1', name: '拾光隱', requiredStaffPerShift: 1 },
  { id: 'site-2', name: 'A20', requiredStaffPerShift: 1 }
];

const DEMO_STAFF: Staff[] = [
  // Site 1: 拾光隱
  { id: 's1-d', name: '彭邦典', role: StaffRole.Regular, defaultSiteId: 'site-1', defaultShift: ShiftType.Day },
  { id: 's1-n', name: '保全A', role: StaffRole.Regular, defaultSiteId: 'site-1', defaultShift: ShiftType.Night },
  
  // Site 2: A20
  { id: 's2-d', name: '保全B', role: StaffRole.Regular, defaultSiteId: 'site-2', defaultShift: ShiftType.Day },
  { id: 's2-n', name: '保全C', role: StaffRole.Regular, defaultSiteId: 'site-2', defaultShift: ShiftType.Night },

  // Mobile
  { id: 'm1', name: '機動A', role: StaffRole.Mobile, allowedShifts: [ShiftType.Day], allowedSiteIds: [] },
  { id: 'm2', name: '機動B', role: StaffRole.Mobile, allowedShifts: [ShiftType.Night], allowedSiteIds: [] },
];

function App() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  
  // Initialize with Demo Data
  const [state, setState] = useState<ScheduleState>({
    year: INITIAL_YEAR,
    month: INITIAL_MONTH,
    sites: DEMO_SITES,
    staff: DEMO_STAFF,
    leaveRequests: [],
    assignments: []
  });

  const [loading, setLoading] = useState(false);

  // Storage Key - Changed to force reload of demo data for this request
  const STORAGE_KEY = 'guardShiftState_v6_strict_mobile';

  // Load from local storage with migration logic
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // MIGRATION LOGIC: Fix allowedShifts if it comes from old data (String -> Array)
        if (parsed.staff && Array.isArray(parsed.staff)) {
            parsed.staff = parsed.staff.map((s: any) => {
                if (s.role === 'Mobile') {
                    // Check if allowedShifts is a string (Old Format) or undefined
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
                        // If missing or null, default to Both
                        s.allowedShifts = [ShiftType.Day, ShiftType.Night];
                    }
                    
                    // Check if allowedSiteIds is undefined
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
    } else {
        // If no saved state, ensure we start with the DEMO data (already in useState initial value)
        // But we might want to save it immediately so it persists on reload
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
        // Remove assignment for THIS specific slot (site/shift/date)
        let newAssignments = prev.assignments.filter(a => 
            !(a.dateStr === dateStr && a.siteId === siteId && a.shift === shift)
        );
        
        if (staffId) {
             // If we are assigning someone, ALSO remove any other assignments for this person on this day
             // to prevent double booking in the data model.
             newAssignments = newAssignments.filter(a => !(a.dateStr === dateStr && a.staffId === staffId));
             
             newAssignments.push({ dateStr, siteId, shift, staffId });
        }
        return { ...prev, assignments: newAssignments };
    });
  };

  /**
   * ATOMIC OPERATION: Mobile Staff Relocation
   * Handles the complex bi-directional logic of moving a mobile staff:
   * 1. If moving FROM a site -> Restore the Regular staff there (Cancel Leave).
   * 2. If moving TO a site -> Set the Regular staff there to Leave.
   * 3. If setting to LEAVE -> Clear assignments, ensure nothing is blocked.
   */
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

          // 1. Identify where this Mobile Staff is CURRENTLY assigned on this day
          const currentAssignment = newAssignments.find(a => a.staffId === mobileStaffId && a.dateStr === dateStr);

          // 2. CLEANUP PHASE: Remove from current assignment & Restore Owner
          if (currentAssignment) {
              // Remove the assignment record
              newAssignments = newAssignments.filter(a => a !== currentAssignment);

              // FIND THE OWNER (Regular Staff) of the slot we just vacated
              const owner = prev.staff.find(s => 
                  s.role === StaffRole.Regular && 
                  s.defaultSiteId === currentAssignment.siteId && 
                  s.defaultShift === currentAssignment.shift
              );

              // RESTORE OWNER: If we leave, the owner should come back to work (Cancel Leave)
              // unless it was a designated (locked) leave.
              if (owner) {
                  const leaveReq = newLeaveRequests.find(r => r.staffId === owner.id && r.dateStr === dateStr);
                  if (leaveReq && !leaveReq.isDesignated) {
                      // It was an auto-leave or manual swap, so we restore the regular staff
                      newLeaveRequests = newLeaveRequests.filter(r => r !== leaveReq);
                  }
              }
          }

          // Also ensure the Mobile Staff is NOT on leave (unless the new action is LEAVE)
          // We clear any existing leave for the mobile staff first
          if (action !== 'LEAVE') {
             newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === mobileStaffId && r.dateStr === dateStr));
          }

          // 3. EXECUTION PHASE: Apply new state
          if (action === 'LEAVE') {
              // Add Leave Request for Mobile Staff
              if (!newLeaveRequests.some(r => r.staffId === mobileStaffId && r.dateStr === dateStr)) {
                  newLeaveRequests.push({ staffId: mobileStaffId, dateStr, isDesignated: false });
              }
          } else if (action === 'ASSIGN' && targetSiteId && targetShift) {
              // We are putting Mobile Staff into a specific slot.
              
              // A. Handle the TARGET Slot's Owner (Regular Staff)
              const targetOwner = prev.staff.find(s => 
                  s.role === StaffRole.Regular && 
                  s.defaultSiteId === targetSiteId && 
                  s.defaultShift === targetShift
              );

              if (targetOwner) {
                  // We MUST put the target owner on leave so the mobile staff can take over
                  if (!newLeaveRequests.some(r => r.staffId === targetOwner.id && r.dateStr === dateStr)) {
                      newLeaveRequests.push({ staffId: targetOwner.id, dateStr, isDesignated: false });
                  }
                  
                  // Also remove any existing assignment record for the target owner (just in case)
                  newAssignments = newAssignments.filter(a => !(a.staffId === targetOwner.id && a.dateStr === dateStr));
              }

              // B. Clear anyone else who might be in that target slot (Double check)
              newAssignments = newAssignments.filter(a => 
                  !(a.siteId === targetSiteId && a.shift === targetShift && a.dateStr === dateStr)
              );

              // C. Assign the Mobile Staff
              newAssignments.push({
                  dateStr,
                  siteId: targetSiteId,
                  shift: targetShift,
                  staffId: mobileStaffId
              });
          }
          // If action is 'EMPTY', we just did the cleanup in Step 2 and stopped.

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
              // --- ACTION: SET LEAVE (MANUAL RED) ---

              // 1. Add Leave Request (Manual = isDesignated: false)
              // Only add if not already there
              if (!newLeaveRequests.some(r => r.staffId === staffId && r.dateStr === dateStr)) {
                  newLeaveRequests.push({ staffId, dateStr, isDesignated: false });
              }
              
              // 2. Remove any working assignment for this staff on this day
              // This creates the gap we want to fill
              newAssignments = newAssignments.filter(a => !(a.staffId === staffId && a.dateStr === dateStr));

              // 3. AUTO-REPLACE LOGIC (Improved with Strict Rules)
              // If this was a Regular staff with a default slot, try to find a Mobile replacement using logic
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                  const targetSiteId = staffMember.defaultSiteId;
                  const targetShift = staffMember.defaultShift;
                  const mobileStaff = prev.staff.filter(s => s.role === StaffRole.Mobile);
                  
                  // Need Days info for constraints checks
                  const days = getMonthDays(prev.year, prev.month);
                  const prevDateIdx = days.findIndex(d => d.dateStr === dateStr) - 1;
                  const prevDateStr = prevDateIdx >= 0 ? days[prevDateIdx].dateStr : undefined;

                  // Find available mobile staff using the STRICT rule engine
                  // IMPORTANT: Pass the *updated* assignments list so we don't think the slot is still full
                  const availableMobile = mobileStaff.find(m => {
                      // Check Site Permission first
                      if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(targetSiteId)) return false;

                      // Check complex constraints
                      const result = isStaffAvailable(
                          m, 
                          dateStr, 
                          targetShift, 
                          newAssignments, // Use updated list
                          newLeaveRequests, 
                          days, 
                          prevDateStr
                      );
                      
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
              // --- ACTION: CANCEL LEAVE (RESTORE WORK) ---

              // 1. Remove Leave Request
              newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === staffId && r.dateStr === dateStr));
              
              // 2. Restore Default Assignment if Regular Staff
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                   // FORCE Restore:
                   // Remove ANYONE currently assigned to this slot (Kick out mobile or anyone else)
                   // This is the "Bidirectional" link: Regular comes back -> Mobile gets kicked out.
                   newAssignments = newAssignments.filter(a => !(
                       a.dateStr === dateStr && 
                       a.siteId === staffMember.defaultSiteId && 
                       a.shift === staffMember.defaultShift
                   ));
                   
                   // Add Regular Staff back
                   newAssignments.push({
                       dateStr,
                       siteId: staffMember.defaultSiteId!,
                       shift: staffMember.defaultShift!,
                       staffId: staffId
                   });
              }
          }

          return {
              ...prev,
              leaveRequests: newLeaveRequests,
              assignments: newAssignments
          };
      });
  };
  
  const handleClearSchedule = () => {
    // Direct Action: Clear assignments and remove NON-designated leave requests
    setState(prev => ({
        ...prev,
        assignments: [],
        leaveRequests: prev.leaveRequests.filter(r => r.isDesignated)
    }));
  };

  const handleClearDesignated = () => {
    // Direct Action: Clear ONLY designated leave requests
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
          console.log("Using existing assignments as draft for AI...");
          draftAssignments = [...state.assignments];
      } else {
          console.log("Generating fresh draft schedule...");
          draftAssignments = await generateScheduleRuleBased(state);
      }
      
      console.log("Optimizing with AI...");
      if (process.env.API_KEY) {
          try {
            const optimizedAssignments = await optimizeScheduleWithAI(state, draftAssignments);
            if (Array.isArray(optimizedAssignments) && optimizedAssignments.length > 0) {
                draftAssignments = optimizedAssignments;
                console.log("AI Optimization successful");
            }
          } catch (aiError) {
            console.warn("AI Optimization failed or timed out. Keeping current draft.", aiError);
          }
      } else {
          console.warn("No API Key found. Skipping AI optimization.");
          if (draftAssignments.length === 0) {
              draftAssignments = await generateScheduleRuleBased(state);
          }
      }

      // --- CRITICAL STEP: FINAL GAP FILL ---
      console.log("Running final gap check with Mobile staff...");
      draftAssignments = fillEmptySlotsWithMobile(state, draftAssignments);

      // --- SYNC PROCESS: Sync Leaves with Assignments ---
      // Goal: 
      // 1. If a Regular staff is replaced by Mobile (slot filled), mark Regular as Leave.
      // 2. If a Regular staff slot is EMPTY (unfilled), do NOT mark as Leave (keep as blank/shortage).
      
      const days = getMonthDays(state.year, state.month);
      
      // Start with only the Designated Leaves (User locked)
      // This resets all auto-generated leaves, ensuring that empty slots become blank (not red)
      const finalLeaveRequests = state.leaveRequests.filter(r => r.isDesignated);

      state.staff.forEach(staff => {
          if (staff.role === StaffRole.Regular && staff.defaultSiteId && staff.defaultShift) {
               days.forEach(day => {
                   // Skip if already designated
                   if (finalLeaveRequests.some(r => r.staffId === staff.id && r.dateStr === day.dateStr)) return;

                   // Check if the Regular Staff is working ANYWHERE on this day
                   const amIWorking = draftAssignments.some(a => a.staffId === staff.id && a.dateStr === day.dateStr);

                   if (amIWorking) {
                       // I am working. No leave needed.
                       return;
                   }

                   // I am NOT working. Check my default slot status.
                   const assignmentInMySlot = draftAssignments.find(a => 
                       a.siteId === staff.defaultSiteId && 
                       a.shift === staff.defaultShift && 
                       a.dateStr === day.dateStr
                   );

                   // Check if someone is ACTUALLY assigned (staffId is not null/undefined)
                   if (assignmentInMySlot && assignmentInMySlot.staffId) {
                       // Slot is FILLED by someone else (e.g. Mobile).
                       // Since I am not working, I must be on Leave.
                       finalLeaveRequests.push({
                           staffId: staff.id,
                           dateStr: day.dateStr,
                           isDesignated: false // Auto-generated
                       });
                   } else {
                       // Slot is EMPTY (or staffId is null).
                       // I am not working, and no one replaced me.
                       // This is a SHORTAGE.
                       // Do NOT add leave request. 
                       // Result: ScheduleView shows as "Blank" (Plus icon), not "Leave" (Red).
                   }
               });
          }
      });

      setState(prev => ({ 
          ...prev, 
          assignments: draftAssignments,
          leaveRequests: finalLeaveRequests
      }));

    } catch (error) {
      alert("排班生成失敗，請檢查系統或稍後再試。\n\n" + error);
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

  const nextStep = () => {
    if (currentStep < 3) {
        const next = (currentStep + 1) as 1 | 2 | 3;
        setCurrentStep(next);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => (prev - 1) as 1 | 2 | 3);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-10">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="w-full px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight hidden md:block">GuardShift <span className="text-primary">Auto</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <select 
              value={state.year} 
              onChange={handleYearChange}
              className="bg-slate-100 border-none rounded-lg py-1 px-2 text-sm font-medium focus:ring-2 focus:ring-primary cursor-pointer hover:bg-slate-200 transition"
            >
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={INITIAL_YEAR + i}>{INITIAL_YEAR + i}年</option>
              ))}
            </select>
            <select 
              value={state.month} 
              onChange={handleMonthChange}
              className="bg-slate-100 border-none rounded-lg py-1 px-2 text-sm font-medium focus:ring-2 focus:ring-primary cursor-pointer hover:bg-slate-200 transition"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>{i + 1}月</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="bg-white border-b border-slate-200 py-2 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between relative">
            {/* Connecting Line */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-100 -z-0"></div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all duration-500 -z-0" style={{ width: `${((currentStep - 1) / 2) * 100}%` }}></div>

            {/* Step 1 */}
            <div className={`relative z-10 flex flex-col items-center gap-1 cursor-pointer`} onClick={() => setCurrentStep(1)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 1 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-500 border-white'}`}>
                1
              </div>
              <span className={`text-[10px] font-bold ${currentStep >= 1 ? 'text-primary' : 'text-slate-400'}`}>人員與案場設定</span>
            </div>

            {/* Step 2 */}
            <div className={`relative z-10 flex flex-col items-center gap-1 cursor-pointer`} onClick={() => setCurrentStep(2)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 2 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-500 border-white'}`}>
                2
              </div>
              <span className={`text-[10px] font-bold ${currentStep >= 2 ? 'text-primary' : 'text-slate-400'}`}>指定休假設定</span>
            </div>

            {/* Step 3 */}
            <div className={`relative z-10 flex flex-col items-center gap-1 cursor-pointer`} onClick={() => setCurrentStep(3)}>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-2 ${currentStep >= 3 ? 'bg-primary text-white border-white shadow-md' : 'bg-slate-200 text-slate-500 border-white'}`}>
                3
              </div>
              <span className={`text-[10px] font-bold ${currentStep >= 3 ? 'text-primary' : 'text-slate-400'}`}>手動 / AI 排班</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <main className="flex-1 w-full px-1 md:px-4 py-4">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {currentStep === 1 && (
            <div className="space-y-6">
               <div className="grid lg:grid-cols-2 gap-6">
                <SiteManager 
                  sites={state.sites} 
                  staff={state.staff} 
                  setSites={(sites) => setState(s => ({ ...s, sites }))}
                  setStaff={(staff) => setState(s => ({ ...s, staff }))}
                />
                <MobileStaffManager 
                  staff={state.staff}
                  sites={state.sites}
                  setStaff={(staff) => setState(s => ({ ...s, staff }))}
                />
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-200">
                 <button 
                  onClick={nextStep}
                  className="bg-primary text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg hover:bg-blue-800 transition flex items-center gap-2"
                >
                  下一步：指定休假設定 <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <LeaveManager 
                state={state}
                setLeaveRequests={(leaveRequests) => setState(s => ({ ...s, leaveRequests }))}
              />
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <button 
                  onClick={prevStep}
                  className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-base hover:bg-slate-300 transition flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> 上一步
                </button>
                <button 
                  onClick={nextStep}
                  className="bg-primary text-white px-6 py-2 rounded-lg font-bold text-base shadow-lg hover:bg-blue-800 transition flex items-center gap-1"
                >
                  下一步：手動 / AI 排班 <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <ScheduleView 
                state={state}
                loading={loading}
                onGenerate={handleGenerate}
                onClear={handleClearSchedule}
                onClearDesignated={handleClearDesignated}
                onUpdateAssignment={handleManualAssignment}
                onToggleLeave={handleToggleLeave}
                onMobileRelocation={handleMobileRelocation}
                apiKeySet={true}
              />
              <div className="flex justify-start pt-2 border-t border-slate-200">
                <button 
                  onClick={prevStep}
                  className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-base hover:bg-slate-300 transition flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> 上一步
                </button>
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