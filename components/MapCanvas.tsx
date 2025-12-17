import React, { useState, useRef, useEffect } from 'react';
import { Space, Point, MapDoc, TimePoint, CharacterPlacement, Character } from '../types';
import { Upload, Plus, X, Trash2, MapPin, Clock, GripVertical } from 'lucide-react';

interface Props {
  maps: MapDoc[];
  currentMapId: string;
  spaces: Space[]; // All spaces
  
  // Timeline Props
  timePoints: TimePoint[];
  currentTimeId: string;
  timelineData: Record<string, CharacterPlacement[]>; // TimeID -> Placements
  characters: Character[];

  // Actions
  onUpdateMaps: (maps: MapDoc[]) => void;
  onCreateMap: (name: string) => void;
  onSelectMap: (id: string) => void;
  onUpdateSpaces: (spaces: Space[]) => void;
  onUpdateTimePoints: (points: TimePoint[]) => void;
  onSelectTime: (id: string) => void;
  onUpdatePlacements: (timeId: string, placements: CharacterPlacement[]) => void;
}

// Safe ID Generator
const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

const MapCanvas: React.FC<Props> = ({ 
    maps, currentMapId, spaces,
    timePoints, currentTimeId, timelineData, characters,
    onUpdateMaps, onCreateMap, onSelectMap, onUpdateSpaces,
    onUpdateTimePoints, onSelectTime, onUpdatePlacements
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; attributes: string[] } | null>(null);
  const [dragOverMap, setDragOverMap] = useState(false);
  
  // Timeline Modal State
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [newTimeName, setNewTimeName] = useState("");
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Map Modal State
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const mapInputRef = useRef<HTMLInputElement>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMap = maps.find(m => m.id === currentMapId) || maps[0];
  const currentSpaces = spaces.filter(s => s.mapId === currentMap.id);
  const currentPlacements = timelineData[currentTimeId] || [];

  // Focus input when timeline modal opens
  useEffect(() => {
    if (isTimeModalOpen && timeInputRef.current) {
        setTimeout(() => timeInputRef.current?.focus(), 100);
    }
  }, [isTimeModalOpen]);

  // Focus input when map modal opens
  useEffect(() => {
    if (isMapModalOpen && mapInputRef.current) {
        setTimeout(() => mapInputRef.current?.focus(), 100);
    }
  }, [isMapModalOpen]);

  // --- Map Management ---
  const handleOpenMapModal = () => {
      setNewMapName("");
      setIsMapModalOpen(true);
  };

  const handleConfirmAddMap = () => {
      if(newMapName.trim()) {
          onCreateMap(newMapName.trim());
          setIsMapModalOpen(false);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === 'string') {
            onUpdateMaps(maps.map(m => m.id === currentMapId ? { ...m, imageUrl: result } : m));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Timeline Management ---
  const handleOpenTimeModal = () => {
      setNewTimeName("");
      setIsTimeModalOpen(true);
  };

  const handleSaveTimePoint = () => {
      if (!newTimeName.trim()) return;
      
      const newTime: TimePoint = { 
          id: generateId(), 
          label: newTimeName.trim(), 
          order: timePoints.length 
      };
      
      onUpdateTimePoints([...timePoints, newTime]);
      onSelectTime(newTime.id);
      setIsTimeModalOpen(false);
  };

  const handleDeleteTimePoint = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (timePoints.length <= 1) {
          alert("至少保留一个时间点");
          return;
      }
      if (confirm("确定删除该时间点吗？")) {
          const newPoints = timePoints.filter(t => t.id !== id);
          onUpdateTimePoints(newPoints);
          if (currentTimeId === id) {
              onSelectTime(newPoints[0].id);
          }
      }
  };

  // Timeline Sorting (Drag & Drop)
  const handleTimeDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData("application/react-dnd-time-id", id);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleTimeDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("application/react-dnd-time-id");
      if (!draggedId || draggedId === targetId) return;

      const fromIndex = timePoints.findIndex(t => t.id === draggedId);
      const toIndex = timePoints.findIndex(t => t.id === targetId);

      if (fromIndex === -1 || toIndex === -1) return;

      const newPoints = [...timePoints];
      const [movedItem] = newPoints.splice(fromIndex, 1);
      newPoints.splice(toIndex, 0, movedItem);

      // Re-assign order based on new index
      const reordered = newPoints.map((p, i) => ({ ...p, order: i }));
      onUpdateTimePoints(reordered);
  };

  // --- Drag & Drop (Characters) ---
  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverMap(true);
  };

  const handleDragLeave = () => {
      setDragOverMap(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverMap(false);
      
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const charId = e.dataTransfer.getData("application/react-dnd-char-id");
      
      if (charId) {
          // Add or Update placement
          const newPlacement: CharacterPlacement = {
              characterId: charId,
              mapId: currentMapId,
              x, y
          };
          
          // Remove old placement for this character in this time slot (if any)
          const others = currentPlacements.filter(p => p.characterId !== charId);
          onUpdatePlacements(currentTimeId, [...others, newPlacement]);
      }
  };

  // Drag existing token
  const handleTokenDragStart = (e: React.DragEvent, charId: string) => {
      e.dataTransfer.setData("application/react-dnd-char-id", charId);
      e.dataTransfer.setData("application/react-dnd-move-existing", "true");
      e.stopPropagation(); // Prevent map from thinking we are drawing
  };

  // Remove token (Right click)
  const handleTokenContextMenu = (e: React.MouseEvent, charId: string) => {
      e.preventDefault();
      const others = currentPlacements.filter(p => p.characterId !== charId);
      onUpdatePlacements(currentTimeId, others);
  };

  // --- Drawing Logic ---
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isDrawing || !containerRef.current) return;
    // Don't draw if clicked on a token (handled by stopPropagation usually)
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCurrentPoints(prev => [...prev, { x, y }]);
  };

  const finishShape = () => {
    if (currentPoints.length < 3) {
      alert("请至少绘制3个点以构成区域");
      return;
    }
    const newSpace: Space = {
      id: generateId(),
      mapId: currentMapId,
      name: "未命名区域",
      attributes: [],
      connected_to: [],
      coordinates: currentPoints
    };
    onUpdateSpaces([...spaces, newSpace]);
    setCurrentPoints([]);
    setIsDrawing(false);
    setSelectedSpaceId(newSpace.id);
    setEditForm({ name: newSpace.name, attributes: [] });
  };

  // --- Attribute Editing ---
  const saveEdit = () => {
    if (!selectedSpaceId || !editForm) return;
    onUpdateSpaces(spaces.map(s => 
      s.id === selectedSpaceId 
        ? { ...s, name: editForm.name, attributes: editForm.attributes } 
        : s
    ));
    setSelectedSpaceId(null);
    setEditForm(null);
  };

  const toggleAttribute = (attr: string) => {
    if (!editForm) return;
    setEditForm(prev => {
      if (!prev) return null;
      return {
        ...prev,
        attributes: prev.attributes.includes(attr) 
          ? prev.attributes.filter(a => a !== attr)
          : [...prev.attributes, attr]
      };
    });
  };

  const pointsToString = (points: Point[]) => points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="flex flex-col gap-4 h-full relative">
      {/* Top Bar: Maps & Tools */}
      <div className="flex items-center justify-between bg-slate-800 p-2 rounded-lg border border-slate-700">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 max-w-[60%]">
            {maps.map(m => (
                <button
                    key={m.id}
                    onClick={() => onSelectMap(m.id)}
                    className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
                        currentMapId === m.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                >
                    {m.name}
                </button>
            ))}
            <button onClick={handleOpenMapModal} className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400">
                <Plus size={16} />
            </button>
        </div>

        <div className="flex gap-2">
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                title="上传当前地图背景"
            >
                <Upload size={18} />
            </button>
            {isDrawing ? (
                <>
                    <button onClick={finishShape} className="px-3 py-1.5 bg-green-600 rounded text-sm">完成</button>
                    <button onClick={() => { setIsDrawing(false); setCurrentPoints([]); }} className="px-3 py-1.5 bg-red-600 rounded text-sm">取消</button>
                </>
            ) : (
                <button 
                    onClick={() => setIsDrawing(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm"
                >
                    <Plus size={16} /> 绘制区域
                </button>
            )}
        </div>
      </div>

      {/* Main Content: Canvas & Editor */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-[500px] relative">
         {/* Canvas */}
         <div className="flex-1 relative bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
            
            {/* Map Area */}
            <div 
                ref={containerRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleCanvasClick}
                className={`relative flex-1 w-full bg-[#1e293b] overflow-hidden 
                    ${isDrawing ? 'cursor-crosshair' : 'cursor-default'}
                    ${dragOverMap ? 'ring-2 ring-blue-500 ring-inset bg-slate-800' : ''}
                `}
            >
                {!currentMap.imageUrl ? (
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none select-none">
                        <MapPin size={48} className="mb-2 opacity-50" />
                        <p>请上传背景图或直接拖入角色</p>
                    </div>
                ) : (
                    // Changed object-contain to w-full h-full to match SVG overlay exactly
                    <img src={currentMap.imageUrl} className="w-full h-full pointer-events-none select-none" alt="map" />
                )}

                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* Spaces */}
                    {currentSpaces.map(space => space.coordinates && (
                        <g key={space.id} onClick={(e) => { e.stopPropagation(); setSelectedSpaceId(space.id); setEditForm({ name: space.name, attributes: space.attributes }); }}>
                            <polygon
                                points={pointsToString(space.coordinates)}
                                className={`stroke-[0.5] hover:stroke-1 hover:fill-blue-500/40 transition-all cursor-pointer
                                    ${selectedSpaceId === space.id ? 'fill-blue-500/50 stroke-blue-300' : 'fill-blue-500/10 stroke-blue-500/30'}
                                    ${space.attributes.includes('密室') ? 'fill-purple-500/20 stroke-purple-400' : ''}
                                `}
                            />
                            {/* Space Label */}
                             {(() => {
                                const centerX = space.coordinates.reduce((sum, p) => sum + p.x, 0) / space.coordinates.length;
                                const centerY = space.coordinates.reduce((sum, p) => sum + p.y, 0) / space.coordinates.length;
                                return (
                                   <text x={centerX} y={centerY} fontSize="3" fill="white" textAnchor="middle" className="pointer-events-none drop-shadow-md font-bold opacity-70">
                                     {space.name}
                                   </text>
                                );
                              })()}
                        </g>
                    ))}
                    {currentPoints.length > 0 && (
                        <polygon points={pointsToString(currentPoints)} className="fill-blue-500/20 stroke-blue-400 stroke-[0.5]" />
                    )}
                </svg>

                {/* Character Tokens Layer */}
                {currentPlacements.filter(p => p.mapId === currentMapId).map(p => {
                    const char = characters.find(c => c.id === p.characterId);
                    if (!char) return null;
                    return (
                        <div
                            key={p.characterId}
                            draggable
                            onDragStart={(e) => handleTokenDragStart(e, p.characterId)}
                            onContextMenu={(e) => handleTokenContextMenu(e, p.characterId)}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing group z-10"
                            style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        >
                            <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-blue-400 text-white flex items-center justify-center font-bold text-xs shadow-lg relative overflow-hidden group-hover:scale-110 transition-transform">
                                {char.name.charAt(0)}
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
                                {char.name}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Timeline Bar (Bottom of Canvas) */}
            <div className="h-16 bg-slate-800 border-t border-slate-700 flex items-center px-4 gap-4 overflow-x-auto custom-scrollbar select-none">
                <div className="flex items-center gap-2 text-slate-400 mr-2 border-r border-slate-700 pr-4 shrink-0">
                    <Clock size={16} />
                    <span className="text-xs font-bold uppercase">时间轴</span>
                </div>
                {timePoints.map((tp, index) => (
                    <div 
                        key={tp.id} 
                        className="flex items-center group relative"
                        draggable
                        onDragStart={(e) => handleTimeDragStart(e, tp.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleTimeDrop(e, tp.id)}
                    >
                        {/* Drag Handle (Visible on Hover) */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-slate-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing">
                            <GripVertical size={10} />
                        </div>

                        <button
                            onClick={() => onSelectTime(tp.id)}
                            className={`flex flex-col items-center min-w-[80px] px-2 py-1 rounded transition-all relative ${
                                currentTimeId === tp.id 
                                    ? 'bg-blue-600/20 text-blue-300 ring-1 ring-blue-500' 
                                    : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full mb-1 ${currentTimeId === tp.id ? 'bg-blue-400' : 'bg-slate-600'}`} />
                            <span className="text-[10px] font-mono whitespace-nowrap">{tp.label}</span>
                            
                            {/* Delete Button (Hover) */}
                            {timePoints.length > 1 && (
                                <div 
                                    onClick={(e) => handleDeleteTimePoint(e, tp.id)}
                                    className="absolute -right-1 -top-1 bg-slate-800 text-slate-600 hover:text-red-400 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X size={10} />
                                </div>
                            )}
                        </button>
                        {index < timePoints.length - 1 && <div className="w-4 h-[1px] bg-slate-700 mx-1" />}
                    </div>
                ))}
                <button 
                    onClick={handleOpenTimeModal} 
                    className="ml-2 w-6 h-6 shrink-0 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-slate-400 transition-colors"
                >
                    <Plus size={12} />
                </button>
            </div>
         </div>

         {/* Sidebar Editor (Attributes) */}
         {selectedSpaceId && editForm && (
            <div className="w-full lg:w-64 bg-slate-800 p-4 rounded-lg border border-slate-700 h-fit">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-sm">区域属性</h3>
                    <button onClick={() => setSelectedSpaceId(null)}><X size={14} /></button>
                </div>
                <div className="space-y-3">
                    <input 
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                        value={editForm.name}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                    />
                    <div className="flex flex-wrap gap-2">
                         {['上锁', '密室', '未探索', '案发地', '开放'].map(attr => (
                            <button
                                key={attr}
                                onClick={() => toggleAttribute(attr)}
                                className={`px-2 py-1 text-xs rounded border ${editForm.attributes.includes(attr) ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-400'}`}
                            >
                                {attr}
                            </button>
                         ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button onClick={saveEdit} className="flex-1 bg-blue-600 text-xs py-1.5 rounded text-white">保存</button>
                        <button onClick={() => {onUpdateSpaces(spaces.filter(s => s.id !== selectedSpaceId)); setSelectedSpaceId(null);}} className="px-2 bg-red-900/50 text-red-200 rounded"><Trash2 size={12}/></button>
                    </div>
                </div>
            </div>
         )}
      </div>
      
      {/* Time Point Modal - Use Fixed Positioning */}
      {isTimeModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-600 shadow-2xl w-80 animate-in fade-in zoom-in duration-200">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <Clock size={20} className="text-blue-400" />
                      添加时间点
                  </h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs text-slate-400 mb-1">时间点名称</label>
                          <input 
                              ref={timeInputRef}
                              type="text" 
                              placeholder="例如: 14:30, 发现尸体时"
                              className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                              value={newTimeName}
                              onChange={(e) => setNewTimeName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveTimePoint()}
                          />
                      </div>
                      <div className="flex gap-2 justify-end">
                          <button 
                              onClick={() => setIsTimeModalOpen(false)}
                              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white"
                          >
                              取消
                          </button>
                          <button 
                              onClick={handleSaveTimePoint}
                              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
                          >
                              确认添加
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Map Creation Modal - Use Fixed Positioning */}
      {isMapModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-600 shadow-2xl w-80 animate-in fade-in zoom-in duration-200">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <MapPin size={20} className="text-blue-400" />
                      添加新场景
                  </h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs text-slate-400 mb-1">场景名称</label>
                          <input 
                              ref={mapInputRef}
                              type="text" 
                              placeholder="例如: 二楼, 庭院, 地下室"
                              className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                              value={newMapName}
                              onChange={(e) => setNewMapName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleConfirmAddMap()}
                          />
                      </div>
                      <div className="flex gap-2 justify-end">
                          <button 
                              onClick={() => setIsMapModalOpen(false)}
                              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white"
                          >
                              取消
                          </button>
                          <button 
                              onClick={handleConfirmAddMap}
                              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
                          >
                              确认创建
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="text-[10px] text-slate-500 text-center">
        提示: 将左侧人物拖入地图可标记位置。右键点击地图上的人物可移除。拖动底部时间轴可排序。
      </div>
    </div>
  );
};

export default MapCanvas;