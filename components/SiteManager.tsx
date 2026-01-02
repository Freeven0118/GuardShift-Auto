import React, { useState, useEffect } from 'react';
import { Site, Staff, StaffRole, ShiftType } from '../types';
import { Plus, Trash2, Building, Sun, Moon, Check } from 'lucide-react';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface SiteManagerProps {
  sites: Site[];
  staff: Staff[];
  setSites: (sites: Site[]) => void;
  setStaff: (staff: Staff[]) => void;
}

// Sub-component for individual Site management
const SiteCard: React.FC<{
  site: Site;
  dayStaff: Staff;
  nightStaff: Staff;
  onRemove: (id: string) => void;
  onUpdateStaff: (dayName: string, nightName: string) => void;
}> = ({ site, dayStaff, nightStaff, onRemove, onUpdateStaff }) => {
  const [dayName, setDayName] = useState(dayStaff.name);
  const [nightName, setNightName] = useState(nightStaff.name);

  // Sync local state if props change (e.g. from reload or tab switch)
  useEffect(() => {
    setDayName(dayStaff.name);
    setNightName(nightStaff.name);
  }, [dayStaff.name, nightStaff.name, site.id]);

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDayName(e.target.value);
  };

  const handleNightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNightName(e.target.value);
  };

  const handleSave = () => {
    // Saves both inputs to ensure state consistency
    onUpdateStaff(dayName, nightName);
  };

  // Determine modification state for UI feedback
  const isDayModified = dayName !== dayStaff.name;
  const isNightModified = nightName !== nightStaff.name;

  return (
    <div className="bg-white p-6 rounded-b-xl rounded-tr-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
        <h3 className="font-bold text-slate-800 text-2xl flex items-center gap-2">
          <Building className="w-6 h-6 text-slate-500" />
          {site.name}
        </h3>
        <button 
          onClick={() => onRemove(site.id)}
          className="flex items-center gap-2 text-slate-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition border border-transparent hover:border-red-100"
          title="刪除案場"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-sm font-bold">刪除此案場</span>
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
        {/* Day Shift Input */}
        <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-lg border border-amber-100">
          <div className="bg-amber-100 p-3 rounded-full text-amber-600 self-start">
            <Sun className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <label className="text-lg font-bold text-slate-700 block mb-2">早班固定保全</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={dayName}
                onChange={handleDayChange}
                className="w-full font-medium text-xl text-slate-800 focus:outline-none focus:border-b-2 focus:border-blue-500 bg-transparent placeholder-slate-400 py-1"
                placeholder="請輸入早班人員姓名"
              />
              <button
                onClick={handleSave}
                disabled={!isDayModified}
                className={`px-4 py-1.5 rounded text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                  isDayModified 
                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-md' 
                    : 'bg-slate-200 text-slate-400 cursor-default'
                }`}
              >
                {isDayModified ? '確認' : <Check className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Night Shift Input */}
        <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-lg border border-indigo-100">
          <div className="bg-indigo-100 p-3 rounded-full text-indigo-600 self-start">
            <Moon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <label className="text-lg font-bold text-slate-700 block mb-2">晚班固定保全</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={nightName}
                onChange={handleNightChange}
                className="w-full font-medium text-xl text-slate-800 focus:outline-none focus:border-b-2 focus:border-blue-500 bg-transparent placeholder-slate-400 py-1"
                placeholder="請輸入晚班人員姓名"
              />
              <button
                onClick={handleSave}
                disabled={!isNightModified}
                className={`px-4 py-1.5 rounded text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                  isNightModified 
                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-md' 
                    : 'bg-slate-200 text-slate-400 cursor-default'
                }`}
              >
                {isNightModified ? '確認' : <Check className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SiteManager: React.FC<SiteManagerProps> = ({ sites, staff, setSites, setStaff }) => {
  const [newSiteName, setNewSiteName] = useState('');
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);

  // Effect to manage active tab state
  useEffect(() => {
    // If we have sites but no active site, select the first one
    if (sites.length > 0 && !activeSiteId) {
      setActiveSiteId(sites[0].id);
    } 
    // If the active site was deleted, select the first one available or null
    else if (activeSiteId && !sites.find(s => s.id === activeSiteId)) {
        setActiveSiteId(sites.length > 0 ? sites[0].id : null);
    }
  }, [sites, activeSiteId]);

  const addSite = () => {
    if (!newSiteName.trim()) return;
    const newSiteId = generateId();
    const newSite: Site = { id: newSiteId, name: newSiteName, requiredStaffPerShift: 1 };
    
    const dayGuard: Staff = { 
      id: generateId(), 
      name: '', 
      role: StaffRole.Regular, 
      defaultSiteId: newSiteId, 
      defaultShift: ShiftType.Day 
    };
    const nightGuard: Staff = { 
      id: generateId(), 
      name: '', 
      role: StaffRole.Regular, 
      defaultSiteId: newSiteId, 
      defaultShift: ShiftType.Night 
    };

    setSites([...sites, newSite]);
    setStaff([...staff, dayGuard, nightGuard]);
    setNewSiteName('');
    setActiveSiteId(newSiteId); // Automatically switch to new site
  };

  const removeSite = (siteId: string) => {
    setSites(sites.filter(s => s.id !== siteId));
    setStaff(staff.filter(s => s.defaultSiteId !== siteId));
    // Active site update handled by useEffect
  };

  const updateSiteStaff = (siteId: string, dayName: string, nightName: string) => {
    const updatedStaff = staff.map(s => {
      if (s.defaultSiteId === siteId) {
        if (s.defaultShift === ShiftType.Day) return { ...s, name: dayName };
        if (s.defaultShift === ShiftType.Night) return { ...s, name: nightName };
      }
      return s;
    });
    setStaff(updatedStaff);
  };

  // Find active site and its staff
  const activeSite = sites.find(s => s.id === activeSiteId);
  const activeDayStaff = activeSite ? staff.find(s => s.defaultSiteId === activeSite.id && s.defaultShift === ShiftType.Day) : undefined;
  const activeNightStaff = activeSite ? staff.find(s => s.defaultSiteId === activeSite.id && s.defaultShift === ShiftType.Night) : undefined;

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
          <Building className="w-6 h-6 text-primary" />
          案場設定 (Sites)
        </h2>
        <p className="text-lg text-slate-600 font-medium mb-6">
          新增案場後，請在下方分頁中輸入固定早、晚班人員姓名。
        </p>
        
        <div className="flex gap-3">
          <input
            type="text"
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
            placeholder="輸入案場名稱 (例如: 帝寶豪宅)"
            className="flex-1 p-3 text-lg border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none placeholder-slate-400"
            onKeyDown={(e) => e.key === 'Enter' && addSite()}
          />
          <button 
            onClick={addSite}
            className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 font-bold text-lg"
          >
            <Plus className="w-5 h-5" /> 新增
          </button>
        </div>
      </div>

      {/* Tabs Container */}
      {sites.length > 0 ? (
        <div className="flex flex-col">
          {/* Tab Headers */}
          <div className="flex flex-wrap gap-1 px-2">
            {sites.map(site => (
              <button
                key={site.id}
                onClick={() => setActiveSiteId(site.id)}
                className={`px-5 py-3 rounded-t-xl font-bold text-lg transition-all relative ${
                  activeSiteId === site.id
                    ? 'bg-white text-primary border-t-2 border-l border-r border-slate-200 border-t-primary z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]' 
                    : 'bg-slate-100 text-slate-500 border border-transparent hover:bg-slate-200'
                }`}
                style={{ marginBottom: '-1px' }} // Overlap the border
              >
                {site.name}
              </button>
            ))}
          </div>

          {/* Active Site Content */}
          {activeSite && activeDayStaff && activeNightStaff && (
            <SiteCard 
              key={activeSite.id}
              site={activeSite}
              dayStaff={activeDayStaff}
              nightStaff={activeNightStaff}
              onRemove={removeSite}
              onUpdateStaff={(d, n) => updateSiteStaff(activeSite.id, d, n)}
            />
          )}
        </div>
      ) : (
        <div className="text-center text-slate-400 text-base py-12 border-2 border-dashed border-slate-200 rounded-lg">
          <Building className="w-10 h-10 mx-auto mb-2 opacity-50" />
          尚未新增案場。請在上方輸入名稱並點擊新增。
        </div>
      )}
    </div>
  );
};

export default SiteManager;