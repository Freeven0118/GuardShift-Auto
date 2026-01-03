
import React, { useState, useEffect, useMemo } from 'react';
import { Site, Staff, StaffRole, ShiftType, SitePost } from '../types';
import { Plus, Trash2, Building, Sun, Moon, Check, Pencil, X, Search, ChevronRight, Shield, Save, AlertTriangle, MapPin } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface SiteManagerProps {
  sites: Site[];
  staff: Staff[];
  onStateChange: (updates: { sites?: Site[], staff?: Staff[] }) => void;
  setSites: (sites: Site[]) => void;
  setStaff: (staff: Staff[]) => void;
}

// ----------------------------------------------------------------------
// Sub-component: PostRow (High Contrast Version + Animations)
// ----------------------------------------------------------------------
const PostRow: React.FC<{
  post: SitePost;
  assignedStaff?: Staff;
  onUpdatePostName: (id: string, name: string) => void;
  onUpdateStaffName: (postId: string, name: string) => void;
  onDeletePost: (id: string) => void;
}> = ({ post, assignedStaff, onUpdatePostName, onUpdateStaffName, onDeletePost }) => {
  const [localPostName, setLocalPostName] = useState(post.name);
  const [localStaffName, setLocalStaffName] = useState(assignedStaff?.name || '');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setLocalPostName(post.name);
  }, [post.name]);

  useEffect(() => {
    setLocalStaffName(assignedStaff?.name || '');
  }, [assignedStaff]);

  const hasChanges = localPostName !== post.name || localStaffName !== (assignedStaff?.name || '');
  const isDay = post.shift === ShiftType.Day;

  const handleSave = () => {
    if (localPostName !== post.name) onUpdatePostName(post.id, localPostName);
    if (localStaffName !== (assignedStaff?.name || '')) onUpdateStaffName(post.id, localStaffName);
  };

  const style = isDay ? {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      iconBg: 'bg-yellow-400',
      iconColor: 'text-yellow-900',
      label: 'text-yellow-700',
      inputBorder: 'border-yellow-300 focus:border-yellow-600',
      placeholder: 'placeholder-yellow-300/70',
      staffBg: 'bg-yellow-100/50'
  } : {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      iconBg: 'bg-blue-400',
      iconColor: 'text-blue-900',
      label: 'text-blue-700',
      inputBorder: 'border-blue-300 focus:border-blue-600',
      placeholder: 'placeholder-blue-300/70',
      staffBg: 'bg-blue-100/50'
  };

  return (
    <div 
        className={`group relative p-4 lg:p-5 rounded-2xl border-2 mb-4 transition-all duration-300 shadow-sm hover:shadow-md ${style.bg} ${style.border}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
    >
        <div className="flex flex-col xl:flex-row gap-5 items-start xl:items-center">
            
            {/* Post Name Section - Full Width on Mobile */}
            <div className="flex items-center gap-4 flex-1 w-full xl:w-auto xl:min-w-[280px]">
                <div className={`p-3 rounded-xl shrink-0 shadow-sm ${style.iconBg} ${style.iconColor}`}>
                    {isDay ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                    <label className={`text-xs font-black uppercase tracking-wider mb-1 block ${style.label}`}>崗位名稱</label>
                    <input 
                        type="text" 
                        value={localPostName}
                        onChange={(e) => setLocalPostName(e.target.value)}
                        className={`w-full font-bold text-xl text-slate-800 bg-transparent border-b-2 py-1 focus:outline-none transition-colors ${style.inputBorder} ${style.placeholder}`}
                        placeholder="例如: 大門哨"
                    />
                </div>
            </div>

            {/* Staff Name Section - Full Width on Mobile */}
            <div className="flex-1 w-full xl:w-auto xl:min-w-[280px]">
                 <label className={`text-xs font-black uppercase tracking-wider mb-1 block ${style.label}`}>固定人員</label>
                 <div className={`relative flex items-center rounded-xl px-3 py-1 border border-transparent focus-within:bg-white focus-within:shadow-sm focus-within:border-slate-200 transition-all ${style.staffBg}`}>
                    <input 
                        type="text" 
                        value={localStaffName}
                        onChange={(e) => setLocalStaffName(e.target.value)}
                        className={`w-full font-bold text-lg text-slate-800 bg-transparent py-1 pr-8 focus:outline-none placeholder-slate-400`}
                        placeholder="輸入姓名..."
                    />
                    {localStaffName && (
                        <button 
                            type="button"
                            onClick={() => setLocalStaffName('')}
                            className="absolute right-2 text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-slate-100 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                 </div>
            </div>

            {/* Actions - Animated Buttons - Full Width on Mobile */}
            <div className="flex items-center gap-3 self-end xl:self-center w-full xl:w-auto justify-end mt-2 xl:mt-0">
                 <button
                    type="button"
                    onClick={handleSave}
                    disabled={!hasChanges}
                    className={`flex-1 xl:flex-none px-6 py-3 xl:py-2.5 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap shadow-sm flex justify-center ${
                        !hasChanges 
                        ? 'bg-slate-200 text-slate-400 cursor-default' 
                        : 'bg-green-600 text-white hover:bg-green-700 hover:-translate-y-0.5 hover:shadow-lg active:scale-95'
                    }`}
                >
                    {!hasChanges ? '已確認' : '確認'}
                </button>
                
                <button 
                    type="button"
                    onClick={(e) => {
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        onDeletePost(post.id);
                    }}
                    className="flex-1 xl:flex-none flex items-center justify-center gap-2 px-5 py-3 xl:py-2.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                    title="刪除"
                >
                    <Trash2 className="w-4 h-4" />
                    刪除
                </button>
            </div>
        </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Sub-component: SiteDetailPanel
// ----------------------------------------------------------------------
const SiteDetailPanel: React.FC<{
  site: Site;
  staffList: Staff[];
  onDeleteSite: (id: string) => void;
  onRenameSite: (id: string, name: string) => void;
  onAddPost: (siteId: string, shift: ShiftType) => void;
  onDeletePost: (siteId: string, postId: string) => void;
  onUpdatePostName: (siteId: string, postId: string, name: string) => void;
  onUpdateStaffName: (siteId: string, postId: string, name: string) => void;
}> = ({ site, staffList, onDeleteSite, onRenameSite, onAddPost, onDeletePost, onUpdatePostName, onUpdateStaffName }) => {
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(site.name);

  useEffect(() => {
    setTitleInput(site.name);
  }, [site.name]);

  const handleTitleSave = () => {
    if (titleInput.trim() && titleInput !== site.name) {
        onRenameSite(site.id, titleInput);
    }
    setIsEditingTitle(false);
  };

  return (
    <div className="bg-white h-full flex flex-col animate-in fade-in duration-300">
      
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-start mb-8 pb-6 border-b border-slate-100 gap-6">
        <div className="flex-1 space-y-3 w-full">
             <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                <MapPin className="w-3.5 h-3.5" />
                <span>Site Configuration</span>
             </div>

            <div className="flex items-center gap-4 w-full">
                {isEditingTitle ? (
                    <div className="flex items-center gap-3 animate-in fade-in zoom-in-95 origin-left w-full">
                        <input 
                            type="text" 
                            value={titleInput}
                            onChange={(e) => setTitleInput(e.target.value)}
                            className="text-3xl lg:text-4xl font-black text-slate-800 border-b-2 border-blue-500 focus:outline-none bg-transparent min-w-[200px] w-full pb-1"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleTitleSave();
                                if (e.key === 'Escape') setIsEditingTitle(false);
                            }}
                        />
                        <button onClick={handleTitleSave} className="p-2 bg-green-100 text-green-700 rounded-full hover:bg-green-200 active:scale-95 transition shrink-0"><Check className="w-5 h-5" /></button>
                    </div>
                ) : (
                    <div className="group flex items-center gap-4 cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                         <h3 className="font-black text-slate-800 text-3xl lg:text-4xl tracking-tight hover:text-blue-600 transition-colors">{site.name}</h3>
                         <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-10px] group-hover:translate-x-0">
                             <Pencil className="w-4 h-4" />
                         </div>
                    </div>
                )}
            </div>
        </div>

        {/* Delete Site Button - Clean Red Button + Animation */}
        <button 
          type="button"
          onClick={(e) => {
              e.stopPropagation();
              onDeleteSite(site.id);
          }}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-red-600 hover:bg-red-700 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-sm font-bold active:scale-95 whitespace-nowrap self-end xl:self-start"
        >
          <Trash2 className="w-4 h-4" />
          <span>刪除案場</span>
        </button>
      </div>
      
      {/* Content Scroll Area */}
      <div className="flex-1 overflow-y-auto pr-2 pb-20 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        
        <div className="flex justify-between items-end mb-4">
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Shield className="w-4 h-4" />
                崗位配置 ({site.posts ? site.posts.length : 0})
            </h4>
        </div>

        <div className="space-y-4">
            {[...(site.posts || [])].sort((a,b) => (a.shift === ShiftType.Day ? -1 : 1)).map(post => {
                const staff = staffList.find(s => s.defaultPostId === post.id);
                return (
                    <PostRow 
                        key={post.id} 
                        post={post}
                        assignedStaff={staff}
                        onUpdatePostName={(postId, name) => onUpdatePostName(site.id, postId, name)}
                        onUpdateStaffName={(postId, name) => onUpdateStaffName(site.id, postId, name)}
                        onDeletePost={(postId) => onDeletePost(site.id, postId)}
                    />
                );
            })}
            
            {/* Empty State */}
            {(site.posts || []).length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 gap-3">
                    <AlertTriangle className="w-8 h-8 opacity-20" />
                    <p className="font-bold">此案場目前沒有崗位</p>
                </div>
            )}
        </div>

        {/* Add Post Action Area - Big Visible Buttons with Lift Animation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <button 
                type="button"
                onClick={() => onAddPost(site.id, ShiftType.Day)}
                className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl border-2 border-dashed border-yellow-300 bg-yellow-50 text-yellow-800 font-bold hover:bg-yellow-100 hover:border-yellow-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98]"
            >
                <div className="p-2 bg-yellow-200 rounded-full text-yellow-700">
                    <Plus className="w-6 h-6" />
                </div>
                <span>新增早班崗位</span>
            </button>
            <button 
                type="button"
                onClick={() => onAddPost(site.id, ShiftType.Night)}
                className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-800 font-bold hover:bg-blue-100 hover:border-blue-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98]"
            >
                <div className="p-2 bg-blue-200 rounded-full text-blue-700">
                    <Plus className="w-6 h-6" />
                </div>
                <span>新增晚班崗位</span>
            </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Main Component: SiteManager
// ----------------------------------------------------------------------
const SiteManager: React.FC<SiteManagerProps> = ({ sites, staff, onStateChange, setSites, setStaff }) => {
  const [newSiteName, setNewSiteName] = useState('');
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleAddSite = () => {
    if (!newSiteName.trim()) return;
    const newSiteId = uuidv4();
    const dayPostId = uuidv4();
    const nightPostId = uuidv4();

    const newSite: Site = { 
        id: newSiteId, 
        name: newSiteName, 
        requiredStaffPerShift: 1,
        posts: [
            { id: dayPostId, name: '正班 (早)', shift: ShiftType.Day },
            { id: nightPostId, name: '正班 (晚)', shift: ShiftType.Night }
        ]
    };
    
    const dayGuard: Staff = { 
      id: uuidv4(), name: '', role: StaffRole.Regular, 
      defaultSiteId: newSiteId, defaultShift: ShiftType.Day, defaultPostId: dayPostId
    };
    const nightGuard: Staff = { 
      id: uuidv4(), name: '', role: StaffRole.Regular, 
      defaultSiteId: newSiteId, defaultShift: ShiftType.Night, defaultPostId: nightPostId
    };

    onStateChange({
        sites: [...sites, newSite],
        staff: [...staff, dayGuard, nightGuard]
    });
    
    setNewSiteName('');
    setActiveSiteId(newSiteId);
  };

  const handleDeleteSite = (siteId: string) => {
    const newSites = sites.filter(s => s.id !== siteId);
    const newStaff = staff.filter(s => s.defaultSiteId !== siteId);

    if (activeSiteId === siteId) {
        const nextSite = newSites.length > 0 ? newSites[0] : null;
        setActiveSiteId(nextSite ? nextSite.id : null);
    }

    setSites(newSites);
    setStaff(newStaff);
  };

  const handleRenameSite = (siteId: string, newName: string) => {
      const newSites = sites.map(s => s.id === siteId ? { ...s, name: newName } : s);
      setSites(newSites);
  };

  const handleAddPost = (siteId: string, shift: ShiftType) => {
      const newPost: SitePost = {
          id: uuidv4(),
          name: shift === ShiftType.Day ? '新崗位 (早)' : '新崗位 (晚)',
          shift: shift
      };
      const newSites = sites.map(s => s.id === siteId ? { ...s, posts: [...(s.posts || []), newPost] } : s);
      setSites(newSites);
  };

  const handleDeletePost = (siteId: string, postId: string) => {
      const newSites = sites.map(s => {
          if (s.id === siteId) {
              return { ...s, posts: (s.posts || []).filter(p => p.id !== postId) };
          }
          return s;
      });
      const newStaff = staff.filter(s => s.defaultPostId !== postId);
      setSites(newSites);
      setStaff(newStaff);
  };

  const handleUpdatePostName = (siteId: string, postId: string, name: string) => {
      const newSites = sites.map(s => {
          if (s.id === siteId) {
              const updatedPosts = (s.posts || []).map(p => p.id === postId ? { ...p, name } : p);
              return { ...s, posts: updatedPosts };
          }
          return s;
      });
      setSites(newSites);
  };

  const handleUpdateStaffName = (siteId: string, postId: string, name: string) => {
      let newStaffList = [...staff];
      const existingStaffIndex = newStaffList.findIndex(s => s.defaultPostId === postId);
      
      if (existingStaffIndex !== -1) {
          if (name.trim() === '') {
               newStaffList[existingStaffIndex] = { ...newStaffList[existingStaffIndex], name: name };
          } else {
               newStaffList[existingStaffIndex] = { ...newStaffList[existingStaffIndex], name: name };
          }
      } else {
          if (name.trim()) {
              const site = sites.find(s => s.id === siteId);
              const post = site?.posts.find(p => p.id === postId);
              if (site && post) {
                  newStaffList.push({
                      id: uuidv4(),
                      name: name,
                      role: StaffRole.Regular,
                      defaultSiteId: siteId,
                      defaultShift: post.shift,
                      defaultPostId: postId
                  });
              }
          }
      }
      setStaff(newStaffList);
  };

  useEffect(() => {
    if (sites.length > 0 && !activeSiteId) {
        setActiveSiteId(sites[0].id);
    }
  }, [sites.length]);

  const filteredSites = useMemo(() => {
      return sites.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [sites, searchTerm]);

  const activeSite = sites.find(s => s.id === activeSiteId);
  const activeSiteStaff = activeSite ? staff.filter(s => s.defaultSiteId === activeSite.id) : [];

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-white overflow-hidden flex flex-col lg:flex-row min-h-[auto] lg:min-h-[750px]">
      
      {/* LEFT SIDEBAR - Reordered for Mobile (Top) / Desktop (Left) */}
      <div className="w-full lg:w-80 bg-slate-50 border-r border-slate-100 flex flex-col z-0 max-h-[400px] lg:max-h-none">
          
          {/* Sidebar Header */}
          <div className="p-4 lg:p-6 pb-2 lg:pb-4 bg-slate-50 sticky top-0 z-10">
              <div className="flex items-center justify-between mb-4 lg:mb-6">
                 <h2 className="text-lg lg:text-xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
                    案場列表
                 </h2>
                 <span className="text-xs font-bold text-slate-400 bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-sm">{sites.length}</span>
              </div>
              
              {/* Add Site Input */}
              <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <input
                        type="text"
                        value={newSiteName}
                        onChange={(e) => setNewSiteName(e.target.value)}
                        placeholder="新增案場..."
                        className="w-full pl-4 pr-3 py-2.5 text-sm font-bold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:outline-none placeholder-slate-400 transition-all"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSite()}
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={handleAddSite}
                    disabled={!newSiteName.trim()}
                    className="bg-blue-600 disabled:bg-slate-300 text-white p-2.5 rounded-xl hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 shadow-md active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜尋..."
                    className="w-full pl-10 pr-4 py-2 text-xs font-bold bg-slate-200/50 border-transparent rounded-lg focus:bg-white focus:ring-2 focus:ring-slate-200 focus:outline-none transition-colors text-slate-600 placeholder-slate-400"
                  />
              </div>
          </div>

          {/* Site List */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 h-[200px] lg:h-auto">
              {filteredSites.length > 0 ? (
                  filteredSites.map(site => {
                    const postCount = (site.posts || []).length;
                    const assignedCount = (site.posts || []).filter(p => staff.some(s => s.defaultPostId === p.id && s.name.trim() !== '')).length;
                    const isComplete = postCount > 0 && assignedCount === postCount;
                    const isActive = activeSiteId === site.id;

                    return (
                        <button
                            key={site.id}
                            type="button"
                            onClick={() => setActiveSiteId(site.id)}
                            className={`w-full text-left px-4 py-3.5 rounded-xl transition-all duration-200 flex items-center justify-between group relative overflow-hidden ${
                                isActive 
                                ? 'bg-white shadow-md shadow-blue-100/50 ring-1 ring-blue-50' 
                                : 'hover:bg-white hover:shadow-md hover:-translate-y-0.5 text-slate-500'
                            }`}
                        >
                            {/* Active Indicator Strip */}
                            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-xl"></div>}

                            <div className={`flex flex-col gap-0.5 z-10 ${isActive ? 'pl-2' : ''}`}>
                                <span className={`font-bold text-sm tracking-tight ${isActive ? 'text-slate-800' : 'text-slate-600 group-hover:text-slate-800'}`}>{site.name}</span>
                                <div className="flex items-center gap-2">
                                    {isComplete 
                                        ? <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md flex items-center gap-1"><Check className="w-2.5 h-2.5"/>配置完成</span> 
                                        : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">缺 {postCount - assignedCount} 員</span>
                                    }
                                </div>
                            </div>
                            
                            {isActive ? (
                                <ChevronRight className="w-4 h-4 text-blue-500 z-10" />
                            ) : (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight className="w-4 h-4 text-slate-300" />
                                </div>
                            )}
                        </button>
                    );
                  })
              ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 opacity-60">
                      <Search className="w-8 h-8 opacity-20" />
                      <span className="text-xs font-medium">無符合資料</span>
                  </div>
              )}
          </div>
      </div>

      {/* RIGHT PANEL: DETAILS */}
      <div className="flex-1 p-4 lg:p-12 bg-white min-h-[600px] z-10 relative">
          {activeSite ? (
            <SiteDetailPanel 
              // FORCE REMOUNT on ID change OR Post Count Change
              key={`${activeSite.id}-${(activeSite.posts || []).length}`}
              site={activeSite}
              staffList={activeSiteStaff}
              onDeleteSite={handleDeleteSite}
              onRenameSite={handleRenameSite}
              onAddPost={handleAddPost}
              onDeletePost={handleDeletePost}
              onUpdatePostName={handleUpdatePostName}
              onUpdateStaffName={handleUpdateStaffName}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-6 animate-in zoom-in-95 duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-blue-100 rounded-full blur-xl opacity-50"></div>
                    <div className="bg-white p-8 rounded-3xl shadow-xl relative">
                        <Building className="w-16 h-16 text-blue-500 opacity-80" />
                    </div>
                </div>
                <div className="text-center space-y-2">
                    <p className="text-2xl font-black text-slate-700">準備開始設定</p>
                    <p className="text-sm font-medium text-slate-400">請從左側列表選擇案場，或建立一個新的案場</p>
                </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default SiteManager;
