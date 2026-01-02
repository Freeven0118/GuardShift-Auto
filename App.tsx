
import React, { useState, useEffect, useCallback } from 'react';
import { ScheduleState, Site, Staff, LeaveRequest, ScheduleAssignment, ShiftType, StaffRole, User } from './types';
import SiteManager from './components/SiteManager';
import MobileStaffManager from './components/MobileStaffManager';
import LeaveManager from './components/LeaveManager';
import ScheduleView from './components/ScheduleView';
import Login from './components/Login';
import { ShieldCheck, ChevronRight, ChevronLeft, LogOut } from 'lucide-react';
import { generateScheduleRuleBased, fillEmptySlotsWithMobile } from './services/ruleBasedScheduler';
import { optimizeScheduleWithAI } from './services/geminiService';

const INITIAL_YEAR = new Date().getFullYear();
const INITIAL_MONTH = new Date().getMonth();

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ScheduleState>({
    year: INITIAL_YEAR,
    month: INITIAL_MONTH,
    sites: [],
    staff: [],
    leaveRequests: [],
    assignments: []
  });

  const getStorageKey = (uid: string) => `guardShift_v1_${uid}`;

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    const saved = localStorage.getItem(getStorageKey(newUser.id));
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ ...prev, ...parsed, userId: newUser.id }));
      } catch (e) { console.error("Error loading user data", e); }
    } else {
        setState({
            year: INITIAL_YEAR,
            month: INITIAL_MONTH,
            sites: [],
            staff: [],
            leaveRequests: [],
            assignments: [],
            userId: newUser.id
        });
    }
  };

  const handleLogout = () => {
      if (confirm("確定要登出嗎？未存檔的變更將保留在本地。")) {
        setUser(null);
        setState({ year: INITIAL_YEAR, month: INITIAL_MONTH, sites: [], staff: [], leaveRequests: [], assignments: [] });
      }
  };

  useEffect(() => {
    if (user) {
      localStorage.setItem(getStorageKey(user.id), JSON.stringify({
        sites: state.sites,
        staff: state.staff,
        leaveRequests: state.leaveRequests,
        year: state.year,
        month: state.month
      }));
    }
  }, [state.sites, state.staff, state.leaveRequests, state.year, state.month, user]);

  const handleManualAssignment = (dateStr: string, siteId: string, shift: ShiftType, staffId: string | null) => {
    setState(prev => {
        let newAssignments = prev.assignments.filter(a => !(a.dateStr === dateStr && a.siteId === siteId && a.shift === shift));
        if (staffId) {
             newAssignments = newAssignments.filter(a => !(a.dateStr === dateStr && a.staffId === staffId));
             newAssignments.push({ dateStr, siteId, shift, staffId });
        }
        return { ...prev, assignments: newAssignments };
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
  
  const handleClearSchedule = () => setState(prev => ({ ...prev, assignments: [], leaveRequests: prev.leaveRequests.filter(r => r.isDesignated) }));
  const handleClearDesignated = () => setState(prev => ({ ...prev, leaveRequests: prev.leaveRequests.filter(r => !r.isDesignated) }));

  const handleGenerate = useCallback(async () => {
    if (state.sites.length === 0) {
        alert("請先新增至少一個案場。");
        setCurrentStep(1);
        return;
    }

    setLoading(true);
    try {
      // 1. 本地規則快速計算 (確保手機點擊後 100% 會有反應)
      let draftAssignments = await generateScheduleRuleBased(state);
      
      // 2. AI 加速優化
      const apiKey = process.env.API_KEY;
      if (apiKey) {
          try {
            const optimized = await optimizeScheduleWithAI(state, draftAssignments);
            if (optimized && optimized.length > 0) {
                draftAssignments = optimized;
            }
          } catch (e) {
            console.warn("AI 優化失敗，使用標準排班結果", e);
          }
      }

      // 3. 填充剩餘空位
      const finalAssignments = fillEmptySlotsWithMobile(state, draftAssignments);
      setState(prev => ({ ...prev, assignments: finalAssignments }));
    } catch (error) {
      console.error("Critical Error during schedule generation:", error);
      alert("排班失敗，請確認資料完整性。");
    } finally {
      // 延遲一點關閉，確保 UI 有感
      setTimeout(() => setLoading(false), 800);
    }
  }, [state]);

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-10 select-none">
      <header className="bg-[#0f172a] text-white sticky top-0 z-50 shadow-2xl">
        <div className="w-full px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
                <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tighter">GuardShift <span className="text-blue-400">Pro</span></h1>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white/10 py-1.5 px-3 rounded-full border border-white/10 mr-1">
                <img src={user.picture} className="w-6 h-6 rounded-full border border-white/20" alt={user.name} />
                <span className="text-xs font-bold hidden sm:block">{user.name}</span>
                <button onClick={handleLogout} className="hover:text-red-400 transition-colors ml-1 active:scale-90"><LogOut className="w-4 h-4" /></button>
            </div>
            <div className="flex bg-white/5 p-1 rounded-xl">
                <select value={state.month} onChange={(e) => setState(s => ({ ...s, month: parseInt(e.target.value) }))} className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer py-1 text-blue-400">
                    {Array.from({ length: 12 }, (_, i) => <option key={i} value={i} className="text-slate-900">{i + 1}月</option>)}
                </select>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full"></div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 transition-all duration-700 rounded-full" style={{ width: `${((currentStep - 1) / 2) * 100}%` }}></div>
            {[1, 2, 3].map(step => (
                <div key={step} className="relative z-10 flex flex-col items-center gap-2 cursor-pointer" onClick={() => setCurrentStep(step as any)}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm transition-all border-2 ${currentStep >= step ? 'bg-blue-600 text-white border-blue-200 shadow-lg scale-110' : 'bg-white text-slate-300 border-slate-100'}`}>{step}</div>
                    <span className={`text-[10px] font-black uppercase tracking-tighter ${currentStep >= step ? 'text-blue-600' : 'text-slate-300'}`}>
                        {step === 1 ? '案場設置' : step === 2 ? '休假指派' : '結果預覽'}
                    </span>
                </div>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 w-full px-4 py-6 max-w-7xl mx-auto">
        {currentStep === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="grid lg:grid-cols-2 gap-8">
                <SiteManager sites={state.sites} staff={state.staff} setSites={(sites) => setState(s => ({ ...s, sites }))} setStaff={(staff) => setState(s => ({ ...s, staff }))} />
                <MobileStaffManager staff={state.staff} sites={state.sites} setStaff={(staff) => setState(s => ({ ...s, staff }))} />
              </div>
              <div className="flex justify-end pt-6">
                 <button onClick={() => setCurrentStep(2)} className="w-full sm:w-auto bg-blue-600 text-white px-10 py-5 rounded-3xl font-black text-lg shadow-2xl shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95">下一步：指定休假 <ChevronRight className="w-6 h-6" /></button>
              </div>
            </div>
        )}
        {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <LeaveManager state={state} setLeaveRequests={(leaveRequests) => setState(s => ({ ...s, leaveRequests }))} />
              <div className="flex justify-between pt-4 gap-4">
                <button onClick={() => setCurrentStep(1)} className="bg-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-bold hover:bg-slate-300 transition flex items-center gap-2 active:scale-95"><ChevronLeft className="w-5 h-5" /> 上一步</button>
                <button onClick={() => setCurrentStep(3)} className="flex-1 sm:flex-none bg-blue-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition flex items-center justify-center gap-2 active:scale-95">下一步：查看結果 <ChevronRight className="w-6 h-6" /></button>
              </div>
            </div>
        )}
        {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <ScheduleView state={state} loading={loading} onGenerate={handleGenerate} onClear={handleClearSchedule} onClearDesignated={handleClearDesignated} onUpdateAssignment={handleManualAssignment} onToggleLeave={handleToggleLeave} onMobileRelocation={handleMobileRelocation} apiKeySet={true} />
              <div className="flex justify-start pt-4">
                <button onClick={() => setCurrentStep(2)} className="bg-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-bold hover:bg-slate-300 transition flex items-center gap-2 active:scale-95"><ChevronLeft className="w-5 h-5" /> 上一步</button>
              </div>
            </div>
        )}
      </main>
    </div>
  );
}

export default App;
