
export interface Character {
  id: string;
  name: string;
  raw_info?: string;
  role?: string;
  description?: string;
  note?: string; 
  imageId?: string; 
  gender?: 'M' | 'F' | 'Unknown';
  isVirtual?: boolean; // 新增：标志是否为虚拟占位人物
}

export interface FamilyLink {
  id: string;
  type: 'marriage' | 'parent_child' | 'other_same_level'; // 新增：同一水平线的其他关系
  partners?: string[]; // Array of character IDs for marriage or same-level links
  parents?: string[];  // Array of parent character IDs
  child?: string;      // Character ID of the child
  label?: string;      // 新增：关系的自定义标签
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

export interface TimelineSegment {
  id: string;
  characterId: string;
  startSlot: number; 
  endSlot: number;   
  locationName: string;
  timeLabel?: string; 
  color?: string;
  relatedTimePointId?: string;
}

export interface TimePeriodLabel {
  id: string;
  label: string;
  startSlot: number;
  endSlot: number;
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

export interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  data: Omit<AppState, 'saveSlots' | 'fileHandle'>; // 避免递归存储 saveSlots
}

export interface AppState {
  characters: Character[];
  graphPeopleRelationships: Relationship[];
  graphItemRelationships: Relationship[];
  
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
  
  timelineSegments: TimelineSegment[];
  timelinePeriods: TimePeriodLabel[]; 
  timelineActiveCharIds: string[];    
  timelineCharOrder: string[];        
  timelineSlotCount: number;      

  familyLinks: FamilyLink[];
  familyActiveCharIds: string[];
  familyCustomOrder: Record<string, string[]>; // 新增：保存家族分支内的节点排序
  familyRootCoords: Record<string, { x: number; y: number }>; // 新增：保存家族树根节点的绝对坐标

  currentMapId: string;
  currentTimeId: string;

  graphActiveCharacterIds: string[];
  graphLayout: Record<string, { x: number; y: number }>;
  
  itemGraphActiveIds: string[]; 
  itemGraphLayout: Record<string, { x: number; y: number }>;

  graphSubTab: 'people' | 'items';
  lastFileName: string | null;
  
  saveSlots: SaveSlot[]; // 多阶段存档列表
}

export const INITIAL_STATE: AppState = {
  characters: [],
  graphPeopleRelationships: [],
  graphItemRelationships: [],
  relationshipDefs: [
    { id: '1', label: '仇敌', color: '#ef4444' },
    { id: '2', label: '盟友', color: '#22c55e' },
    { id: '3', label: '持有', color: '#f59e0b' },
    { id: '4', label: '亲属', color: '#3b82f6' },
    { id: '5', label: '配套', color: '#10b981' },
    { id: '6', label: '包含', color: '#8b5cf6' },
    { id: '7', label: '父子/母子', color: '#ec4899' },
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
  timelinePeriods: [],
  timelineActiveCharIds: [],
  timelineCharOrder: [],
  timelineSlotCount: 24, 
  
  familyLinks: [],
  familyActiveCharIds: [],
  familyCustomOrder: {},
  familyRootCoords: {},

  currentMapId: 'default',
  currentTimeId: 't1',
  
  graphActiveCharacterIds: [],
  graphLayout: {},
  
  itemGraphActiveIds: [],
  itemGraphLayout: {},
  
  graphSubTab: 'people',
  lastFileName: null,
  
  saveSlots: []
};
