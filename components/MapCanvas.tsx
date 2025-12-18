
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Space, Point, MapDoc, TimePoint, CharacterPlacement, Character } from '../types';
import { Upload, Plus, X, Trash2, MapPin, Clock, GripVertical, Edit3, Loader2 } from 'lucide-react';
import { compressImage } from '../utils/imageProcessor';

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
  const [isCompressing, setIsCompressing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  
  const [editForm, setEditForm] = useState<{ name: string; attributes: string[]; note: string } | null>(null);
  const [dragOverMap, setDragOverMap] = useState(false);
  
  // Timeline Modal State
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [newTimeName, setNewTimeName] = useState("");
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Map Modal State
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const mapInputRef = useRef<HTMLInputElement>(null);
  
  // Map Renaming State
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [tempMapName, setTempMapName] = useState("");
  
  // Image Aspect Ratio & Sizing State
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [naturalSize, setNaturalSize] = useState<{w: number, h: number} | null>(null);
  const [displaySize, setDisplaySize] = useState<{w: number | string, h: number | string}>({ w: '100%', h: '100%' });

  const currentMap = maps.find(m => m.id === currentMapId) || maps[0];
  const currentSpaces = spaces.filter(s => s.mapId === currentMap.id);
  const currentPlacements = timelineData[currentTimeId] || [];

  useEffect(() => {
    if (isTimeModalOpen && timeInputRef.current) {
        setTimeout(() => timeInputRef.current?.focus(), 100);
    }
  }, [isTimeModalOpen]);

  useEffect(() => {
    if (isMapModalOpen && mapInputRef.current) {
        setTimeout(() => mapInputRef.current?.focus(), 100);
    }
  }, [isMapModalOpen]);

  useEffect(() => {
      setNaturalSize(null);
  }, [currentMapId, currentMap.imageUrl]);

  useLayoutEffect(() => {
      if (!currentMap.imageUrl || !naturalSize) {
          setDisplaySize({ w: '100%', h: '100%' });
          return;
      }
      
      const updateSize = () => {
          if (!wrapperRef.current) return;
          const { clientWidth: cw, clientHeight: ch } = wrapperRef.current;
          const { w: nw, h: nh } = naturalSize;
          
          if (nw === 0 || nh === 0) return;
          const scale = Math.min(cw / nw, ch / nh);
          setDisplaySize({ w: nw * scale, h: nh * scale });
      };

      updateSize();
      const ro = new ResizeObserver(updateSize);
      if (wrapperRef.current) {
        ro.observe(wrapperRef.current);
      }
      return () => ro.disconnect();
  }, [naturalSize, currentMap.imageUrl]);

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

  const startRenaming = (map: MapDoc) => {
      setEditingMapId(map.id);
      setTempMapName(map.name);
  };

  const saveMapName = () => {
      if (editingMapId && tempMapName.trim()) {
          const newMaps = maps.map(m => m.id === editingMapId ? { ...m, name: tempMapName.trim() } : m);
          onUpdateMaps(newMaps);
      }
      setEditingMapId(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        // Limit to 1024px and use WebP compression for IndexedDB efficiency
        const compressedBase64 = await compressImage(file, 1024, 0.8);
        onUpdateMaps(maps.map(m => m.id === currentMapId ? { ...m, imageUrl: compressedBase64 } : m));
      } catch (err) {
        console.error("Image compression failed:", err);
        alert("图片处理失败，请重试。");
      } finally {
        setIsCompressing(false);
      }
    }
  };

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
      const reordered = newPoints.map((p, i) => ({ ...p, order: i }));
      onUpdateTimePoints(reordered);
  };

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
          const newPlacement: CharacterPlacement = { characterId: charId, mapId: currentMapId, x, y };
          const others = currentPlacements.filter(p => p.characterId !== charId);
          onUpdatePlacements(currentTimeId, [...others, newPlacement]);
      }
  };

  const handleTokenDragStart = (e: React.DragEvent, charId: string) => {
      e.dataTransfer.setData("application/react-dnd-char-id", charId);
      e.dataTransfer.setData("application/react-dnd-move-existing", "true");
      e.stopPropagation();
  };

  const handleTokenContextMenu = (e: React.MouseEvent, charId: string) => {
      e.preventDefault();
      const others = currentPlacements.filter(p => p.characterId !== charId);
      onUpdatePlacements(currentTimeId, others);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isDrawing || !containerRef.current) return;
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
      coordinates: currentPoints,
      note: ""
    };
    onUpdateSpaces([...spaces, newSpace]);
    setCurrentPoints([]);
    setIsDrawing(false);
    setSelectedSpaceId(newSpace.id);
    setEditForm({ name: newSpace.name, attributes: [], note: "" });
  };

  const saveEdit = () => {
    if (!selectedSpaceId || !editForm) return;
    onUpdateSpaces(spaces.map(s => 
      s.id === selectedSpaceId 
        ? { ...s, name: editForm.name, attributes: editForm.attributes, note: editForm.note } 
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
    <div className="flex flex-col gap-2 h-[650px] lg:h-[calc(100vh-180px)] min-h-[500px] relative">
      {/* Top Bar: Maps & Tools */}
      <div className="flex items-center justify-between bg-slate-800 p-2 rounded-lg border border-slate-700 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 max-w-[60%]">
            {maps.map(m => (
                editingMapId === m.id ? (
                    <input 
                        key={m.id}
                        autoFocus
                        value={tempMapName}
                        onChange={(e) => setTempMapName(e.target.value)}
                        onBlur={saveMapName}
                        onKeyDown={(e) => e.key === 'Enter' && saveMapName()}
                        className="w-24 px-2 py-1.5 rounded text-sm bg-slate-900 text-white border border-blue-500 outline-none"
                    />
                ) : (
                    <button
                        key={m.id}
                        onClick={() => onSelectMap(m.id)}
                        onDoubleClick={() => startRenaming(m)}
                        className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors select-none ${
                            currentMapId === m.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                        title="双击重命名"
                    >
                        {m.name}
                    </button>
                )
            ))}
            <button onClick={handleOpenMapModal} className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400">
                <Plus size={16} />
            </button>
        </div>

        <div className="flex gap-2">
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 disabled:opacity-50"
                title="上传当前地图背景"
            >
                {isCompressing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
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

      {/* Main Map Viewport */}
      <div className="flex-1 relative bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-0">
        <div ref={wrapperRef} className="flex-1 w-full h-full flex items-center justify-center bg-[#1e293b] overflow-hidden relative">
            <div 
                ref={containerRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleCanvasClick}
                style={{ width: displaySize.w, height: displaySize.h }}
                className={`relative shadow-2xl transition-all duration-75 ${isDrawing ? 'cursor-crosshair' : 'cursor-default'} ${dragOverMap ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
            >
                {!currentMap.imageUrl ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none select-none border border-slate-700/30">
                        <MapPin size={48} className="mb-2 opacity-50" />
                        <p>请上传背景图或直接拖入角色</p>
                    </div>
                ) : (
                    <img src={currentMap.imageUrl} className="w-full h-full pointer-events-none select-none" alt="map" onLoad={(e) => setNaturalSize({w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight})} />
                )}

                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {currentSpaces.map(space => space.coordinates && (
                        <g key={space.id} onClick={(e) => { e.stopPropagation(); setSelectedSpaceId(space.id); setEditForm({ name: space.name, attributes: space.attributes, note: space.note || "" }); }}>
                            <polygon points={pointsToString(space.coordinates)} className={`stroke-[0.5] hover:stroke-1 hover:fill-blue-500/40 transition-all cursor-pointer ${selectedSpaceId === space.id ? 'fill-blue-500/50 stroke-blue-300' : 'fill-blue-500/10 stroke-blue-500/30'} ${space.attributes.includes('密室') ? 'fill-purple-500/20 stroke-purple-400' : ''}`} />
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
                    {currentPoints.length > 0 && <polygon points={pointsToString(currentPoints)} className="fill-blue-500/20 stroke-blue-400 stroke-[0.5]" />}
                </svg>

                {currentPlacements.filter(p => p.mapId === currentMapId).map(p => {
                    const char = characters.find(c => c.id === p.characterId);
                    if (!char) return null;
                    return (
                        <div key={p.characterId} draggable onDragStart={(e) => handleTokenDragStart(e, p.characterId)} onContextMenu={(e) => handleTokenContextMenu(e, p.characterId)} className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing group z-10" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                            <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-white shadow-lg flex items-center justify-center text-xs font-bold text-white relative">
                                {char.name.charAt(0)}
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/75 text-[10px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    {char.name}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedSpaceId && editForm && (
                <div className="absolute right-4 top-4 bottom-4 w-72 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-lg shadow-2xl z-30 flex flex-col animate-in slide-in-from-right duration-200">
                    <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-lg">
                        <h3 className="font-bold text-white flex items-center gap-2 text-sm"><Edit3 size={14} className="text-blue-400" />区域编辑</h3>
                        <button onClick={() => { setSelectedSpaceId(null); setEditForm(null); }} className="text-slate-500 hover:text-white"><X size={16} /></button>
                    </div>
                    <div className="p-3 space-y-3 flex-1 overflow-y-auto">
                        <div>
                           <label className="text-xs font-bold text-slate-400 mb-1 block">区域名称</label>
                           <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-1.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-400 mb-1 block">属性标签</label>
                           <div className="flex flex-wrap gap-1.5">
                             {['密室', '上锁', '未探索', '危险', '案发现场'].map(attr => (
                                <button key={attr} onClick={() => toggleAttribute(attr)} className={`text-[10px] px-2 py-1 rounded border transition-colors ${editForm.attributes.includes(attr) ? 'bg-blue-600 border-blue-500 text-white shadow' : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'}`}>{attr}</button>
                             ))}
                           </div>
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-400 mb-1 block">场景备注</label>
                           <textarea value={editForm.note} onChange={e => setEditForm({...editForm, note: e.target.value})} className="w-full h-40 bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" placeholder="描述特征..." />
                        </div>
                    </div>
                    <div className="p-3 border-t border-slate-700 bg-slate-800/50 flex gap-2 rounded-b-lg">
                        <button onClick={() => { const newSpaces = spaces.filter(s => s.id !== selectedSpaceId); onUpdateSpaces(newSpaces); setSelectedSpaceId(null); setEditForm(null); }} className="p-2 text-red-400 hover:bg-red-900/20 rounded transition-colors" title="删除"><Trash2 size={16} /></button>
                        <button onClick={saveEdit} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold shadow">保存</button>
                    </div>
                </div>
            )}
         </div>
      </div>

      {/* Horizontal Timeline Strip */}
      <div className="shrink-0 h-28 bg-slate-800 rounded-lg border border-slate-700 flex flex-col">
        <div className="px-3 py-1.5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm"><Clock size={14} className="text-orange-400" />时间线</h3>
            <button onClick={handleOpenTimeModal} className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded"><Plus size={14} /></button>
        </div>
        <div className="flex-1 overflow-x-auto flex items-center p-2 gap-2 custom-scrollbar">
            {timePoints.map((tp) => (
                <div key={tp.id} draggable onDragStart={(e) => handleTimeDragStart(e, tp.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleTimeDrop(e, tp.id)} onClick={() => onSelectTime(tp.id)} className={`group flex-shrink-0 w-40 h-full p-2 rounded cursor-pointer border transition-all relative flex flex-col justify-between ${currentTimeId === tp.id ? 'bg-slate-700 border-orange-500/50 shadow-md' : 'bg-slate-800 border-slate-700 hover:bg-slate-700/50 hover:border-slate-600'}`}>
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                             <GripVertical size={12} className="text-slate-600 cursor-grab opacity-0 group-hover:opacity-100" />
                             <span className={`text-sm font-bold truncate ${currentTimeId === tp.id ? 'text-orange-100' : 'text-slate-300'}`}>{tp.label}</span>
                        </div>
                        {timePoints.length > 1 && <button onClick={(e) => handleDeleteTimePoint(e, tp.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>}
                    </div>
                    <div className="flex items-end justify-between mt-2">
                         <div className="text-[10px] text-slate-500">{timelineData[tp.id]?.length || 0} 角色</div>
                         {currentTimeId === tp.id && <div className="w-full h-0.5 bg-orange-500 absolute bottom-0 left-0 right-0 rounded-b"></div>}
                    </div>
                </div>
            ))}
            <button onClick={handleOpenTimeModal} className="flex-shrink-0 w-8 h-full rounded border border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors"><Plus size={16} /></button>
        </div>
      </div>

      {isTimeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-sm">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center"><h3 className="font-bold text-white">添加时间点</h3><button onClick={() => setIsTimeModalOpen(false)}><X size={20} className="text-slate-400" /></button></div>
                <div className="p-6"><input ref={timeInputRef} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: 12:00, 案发时..." value={newTimeName} onChange={(e) => setNewTimeName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveTimePoint()} /></div>
                <div className="p-4 border-t border-slate-700 flex justify-end gap-2 bg-slate-800/50 rounded-b-xl"><button onClick={() => setIsTimeModalOpen(false)} className="px-4 py-2 text-slate-300 hover:text-white text-sm">取消</button><button onClick={handleSaveTimePoint} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold">添加</button></div>
            </div>
        </div>
      )}

      {isMapModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-sm">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center"><h3 className="font-bold text-white">新建地图层</h3><button onClick={() => setIsMapModalOpen(false)}><X size={20} className="text-slate-400" /></button></div>
                <div className="p-6"><input ref={mapInputRef} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="例如: 二楼, 地下室..." value={newMapName} onChange={(e) => setNewMapName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleConfirmAddMap()} /></div>
                <div className="p-4 border-t border-slate-700 flex justify-end gap-2 bg-slate-800/50 rounded-b-xl"><button onClick={() => setIsMapModalOpen(false)} className="px-4 py-2 text-slate-300 hover:text-white text-sm">取消</button><button onClick={handleConfirmAddMap} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold">创建</button></div>
            </div>
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
