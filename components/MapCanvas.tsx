
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Space, Point, MapDoc, TimePoint, CharacterPlacement, ItemPlacement, Character, Clue, Alibi } from '../types';
import { Upload, Plus, X, Trash2, MapPin, Clock, Edit3, Loader2, AlertTriangle, Package, ZoomIn, Maximize2, Tag, AlignLeft, Hash, MousePointer2, Copy, Scissors, Clipboard, Check, Eraser, ShieldCheck, Users, GripHorizontal, Maximize, Minimize } from 'lucide-react';
import { compressImage } from '../utils/imageProcessor';

interface Props {
  maps: MapDoc[];
  currentMapId: string;
  spaces: Space[]; 
  clues: Clue[];
  alibis: Alibi[]; 
  timePoints: TimePoint[];
  currentTimeId: string;
  timelineData: Record<string, CharacterPlacement[]>; 
  itemTimelineData: Record<string, ItemPlacement[]>;
  characters: Character[];
  blobUrls: Record<string, string>;

  onUpdateMaps: (maps: MapDoc[]) => void;
  onDeleteMap: (id: string) => void;
  onCreateMap: (name: string) => void;
  onSelectMap: (id: string) => void;
  onUpdateSpaces: (spaces: Space[]) => void;
  onUpdateTimePoints: (points: TimePoint[]) => void;
  onSelectTime: (id: string) => void;
  onUpdatePlacements: (timeId: string, placements: CharacterPlacement[]) => void;
  onUpdateItemPlacements: (timeId: string, placements: ItemPlacement[]) => void;
  onAddClue: (clue: Clue) => void; 
  onOpenClueModal?: (clue: Clue) => void;
  onImageSave: (entityId: string, blob: Blob) => Promise<string>;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

interface ClipboardItem {
  id: string;
  type: 'character' | 'item' | 'space';
  data?: any; 
  relX?: number;
  relY?: number;
}

const MapCanvas: React.FC<Props> = ({ 
    maps, currentMapId, spaces, clues, alibis,
    timePoints, currentTimeId, timelineData, itemTimelineData = {}, characters, blobUrls,
    onUpdateMaps, onDeleteMap, onCreateMap, onSelectMap, onUpdateSpaces,
    onUpdateTimePoints, onSelectTime,
    onUpdatePlacements, onUpdateItemPlacements, onAddClue,
    onOpenClueModal, onImageSave
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardItem[]>([]);
  const [isCutMode, setIsCutMode] = useState(false);
  const [showAlibiSummary, setShowAlibiSummary] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100); 
  const [zoomInput, setZoomInput] = useState('100');
  const [canvasHeight, setCanvasHeight] = useState(650);
  const [heightInput, setHeightInput] = useState('650');
  const [editForm, setEditForm] = useState<{ name: string; attributes: string[]; note: string } | null>(null);
  const [customAttrInput, setCustomAttrInput] = useState("");
  const [dragOverMap, setDragOverMap] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [newTimeName, setNewTimeName] = useState("");
  const [timeToDelete, setTimeToDelete] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);
  
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [tempTimeLabel, setTempTimeLabel] = useState("");

  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [mapToDelete, setMapToDelete] = useState<MapDoc | null>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [tempMapName, setTempMapName] = useState("");
  const [draggedMapIndex, setDraggedMapIndex] = useState<number | null>(null);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [naturalSize, setNaturalSize] = useState<{w: number, h: number} | null>(null);
  const [displaySize, setDisplaySize] = useState<{w: number | string, h: number | string}>({ w: '100%', h: '100%' });

  const currentMap = maps.find(m => m.id === currentMapId) || maps[0];
  const currentSpaces = spaces.filter(s => s.mapId === currentMap.id);
  const currentPlacements = timelineData[currentTimeId] || [];
  const currentItemPlacements = itemTimelineData[currentTimeId] || [];

  const currentMapUrl = currentMap.imageId ? blobUrls[currentMap.imageId] : null;

  useEffect(() => {
    setSelectedIds(new Set());
    setEditForm(null);
  }, [currentMapId, currentTimeId]);

  useEffect(() => {
    if (isTimeModalOpen && timeInputRef.current) setTimeout(() => timeInputRef.current?.focus(), 100);
  }, [isTimeModalOpen]);

  useEffect(() => {
    if (isMapModalOpen && mapInputRef.current) setTimeout(() => mapInputRef.current?.focus(), 100);
  }, [isMapModalOpen]);

  useEffect(() => setNaturalSize(null), [currentMapId, currentMapUrl]);

