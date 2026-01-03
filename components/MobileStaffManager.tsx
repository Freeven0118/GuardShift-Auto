
import React, { useState, useEffect } from 'react';
import { Staff, StaffRole, Site, ShiftType } from '../types';
import { Plus, Truck, Sun, Moon, Check, Trash2 } from 'lucide-react';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface MobileStaffManagerProps {
  staff: Staff[];
  sites: Site[];
  setStaff: (staff: Staff[]) => void;
}

const MobileStaffRow: React.FC<{
  staffMember: Staff;
  allSites: Site[];
  onRemove: (id: string) => void;
  onSave: (id: string, newName: string, shifts: ShiftType[], siteIds: string[]) => void;
}> = ({ staffMember, allSites, onRemove, onSave }) => {
  const [name, setName] = useState(staffMember.name);
  const [shifts, setShifts] = useState<ShiftType[]>(() => Array.isArray(staffMember.allowedShifts) ? staffMember.allowedShifts : [ShiftType.Day, ShiftType.Night]);
  const [siteIds, setSiteIds] = useState<string[]>(() => Array.isArray(staffMember.allowedSiteIds) ? staffMember.allowedSiteIds : []);
  const [isModified, setIsModified] = useState(false);
  const [isSaved, setIsSaved] = useState(true);

  useEffect(() => {
    setName(staffMember.name);
    setShifts(Array.isArray(staffMember.allowedShifts) ? staffMember.allowedShifts : [ShiftType.Day, ShiftType.Night]);
    setSiteIds(Array.isArray(staffMember.allowedSiteIds) ? staffMember.allowedSiteIds : []);
  }, [staffMember]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setIsModified(true);
    setIsSaved(false);
  };

  const toggleShift = (shift: ShiftType) => {
    setShifts(prev => prev.includes(shift) ? prev.filter(s => s !== shift) : [...prev, shift]);
    setIsModified(true);
    setIsSaved(false);
  };

  const toggleSite = (id: string) => {
    setSiteIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
    setIsModified(true);
    setIsSaved(false);
  };

  const setAllSites = () => {
    setSiteIds([]);
    setIsModified(true);
    setIsSaved(false);
  };

  const handleConfirm = () => {
    onSave(staffMember.id, name, shifts, siteIds);
    setIsModified(false);
    setIsSaved(true);
  };

  const isAllSites = siteIds.length === 0;

  return (
    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex flex-col xl:flex-row gap-5 items-start xl:items-center justify-between shadow-sm">
        
        {/* Name Input */}
        <div className="flex items-center gap-3 w-full xl:w-auto xl:min-w-[200px]">
          <div className="bg-amber-200 text-amber-800 p-3 rounded-xl shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="flex-1">
             <span className="text-[10px] font-bold text-amber-600 block mb-0.5 uppercase tracking-wider">機動人員姓名</span>
             <input
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="姓名"
                className="font-bold text-slate-800 text-xl bg-transparent border-b-2 border-amber-300 focus:border-amber-500 focus:outline-none w-full"
              />
          </div>
        </div>

        {/* Middle: Shifts & Sites Selection */}
        <div className="flex flex-col md:flex-row gap-6 flex-1 w-full">
            <div className="flex flex-col gap-2 w-full md:w-auto">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">可代班別 (點擊切換)</span>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => toggleShift(ShiftType.Day)}
                    className={`flex-1 px-3 py-3 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2 ${
                      shifts.includes(ShiftType.Day) ? 'bg-yellow-300 border-yellow-400 text-slate-900 shadow-sm' : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <Sun className="w-4 h-4" /> {shifts.includes(ShiftType.Day) && <Check className="w-3.5 h-3.5" />} 日班
                  </button>
                  <button
                    onClick={() => toggleShift(ShiftType.Night)}
                    className={`flex-1 px-3 py-3 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2 ${
                      shifts.includes(ShiftType.Night) ? 'bg-blue-300 border-blue-400 text-slate-900 shadow-sm' : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <Moon className="w-4 h-4" /> {shifts.includes(ShiftType.Night) && <Check className="w-3.5 h-3.5" />} 夜班
                  </button>
                </div>
            </div>

            <div className="flex flex-col gap-2 flex-1 w-full">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">可支援案場 (點選後需按確認)</span>
                <div className="flex flex-wrap gap-2">
                    <button 
                        onClick={setAllSites}
                        className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${isAllSites ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white border-slate-300 text-slate-500'}`}
                    >
                        全部
                    </button>
                    {allSites.map(site => (
                        <button
                            key={site.id}
                            onClick={() => toggleSite(site.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${siteIds.includes(site.id) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white border-slate-300 text-slate-500'}`}
                        >
                            {site.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 w-full xl:w-auto mt-2 xl:mt-0">
             <button
                onClick={handleConfirm}
                disabled={!isModified && isSaved}
                className={`flex-1 xl:flex-none px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-sm ${
                    (!isModified && isSaved) ? 'bg-slate-200 text-slate-400 cursor-default' : 'bg-green-600 text-white hover:bg-green-700 shadow-md active:scale-95'
                }`}
            >
                {(!isModified && isSaved) ? '已確認' : '已修改，請確認'}
            </button>
            <button 
                onClick={() => onRemove(staffMember.id)} 
                className="p-3 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm active:scale-95"
            >
              <Trash2 className="w-5 h-5" />
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
    setStaff([...staff, { id: generateId(), name: newName, role: StaffRole.Mobile, allowedShifts: [], allowedSiteIds: [] }]);
    setNewName('');
  };

  const updateStaffDetails = (id: string, name: string, shifts: ShiftType[], siteIds: string[]) => {
    setStaff(staff.map(s => s.id === id ? { ...s, name, allowedShifts: shifts, allowedSiteIds: siteIds } : s));
  };

  return (
    <div className="bg-white p-5 lg:p-8 rounded-[2rem] shadow-sm border border-slate-200 mt-8">
      <h2 className="text-xl lg:text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
        <Truck className="w-7 h-7 text-accent" /> 機動保全設定
      </h2>
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="輸入機動人員姓名..."
          className="flex-1 p-4 text-lg border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-accent/10 focus:border-accent focus:outline-none transition-all"
          onKeyDown={(e) => e.key === 'Enter' && addMobileStaff()}
        />
        <button onClick={addMobileStaff} className="bg-accent text-white px-8 py-4 rounded-2xl font-black text-lg shadow-lg hover:bg-amber-600 active:scale-95 transition-all flex items-center justify-center gap-2"><Plus className="w-6 h-6" /> 新增人員</button>
      </div>
      <div className="space-y-6">
        {mobileStaff.map(s => <MobileStaffRow key={s.id} staffMember={s} allSites={sites} onRemove={(id) => setStaff(staff.filter(x => x.id !== id))} onSave={updateStaffDetails} />)}
        {mobileStaff.length === 0 && <div className="text-center text-slate-400 py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">目前尚無機動人員</div>}
      </div>
    </div>
  );
};

export default MobileStaffManager;
