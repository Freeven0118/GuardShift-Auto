
import { ScheduleState, ShiftType, StaffRole, Staff, ScheduleAssignment, DayInfo, LeaveRequest } from "../types";
import { getMonthDays, getRequiredLeaveDays } from "../utils/dateUtils";

// --- 輔助檢查函式 ---

/**
 * 檢查某個員工在特定日期是否可以排班
 * 嚴格執行：排休、連七禁令 (工作不得超過6天)、追趕跑跳碰（晚接早）、正班定班定點
 */
export const isStaffAvailable = (
  staff: Staff,
  currentDateStr: string,
  targetShift: ShiftType,
  allAssignments: ScheduleAssignment[],
  leaveRequests: { staffId: string; dateStr: string }[],
  days: DayInfo[]
): { available: boolean; reason?: string } => {
  const currentDayIndex = days.findIndex(d => d.dateStr === currentDateStr);
  
  // 0. 絕對規則：正班人員只能上自己的固定班別 (Fix for User Request)
  if (staff.role === StaffRole.Regular) {
      if (staff.defaultShift && staff.defaultShift !== targetShift) {
          return { available: false, reason: "正班人員班別固定" };
      }
  }

  // 1. 檢查是否已請假 (Leave Request)
  if (leaveRequests.some(r => r.staffId === staff.id && r.dateStr === currentDateStr)) {
    return { available: false, reason: "已排休" };
  }

  // 2. 檢查當天是否已經有排班 (避免同一天分身)
  const assignedToday = allAssignments.find(a => a.staffId === staff.id && a.dateStr === currentDateStr);
  if (assignedToday) {
      return { available: false, reason: "當天已有班" };
  }

  // 3. 檢查機動人員的限制 (Allowed Shifts / Sites)
  if (staff.role === StaffRole.Mobile && staff.allowedShifts && staff.allowedShifts.length > 0) {
      if (!staff.allowedShifts.includes(targetShift)) {
          return { available: false, reason: "不支援此班別" };
      }
  }

  // 4. 嚴格檢查：晚接早 (No Night -> Day rotation)
  // 如果今天是早班，昨天不能是晚班
  if (targetShift === ShiftType.Day && currentDayIndex > 0) {
    const prevDateStr = days[currentDayIndex - 1].dateStr;
    const workedLastNight = allAssignments.some(a => 
      a.staffId === staff.id && 
      a.dateStr === prevDateStr && 
      a.shift === ShiftType.Night
    );
    if (workedLastNight) {
      return { available: false, reason: "禁止晚接早" };
    }
  }

  // 5. 嚴格檢查：勞基法連七禁令 (工作不得超過 6 天)
  // 檢查過去 6 天是否都有工作 (如果過去6天全勤，今天第7天必須休)
  if (currentDayIndex >= 6) {
    let consecutiveDays = 0;
    for (let i = 1; i <= 6; i++) {
       const checkDate = days[currentDayIndex - i].dateStr;
       const hasWork = allAssignments.some(a => a.staffId === staff.id && a.dateStr === checkDate);
       if (hasWork) consecutiveDays++;
       else break; // 中斷就不算連班
    }
    // 如果連續工作已經達到 6 天，第 7 天 (今天) 必須休息
    if (consecutiveDays >= 6) {
        return { available: false, reason: "連七禁令" };
    }
  }

  return { available: true };
};

/**
 * 自動幫人員安插休假，直到滿足當月目標休假天數
 * 策略：優先依據「作 3 休 1」>「作 4 休 1」的優先級節奏安插休假
 * 採用「最長工時區塊優先切斷」策略 (Longest Block First)
 */