  useLayoutEffect(() => {
      if (!currentMapUrl || !naturalSize) {
          setDisplaySize({ w: '100%', h: '100%' });
          return;
      }
      const updateSize = () => {
          if (!wrapperRef.current) return;
          const { clientWidth: cw, clientHeight: ch } = wrapperRef.current;
          const { w: nw, h: nh } = naturalSize;
          if (nw === 0 || nh === 0) return;
          
          const baseScale = Math.min(cw / nw, ch / nh);
          const finalScale = baseScale * (zoom / 100);
          setDisplaySize({ w: nw * finalScale, h: nh * finalScale });
      };
      updateSize();
      const ro = new ResizeObserver(updateSize);
      if (wrapperRef.current) ro.observe(wrapperRef.current);
      return () => ro.disconnect();
  }, [naturalSize, currentMapUrl, zoom, canvasHeight, isExpanded]);

  const handleZoomBlur = () => {
    let num = parseInt(zoomInput);
    if (isNaN(num) || num < 10) num = 10;
    setZoom(num);
    setZoomInput(num.toString());
  };

  const handleHeightBlur = () => {
    let num = parseInt(heightInput);
    if (isNaN(num) || num < 200) num = 200;
    if (num > 2000) num = 2000;
    setCanvasHeight(num);
    setHeightInput(num.toString());
  };

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

  const handleConfirmDeleteMap = () => {
    if (mapToDelete) {
      onDeleteMap(mapToDelete.id);
      setMapToDelete(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        const blob = await compressImage(file, 1024, 0.8);
        const imageId = await onImageSave(currentMapId, blob);
        onUpdateMaps(maps.map(m => m.id === currentMapId ? { ...m, imageId } : m));
      } catch (err) { console.error(err); } finally { setIsCompressing(false); }
    }
  };

  const handleSaveTimePoint = () => {
      if (!newTimeName.trim()) return;
      const newTime: TimePoint = { id: generateId(), label: newTimeName.trim(), order: timePoints.length };
      onUpdateTimePoints([...timePoints, newTime]);
      onSelectTime(newTime.id);
      setIsTimeModalOpen(false);
  };

  const handleConfirmDeleteTime = () => {
      if (!timeToDelete) return;
      const newPoints = timePoints.filter(t => t.id !== timeToDelete);
      onUpdateTimePoints(newPoints);
      if (currentTimeId === timeToDelete) onSelectTime(newPoints[0].id);
      setTimeToDelete(null);
  };

  const handleUpdateCurrentTimeLabel = () => {
      if (editingTimeId && tempTimeLabel.trim()) {
          onUpdateTimePoints(timePoints.map(tp => 
              tp.id === editingTimeId ? { ...tp, label: tempTimeLabel.trim() } : tp
          ));
      }
      setEditingTimeId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverMap(true);
  };

  const handleDragLeave = () => setDragOverMap(false);

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverMap(false);
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const charId = e.dataTransfer.getData("application/react-dnd-char-id");
      const clueId = e.dataTransfer.getData("application/react-dnd-clue-id");

