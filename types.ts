
export interface Character {
  id: string;
  name: string;
  raw_info?: string;
  role?: string;
  description?: string;
  note?: string; 
  imageId?: string; 
}

export interface Relationship {
  source: string; 
  target: string; 
  relation: string; 
  value?: number;
}

export interface RelationshipDef {
  id: string;
  label: string;
  color: string;
}

export interface CharacterGroup {
  id: string;
  label: string; 
  characterIds: string[];
  color: string;
}

export interface LocationItem {
  id: string;
  name: string;
  note?: string;
  clueId?: string; 
}

export interface Location {
  id: string;
  name: string;
  note?: string;
  mapId?: string;   
  spaceId?: string; 
  items?: LocationItem[]; 
  imageId?: string; 
}

export interface Clue {
  id: string;
  name: string;
  found_location: string;
  locationId?: string; 
  locationItemId?: string; 
  status: '未解决' | '已解释' | '误导项';
  description?: string;
  imageId?: string; 
}

export interface Alibi {
  character_ids: string[];
  time_period: string;
  timePointId?: string; 
  location: string;    
  locationId?: string; 
  status: '确凿' | '模糊' | '无证明';
  details?: string;
}

// --- 时间线片段数据定义 ---
export interface TimelineSegment {
  id: string;
  characterId: string;
  startSlot: number; // 起始格索引
  endSlot: number;   // 结束格索引
  locationName: string;
  timeLabel?: string; // 选填的时间显示文字
  color?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface MapDoc {
  id: string;
  name: string;
  imageId?: string;
}

export interface Space {
  id: string;
  mapId: string; 
  name: string;
  attributes: string[]; 
  connected_to: string[]; 
  coordinates?: Point[]; 
  note?: string; 
}

export interface TimePoint {
  id: string;
  label: string; 
  order: number;
}

export interface CharacterPlacement {
  characterId: string;
  mapId: string;
  x: number; 
  y: number; 
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
  locations: Location[]; 
  
  maps: MapDoc[];
  spaces: Space[];
  timePoints: TimePoint[];
  timelineData: TimelineData;
  itemTimelineData: ItemTimelineData; 
  
  // 时间线新字段
  timelineSegments: TimelineSegment[];
  timelineActiveCharIds: string[]; // 时间线图谱显示的活动角色
  timelineSlotCount: number;      // 总格子数

  currentMapId: string;
  currentTimeId: string;
  graphActiveCharacterIds: string[];

  graphLayout: Record<string, { x: number; y: number }>;
  
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
  locations: [],
  
  maps: [{ id: 'default', name: '主场景' }],
  spaces: [],
  timePoints: [{ id: 't1', label: '初始时刻', order: 0 }],
  timelineData: {},
  itemTimelineData: {}, 

  timelineSegments: [],
  timelineActiveCharIds: [],
  timelineSlotCount: 24, // 默认24格
  
  currentMapId: 'default',
  currentTimeId: 't1',
  graphActiveCharacterIds: [],
  graphLayout: {},
  lastFileName: null
};
