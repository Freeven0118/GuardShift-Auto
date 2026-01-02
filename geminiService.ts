
import { GoogleGenAI, Type } from "@google/genai";
import { ScheduleState, ShiftType, StaffRole, Staff, Site, ScheduleAssignment } from "./types";
import { getMonthDays, getRequiredLeaveDays } from "./utils/dateUtils";

export const optimizeScheduleWithAI = async (
  currentState: ScheduleState,
  draftAssignments: ScheduleAssignment[]
): Promise<ScheduleAssignment[]> => {
  // Use process.env.API_KEY exclusively as per guidelines.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  const days = getMonthDays(currentState.year, currentState.month);
  const requiredLeave = getRequiredLeaveDays(currentState.year, currentState.month);
  
  const sitesInfo = currentState.sites.map(s => `- ID: ${s.id}, Name: ${s.name}`).join('\n');
  
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

  const leaveRequestsInfo = currentState.leaveRequests.map(l => 
    `- Staff ${l.staffId} wants off on ${l.dateStr} (Designated: ${l.isDesignated})`
  ).join('\n');

  const draftJson = JSON.stringify(draftAssignments);

  const prompt = `
    You are an expert Security Schedule Optimizer.
    I have a DRAFT SCHEDULE. Optimize it to avoid 5+ consecutive work days and respect exactly ${requiredLeave} off days.
    
    HARD CONSTRAINTS:
    1. Regular Staff must stay at their default site/shift.
    2. Mobile Staff can only work their allowed shifts/sites.
    3. Respect all designated leaves.
    4. NO Night-to-Day rotation (Date X Night -> Date X+1 Day is forbidden).

    INPUT:
    Target TOTAL Off Days: ${requiredLeave}
    SITES: ${sitesInfo}
    STAFF: ${staffInfo}
    LEAVES: ${leaveRequestsInfo}
    DRAFT: ${draftJson}

    OUTPUT:
    Return JSON array of { dateStr, siteId, shift, staffId }.
  `;

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
        return parsed.map((item: any) => {
            let shift = item.shift?.toLowerCase().includes('night') ? ShiftType.Night : ShiftType.Day;
            const staffMember = currentState.staff.find(s => s.id === item.staffId);
            if (!staffMember) return null;

            if (staffMember.role === StaffRole.Regular && staffMember.defaultSiteId === item.siteId) {
                if (staffMember.defaultShift) shift = staffMember.defaultShift; 
            }

            if (staffMember.role === StaffRole.Mobile) {
                if (staffMember.allowedShifts && staffMember.allowedShifts.length > 0) {
                    if (!staffMember.allowedShifts.includes(shift)) return null;
                }
                if (staffMember.allowedSiteIds && staffMember.allowedSiteIds.length > 0) {
                    if (!staffMember.allowedSiteIds.includes(item.siteId)) return null;
                }
            }

            return { dateStr: item.dateStr, siteId: item.siteId, shift, staffId: item.staffId };
        }).filter((item: any) => item !== null);
    }
    return parsed;
  } catch (error) {
    console.error("AI Optimization Error:", error);
    throw error;
  }
};
