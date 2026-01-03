
import { GoogleGenAI, Type } from "@google/genai";
import { ScheduleState, ShiftType, StaffRole, Staff, Site, ScheduleAssignment } from "../types";
import { getMonthDays, getRequiredLeaveDays, isBigMonth } from "../utils/dateUtils";
import { format, parse, isValid } from 'date-fns';

// 獨立匯出 Prompt 建構函式，供 UI Debug 使用
export const constructSchedulePrompt = (
  currentState: ScheduleState,
  draftAssignments: ScheduleAssignment[]
): string => {
  const requiredLeave = getRequiredLeaveDays(currentState.year, currentState.month);
  const daysInMonth = getMonthDays(currentState.year, currentState.month).length;
  const isBig = isBigMonth(currentState.year, currentState.month);
  const monthType = isBig ? "BIG Month (31 Days)" : "SMALL Month (<31 Days)";
  
  const sitesInfo = currentState.sites.map(s => {
      const postsStr = (s.posts || []).map(p => `[${p.name}-Shift:${p.shift}]`).join(', ');
      return `- ID: ${s.id}, Name: ${s.name}, Posts: ${postsStr}`;
  }).join('\n');
  
  const staffInfo = currentState.staff.map(s => {
    let base = `- ID: ${s.id}, Name: ${s.name}, Role: ${s.role}`;
    if (s.role === StaffRole.Regular) {
      base += `, Default Site: ${s.defaultSiteId}, Default Shift: ${s.defaultShift}`;
    } else if (s.role === StaffRole.Mobile) {
        let allowedShiftsStr = (s.allowedShifts || []).join(' & ');
        let allowedSitesStr = (s.allowedSiteIds || []).length > 0 ? s.allowedSiteIds?.join(', ') : 'ALL';
        base += `, Allowed Shifts: [${allowedShiftsStr}], Allowed Sites: [${allowedSitesStr}]`;
    }
    return base;
  }).join('\n');

  // 明確列出已有的休假 (Designated + Manual)
  const leaveRequestsInfo = currentState.leaveRequests.map(l => 
    `- Staff ${l.staffId} OFF on ${l.dateStr} (${l.isDesignated ? 'Designated/Green' : 'Manual/Red'})`
  ).join('\n');

  // 簡化 Draft JSON
  const simplifiedDraft = draftAssignments.map(a => ({
      d: a.dateStr,
      s: a.siteId,
      sh: a.shift,
      uid: a.staffId
  }));
  const draftJson = JSON.stringify(simplifiedDraft);

  return `
    You are an expert Security Schedule Optimizer.
    
    CURRENT MONTH CONTEXT:
    - Type: ${monthType}
    - Total Days: ${daysInMonth}
    - REQUIRED TOTAL LEAVES PER PERSON: ${requiredLeave} days
    
    CRITICAL RULE: **TOTAL LEAVES = Designated Leaves + Manual Leaves + AI Generated Leaves**
    The sum MUST equal exactly ${requiredLeave} for EVERY staff member.
    
    PRIORITIES:
    1. **Work Rhythm**: Prioritize "Work 3 Rest 1" or "Work 4 Rest 1". Avoid "Work 5 Rest 1" if possible.
    2. **Max Consecutive Work**: STRICTLY MAX 6 DAYS. 7 consecutive work days is ILLEGAL.
    3. **Total Leave Compliance**: If a staff member already has ${requiredLeave} leaves (Designated+Manual), DO NOT schedule more leaves. If they have less, you MUST schedule the remaining days as leaves.
    
    HARD CONSTRAINTS:
    1. Regular Staff MUST stay at their default site/shift/post.
    2. Mobile Staff can ONLY work their allowed shifts/sites.
    3. NO Night-to-Day rotation (Date X Night -> Date X+1 Day is forbidden).
    4. ONE SLOT = ONE PERSON.

    INPUT DATA:
    SITES (With Posts):
    ${sitesInfo}
    
    STAFF:
    ${staffInfo}
    
    EXISTING LEAVES (Designated & Manual):
    ${leaveRequestsInfo}
    
    DRAFT SCHEDULE (d=date, s=site, sh=shift, uid=staffId):
    ${draftJson}

    OUTPUT INSTRUCTIONS:
    - Return a JSON array of assigned work slots.
    - Any date NOT in the returned list for a specific staff member implies a LEAVE.
    - Ensure dateStr format is YYYY-MM-DD.
  `;
};

