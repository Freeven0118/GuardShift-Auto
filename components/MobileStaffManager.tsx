
import React, { useState, useEffect } from 'react';
import { Staff, StaffRole, Site, ShiftType } from '../types';
import { Plus, Truck, Sun, Moon, Check, Trash2 } from 'lucide-react';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface MobileStaffManagerProps {
  staff: Staff[];
  sites: Site[];
  setStaff: (staff: Staff[]) => void;
}

// Sub-component for individual Mobile Staff row management
const MobileStaffRow: React.FC<{
  staffMember: Staff;
  allSites: Site[];
  onRemove: (id: string) => void;
  onSave: (id: string, newName: string, shifts: ShiftType[], siteIds: string[]) => void;
}> = ({ staffMember, allSites, onRemove, onSave }) => {
  const [name, setName] = useState(staffMember.name);
  
  // Defensive initialization: ensure shifts is always an array
  const [shifts, setShifts] = useState<ShiftType[]>(() => {
    if (Array.isArray(staffMember.allowedShifts)) {
      return staffMember.allowedShifts;
    }
    // Fallback for legacy string data or undefined
    return [ShiftType.Day, ShiftType.Night];
  });

  // Defensive initialization for siteIds
  const [siteIds, setSiteIds] = useState<string[]>(() => {
    if (Array.isArray(staffMember.allowedSiteIds)) {
        return staffMember.allowedSiteIds;
    }
    return [];
  });

  const [isModified, setIsModified] = useState(false);
  const [isSaved, setIsSaved] = useState(true);

  // Sync with props if they change externally (and handle potential type mismatches)
  useEffect(() => {
    setName(staffMember.name);
    
    if (Array.isArray(staffMember.allowedShifts)) {
        setShifts(staffMember.allowedShifts);
    } else {
        setShifts([ShiftType.Day, ShiftType.Night]);
    }

    if (Array.isArray(staffMember.allowedSiteIds)) {
        setSiteIds(staffMember.allowedSiteIds);
    } else {
        setSiteIds([]);
    }
  }, [staffMember]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setIsModified(true);
    setIsSaved(false);
  };

  const toggleShift = (shift: ShiftType) => {
    setShifts(prev => {
      // Ensure prev is array before calling includes (extra safety)
      const safePrev = Array.isArray(prev) ? prev : [];
      if (safePrev.includes(shift)) {
        return safePrev.filter(s => s !== shift);
      } else {
        return [...safePrev, shift];
      }
    });
    setIsModified(true);
    setIsSaved(false);
  };

  const toggleSite = (id: string) => {
    setSiteIds(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        if (safePrev.includes(id)) {
            return safePrev.filter(sid => sid !== id);
        } else {
            return [...safePrev, id];
        }
    });
    setIsModified(true);
    setIsSaved(false);
  };

  const setAllSites = () => {
    setSiteIds([]); // Empty array means ALL
    setIsModified(true);
    setIsSaved(false);
  };

  const handleConfirm = () => {
    onSave(staffMember.id, name, shifts, siteIds);
    setIsModified(false);
    setIsSaved(true);
  };

  // Check if "All" is effectively selected (empty array)
  const isAllSites = siteIds.length === 0;

  return (
    <div className="bg-amber-50 border border-amber-100 p-5 rounded-lg flex flex-col xl:flex-row gap-5 items-start xl:items-center justify-between shadow-sm hover:shadow-md transition-shadow duration-300">
        
        {/* Name Input - Widened width for better aesthetics */}
        <div className="flex items-center gap-3 w-full sm:w-auto min-w-[240px]">
          <div className="bg-amber-200 text-amber-800 p-3 rounded-full shrink-0 shadow-sm">
            <Truck className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder="姓名"
            className="font-bold text-slate-700 text-xl bg-transparent border-b-2 border-amber-300 focus:border-amber-500 focus:outline-none w-full sm:w-[180px]"
          />
        </div>

        <div className="flex flex-col md:flex-row gap-6 flex-1 w-full">
            {/* Shifts Selection (Multi-select) */}
            <div className="flex flex-col gap-2 min-w-[180px]">
                <span className="text-sm font-bold text-slate-600 uppercase">可代班別 (點擊切換)</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleShift(ShiftType.Day)}
                    className={`flex-1 px-3 py-2 text-sm font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 border hover:-translate-y-0.5 active:scale-95 ${
                      shifts.includes(ShiftType.Day) 
                        ? 'bg-yellow-300 border-yellow-400 text-slate-900 shadow-md' // Selected
                        : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200 shadow-sm' // Unselected
                    }`}
                  >
                    {shifts.includes(ShiftType.Day) && <Check className="w-4 h-4" />}
                    <Sun className="w-4 h-4" /> 日班
                  </button>
                  <button
                    onClick={() => toggleShift(ShiftType.Night)}
                    className={`flex-1 px-3 py-2 text-sm font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 border hover:-translate-y-0.5 active:scale-95 ${
                      shifts.includes(ShiftType.Night) 
                        ? 'bg-blue-300 border-blue-400 text-slate-900 shadow-md' // Selected
                        : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200 shadow-sm' // Unselected
                    }`}
                  >
                    {shifts.includes(ShiftType.Night) && <Check className="w-4 h-4" />}
                    <Moon className="w-4 h-4" /> 夜班
                  </button>
                </div>
            </div>

            {/* Sites Selection */}
            <div className="flex flex-col gap-2 flex-1">
                <span className="text-sm font-bold text-slate-600 uppercase">可支援案場 (點選後需按確認)</span>
                <div className="flex flex-wrap gap-2">
                    <button 
                        onClick={setAllSites}
                        className={`px-3 py-1.5 rounded text-sm font-medium border transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${isAllSites ? 'bg-slate-700 text-white border-slate-700 shadow-md' : 'bg-white border-slate-300 text-slate-500 hover:border-slate-500 shadow-sm'}`}
                    >
                        全部
                    </button>
                    {allSites.map(site => {
                        const isSelected = siteIds.includes(site.id);
                        return (
                            <button
                                key={site.id}
                                onClick={() => toggleSite(site.id)}
                                className={`px-3 py-1.5 rounded text-sm font-medium border transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white border-slate-300 text-slate-500 hover:border-slate-500 shadow-sm'}`}
                            >
                                {site.name}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 self-end xl:self-center">
             <button
                onClick={handleConfirm}
                disabled={!isModified && isSaved}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap shadow-sm ${
                    (!isModified && isSaved) 
                    ? 'bg-slate-200 text-slate-400 cursor-default' 
                    : 'bg-green-600 text-white hover:bg-green-700 hover:-translate-y-0.5 hover:shadow-lg active:scale-95'
                }`}
            >
                {(!isModified && isSaved) ? '已確認' : '確認'}
            </button>
            <button 
                onClick={() => onRemove(staffMember.id)} 
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              刪除
            </button>
        </div>
    </div>
  );
};

const MobileStaffManager: React.FC<MobileStaffManagerProps> = ({ staff, sites, setStaff }) => {
  const [newName, setNewName] = useState('');

  const mobileStaff = staff.filter(s => s.role === StaffRole.Mobile);

  const addMobileStaff = () => {
    if (!newName.trim()) return;
    const newStaff: Staff = {
      id: generateId(),
      name: newName,
      role: StaffRole.Mobile,
      allowedShifts: [], // Default to NONE checked (user must select)
      allowedSiteIds: [] // Empty means all sites by default logic
    };
    setStaff([...staff, newStaff]);
    setNewName('');
  };

  const removeStaff = (id: string) => {
    setStaff(staff.filter(s => s.id !== id));
  };

  const updateStaffDetails = (id: string, name: string, shifts: ShiftType[], siteIds: string[]) => {
    setStaff(staff.map(s => {
        if (s.id === id) {
            return { ...s, name, allowedShifts: shifts, allowedSiteIds: siteIds };
        }
        return s;
    }));
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 mt-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
        <Truck className="w-6 h-6 text-accent" />
        機動保全設定 (Mobile Staff)
      </h2>
      <p className="text-lg text-slate-600 font-medium mb-6">
        設定機動人員可代班的時段(日/夜)以及可支援的案場。調整設定後請務必點擊右側「確認」儲存。
      </p>
      
      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="輸入機動人員姓名"
          className="flex-1 p-3 text-lg border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent focus:outline-none placeholder-slate-400"
          onKeyDown={(e) => e.key === 'Enter' && addMobileStaff()}
        />
        <button 
          onClick={addMobileStaff}
          className="bg-accent text-white px-6 py-3 rounded-lg hover:bg-amber-600 transition-all duration-200 flex items-center gap-2 font-bold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
        >
          <Plus className="w-5 h-5" /> 新增
        </button>
      </div>

      <div className="space-y-6">
        {mobileStaff.map(s => (
          <MobileStaffRow 
            key={s.id}
            staffMember={s}
            allSites={sites}
            onRemove={removeStaff}
            onSave={updateStaffDetails}
          />
        ))}
        {mobileStaff.length === 0 && (
          <div className="text-center text-slate-400 text-base py-12 bg-slate-50 rounded border border-dashed">
            無機動人員資料
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileStaffManager;
