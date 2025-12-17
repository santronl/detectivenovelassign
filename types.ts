
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

export interface Clue {
  id: string;
  name: string;
  found_location: string;
  status: '未解决' | '已解释' | '误导项';
  description?: string;
}

export interface Alibi {
  id: string;
  character_id: string;
  time_period: string;
  location: string;
  status: '确凿' | '模糊' | '无证明';
  details?: string;
}

export interface Point {
  x: number;
  y: number;
}

// Support multiple maps
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
}

// Timeline Management
export interface TimePoint {
  id: string;
  label: string; // e.g. "12:00", "案发时"
  order: number;
}

// Character location at a specific time
export interface CharacterPlacement {
  characterId: string;
  mapId: string;
  x: number; // percentage
  y: number; // percentage
}

// Map: TimePointId -> [CharacterPlacement]
export type TimelineData = Record<string, CharacterPlacement[]>;

export interface AppState {
  characters: Character[];
  relationships: Relationship[];
  relationshipDefs: RelationshipDef[];
  clues: Clue[];
  
  // Map & Timeline State
  maps: MapDoc[];
  spaces: Space[];
  timePoints: TimePoint[];
  timelineData: TimelineData; // Locations of characters at specific times
  
  // UI Selection State
  currentMapId: string;
  currentTimeId: string;
  graphActiveCharacterIds: string[];

  // Graph Layout Persistence
  graphLayout: Record<string, { x: number; y: number }>;
}

// Action types for the reducer or state update
export type ActionType = 
  | { type: 'IMPORT_CHARACTERS'; payload: Character[] }
  | { type: 'UPDATE_MAP'; payload: Space[] }
  | { type: 'RESET' };

export const INITIAL_STATE: AppState = {
  characters: [],
  relationships: [],
  relationshipDefs: [
    { id: '1', label: '仇敌', color: '#ef4444' }, // Red
    { id: '2', label: '盟友', color: '#22c55e' }, // Green
    { id: '3', label: '亲属', color: '#3b82f6' }, // Blue
    { id: '4', label: '普通', color: '#94a3b8' }, // Slate
  ],
  clues: [],
  
  maps: [{ id: 'default', name: '主场景' }],
  spaces: [],
  timePoints: [{ id: 't1', label: '初始时刻', order: 0 }],
  timelineData: {},
  
  currentMapId: 'default',
  currentTimeId: 't1',
  graphActiveCharacterIds: [],
  graphLayout: {}
};
