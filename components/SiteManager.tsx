
import React, { useState, useEffect, useMemo } from 'react';
import { Site, Staff, StaffRole, ShiftType, SitePost } from '../types';
import { Plus, Trash2, Building, Sun, Moon, Check, Pencil, X, Search, ChevronRight, Shield, Save, AlertTriangle, MapPin } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Add missing SiteManagerProps interface definition
interface SiteManagerProps {
  sites: Site[];
  staff: Staff[];
  onStateChange: (updates: { sites?: Site[]; staff?: Staff[] }) => void;
  setSites: (sites: Site[]) => void;
  setStaff: (staff: Staff[]) => void;
}

const PostRow: React.FC<{
  post: SitePost;
  assignedStaff?: Staff;
  onUpdatePostName: (id: string, name: string) => void;
  onUpdateStaffName: (postId: string, name: string) => void;
  onDeletePost: (id: string) => void;
}> = ({ post, assignedStaff, onUpdatePostName, onUpdateStaffName, onDeletePost }) => {
  const [localPostName, setLocalPostName] = useState(post.name);
  const [localStaffName, setLocalStaffName] = useState(assignedStaff?.name || '');
  const isDay = post.shift === ShiftType.Day;

  useEffect(() => { setLocalPostName(post.name); }, [post.name]);
  useEffect(() => { setLocalStaffName(assignedStaff?.name || ''); }, [assignedStaff]);

  const hasChanges = localPostName !== post.name || localStaffName !== (assignedStaff?.name || '');
  const style = isDay ? { bg: 'bg-yellow-50', border: 'border-yellow-200', iconBg: 'bg-yellow-400', iconColor: 'text-yellow-900', label: 'text-yellow-700', staffBg: 'bg-yellow-100/50' } : { bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-400', iconColor: 'text-blue-900', label: 'text-blue-700', staffBg: 'bg-blue-100/50' };

  const handleSave = () => {
    if (localPostName !== post.name) onUpdatePostName(post.id, localPostName);
    if (localStaffName !== (assignedStaff?.name || '')) onUpdateStaffName(post.id, localStaffName);
  };

  return (
    <div className={`p-4 lg:p-5 rounded-2xl border-2 mb-4 transition-all ${style.bg} ${style.border} shadow-sm`}>
        <div className="flex flex-col xl:flex-row gap-5 items-start xl:items-center">
            <div className="flex items-center gap-4 w-full xl:w-auto xl:min-w-[240px]">
                <div className={`p-3 rounded-xl shrink-0 shadow-sm ${style.iconBg} ${style.iconColor}`}>{isDay ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}</div>
                <div className="flex-1">
                    <label className={`text-[10px] font-black uppercase mb-1 block ${style.label}`}>崗位</label>
                    <input type="text" value={localPostName} onChange={(e) => setLocalPostName(e.target.value)} className="w-full font-bold text-xl text-slate-800 bg-transparent border-b-2 border-transparent focus:border-slate-400 focus:outline-none" />
                </div>
            </div>
            <div className="w-full xl:flex-1">
                 <label className={`text-[10px] font-black uppercase mb-1 block ${style.label}`}>固定人員</label>
                 <div className={`flex items-center rounded-xl px-3 py-2 border border-transparent focus-within:bg-white focus-within:border-slate-200 transition-all ${style.staffBg}`}>
                    <input type="text" value={localStaffName} onChange={(e) => setLocalStaffName(e.target.value)} className="w-full font-bold text-lg text-slate-800 bg-transparent focus:outline-none" placeholder="輸入姓名..." />
                 </div>
            </div>
            <div className="flex items-center gap-2 w-full xl:w-auto">
                 <button onClick={handleSave} disabled={!hasChanges} className={`flex-1 xl:flex-none px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${!hasChanges ? 'bg-slate-200 text-slate-400' : 'bg-green-600 text-white active:scale-95'}`}>{!hasChanges ? '已確認' : '確認'}</button>
                 <button onClick={() => onDeletePost(post.id)} className="p-3 bg-white border border-red-200 text-red-600 rounded-xl active:scale-95"><Trash2 className="w-5 h-5" /></button>
            </div>
        </div>
    </div>
  );
};

const SiteManager: React.FC<SiteManagerProps> = ({ sites, staff, onStateChange, setSites, setStaff }) => {
  const [newSiteName, setNewSiteName] = useState('');
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleAddSite = () => {
    if (!newSiteName.trim()) return;
    const newSiteId = uuidv4();
    const dayPostId = uuidv4();
    const nightPostId = uuidv4();
    const newSite: Site = { id: newSiteId, name: newSiteName, requiredStaffPerShift: 1, posts: [{ id: dayPostId, name: '正班 (早)', shift: ShiftType.Day }, { id: nightPostId, name: '正班 (晚)', shift: ShiftType.Night }] };
    onStateChange({ sites: [...sites, newSite], staff: [...staff, { id: uuidv4(), name: '', role: StaffRole.Regular, defaultSiteId: newSiteId, defaultShift: ShiftType.Day, defaultPostId: dayPostId }, { id: uuidv4(), name: '', role: StaffRole.Regular, defaultSiteId: newSiteId, defaultShift: ShiftType.Night, defaultPostId: nightPostId }] });
    setNewSiteName(''); setActiveSiteId(newSiteId);
  };

  useEffect(() => { if (sites.length > 0 && !activeSiteId) setActiveSiteId(sites[0].id); }, [sites]);
  const activeSite = sites.find(s => s.id === activeSiteId);

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col lg:flex-row">
      <div className="w-full lg:w-80 bg-slate-50 border-r border-slate-100 flex flex-col max-h-[300px] lg:max-h-none">
          <div className="p-5 sticky top-0 bg-slate-50 z-10 border-b border-slate-200 lg:border-none">
              <div className="flex items-center justify-between mb-4">
                 <h2 className="text-xl font-black text-slate-800 tracking-tight">案場列表</h2>
                 <span className="text-xs font-bold bg-white px-2 py-1 rounded-full border border-slate-200">{sites.length}</span>
              </div>
              <div className="flex gap-2">
                  <input type="text" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="新增案場..." className="flex-1 px-4 py-2.5 text-sm font-bold bg-white border border-slate-200 rounded-xl focus:outline-none" onKeyDown={(e) => e.key === 'Enter' && handleAddSite()} />
                  <button onClick={handleAddSite} className="bg-blue-600 text-white p-2.5 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 mt-2">
              {sites.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(site => (
                  <button key={site.id} onClick={() => setActiveSiteId(site.id)} className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-center justify-between group ${activeSiteId === site.id ? 'bg-white shadow-md ring-1 ring-blue-100' : 'hover:bg-white text-slate-500'}`}>
                      <span className={`font-bold text-sm ${activeSiteId === site.id ? 'text-slate-800' : 'text-slate-600'}`}>{site.name}</span>
                      <ChevronRight className={`w-4 h-4 ${activeSiteId === site.id ? 'text-blue-500' : 'text-slate-300'}`} />
                  </button>
              ))}
          </div>
      </div>
      <div className="flex-1 p-5 lg:p-12 min-h-[500px]">
          {activeSite ? (
            <div className="animate-in fade-in duration-300">
               <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-100">
                  <h3 className="text-3xl font-black text-slate-800">{activeSite.name}</h3>
                  <button onClick={() => setSites(sites.filter(s => s.id !== activeSite.id))} className="text-red-500 hover:bg-red-50 p-3 rounded-xl transition-all"><Trash2 className="w-6 h-6" /></button>
               </div>
               <div className="space-y-4">
                  {(activeSite.posts || []).sort((a,b) => (a.shift === ShiftType.Day ? -1 : 1)).map(post => (
                    <PostRow key={post.id} post={post} assignedStaff={staff.find(s => s.defaultPostId === post.id)} 
                      onUpdatePostName={(id, name) => setSites(sites.map(s => s.id === activeSite.id ? { ...s, posts: s.posts.map(p => p.id === id ? { ...p, name } : p) } : s))} 
                      onUpdateStaffName={(id, name) => {
                          let newStaff = [...staff];
                          const idx = newStaff.findIndex(s => s.defaultPostId === id);
                          if (idx !== -1) { newStaff[idx].name = name; } else { newStaff.push({ id: uuidv4(), name, role: StaffRole.Regular, defaultSiteId: activeSite.id, defaultShift: activeSite.posts.find(p => p.id === id)!.shift, defaultPostId: id }); }
                          setStaff(newStaff);
                      }} 
                      onDeletePost={(id) => { setSites(sites.map(s => s.id === activeSite.id ? { ...s, posts: s.posts.filter(p => p.id !== id) } : s)); setStaff(staff.filter(s => s.defaultPostId !== id)); }} />
                  ))}
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                  <button onClick={() => setSites(sites.map(s => s.id === activeSite.id ? { ...s, posts: [...s.posts, { id: uuidv4(), name: '新崗位 (早)', shift: ShiftType.Day }] } : s))} className="p-4 border-2 border-dashed border-yellow-300 rounded-2xl bg-yellow-50 font-bold text-yellow-800 hover:bg-yellow-100 transition-all flex items-center justify-center gap-2"><Plus className="w-5 h-5" /> 新增早班</button>
                  <button onClick={() => setSites(sites.map(s => s.id === activeSite.id ? { ...s, posts: [...s.posts, { id: uuidv4(), name: '新崗位 (晚)', shift: ShiftType.Night }] } : s))} className="p-4 border-2 border-dashed border-blue-300 rounded-2xl bg-blue-50 font-bold text-blue-800 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"><Plus className="w-5 h-5" /> 新增晚班</button>
               </div>
            </div>
          ) : <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4"><Building className="w-16 h-16 opacity-30" /><p className="font-bold">請先點擊左側選擇案場</p></div>}
      </div>
    </div>
  );
};

export default SiteManager;
