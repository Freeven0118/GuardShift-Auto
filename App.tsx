
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScheduleState, Site, Staff, LeaveRequest, ScheduleAssignment, ShiftType, StaffRole, User } from './types';
import SiteManager from './components/SiteManager';
import MobileStaffManager from './components/MobileStaffManager';
import LeaveManager from './components/LeaveManager';
import ScheduleView from './components/ScheduleView';
import Login from './components/Login';
import { ShieldCheck, ChevronRight, ChevronLeft, LogOut, CheckCircle2, Save, Check, Download, Copy, FileText, ImageIcon } from 'lucide-react';
import { generateScheduleRuleBased, fillEmptySlotsWithMobile, deduplicateAssignments } from './services/ruleBasedScheduler';
import { optimizeScheduleWithAI } from './services/geminiService';
import html2canvas from 'html2canvas';
import { getMonthDays, getChineseDayOfWeek } from './utils/dateUtils';

const INITIAL_YEAR = new Date().getFullYear();
const INITIAL_MONTH = new Date().getMonth();

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [state, setState] = useState<ScheduleState>({
    year: INITIAL_YEAR,
    month: INITIAL_MONTH,
    sites: [],
    staff: [],
    leaveRequests: [],
    assignments: []
  });

  const exportRef = useRef<HTMLDivElement>(null);
  const getStorageKey = (uid: string) => `guardShift_v3_${uid}`;

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    const saved = localStorage.getItem(getStorageKey(newUser.id));
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ 
            ...prev, 
            ...parsed, 
            assignments: parsed.assignments || [], 
            userId: newUser.id 
        }));
      } catch (e) { console.error("Error loading user data", e); }
    } else {
        const s1_p1 = 'post-1-day';
        const s1_p2 = 'post-1-night';
        const s2_p1 = 'post-2-day';
        const s2_p2 = 'post-2-night';

        const seedSites: Site[] = [
            { 
                id: 'site-1', 
                name: '帝寶豪宅', 
                requiredStaffPerShift: 1,
                posts: [
                    { id: s1_p1, name: '大門哨 (早)', shift: ShiftType.Day },
                    { id: s1_p2, name: '大門哨 (晚)', shift: ShiftType.Night }
                ]
            },
            { 
                id: 'site-2', 
                name: '信義之星', 
                requiredStaffPerShift: 1,
                posts: [
                    { id: s2_p1, name: '正班 (早)', shift: ShiftType.Day },
                    { id: s2_p2, name: '正班 (晚)', shift: ShiftType.Night }
                ]
            }
        ];
        const seedStaff: Staff[] = [
            { id: 'staff-1', name: '張志明', role: StaffRole.Regular, defaultSiteId: 'site-1', defaultShift: ShiftType.Day, defaultPostId: s1_p1 },
            { id: 'staff-2', name: '陳春嬌', role: StaffRole.Regular, defaultSiteId: 'site-1', defaultShift: ShiftType.Night, defaultPostId: s1_p2 },
            { id: 'staff-3', name: '王建國', role: StaffRole.Regular, defaultSiteId: 'site-2', defaultShift: ShiftType.Day, defaultPostId: s2_p1 },
            { id: 'staff-4', name: '林雅婷', role: StaffRole.Regular, defaultSiteId: 'site-2', defaultShift: ShiftType.Night, defaultPostId: s2_p2 },
            { id: 'mobile-1', name: '機動阿傑', role: StaffRole.Mobile, allowedShifts: [ShiftType.Day, ShiftType.Night], allowedSiteIds: [] },
            { id: 'mobile-2', name: '機動小強', role: StaffRole.Mobile, allowedShifts: [ShiftType.Day, ShiftType.Night], allowedSiteIds: [] }
        ];

        setState({
            year: INITIAL_YEAR,
            month: INITIAL_MONTH,
            sites: seedSites,
            staff: seedStaff,
            leaveRequests: [],
            assignments: [],
            userId: newUser.id
        });
    }
  };

  const handleLogout = () => {
      if (confirm("確定要登出嗎？資料皆已保留在這台電腦上。")) {
        setUser(null);
        setState({ year: INITIAL_YEAR, month: INITIAL_MONTH, sites: [], staff: [], leaveRequests: [], assignments: [] });
      }
  };

  useEffect(() => {
    if (user) {
      setSaveStatus('saving');
      const dataToSave = {
        sites: state.sites,
        staff: state.staff,
        leaveRequests: state.leaveRequests,
        year: state.year,
        month: state.month,
        assignments: state.assignments 
      };
      localStorage.setItem(getStorageKey(user.id), JSON.stringify(dataToSave));
      const timer = setTimeout(() => { setSaveStatus('saved'); }, 600);
      return () => clearTimeout(timer);
    }
  }, [state.sites, state.staff, state.leaveRequests, state.year, state.month, state.assignments, user]);

  const handleManualAssignment = (dateStr: string, siteId: string, shift: ShiftType, staffId: string | null) => {
    setState(prev => {
        let newAssignments = prev.assignments.filter(a => !(a.dateStr === dateStr && a.siteId === siteId && a.shift === shift));
        let newLeaveRequests = [...prev.leaveRequests];
        if (staffId) {
             const owners = prev.staff.filter(s => s.role === StaffRole.Regular && s.defaultSiteId === siteId && s.defaultShift === shift);
             const owner = owners.find(s => s.id === staffId);
             if (owner) { newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === owner.id && r.dateStr === dateStr)); }
             newAssignments = newAssignments.filter(a => !(a.dateStr === dateStr && a.staffId === staffId));
             newAssignments.push({ dateStr, siteId, shift, staffId });
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
              if (!newLeaveRequests.some(r => r.staffId === staffId && r.dateStr === dateStr)) {
                  newLeaveRequests.push({ staffId, dateStr, isDesignated: false });
              }
              newAssignments = newAssignments.filter(a => !(a.staffId === staffId && a.dateStr === dateStr));
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                  const targetSiteId = staffMember.defaultSiteId;
                  const targetShift = staffMember.defaultShift;
                  const candidate = prev.staff.find(m => {
                      if (m.role !== StaffRole.Mobile) return false;
                      if (newLeaveRequests.some(r => r.staffId === m.id && r.dateStr === dateStr)) return false;
                      if (newAssignments.some(a => a.staffId === m.id && a.dateStr === dateStr)) return false;
                      if (m.allowedShifts && m.allowedShifts.length > 0 && !m.allowedShifts.includes(targetShift)) return false;
                      if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(targetSiteId)) return false;
                      return true;
                  });
                  if (candidate) { newAssignments.push({ dateStr, siteId: targetSiteId, shift: targetShift, staffId: candidate.id }); }
              }
          } else {
              newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === staffId && r.dateStr === dateStr));
              if (staffMember && staffMember.role === StaffRole.Regular && staffMember.defaultSiteId && staffMember.defaultShift) {
                   newAssignments = newAssignments.filter(a => !(a.dateStr === dateStr && a.siteId === staffMember.defaultSiteId && a.shift === staffMember.defaultShift && a.staffId !== staffId));
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
        const previousMobileAssignment = prev.assignments.find(a => a.staffId === mobileStaffId && a.dateStr === dateStr);
        newAssignments = newAssignments.filter(a => !(a.staffId === mobileStaffId && a.dateStr === dateStr));
        newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === mobileStaffId && r.dateStr === dateStr));

        if (previousMobileAssignment && action !== 'EMPTY') {
            const { siteId: oldSiteId, shift: oldShift } = previousMobileAssignment;
            const regularOwners = prev.staff.filter(s => s.role === StaffRole.Regular && s.defaultSiteId === oldSiteId && s.defaultShift === oldShift);
            regularOwners.forEach(owner => {
                const isDesignated = prev.leaveRequests.some(r => r.staffId === owner.id && r.dateStr === dateStr && r.isDesignated);
                if (!isDesignated) {
                    newLeaveRequests = newLeaveRequests.filter(r => !(r.staffId === owner.id && r.dateStr === dateStr));
                    const isBackAtWork = newAssignments.some(a => a.staffId === owner.id && a.dateStr === dateStr);
                    if (!isBackAtWork) { newAssignments.push({ dateStr: dateStr, siteId: oldSiteId, shift: oldShift, staffId: owner.id }); }
                }
            });
        }
        if (action === 'ASSIGN' && targetSiteId && targetShift) {
             const targetOwners = prev.staff.filter(s => s.role === StaffRole.Regular && s.defaultSiteId === targetSiteId && s.defaultShift === targetShift);
            targetOwners.forEach(owner => {
                const alreadyOnLeave = newLeaveRequests.some(r => r.staffId === owner.id && r.dateStr === dateStr);
                if (!alreadyOnLeave) { newLeaveRequests.push({ staffId: owner.id, dateStr, isDesignated: false }); }
                newAssignments = newAssignments.filter(a => !(a.staffId === owner.id && a.dateStr === dateStr));
            });
            newAssignments = newAssignments.filter(a => !(a.siteId === targetSiteId && a.shift === targetShift && a.dateStr === dateStr));
            newAssignments.push({ dateStr, siteId: targetSiteId, shift: targetShift, staffId: mobileStaffId });
        } else if (action === 'LEAVE') {
            newLeaveRequests.push({ staffId: mobileStaffId, dateStr, isDesignated: false });
        }
        return { ...prev, assignments: newAssignments, leaveRequests: newLeaveRequests };
    });
  };
  
  const handleClearSchedule = () => setState(prev => ({ ...prev, assignments: [], leaveRequests: prev.leaveRequests.filter(r => r.isDesignated) }));
  const handleClearDesignated = () => setState(prev => ({ ...prev, leaveRequests: prev.leaveRequests.filter(r => !r.isDesignated) }));

  const handleGenerate = useCallback(async () => {
    if (state.sites.length === 0) { alert("請先新增至少一個案場。"); setCurrentStep(1); return; }
    setLoading(true);
    try {
      const { assignments: draftAssignments, generatedLeaves } = await generateScheduleRuleBased(state);
      let currentAssignments = draftAssignments;
      const stateWithGenLeaves = { ...state, leaveRequests: generatedLeaves };
      const apiKey = process.env.API_KEY;
      if (apiKey) {
          try {
            const optimized = await optimizeScheduleWithAI(stateWithGenLeaves, currentAssignments);
            if (optimized && optimized.length > 0) { currentAssignments = optimized; }
          } catch (e) { console.warn("AI 優化失敗", e); }
      }
      const filledAssignments = fillEmptySlotsWithMobile(stateWithGenLeaves, currentAssignments);
      const finalAssignments = deduplicateAssignments(filledAssignments, state.staff);
      const syncedLeaveRequests = [...generatedLeaves];
      finalAssignments.forEach(asm => {
          const owner = state.staff.find(s => s.role === StaffRole.Regular && s.defaultSiteId === asm.siteId && s.defaultShift === asm.shift);
          if (owner && owner.id !== asm.staffId) {
              const exists = syncedLeaveRequests.some(r => r.staffId === owner.id && r.dateStr === asm.dateStr);
              if (!exists) { syncedLeaveRequests.push({ staffId: owner.id, dateStr: asm.dateStr, isDesignated: false }); }
          }
      });
      setState(prev => ({ ...prev, assignments: finalAssignments, leaveRequests: syncedLeaveRequests }));
    } catch (error) { console.error("Error", error); alert("排班失敗"); } 
    finally { setTimeout(() => setLoading(false), 800); }
  }, [state]);

  const handleDownloadImage = async () => {
      const element = exportRef.current;
      if (!element) return;
      try {
          const canvas = await html2canvas(element, { scale: 3, backgroundColor: '#ffffff', logging: false, useCORS: true, scrollX: 0, scrollY: 0, width: element.offsetWidth, height: element.offsetHeight });
          const link = document.createElement('a');
          link.download = `排班表_${state.year}_${state.month + 1}月.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
      } catch (e) { alert("圖片輸出失敗，請重試"); }
  };

  const handleCopyText = () => {
      const days = getMonthDays(state.year, state.month);
      let text = `【${state.year}年 ${state.month + 1}月 保全排班表】\n\n`;
      state.sites.forEach(site => {
          text += `📍 [${site.name}]\n------------------------\n`;
          days.forEach(day => {
              const dayAssignments = state.assignments.filter(a => a.dateStr === day.dateStr && a.siteId === site.id);
              if (dayAssignments.length > 0) {
                  const dayStr = `${day.date.getDate()}(${getChineseDayOfWeek(day.dayOfWeek)})`;
                  const staffNames = dayAssignments.map(a => {
                      const staff = state.staff.find(s => s.id === a.staffId);
                      const shiftName = a.shift === ShiftType.Day ? '早' : '晚';
                      return `${shiftName}:${staff?.name || '缺'}`;
                  }).join(' / ');
                  text += `${dayStr} ➜ ${staffNames}\n`;
              }
          });
          text += `\n`;
      });
      navigator.clipboard.writeText(text).then(() => { alert("班表文字已複製！可直接貼上 Line 群組。"); });
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-10 select-none">
      <header className="bg-[#0f172a] text-white sticky top-0 z-50 shadow-2xl">
        <div className="w-full px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
                <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tighter">保全排班王</h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-500 ${saveStatus === 'saving' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
                {saveStatus === 'saving' ? <Save className="w-3.5 h-3.5 animate-pulse" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{saveStatus === 'saving' ? '儲存中...' : '資料已同步'}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 py-1.5 px-3 rounded-full border border-white/10">
                <img src={user.picture} className="w-6 h-6 rounded-full border border-white/20" alt={user.name} />
                <span className="text-xs font-bold hidden sm:block truncate max-w-[80px]">{user.name}</span>
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

      <div style={{ position: 'absolute', top: 0, left: '-20000px', width: 'max-content', visibility: 'visible', zIndex: -100 }}>
        <div ref={exportRef} className="p-10 bg-white">
            <div className="mb-6">
                <h1 className="text-3xl font-black text-slate-800">保全排班表</h1>
                <p className="text-slate-500 font-bold mt-2">{state.year}年 {state.month + 1}月</p>
            </div>
            <ScheduleView state={state} loading={false} onGenerate={() => {}} onClear={() => {}} onClearDesignated={() => {}} onUpdateAssignment={() => {}} onToggleLeave={() => {}} onMobileRelocation={() => {}} apiKeySet={true} readOnly={true} isExporting={true} />
            <div className="mt-4 flex gap-4 text-sm text-slate-400"><span>保全排班王 自動排班系統</span></div>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full"></div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 transition-all duration-700 rounded-full" style={{ width: `${((currentStep - 1) / 3) * 100}%` }}></div>
            {[1, 2, 3, 4].map(step => (
                <div key={step} className="relative z-10 flex flex-col items-center gap-2 cursor-pointer" onClick={() => setCurrentStep(step as any)}>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm transition-all border-2 ${currentStep >= step ? 'bg-blue-600 text-white border-blue-200 shadow-lg scale-110' : 'bg-white text-slate-300 border-slate-100'}`}>{step}</div>
                    <span className={`text-[10px] font-black uppercase tracking-tighter ${currentStep >= step ? 'text-blue-600' : 'text-slate-300'}`}>
                        {step === 1 ? '案場設置' : step === 2 ? '指定休假' : step === 3 ? '排班作業' : '確認班表'}
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
                <SiteManager sites={state.sites} staff={state.staff} onStateChange={(updates) => setState(s => ({ ...s, ...updates }))} setSites={(sites) => setState(s => ({ ...s, sites }))} setStaff={(staff) => setState(s => ({ ...s, staff }))} />
                <MobileStaffManager staff={state.staff} sites={state.sites} setStaff={(staff) => setState(s => ({ ...s, staff }))} />
              </div>
              <div className="flex justify-end pt-6">
                 <button onClick={() => setCurrentStep(2)} className="w-full sm:w-auto bg-blue-600 text-white px-10 py-5 rounded-3xl font-black text-lg shadow-2xl shadow-blue-600/20 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-3 active:scale-95">下一步：指定休假 <ChevronRight className="w-6 h-6" /></button>
              </div>
            </div>
        )}
        {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <LeaveManager state={state} setLeaveRequests={(leaveRequests) => setState(s => ({ ...s, leaveRequests }))} />
              <div className="flex justify-between pt-4 gap-4">
                <button onClick={() => setCurrentStep(1)} className="bg-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-bold hover:bg-slate-300 transition-all duration-200 active:scale-95 flex items-center gap-2"><ChevronLeft className="w-5 h-5" /> 上一步</button>
                <button onClick={() => setCurrentStep(3)} className="flex-1 sm:flex-none bg-blue-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 active:scale-95">下一步：排班作業 <ChevronRight className="w-6 h-6" /></button>
              </div>
            </div>
        )}
        {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <ScheduleView state={state} loading={loading} onGenerate={handleGenerate} onClear={handleClearSchedule} onClearDesignated={handleClearDesignated} onUpdateAssignment={handleManualAssignment} onToggleLeave={handleToggleLeave} onMobileRelocation={handleMobileRelocation} apiKeySet={true} />
              <div className="flex justify-between pt-4 gap-4">
                <button onClick={() => setCurrentStep(2)} className="bg-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-bold hover:bg-slate-300 transition-all duration-200 active:scale-95 flex items-center gap-2"><ChevronLeft className="w-5 h-5" /> 上一步</button>
                <button onClick={() => setCurrentStep(4)} className="flex-1 sm:flex-none bg-green-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2 active:scale-95">下一步：確認班表 <CheckCircle2 className="w-6 h-6" /></button>
              </div>
            </div>
        )}
        {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-green-800 font-bold px-4 py-2 bg-green-50 rounded-lg"><CheckCircle2 className="w-5 h-5" /> <span>最終班表 (Read Only)</span></div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleCopyText} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all active:scale-95 border border-slate-200"><Copy className="w-4 h-4" /> <span className="hidden sm:inline">複製文字公告</span></button>
                        <button onClick={handleDownloadImage} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:shadow-xl transition-all active:scale-95"><ImageIcon className="w-4 h-4" /> <span>下載班表圖片</span></button>
                    </div>
                </div>
                <div className="p-2 bg-white rounded-xl">
                    <ScheduleView state={state} loading={false} onGenerate={() => {}} onClear={() => {}} onClearDesignated={() => {}} onUpdateAssignment={() => {}} onToggleLeave={() => {}} onMobileRelocation={() => {}} apiKeySet={true} readOnly={true} />
                </div>
                <div className="flex justify-start pt-4"><button onClick={() => setCurrentStep(3)} className="bg-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-bold hover:bg-slate-300 transition-all duration-200 active:scale-95 flex items-center gap-2"><ChevronLeft className="w-5 h-5" /> 返回修改</button></div>
            </div>
        )}
      </main>
    </div>
  );
}

export default App;