const distributeMandatoryLeaves = (
  staff: Staff, 
  days: DayInfo[], 
  currentLeaves: { staffId: string; dateStr: string; isDesignated: boolean }[],
  targetOffDays: number
): { staffId: string; dateStr: string; isDesignated: boolean }[] => {
  
  const staffLeaves = currentLeaves.filter(l => l.staffId === staff.id);
  let needed = targetOffDays - staffLeaves.length;
  
  if (needed <= 0) return staffLeaves; // 假已經夠了

  const newLeaves = [...staffLeaves];
  
  // 建立一個 "工作日模擬陣列"：0 = 休, 1 = 工作
  // 預設全勤 (1)，然後根據現有休假填入 0
  const scheduleSim = new Array(days.length).fill(1);
  staffLeaves.forEach(l => {
      const idx = days.findIndex(d => d.dateStr === l.dateStr);
      if (idx !== -1) scheduleSim[idx] = 0;
  });

  // 迭代邏輯：只要還缺假，就找出最長的一段連續工作日，並將其切斷
  while (needed > 0) {
      // 1. 掃描目前所有的連續工作區塊
      const blocks: { start: number; length: number }[] = [];
      let currentStart = -1;
      
      for (let i = 0; i < days.length; i++) {
          if (scheduleSim[i] === 1) {
              if (currentStart === -1) currentStart = i;
          } else {
              if (currentStart !== -1) {
                  blocks.push({ start: currentStart, length: i - currentStart });
                  currentStart = -1;
              }
          }
      }
      // 處理結尾
      if (currentStart !== -1) {
          blocks.push({ start: currentStart, length: days.length - currentStart });
      }

      // 如果沒有工作區塊了 (全休)，則跳出
      if (blocks.length === 0) break;

      // 2. 排序：優先處理最長的區塊 (解決連 7 問題，並創造節奏)
      blocks.sort((a, b) => b.length - a.length);
      const targetBlock = blocks[0];

      // 3. 決定切點 (Cut Point)
      // 優先級：3-1 (切在 index 3) > 4-1 (切在 index 4) > 5-1 > 6-1
      let cutOffset = 0;

      if (targetBlock.length > 4) {
          // 對於長區塊，優先切出「作 3」或「作 4」的節奏
          // 這裡給予 3 較高的權重 (65%)，以符合最高優先級
          cutOffset = Math.random() < 0.65 ? 3 : 4; 
          
          // 安全檢查
          if (cutOffset >= targetBlock.length) cutOffset = targetBlock.length - 1;

      } else if (targetBlock.length === 4) {
          // 長度為 4，切在 3 (第 4 天) 剛好形成「作 3 休 1」
          cutOffset = 3;
      } else {
          // 長度小於 4 (剩餘的小碎塊)，但我們必須消耗休假
          // 隨機切
          cutOffset = Math.floor(Math.random() * targetBlock.length);
      }

      // 4. 執行排休
      const leaveIndex = targetBlock.start + cutOffset;
      scheduleSim[leaveIndex] = 0;
      newLeaves.push({ staffId: staff.id, dateStr: days[leaveIndex].dateStr, isDesignated: false });
      needed--;
  }

  return newLeaves;
};

// --- 強力去重函式 ---
export const deduplicateAssignments = (assignments: ScheduleAssignment[], staffList: Staff[]): ScheduleAssignment[] => {
  const slotMap = new Map<string, ScheduleAssignment>();
  
  for (const asm of assignments) {
    const key = `${asm.dateStr}-${asm.siteId}-${asm.shift}`;
    const existing = slotMap.get(key);
    
    if (!existing) {
      slotMap.set(key, asm);
      continue;
    }
    
    // 發現重複！開始進行衝突解決 (Conflict Resolution)
    const currentStaff = staffList.find(s => s.id === asm.staffId);
    const existingStaff = staffList.find(s => s.id === existing.staffId);
    
    // 規則1：正班人員 (Regular) 優先於 機動人員 (Mobile)
    if (currentStaff?.role === StaffRole.Regular && existingStaff?.role === StaffRole.Mobile) {
       // 新的是正班，取代舊的機動
       slotMap.set(key, asm);
    }
    // 規則2：如果都是機動，或者都是正班，保留既有的 (First-come-first-serve)，或這裡可以加入其他邏輯
  }
  
  return Array.from(slotMap.values());
};


// --- 主生成邏輯 ---

