
export interface Character {
  id: string;
  name: string;
  raw_info?: string;
  role?: string;
  description?: string;
  note?: string; // User-added detailed remarks
}

export interface Relationship {
  source: string; // Character ID
  target: string; // Character ID
  relation: string; // e.g., "情侣", "仇敌"
  value?: number;
}

export interface RelationshipDef {
  id: string;
  label: string;
  color: string;
}

export interface CharacterGroup {
  id: string;
  label: string; // The group name/note
  characterIds: string[];
  color: string;
}

export interface Clue {
  id: string;
  name: string;
  found_location: string;
  status: '未解决' | '已解释' | '误导项';
  description?: string;
  imageUrl?: string; // Base64 encoded compressed image
}

export interface Alibi {
  character_ids: string[]; // Changed from character_id to support multiple characters
  time_period: string;
  location: string;
  status: '确凿' | '模糊' | '无证明';
  details?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface MapDoc {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface Space {
  id: string;
  mapId: string; // Link to specific map
  name: string;
  attributes: string[]; // e.g., "上锁", "密室"
  connected_to: string[]; // Space IDs or Names
  coordinates?: Point[]; // Array of percentages {x: 0-100, y: 0-100}
  note?: string; // Annotation for the scene details
}

export interface TimePoint {
  id: string;
  label: string; // e.g. "12:00", "案发时"
  order: number;
}

export interface CharacterPlacement {
  characterId: string;
  mapId: string;
  x: number; // percentage
  y: number; // percentage
}

export interface ItemPlacement {
  clueId: string;
  mapId: string;
  x: number;
  y: number;
}

export type TimelineData = Record<string, CharacterPlacement[]>;
export type ItemTimelineData = Record<string, ItemPlacement[]>;

export interface AppState {
  characters: Character[];
  relationships: Relationship[];
  relationshipDefs: RelationshipDef[];
  characterGroups: CharacterGroup[];
  clues: Clue[];
  alibis: Alibi[];
  
  maps: MapDoc[];
  spaces: Space[];
  timePoints: TimePoint[];
  timelineData: TimelineData;
  itemTimelineData: ItemTimelineData; // Added: Track clues on map
  
  currentMapId: string;
  currentTimeId: string;
  graphActiveCharacterIds: string[];

  graphLayout: Record<string, { x: number; y: number }>;
  
  // Persistence Tracking
  lastFileName: string | null;
}

export const INITIAL_STATE: AppState = {
  characters: [],
  relationships: [],
  relationshipDefs: [
    { id: '1', label: '仇敌', color: '#ef4444' },
    { id: '2', label: '盟友', color: '#22c55e' },
    { id: '3', label: '亲属', color: '#3b82f6' },
    { id: '4', label: '普通', color: '#94a3b8' },
  ],
  characterGroups: [],
  clues: [],
  alibis: [],
  
  maps: [{ id: 'default', name: '主场景' }],
  spaces: [],
  timePoints: [{ id: 't1', label: '初始时刻', order: 0 }],
  timelineData: {},
  itemTimelineData: {}, // Added
  
  currentMapId: 'default',
  currentTimeId: 't1',
  graphActiveCharacterIds: [],
  graphLayout: {},
  lastFileName: null
};
