import { GoogleGenAI, Type } from "@google/genai";
import { AppState } from "../types";

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

const SYSTEM_INSTRUCTION = `
You are the backend logic engine for a "Mystery Novel Reader Assistant" (推理小说阅读辅助工具).
Your goal is to structure unstructured user inputs into strictly formatted JSON data.

Global Constraints:
1. Language: All output values (names, descriptions, statuses, reasons) must be in Simplified Chinese (简体中文).
2. No KPIs: Do NOT output any performance metrics or vanity stats.

Core Capabilities & Rules:

1. Dynamic Relationship Graph (人物关系网)
   - Extract relationships.
   - Types: "情侣", "仇敌", "债权人", "共犯", "亲属", "朋友", "陌生人".

2. Evidence Board (证物公告板)
   - Manage physical evidence.
   - Status Values: MUST use "未解决" (Unsolved), "已解释" (Explained), "误导项" (Red Herring).

3. Map & Spatial Management (地图空间管理)
   - Manage spatial nodes.
   - Attributes: "上锁", "开放", "密室", "未探索", "案发地".
   - Note: Do not track alibis anymore, focus on physical layout.

Input Context:
You will receive the current state of the database (JSON) and a new text snippet from the user.
Update the database based on the new text. merge intelligently.
`;

export const analyzeMysteryText = async (
  text: string, 
  currentState: AppState
): Promise<Partial<AppState>> => {
  if (!API_KEY) {
    console.warn("No API Key provided");
    return {};
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: `Current Database State: ${JSON.stringify(currentState)}` },
            { text: `New Narrative Text to Analyze: ${text}` },
            { text: "Based on the new text, return the UPDATED lists for characters (if details changed), relationships, spaces, and clues. Keep existing data if not contradicted." }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                characters: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            role: { type: Type.STRING },
                            description: { type: Type.STRING }
                        }
                    }
                },
                relationships: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            source: { type: Type.STRING, description: "Name of source character" },
                            target: { type: Type.STRING, description: "Name of target character" },
                            relation: { type: Type.STRING }
                        }
                    }
                },
                clues: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            found_location: { type: Type.STRING },
                            status: { type: Type.STRING, enum: ["未解决", "已解释", "误导项"] },
                            description: { type: Type.STRING }
                        }
                    }
                },
                spaces: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            attributes: { type: Type.ARRAY, items: { type: Type.STRING } },
                            connected_to: { type: Type.ARRAY, items: { type: Type.STRING } }
                        }
                    }
                }
            }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) return {};
    
    const parsed = JSON.parse(resultText);
    
    const findId = (name: string): string => {
        const existing = currentState.characters.find(c => c.name === name);
        return existing ? existing.id : crypto.randomUUID();
    };

    const newRelationships = (parsed.relationships || []).map((r: any) => ({
        source: findId(r.source),
        target: findId(r.target),
        relation: r.relation
    }));

    const newClues = (parsed.clues || []).map((c: any) => ({
        id: crypto.randomUUID(),
        ...c
    }));
    
    // Assign new spaces to current map or default
    const newSpaces = (parsed.spaces || []).map((s: any) => ({
        id: crypto.randomUUID(),
        mapId: currentState.currentMapId || 'default',
        ...s
    }));

    return {
        relationships: newRelationships,
        clues: newClues,
        spaces: newSpaces
    };

  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {};
  }
};