export const generateScheduleRuleBased = async (state: ScheduleState): Promise<{ assignments: ScheduleAssignment[], generatedLeaves: LeaveRequest[] }> => {
  const days = getMonthDays(state.year, state.month);
  const targetOffDays = getRequiredLeaveDays(state.year, state.month);
  
  const regularStaff = state.staff.filter(s => s.role === StaffRole.Regular);
  const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);
  
  // 深拷貝現有休假請求，因為我們會自動新增「強制休假」
  let finalLeaveRequests = [...state.leaveRequests];
  const assignments: ScheduleAssignment[] = [];

  // Phase 1: 人員休假規劃 (Planning Leaves for ALL Staff)
  // 確保每位人員(包含正班與機動)都有足夠的休假，避免過勞
  state.staff.forEach(staff => {
      const updatedLeaves = distributeMandatoryLeaves(staff, days, finalLeaveRequests, targetOffDays);
      // 更新總表
      updatedLeaves.forEach(l => {
          if (!finalLeaveRequests.some(exist => exist.staffId === l.staffId && exist.dateStr === l.dateStr)) {
              finalLeaveRequests.push(l);
          }
      });
  });

  // Phase 2: 排定正班人員 (Fill Regulars)
  // 規則：正班人員「預設」上班，除非有休假
  // Iterate through Sites -> Posts (Types)
  for (const day of days) {
      for (const site of state.sites) {
          if (!site.posts) continue;

          for (const post of site.posts) {
              // Find the regular staff assigned to this post
              const staffMember = regularStaff.find(s => s.defaultPostId === post.id) || 
                                  // Fallback logic for migration
                                  regularStaff.find(s => s.defaultSiteId === site.id && s.defaultShift === post.shift && !s.defaultPostId);
              
              if (staffMember) {
                  const isLeave = finalLeaveRequests.some(r => r.staffId === staffMember.id && r.dateStr === day.dateStr);
                  if (!isLeave) {
                      assignments.push({ 
                          dateStr: day.dateStr, 
                          siteId: site.id, 
                          shift: post.shift, 
                          staffId: staffMember.id 
                      });
                  }
              }
          }
      }
  }

  // Phase 3: 機動人員填補空缺 (Fill Gaps with Mobile)
  // 找出所有「原本該有人但沒人」的格子 (即正班請假造成的空缺)
  for (const day of days) {
      // 隨機打亂機動人員順序，避免都是同一人先搶到班，達到工時平均
      const shuffledMobile = [...mobileStaff].sort(() => Math.random() - 0.5);

      for (const site of state.sites) {
          if (!site.posts) continue;

          for (const post of site.posts) {
              const shift = post.shift;
              
              // 檢查這個位置是否已經有人 (正班)
              const existing = assignments.find(a => a.dateStr === day.dateStr && a.siteId === site.id && a.shift === shift);
              
              if (!existing) {
                  // 這是一個空缺！需要機動人員
                  // 尋找可用的機動人員
                  const candidate = shuffledMobile.find(m => {
                      // 1. 案場限制檢查
                      if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(site.id)) {
                          return false;
                      }
                      
                      // 2. 可用性檢查 (含勞基法檢查 & 檢查 Phase 1 產生的休假)
                      const status = isStaffAvailable(m, day.dateStr, shift as ShiftType, assignments, finalLeaveRequests, days);
                      return status.available;
                  });

                  if (candidate) {
                      assignments.push({ 
                          dateStr: day.dateStr, 
                          siteId: site.id, 
                          shift: shift as ShiftType, 
                          staffId: candidate.id 
                      });
                  }
              }
          }
      }
  }

  // 回傳 assignments 以及「包含新生成休假」的完整休假表
  return { assignments, generatedLeaves: finalLeaveRequests };
};

export const fillEmptySlotsWithMobile = (state: ScheduleState, currentAssignments: ScheduleAssignment[]): ScheduleAssignment[] => {
    // 這裡重用上面的邏輯概念，但基於傳入的 state.leaveRequests (應包含已生成的休假)
    const assignments = [...currentAssignments];
    const days = getMonthDays(state.year, state.month);
    const mobileStaff = state.staff.filter(s => s.role === StaffRole.Mobile);
    
    // 重新排序 Mobile，優先選「班最少」的人，以達到勞逸不均的平衡
    const getWorkCount = (sid: string) => assignments.filter(a => a.staffId === sid).length;

    for (const day of days) {
        // 動態排序：目前班最少的人優先排
        const sortedMobile = [...mobileStaff].sort((a, b) => getWorkCount(a.id) - getWorkCount(b.id));

        for (const site of state.sites) {
            if (!site.posts) continue;

            for (const post of site.posts) {
                const shift = post.shift;
                const existing = assignments.find(a => a.dateStr === day.dateStr && a.siteId === site.id && a.shift === shift);
                if (!existing) {
                     const candidate = sortedMobile.find(m => {
                        if (m.allowedSiteIds && m.allowedSiteIds.length > 0 && !m.allowedSiteIds.includes(site.id)) return false;
                        return isStaffAvailable(m, day.dateStr, shift as ShiftType, assignments, state.leaveRequests, days).available;
                     });
                     if (candidate) {
                         assignments.push({ dateStr: day.dateStr, siteId: site.id, shift: shift as ShiftType, staffId: candidate.id });
                     }
                }
            }
        }
    }
    return assignments;
};
