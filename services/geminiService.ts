
// AI Functionality for extracting structured entities from mystery fiction text using Gemini.
import { GoogleGenAI, Type } from "@google/genai";
import { AppState, Character, Relationship, Clue, Alibi } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uses Gemini AI to analyze raw mystery text and return partial application state.
 * Extracts characters, their relationships, clues, and alibis with high reasoning capabilities.
 */
export const analyzeMysteryText = async (
  text: string, 
  currentState: AppState
): Promise<Partial<AppState>> => {
    if (!text.trim()) return {};

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `你是一个专业的推理小说分析师。请分析下方的文本，提取其中的人物、人物关系、发现的线索（证物）以及人物的不在场证明。
            
文本内容：
${text}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        characters: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING, description: "人物姓名" },
                                    role: { type: Type.STRING, description: "身份/职业/角色" },
                                    description: { type: Type.STRING, description: "简短描述" }
                                },
                                required: ["name"]
                            }
                        },
                        relationships: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    source: { type: Type.STRING, description: "人物A姓名" },
                                    target: { type: Type.STRING, description: "人物B姓名" },
                                    relation: { type: Type.STRING, description: "关系描述" }
                                },
                                required: ["source", "target", "relation"]
                            }
                        },
                        clues: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING, description: "证物名称" },
                                    location: { type: Type.STRING, description: "地点" },
                                    status: { type: Type.STRING, description: "'未解决' | '已解释' | '误导项'" },
                                    description: { type: Type.STRING }
                                },
                                required: ["name", "status"]
                            }
                        },
                        alibis: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    characterName: { type: Type.STRING, description: "涉及人物" },
                                    time: { type: Type.STRING, description: "时间" },
                                    location: { type: Type.STRING, description: "地点" },
                                    status: { type: Type.STRING, description: "'确凿' | '模糊' | '无证明'" },
                                    details: { type: Type.STRING }
                                },
                                required: ["characterName", "time", "location", "status"]
                            }
                        }
                    }
                }
            }
        });

        const rawJson = response.text || "{}";
        const data = JSON.parse(rawJson);
        
        // Map new characters and generate unique IDs
        const newCharacters: Character[] = (data.characters || []).map((c: any) => ({
            id: crypto.randomUUID(),
            name: c.name,
            raw_info: c.role || c.description || ""
        }));

        const combinedChars = [...currentState.characters, ...newCharacters];
        const findCharId = (name: string) => combinedChars.find(c => c.name === name)?.id;

        // Map relationships using resolved IDs
        const newRelationships: Relationship[] = (data.relationships || [])
            .map((r: any) => {
                const sId = findCharId(r.source);
                const tId = findCharId(r.target);
                if (sId && tId) return { source: sId, target: tId, relation: r.relation };
                return null;
            })
            .filter(Boolean) as Relationship[];

        // Map clues
        const newClues: Clue[] = (data.clues || []).map((c: any) => ({
            id: crypto.randomUUID(),
            name: c.name,
            found_location: c.location || "未知",
            status: (['未解决', '已解释', '误导项'].includes(c.status) ? c.status : '未解决') as Clue['status'],
            description: c.description
        }));

        // Map alibis using resolved IDs
        const newAlibis: Alibi[] = (data.alibis || [])
            .map((a: any) => {
                const cId = findCharId(a.characterName);
                if (cId) return {
                    character_id: cId,
                    time_period: a.time,
                    location: a.location,
                    status: (['确凿', '模糊', '无证明'].includes(a.status) ? a.status : '模糊') as Alibi['status'],
                    details: a.details
                };
                return null;
            })
            .filter(Boolean) as Alibi[];

        return {
            characters: combinedChars,
            relationships: [...currentState.relationships, ...newRelationships],
            clues: [...currentState.clues, ...newClues],
            alibis: [...currentState.alibis, ...newAlibis]
        };
    } catch (error) {
        console.error("Gemini analysis error:", error);
        return {};
    }
};