export const optimizeScheduleWithAI = async (
  currentState: ScheduleState,
  draftAssignments: ScheduleAssignment[]
): Promise<ScheduleAssignment[]> => {
  // Use process.env.API_KEY exclusively as per guidelines.
  const apiKey = process.env.API_KEY as string;
  
  // 若無 API Key，直接回傳草稿，不做處理
  if (!apiKey) {
      return draftAssignments;
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = constructSchedulePrompt(currentState, draftAssignments);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              dateStr: { type: Type.STRING },
              siteId: { type: Type.STRING },
              shift: { type: Type.STRING },
              staffId: { type: Type.STRING }
            }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    
    const parsed = JSON.parse(jsonText);
    
    if (Array.isArray(parsed)) {
        // 1. 初步過濾與標準化
        const rawAssignments = parsed.map((item: any) => {
            let shift = item.shift?.toLowerCase().includes('night') ? ShiftType.Night : ShiftType.Day;
            const staffMember = currentState.staff.find(s => s.id === item.staffId);
            
            // 重要：使用系統內部的 siteId，而非 AI 回傳的 (避免字串微小差異)
            const siteObj = currentState.sites.find(s => s.id === item.siteId);
            
            if (!staffMember || !siteObj) return null;

            // 重要：標準化日期格式，確保與系統一致 (yyyy-MM-dd)
            let normalizedDateStr = item.dateStr;
            try {
                // 嘗試解析 AI 回傳的日期，並強制轉為標準格式
                const parsedDate = parse(item.dateStr, 'yyyy-MM-dd', new Date());
                if (isValid(parsedDate)) {
                    normalizedDateStr = format(parsedDate, 'yyyy-MM-dd');
                }
            } catch (e) {
                console.warn("Date parsing warning", e);
            }

            // 正班人員必須回到自己的案場與班別
            if (staffMember.role === StaffRole.Regular) {
                if (staffMember.defaultSiteId && staffMember.defaultSiteId !== siteObj.id) return null;
                if (staffMember.defaultShift && staffMember.defaultShift !== shift) return null;
            }

            // 機動人員資格檢查
            if (staffMember.role === StaffRole.Mobile) {
                if (staffMember.allowedShifts && staffMember.allowedShifts.length > 0) {
                    if (!staffMember.allowedShifts.includes(shift)) return null;
                }
                if (staffMember.allowedSiteIds && staffMember.allowedSiteIds.length > 0) {
                    if (!staffMember.allowedSiteIds.includes(siteObj.id)) return null;
                }
            }

            return { dateStr: normalizedDateStr, siteId: siteObj.id, shift, staffId: item.staffId };
        }).filter((item: any) => item !== null) as ScheduleAssignment[];

        // 2. 嚴格去重 (Deduplication)
        const slotMap = new Map<string, ScheduleAssignment>();

        for (const assignment of rawAssignments) {
            const slotKey = `${assignment.dateStr}-${assignment.siteId}-${assignment.shift}`;
            const existing = slotMap.get(slotKey);

            if (!existing) {
                slotMap.set(slotKey, assignment);
            } else {
                const currentStaff = currentState.staff.find(s => s.id === assignment.staffId);
                const existingStaff = currentState.staff.find(s => s.id === existing.staffId);
                
                // 規則：正班人員 (Regular) 優先於 機動人員 (Mobile)
                if (currentStaff?.role === StaffRole.Regular && existingStaff?.role === StaffRole.Mobile) {
                    slotMap.set(slotKey, assignment);
                }
            }
        }

        return Array.from(slotMap.values());
    }
    return parsed;
  } catch (error) {
    console.error("AI Optimization Error:", error);
    // AI 失敗時，回傳原始草稿
    return draftAssignments;
  }
};