      if (charId) {
          const newPlacement: CharacterPlacement = { characterId: charId, mapId: currentMapId, x, y };
          const others = currentPlacements.filter(p => p.characterId !== charId);
          onUpdatePlacements(currentTimeId, [...others, newPlacement]);
      } else if (clueId) {
          const newItemPlacement: ItemPlacement = { clueId, mapId: currentMapId, x, y };
          const others = currentItemPlacements.filter(p => p.clueId !== clueId);
          onUpdateItemPlacements(currentTimeId, [...others, newItemPlacement]);
      }
  };

  const handleTokenDragStart = (e: React.DragEvent, charId: string) => {
      if (!selectedIds.has(charId)) {
          setSelectedIds(new Set([charId]));
      }
      e.dataTransfer.setData("application/react-dnd-char-id", charId);
      e.stopPropagation();
  };

  const handleItemDragStart = (e: React.DragEvent, clueId: string) => {
      if (!selectedIds.has(clueId)) {
          setSelectedIds(new Set([clueId]));
      }
      e.dataTransfer.setData("application/react-dnd-clue-id", clueId);
      e.stopPropagation();
  };

  const handleMapDragStart = (index: number) => {
    if (editingMapId) return; 
    setDraggedMapIndex(index);
  };

  const handleMapDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedMapIndex === null || draggedMapIndex === index) return;
  };

  const handleMapDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedMapIndex === null || draggedMapIndex === targetIndex) {
      setDraggedMapIndex(null);
      return;
    }

    const updatedMaps = [...maps];
    const [draggedMap] = updatedMaps.splice(draggedMapIndex, 1);
    updatedMaps.splice(targetIndex, 0, draggedMap);
    
    onUpdateMaps(updatedMaps);
    setDraggedMapIndex(null);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (isDrawing) return;
    if (!containerRef.current) return;
    if (e.button !== 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setSelectionBox({ x1: x, y1: y, x2: x, y2: y });

    if (!e.ctrlKey) {
      setSelectedIds(new Set());
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (selectionBox && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setSelectionBox(prev => prev ? { ...prev, x2: x, y2: y } : null);
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (selectionBox) {
      const { x1, y1, x2, y2 } = selectionBox;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      const isBoxTiny = Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) < 0.5;

      if (!isBoxTiny) {
        const newlySelected = new Set(e.ctrlKey ? selectedIds : []);
        
        currentPlacements.forEach(p => {
          if (p.mapId === currentMapId && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
            newlySelected.add(p.characterId);
          }
        });

        currentItemPlacements.forEach(p => {
          if (p.mapId === currentMapId && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
            newlySelected.add(p.clueId);
          }
        });

        currentSpaces.forEach(s => {
          if (s.coordinates) {
            const sX = s.coordinates.map(p => p.x);
            const sY = s.coordinates.map(p => p.y);
            const sMinX = Math.min(...sX);
            const sMaxX = Math.max(...sX);
            const sMinY = Math.min(...sY);
            const sMaxY = Math.max(...sY);

            if (!(sMaxX < minX || sMinX > maxX || sMaxY < minY || sMinY > maxY)) {
              newlySelected.add(s.id);
            }
          }
        });

        setSelectedIds(newlySelected);
      }
      setSelectionBox(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCurrentPoints(prev => [...prev, { x, y }]);
  };

  const finishShape = () => {
    if (currentPoints.length < 3) return;
    const newSpace: Space = {
      id: generateId(), mapId: currentMapId, name: "未命名区域", attributes: [], connected_to: [], coordinates: currentPoints, note: ""
    };
    onUpdateSpaces([...spaces, newSpace]);
    setCurrentPoints([]);
    setIsDrawing(false);
    setSelectedIds(new Set([newSpace.id]));
  };

  const saveEdit = () => {
    if (selectedIds.size === 0 || !editForm) return;
    const spaceIdsToUpdate = Array.from(selectedIds).filter(id => currentSpaces.some(s => s.id === id));
    if (spaceIdsToUpdate.length > 0) {
      onUpdateSpaces(spaces.map(s => spaceIdsToUpdate.includes(s.id) ? { ...s, name: editForm.name, attributes: editForm.attributes, note: editForm.note } : s));
    }
    setSelectedIds(new Set());
    setEditForm(null);
    setCustomAttrInput("");
  };

  const handleAddCustomAttr = () => {
    if (!customAttrInput.trim() || !editForm) return;
    const trimmed = customAttrInput.trim();
    if (!editForm.attributes.includes(trimmed)) {
      setEditForm({ ...editForm, attributes: [...editForm.attributes, trimmed] });
    }
    setCustomAttrInput("");
  };

  const handleRemoveAttr = (attr: string) => {
    if (!editForm) return;
    setEditForm({ ...editForm, attributes: editForm.attributes.filter(a => a !== attr) });
  };

  const toggleSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (e.ctrlKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  const handleBulkDelete = () => {
    const newPlacements = currentPlacements.filter(p => !(selectedIds.has(p.characterId) && p.mapId === currentMapId));
    onUpdatePlacements(currentTimeId, newPlacements);

    const newItemPlacements = currentItemPlacements.filter(p => !(selectedIds.has(p.clueId) && p.mapId === currentMapId));
    onUpdateItemPlacements(currentTimeId, newItemPlacements);

    onUpdateSpaces(spaces.filter(s => !selectedIds.has(s.id)));
    
    setSelectedIds(new Set());
  };

  const handleBulkCopy = (isCut = false) => {
    const items: ClipboardItem[] = [];
    selectedIds.forEach(id => {
      const charP = currentPlacements.find(p => p.characterId === id && p.mapId === currentMapId);
      if (charP) {
        items.push({ id, type: 'character', relX: charP.x, relY: charP.y });
      }
      const itemP = currentItemPlacements.find(p => p.clueId === id && p.mapId === currentMapId);
      if (itemP) {
        items.push({ id, type: 'item', relX: itemP.x, relY: itemP.y });
      }
      const space = currentSpaces.find(s => s.id === id);
      if (space) {
        items.push({ id, type: 'space', data: space });
      }
    });

    setClipboard(items);
    setIsCutMode(isCut);
    if (isCut) {
      handleBulkDelete();
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleClearClipboard = () => {
    setClipboard([]);
    setIsCutMode(false);
  };

  const handlePaste = () => {
    if (clipboard.length === 0) return;

    const newSpaces: Space[] = [];
    const charPlacements = [...currentPlacements];
    const itemPlacements = [...currentItemPlacements];

    clipboard.forEach(item => {
      if (item.type === 'character') {
        const existsIdx = charPlacements.findIndex(p => p.characterId === item.id);
        const placement = { characterId: item.id, mapId: currentMapId, x: (item.relX || 50) + 2, y: (item.relY || 50) + 2 };
        if (existsIdx > -1) {
            charPlacements[existsIdx] = placement;
        } else {
            charPlacements.push(placement);
        }
      } else if (item.type === 'item') {
        const existsIdx = itemPlacements.findIndex(p => p.clueId === item.id);
        const placement = { clueId: item.id, mapId: currentMapId, x: (item.relX || 50) + 2, y: (item.relY || 50) + 2 };
        if (existsIdx > -1) {
            itemPlacements[existsIdx] = placement;
        } else {
            itemPlacements.push(placement);
        }
      } else if (item.type === 'space') {
        const newSpace = { 
          ...item.data, 
          id: generateId(), 
          mapId: currentMapId,
          coordinates: item.data.coordinates?.map((p: Point) => ({ x: p.x + 2, y: p.y + 2 }))
        };
        newSpaces.push(newSpace);
      }
    });

    if (newSpaces.length > 0) onUpdateSpaces([...spaces, ...newSpaces]);
    onUpdatePlacements(currentTimeId, charPlacements);
    onUpdateItemPlacements(currentTimeId, itemPlacements);
    
    if (isCutMode) {
      handleClearClipboard();
    }
  };

  const pointsToString = (points: Point[]) => points.map(p => `${p.x},${p.y}`).join(' ');

  useEffect(() => {
    if (selectedIds.size > 0) {
      const firstId = Array.from(selectedIds)[0];
      const space = currentSpaces.find(s => s.id === firstId);
      if (space) {
        setEditForm({ name: space.name, attributes: space.attributes, note: space.note || "" });
      } else {
        setEditForm(null);
      }
    } else {
      setEditForm(null);
    }
  }, [selectedIds, currentMapId]);

  return (
    <div 
        style={{ height: isExpanded ? '100vh' : `${canvasHeight}px` }} 
        className={`flex flex-col gap-2 transition-all duration-300 select-none ${isExpanded ? 'fixed inset-0 z-[400] bg-slate-950 p-6' : 'relative'}`}
    >
      <div className="flex items-center justify-between bg-slate-800 p-2 rounded-lg border border-slate-700 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 max-w-[40%]">
            {maps.map((m, idx) => (
                editingMapId === m.id ? (
                    <input 
                        key={m.id} autoFocus value={tempMapName} onChange={(e) => setTempMapName(e.target.value)}
                        onBlur={() => { if (editingMapId && tempMapName.trim()) onUpdateMaps(maps.map(x => x.id === editingMapId ? { ...x, name: tempMapName.trim() } : x)); setEditingMapId(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="w-32 px-2 py-1.5 rounded text-sm bg-slate-900 text-white border border-blue-500 outline-none"
                    />
                ) : (
                    <div 
                      key={m.id} 
                      className={`relative group/tab flex shrink-0 transition-all ${draggedMapIndex === idx ? 'opacity-30 scale-95' : 'opacity-100'}`}
                      draggable={!editingMapId}
                      onDragStart={() => handleMapDragStart(idx)}
                      onDragOver={(e) => handleMapDragOver(e, idx)}
                      onDrop={(e) => handleMapDrop(e, idx)}
                    >
                        <button
                            onClick={() => onSelectMap(m.id)}
                            onDoubleClick={() => { setEditingMapId(m.id); setTempMapName(m.name); }}
                            className={`px-4 py-1.5 rounded text-sm transition-all flex items-center gap-2 ${currentMapId === m.id ? 'bg-blue-600 text-white pr-7' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        >
                            <GripHorizontal size={12} className="text-slate-400 group-hover/tab:text-white transition-colors" />
                            {m.name}
                        </button>
                        {maps.length > 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setMapToDelete(m); }}
                                className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-red-500/30 text-slate-400 hover:text-red-400 transition-opacity ${currentMapId === m.id ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100'}`}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )
            ))}
            <button onClick={handleOpenMapModal} className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 shrink-0"><Plus size={16} /></button>
        </div>

        <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur border border-blue-500/40 p-1 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2">
                <button onClick={() => handleBulkCopy(false)} title="复制" className="p-1.5 hover:bg-slate-700 rounded-lg text-blue-400 transition-colors"><Copy size={14}/></button>
                <button onClick={() => handleBulkCopy(true)} title="剪切" className="p-1.5 hover:bg-slate-700 rounded-lg text-blue-400 transition-colors"><Scissors size={14}/></button>
                <button onClick={handleBulkDelete} title="批量删除" className="p-1.5 hover:bg-red-900/20 rounded-lg text-red-400 transition-colors"><Trash2 size={14}/></button>
                <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
                <div className="px-2 text-[10px] font-bold text-slate-400">已选 {selectedIds.size}</div>
              </div>
            )}

            {clipboard.length > 0 && (
               <div className="flex items-center gap-1 bg-green-600/10 border border-green-500/30 rounded-xl p-0.5">
                 <button onClick={handlePaste} className="flex items-center gap-2 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-xs font-bold transition-all shadow-lg animate-in pulse duration-1000 infinite"><Clipboard size={14}/> 粘贴 ({clipboard.length})</button>
                 <button onClick={handleClearClipboard} title="清空剪贴板" className="p-1.5 hover:bg-slate-700 text-slate-500 hover:text-red-400 rounded-lg transition-colors"><Eraser size={14} /></button>
               </div>
            )}

            <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-700">
                <Maximize2 size={14} className="text-slate-400" />
                <input type="text" value={heightInput} onChange={(e) => setHeightInput(e.target.value)} onBlur={handleHeightBlur} onKeyDown={(e) => e.key === 'Enter' && handleHeightBlur()} className="w-16 h-8 bg-slate-800 text-white text-xs border border-slate-700 rounded text-center outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-700">
                <ZoomIn size={14} className="text-slate-400" />
                <input type="text" value={zoomInput} onChange={(e) => setZoomInput(e.target.value)} onBlur={handleZoomBlur} onKeyDown={(e) => e.key === 'Enter' && handleZoomBlur()} className="w-16 h-8 bg-slate-800 text-white text-xs border border-slate-700 rounded text-center outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div className="flex gap-2">
                <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                <button onClick={() => fileInputRef.current?.click()} title="更换背景图" className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">{isCompressing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}</button>
                {isDrawing ? (
                    <>
                        <button onClick={finishShape} className="px-3 py-1.5 bg-green-600 rounded text-sm font-bold shadow-lg">完成</button>
                        <button onClick={() => { setIsDrawing(false); setCurrentPoints([]); }} className="px-3 py-1.5 bg-red-600 rounded text-sm font-bold">取消</button>
                    </>
                ) : (
                    <button onClick={() => setIsDrawing(true)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-bold shadow-lg transition-all"><Plus size={16} /> 绘制区域</button>
                )}
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={`p-1.5 rounded transition-all shadow-lg ${isExpanded ? 'bg-slate-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                    {isExpanded ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
          <div className="flex-1 relative bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
            <div 
              ref={wrapperRef} 
              className="flex-1 w-full h-full flex items-center justify-center bg-[#0f172a] overflow-auto relative custom-scrollbar"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            >
                <div 
                    ref={containerRef}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleCanvasClick}
                    style={{ width: displaySize.w, height: displaySize.h }}
                    className={`relative shadow-2xl transition-all duration-75 mx-auto ${isDrawing ? 'cursor-crosshair' : 'cursor-default'} ${dragOverMap ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
                >
                    {!currentMapUrl ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none select-none border border-slate-700/30">
                            <MapPin size={48} className="mb-2 opacity-50" />
                            <p className="text-sm font-medium">请上传背景图</p>
                        </div>
                    ) : (
                        <img src={currentMapUrl} className="w-full h-full pointer-events-none select-none" alt="map" onLoad={(e) => setNaturalSize({w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight})} />
                    )}

                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {currentSpaces.map(space => space.coordinates && (
                            <g key={space.id} onClick={(e) => toggleSelection(e, space.id)}>
                                <polygon points={pointsToString(space.coordinates)} className={`stroke-[0.5] hover:stroke-1 hover:fill-blue-500/40 transition-all cursor-pointer ${selectedIds.has(space.id) ? 'fill-blue-500/50 stroke-blue-300 stroke-[1] drop-shadow-lg' : 'fill-blue-500/10 stroke-blue-500/30'} ${space.attributes.includes('密室') ? 'fill-purple-500/20 stroke-purple-400' : ''}`} />
                            </g>
                        ))}
                        {currentPoints.length > 0 && <polygon points={pointsToString(currentPoints)} className="fill-blue-500/20 stroke-blue-400 stroke-[0.5]" />}
                        {selectionBox && (
                          <rect x={Math.min(selectionBox.x1, selectionBox.x2)} y={Math.min(selectionBox.y1, selectionBox.y2)} width={Math.abs(selectionBox.x1 - selectionBox.x2)} height={Math.abs(selectionBox.y1 - selectionBox.y2)} className="fill-blue-500/10 stroke-blue-400 stroke-[0.2]" strokeDasharray="1,1" />
                        )}
                    </svg>

                    {currentPlacements.filter(p => p.mapId === currentMapId).map(p => {
                        const char = characters.find(c => c.id === p.characterId);
                        if (!char) return null;
                        const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                        const isSelected = selectedIds.has(p.characterId);
                        return (
                            <div 
                              key={p.characterId} 
                              draggable 
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => handleTokenDragStart(e, p.characterId)} 
                              onClick={(e) => toggleSelection(e, p.characterId)} 
                              className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing group z-10 transition-all ${isSelected ? 'scale-110' : ''}`} 
                              style={{ left: `${p.x}%`, top: `${p.y}%` }}
                            >
                                <div className={`w-8 h-8 rounded-full bg-slate-800 border-2 shadow-lg flex items-center justify-center text-xs font-bold text-white relative transition-all overflow-hidden ${isSelected ? 'border-blue-400 ring-4 ring-blue-400/20' : 'border-white'}`}>
                                    {portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover" /> : char.name.charAt(0)}
                                    <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/75 text-[10px] px-1 rounded transition-opacity shadow-black/50 shadow-md ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{char.name}</div>
                                </div>
                            </div>
                        );
                    })}

                    {currentItemPlacements.filter(p => p.mapId === currentMapId).map(p => {
                        const clue = clues.find(c => c.id === p.clueId);
                        if (!clue) return null;
                        const isSelected = selectedIds.has(p.clueId);
                        return (
                            <div 
                              key={p.clueId} 
                              draggable 
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => handleItemDragStart(e, p.clueId)} 
                              onClick={(e) => toggleSelection(e, p.clueId)} 
                              onDoubleClick={(e) => { e.stopPropagation(); onOpenClueModal?.(clue); }} 
                              className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing group z-20 transition-all ${isSelected ? 'scale-110' : ''}`} 
                              style={{ left: `${p.x}%`, top: `${p.y}%` }}
                            >
                                <div className={`w-7 h-7 bg-amber-500 rounded-md border-2 shadow-lg flex items-center justify-center relative transition-all ${isSelected ? 'border-blue-400 ring-4 ring-blue-400/20' : 'border-amber-900/50'}`}>
                                    <div className="text-amber-900"><Package size={14} strokeWidth={3} /></div>
                                    <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-amber-900/90 text-[10px] px-1.5 py-0.5 rounded text-amber-100 transition-opacity font-bold shadow-xl border border-amber-500/30 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{clue.name}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
             </div>
          </div>

          {selectedIds.size > 0 && editForm && (
              <div className="w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                      <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                          <Edit3 size={16} className="text-blue-400" />
                          {selectedIds.size > 1 ? `批量编辑 (${selectedIds.size})` : '区域属性'}
                      </h3>
                      <button onClick={() => { setSelectedIds(new Set()); setEditForm(null); }} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
                  </div>
                  <div className="p-5 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                      <div className="space-y-2">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><MapPin size={12} /> 名称</label>
                          <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500" placeholder={selectedIds.size > 1 ? "统一设置" : "名称"} />
                      </div>
                      <div className="space-y-3">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Tag size={12} /> 状态标签</label>
                          <div className="flex flex-wrap gap-2">
                              {['密室', '上锁', '危险', '发现点'].map(attr => (
                                  <button key={attr} onClick={() => setEditForm({ ...editForm, attributes: editForm.attributes.includes(attr) ? editForm.attributes.filter(a => a !== attr) : [...editForm.attributes, attr] })} className={`text-[10px] px-3 py-1.5 rounded-full border transition-all font-bold ${editForm.attributes.includes(attr) ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'}`}>{attr}</button>
                              ))}
                          </div>
                          <div className="pt-2">
                              <div className="flex gap-2">
                                  <div className="relative flex-1">
                                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                                      <input value={customAttrInput} onChange={(e) => setCustomAttrInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddCustomAttr()} placeholder="自定义..." className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-300 outline-none" />
                                  </div>
                                  <button onClick={handleAddCustomAttr} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 transition-colors"><Plus size={18} /></button>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                  {editForm.attributes.filter(a => !['密室', '上锁', '危险', '发现点'].includes(a)).map(attr => (
                                      <div key={attr} className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-700 px-2.5 py-1 rounded-lg text-[10px] text-blue-300">{attr}<button onClick={() => handleRemoveAttr(attr)} className="text-slate-500 hover:text-red-400"><X size={10} /></button></div>
                                  ))}
                              </div>
                          </div>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><AlignLeft size={12} /> 场景备注</label>
                          <textarea value={editForm.note} onChange={e => setEditForm({...editForm, note: e.target.value})} className="w-full h-40 bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs text-slate-300 outline-none resize-none focus:ring-1 focus:ring-blue-500" placeholder="在此记录线索..." />
                      </div>
                  </div>
                  <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex gap-3">
                      <button onClick={handleBulkDelete} className="p-3 text-slate-500 hover:text-red-400 hover:bg-red-900/10 rounded-xl transition-all"><Trash2 size={20} /></button>
                      <button onClick={saveEdit} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-black transition-all shadow-xl shadow-blue-900/20 active:scale-95">保存更改</button>
                  </div>
              </div>
          )}
      </div>

      <div className={`shrink-0 bg-slate-800 rounded-lg border border-slate-700 flex flex-col shadow-inner transition-all ${isExpanded ? 'h-48' : 'h-40'}`}>
        <div className="px-3 py-1.5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm"><Clock size={14} className="text-orange-400" />时间线点 (Timeline)</h3>
            <div className="flex items-center gap-2">
               {clipboard.length > 0 && <div className="text-[10px] text-green-400 font-bold flex items-center gap-1.5 bg-green-900/30 px-2 py-0.5 rounded border border-green-500/20 animate-pulse"><Clipboard size={10}/> 剪贴板已就绪<button onClick={handleClearClipboard} className="text-slate-500 hover:text-red-400 ml-1"><X size={10} /></button></div>}
               <button onClick={() => { setNewTimeName(""); setIsTimeModalOpen(true); }} className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded transition-colors"><Plus size={14} /></button>
            </div>
        </div>
        <div className="flex-1 overflow-x-auto flex items-center p-2 gap-2 custom-scrollbar">
            {timePoints.map((tp) => {
                const linkedAlibis = alibis.filter(a => a.timePointId === tp.id);
                return (
                    <div key={tp.id} onClick={() => onSelectTime(tp.id)} className={`group flex-shrink-0 min-w-[14rem] h-full p-3 rounded cursor-pointer border transition-all relative flex flex-row items-stretch ${currentTimeId === tp.id ? 'bg-slate-700 border-orange-500/50 shadow-lg' : 'bg-slate-800 border-slate-700 hover:bg-slate-700/50 hover:border-slate-600'}`}>
                        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                               {linkedAlibis.length > 0 && (
                                 <button onClick={(e) => { e.stopPropagation(); setShowAlibiSummary(tp.id); }} title="查看不在场证明汇总" className="text-purple-400 hover:scale-110 p-0.5">
                                   <ShieldCheck size={11}/>
                                 </button>
                               )}
                               <button 
                                   onClick={(e) => { e.stopPropagation(); setEditingTimeId(tp.id); setTempTimeLabel(tp.label); }} 
                                   title="编辑名称"
                                   className="text-slate-500 hover:text-blue-400 p-0.5"
                               >
                                   <Edit3 size={11}/>
                               </button>
                               {timePoints.length > 1 && <button onClick={(e) => { e.stopPropagation(); setTimeToDelete(tp.id); }} title="删除时间点" className="text-slate-600 hover:text-red-400 p-0.5"><X size={11} /></button>}
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden pr-2">
                            {editingTimeId === tp.id ? (
                                <input 
                                    autoFocus
                                    value={tempTimeLabel}
                                    onChange={(e) => setTempTimeLabel(e.target.value)}
                                    onBlur={handleUpdateCurrentTimeLabel}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdateCurrentTimeLabel();
                                        if (e.key === 'Escape') setEditingTimeId(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-slate-900 border border-blue-500 rounded px-1.5 py-1 text-xs text-white w-full outline-none"
                                />
                            ) : (
                                <div 
                                    onDoubleClick={(e) => { e.stopPropagation(); setEditingTimeId(tp.id); setTempTimeLabel(tp.label); }}
                                    className="flex flex-col min-w-0"
                                >
                                    <span className={`text-sm font-bold leading-tight ${currentTimeId === tp.id ? 'text-orange-100' : 'text-slate-300'}`}>
                                        {tp.label.length > 7 ? tp.label.slice(0, 7) : tp.label}
                                    </span>
                                    {tp.label.length > 7 && (
                                        <span className={`text-[10px] font-medium mt-1 opacity-60 break-all leading-[1.2] ${currentTimeId === tp.id ? 'text-orange-200/80' : 'text-slate-500'}`}>
                                            {tp.label.slice(7)}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 flex flex-col justify-center gap-1.5 pl-3 border-l border-white/5">
                             <div className="flex items-center gap-1.5 px-2 py-1 bg-black/30 rounded text-[9px] text-slate-400 font-mono shadow-inner border border-white/5">
                                 <Users size={10} className="text-blue-500/70" />
                                 <span>{timelineData[tp.id]?.length || 0}</span>
                             </div>
                             <div className="flex items-center gap-1.5 px-2 py-1 bg-black/30 rounded text-[9px] text-slate-400 font-mono shadow-inner border border-white/5">
                                 <Package size={10} className="text-amber-500/70" />
                                 <span>{itemTimelineData[tp.id]?.length || 0}</span>
                             </div>
                        </div>

                        {currentTimeId === tp.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-b"></div>}
                    </div>
                );
            })}
        </div>
      </div>

      {showAlibiSummary && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAlibiSummary(null)}>
            <div className="bg-slate-800 rounded-2xl border border-purple-500/40 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                    <h3 className="font-bold text-white flex items-center gap-2"><ShieldCheck size={20} className="text-purple-400" />证明核查: {timePoints.find(t => t.id === showAlibiSummary)?.label}</h3>
                    <button onClick={() => setShowAlibiSummary(null)}><X size={20} className="text-slate-400" /></button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
                    {alibis.filter(a => a.timePointId === showAlibiSummary).map((alibi, i) => (
                        <div key={i} className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 space-y-3">
                            <div className="flex flex-wrap gap-1.5">
                                {alibi.character_ids.map(cid => (
                                    <span key={cid} className="px-2 py-0.5 bg-blue-900/30 text-blue-300 border border-blue-500/30 rounded text-[10px] font-bold">
                                        {characters.find(c => c.id === cid)?.name}
                                    </span>
                                ))}
                                <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold border ${alibi.status === '确凿' ? 'bg-green-900/20 text-green-400 border-green-500/30' : alibi.status === '模糊' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30' : 'bg-red-900/20 text-red-400 border-red-500/30'}`}>
                                    {alibi.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-400">
                                <span className="flex items-center gap-1"><MapPin size={12}/> {alibi.location}</span>
                                <span className="flex items-center gap-1"><Clock size={12}/> {alibi.time_period}</span>
                            </div>
                            {alibi.details && <p className="text-xs text-slate-500 italic border-l-2 border-slate-700 pl-3 py-1 font-mono">{alibi.details}</p>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {mapToDelete && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-800 rounded-2xl border border-red-900/50 shadow-2xl w-full max-sm overflow-hidden p-6 text-center">
              <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30"><AlertTriangle className="text-red-500" size={32} /></div>
              <h3 className="text-xl font-bold text-white mb-2">确认删除场景?</h3>
              <p className="text-slate-400 text-sm mb-6">场景 "<span className="text-white font-bold">{mapToDelete.name}</span>" 及其关联数据将被永久删除。</p>
              <div className="flex gap-3"><button onClick={() => setMapToDelete(null)} className="flex-1 px-4 py-2.5 bg-slate-700 text-slate-200 rounded-xl font-bold">取消</button><button onClick={handleConfirmDeleteMap} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold">确认</button></div>
          </div>
        </div>
      )}
      {timeToDelete && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-800 rounded-2xl border border-red-900/50 shadow-2xl w-full max-sm overflow-hidden p-6 text-center">
              <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30"><AlertTriangle className="text-red-500" size={32} /></div>
              <h3 className="text-xl font-bold text-white mb-2">确认删除轨迹点?</h3>
              <p className="text-slate-400 text-sm mb-6">确定要删除此时间点吗？</p>
              <div className="flex gap-3"><button onClick={() => setTimeToDelete(null)} className="flex-1 px-4 py-2.5 bg-slate-700 text-slate-200 rounded-xl font-bold">取消</button><button onClick={handleConfirmDeleteTime} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold">确认</button></div>
          </div>
        </div>
      )}
      {isTimeModalOpen && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-sm">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-xl"><h3 className="font-bold text-white">添加时间节点</h3><button onClick={() => setIsTimeModalOpen(false)}><X size={20}/></button></div>
                <div className="p-6"><input ref={timeInputRef} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none" placeholder="例如: 12:00" value={newTimeName} onChange={(e) => setNewTimeName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveTimePoint()} /></div>
                <div className="p-4 border-t border-slate-700 flex justify-end gap-2 bg-slate-800/50 rounded-b-xl"><button onClick={() => setIsTimeModalOpen(false)} className="px-4 py-2 text-slate-300">取消</button><button onClick={handleSaveTimePoint} className="px-4 py-2 bg-blue-600 text-white rounded font-bold shadow-lg">确认</button></div>
            </div>
        </div>
      )}
      {isMapModalOpen && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-sm">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-xl"><h3 className="font-bold text-white">新建地图层</h3><button onClick={() => setIsMapModalOpen(false)}><X size={20}/></button></div>
                <div className="p-6"><input ref={mapInputRef} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none" placeholder="例如: 地下室" value={newMapName} onChange={(e) => setNewMapName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleConfirmAddMap()} /></div>
                <div className="p-4 border-t border-slate-700 flex justify-end gap-2 bg-slate-800/50 rounded-b-xl"><button onClick={() => setIsMapModalOpen(false)} className="px-4 py-2 text-slate-300 text-sm">取消</button><button onClick={handleConfirmAddMap} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold shadow-lg">创建</button></div>
            </div>
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
