
import React, { useState } from 'react';
import { Character, TimelineSegment, Location, TimePeriodLabel, TimePoint } from '../types';
import { Plus, Trash2, Clock, MapPin, UserPlus, X, Calendar, GripVertical, ChevronDown, ChevronUp, Link as LinkIcon, Map as MapIcon, Info, Maximize, Minimize } from 'lucide-react';

interface Props {
  characters: Character[];
  segments: TimelineSegment[];
  periods: TimePeriodLabel[];
  activeCharIds: string[];
  charOrder: string[];
  slotCount: number;
  locations: Location[];
  timePoints: TimePoint[];
  onAddSegment: (seg: TimelineSegment) => void;
  onRemoveSegment: (id: string) => void;
  onUpdateActiveChars: (ids: string[]) => void;
  onUpdateSlotCount: (count: number) => void;
  onUpdatePeriods: (periods: TimePeriodLabel[]) => void;
  onUpdateCharOrder: (order: string[]) => void;
  onInsertSlot: (index: number) => void;
}

const SLOT_HEIGHT = 64; 
const LEFT_SECTION_WIDTH = 140; 
const CHAR_COLUMN_WIDTH = 220;
const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

const TimelineVertical: React.FC<Props> = ({
  characters,
  segments,
  periods = [],
  activeCharIds,
  charOrder = [],
  slotCount,
  locations,
  timePoints,
  onAddSegment,
  onRemoveSegment,
  onUpdateActiveChars,
  onUpdateSlotCount,
  onUpdatePeriods,
  onUpdateCharOrder,
  onInsertSlot
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeg, setEditingSeg] = useState<Partial<TimelineSegment> | null>(null);
  const [draggedCharIndex, setDraggedCharIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [newPeriodLabel, setNewPeriodLabel] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const sortedIds = [
    ...charOrder.filter(id => activeCharIds.includes(id)),
    ...activeCharIds.filter(id => !charOrder.includes(id))
  ];
  
  const activeCharacters = sortedIds.map(id => characters.find(c => c.id === id)).filter(Boolean) as Character[];

  const handleOpenAdd = (charId?: string, slotIdx?: number) => {
    setEditingSeg({
      id: crypto.randomUUID(),
      characterId: charId || activeCharIds[0] || '',
      startSlot: slotIdx ?? 0,
      endSlot: (slotIdx ?? 0) + 1,
      locationName: '',
      timeLabel: '',
      relatedTimePointId: '',
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    });
    setIsModalOpen(true);
  };

  const handleSaveSegment = () => {
    if (editingSeg && editingSeg.characterId && editingSeg.locationName) {
      onAddSegment(editingSeg as TimelineSegment);
      if (editingSeg.timeLabel) {
        const hasExisting = periods.some(p => p.startSlot === editingSeg.startSlot && p.endSlot === editingSeg.endSlot);
        if (!hasExisting) {
            onUpdatePeriods([...periods, {
                id: crypto.randomUUID(),
                label: editingSeg.timeLabel,
                startSlot: editingSeg.startSlot!,
                endSlot: editingSeg.endSlot!,
                color: editingSeg.color
            }]);
        }
      }
      setIsModalOpen(false);
      setEditingSeg(null);
    }
  };

  const handleSavePeriod = () => {
      if (newPeriodLabel.trim() && editingSeg) {
          onUpdatePeriods([...periods, {
              id: crypto.randomUUID(),
              label: newPeriodLabel.trim(),
              startSlot: editingSeg.startSlot!,
              endSlot: editingSeg.endSlot!,
              color: COLORS[Math.floor(Math.random() * COLORS.length)]
          }]);
          setNewPeriodLabel("");
          setIsPeriodModalOpen(false);
          setEditingSeg(null);
      }
  };

  return (
    <div className={`flex flex-col transition-all duration-300 ${isExpanded ? 'fixed inset-0 z-[400] bg-slate-950 p-6' : 'min-h-screen space-y-4'}`}>
      <div className="flex items-center justify-between bg-slate-800/80 p-4 rounded-xl border border-slate-700 shadow-xl backdrop-blur shrink-0 sticky top-0 z-[100]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">轴格配置</span>
            <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-700">
                <input 
                    type="number" 
                    className="w-12 bg-transparent text-center text-blue-400 font-mono text-sm outline-none"
                    value={slotCount}
                    onChange={(e) => onUpdateSlotCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <div className="flex flex-col gap-0.5 ml-1">
                    <button onClick={() => onUpdateSlotCount(slotCount+1)} className="text-slate-500 hover:text-white"><ChevronUp size={12}/></button>
                    <button onClick={() => onUpdateSlotCount(Math.max(1, slotCount-1))} className="text-slate-500 hover:text-white"><ChevronDown size={12}/></button>
                </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-slate-400" />
            <div className="flex flex-wrap gap-1 max-w-xl">
              {characters.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    const next = activeCharIds.includes(c.id) 
                      ? activeCharIds.filter(id => id !== c.id)
                      : [...activeCharIds, c.id];
                    onUpdateActiveChars(next);
                  }}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                    activeCharIds.includes(c.id) 
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg' 
                      : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 items-center">
            <button 
                onClick={() => { setShowGuide(true); setTimeout(() => setShowGuide(false), 3000); }}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
            >
                <Calendar size={16} /> 备注时间段
            </button>
            <button 
                onClick={() => handleOpenAdd()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-black shadow-lg shadow-blue-900/30 transition-all active:scale-95"
            >
                <Plus size={18} /> 活动实录
            </button>
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-xl border border-slate-600 shadow-xl transition-all"
            >
                {isExpanded ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
        </div>
      </div>

      <div 
        className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl overflow-x-auto custom-scrollbar relative"
        style={{ transform: 'rotateX(180deg)' }} 
      >
        <div 
          className="min-w-max min-h-full flex flex-col"
          style={{ transform: 'rotateX(180deg)' }} 
        >
          <div className="flex sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
            <div 
              style={{ width: `${LEFT_SECTION_WIDTH}px` }}
              className="sticky left-0 top-0 z-[60] shrink-0 bg-slate-900 border-r border-slate-800 flex items-center justify-center font-black text-[10px] text-slate-500 uppercase tracking-widest h-14"
            >
              时间/轴标
            </div>
            {activeCharacters.map((char, idx) => (
              <div 
                key={char.id} 
                draggable
                onDragStart={() => setDraggedCharIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                    if (draggedCharIndex !== null && draggedCharIndex !== idx) {
                        const newOrder = [...sortedIds];
                        const [moved] = newOrder.splice(draggedCharIndex, 1);
                        newOrder.splice(idx, 0, moved);
                        onUpdateCharOrder(newOrder);
                    }
                    setDraggedCharIndex(null);
                }}
                style={{ width: `${CHAR_COLUMN_WIDTH}px` }}
                className={`shrink-0 border-r border-slate-800/50 flex items-center justify-center group/head cursor-move transition-colors hover:bg-slate-800/30 ${draggedCharIndex === idx ? 'opacity-20' : ''}`}
              >
                <div className="flex items-center justify-center gap-2">
                    <GripVertical size={14} className="text-slate-700 group-hover/head:text-blue-500" />
                    <span className="text-sm font-black text-blue-200">{char.name}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex">
            <div 
              style={{ width: `${LEFT_SECTION_WIDTH}px` }}
              className="sticky left-0 z-40 bg-slate-900/95 border-r border-slate-800 flex shrink-0"
            >
                <div className="w-20 shrink-0 relative bg-slate-950/20">
                    {periods.map(p => (
                        <div 
                            key={p.id}
                            style={{ 
                                top: `${p.startSlot * SLOT_HEIGHT + 4}px`, 
                                height: `${(p.endSlot - p.startSlot) * SLOT_HEIGHT - 8}px`,
                                backgroundColor: `${p.color || '#3b82f6'}15`,
                                borderColor: p.color || '#3b82f6'
                            }}
                            className="absolute left-1 right-1 border-l-2 rounded p-1 overflow-hidden group/p shadow-sm z-10"
                        >
                            <div className="text-[9px] font-bold text-slate-400 leading-tight line-clamp-3">
                                {p.label}
                            </div>
                            <button 
                                onClick={() => onUpdatePeriods(periods.filter(x => x.id !== p.id))}
                                className="absolute top-0 right-0 p-0.5 opacity-0 group-hover/p:opacity-100 text-red-500 hover:bg-red-500/20 rounded"
                            >
                                <X size={8}/>
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex-1 flex flex-col bg-slate-900/40 relative">
                    {Array.from({ length: slotCount }).map((_, i) => (
                        <div 
                            key={i} 
                            style={{ height: `${SLOT_HEIGHT}px` }} 
                            className={`flex flex-col items-center justify-center border-b border-slate-800/30 transition-colors hover:bg-slate-800/40 cursor-pointer relative group/slot ${selectionStart === i ? 'bg-blue-600/20 ring-1 ring-blue-500/50 shadow-inner' : ''}`}
                            onClick={() => {
                                if (selectionStart === null) setSelectionStart(i);
                                else {
                                    const start = Math.min(selectionStart, i);
                                    const end = Math.max(selectionStart, i) + 1;
                                    setSelectionStart(null);
                                    setEditingSeg({ startSlot: start, endSlot: end } as any);
                                    setIsPeriodModalOpen(true);
                                }
                            }}
                        >
                            <span className={`text-[10px] font-mono font-black transition-colors ${selectionStart === i ? 'text-blue-400' : 'text-slate-600 group-hover/slot:text-slate-400'}`}>G{i+1}</span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onInsertSlot(i); }}
                                className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 p-1.5 bg-blue-600 rounded-full text-white opacity-0 group-hover/slot:opacity-100 hover:scale-110 transition-all z-50 shadow-lg border border-white/10"
                            >
                                <Plus size={10} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex">
              {activeCharacters.map(char => (
                <div 
                  key={char.id} 
                  style={{ width: `${CHAR_COLUMN_WIDTH}px` }}
                  className="shrink-0 border-r border-slate-900/30 relative"
                  onDoubleClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const slotIdx = Math.floor(y / SLOT_HEIGHT);
                    handleOpenAdd(char.id, slotIdx);
                  }}
                >
                  <div className="absolute inset-0 pointer-events-none">
                    {Array.from({ length: slotCount }).map((_, i) => (
                      <div key={i} style={{ height: `${SLOT_HEIGHT}px` }} className="border-b border-slate-900/30" />
                    ))}
                  </div>

                  {segments.filter(s => s.characterId === char.id).map(seg => {
                    const top = seg.startSlot * SLOT_HEIGHT;
                    const height = (seg.endSlot - seg.startSlot) * SLOT_HEIGHT;
                    return (
                      <div
                        key={seg.id}
                        style={{ 
                          top: `${top + 6}px`, 
                          height: `${height - 12}px`,
                          backgroundColor: `${seg.color}15`,
                          borderColor: seg.color
                        }}
                        className="absolute left-3 right-3 rounded-xl border-l-4 shadow-xl group/seg transition-all hover:scale-[1.02] hover:z-20 p-3 overflow-hidden flex flex-col justify-center border border-slate-700/30 backdrop-blur-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[11px] font-black text-white/90 truncate flex items-center gap-1.5">
                                <MapPin size={12} style={{ color: seg.color }} /> {seg.locationName}
                              </span>
                              {(seg.timeLabel || seg.relatedTimePointId) && (
                                <div className="text-[9px] font-mono text-slate-400 flex flex-wrap gap-2 items-center">
                                  {seg.timeLabel && <div className="flex items-center gap-1"><Clock size={10} /> {seg.timeLabel}</div>}
                                  {seg.relatedTimePointId && (
                                    <div className="flex items-center gap-1 text-blue-400">
                                      <LinkIcon size={10} /> {timePoints.find(t => t.id === seg.relatedTimePointId)?.label}
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                          <button onClick={() => onRemoveSegment(seg.id)} className="opacity-0 group-hover/seg:opacity-100 p-1.5 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && editingSeg && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
              <h3 className="font-bold text-white flex items-center gap-3"><Clock size={20} className="text-blue-400" />轨迹实录</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full transition-colors"><X size={24}/></button>
            </div>
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">起始格 (G)</label>
                  <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500" value={(editingSeg.startSlot || 0) + 1} onChange={(e) => setEditingSeg({ ...editingSeg, startSlot: Math.max(0, parseInt(e.target.value) - 1 || 0) })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">终止格 (G)</label>
                  <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500" value={editingSeg.endSlot} onChange={(e) => setEditingSeg({ ...editingSeg, endSlot: parseInt(e.target.value) || 1 })} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><MapPin size={12}/> 案发地点</label>
                <div className="flex gap-2">
                  <select 
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                    value={editingSeg.locationName}
                    onChange={(e) => setEditingSeg({ ...editingSeg, locationName: e.target.value })}
                  >
                    <option value="">-- 选择已有地点 --</option>
                    {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                  </select>
                  <input 
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="或手动录入..."
                    value={editingSeg.locationName}
                    onChange={(e) => setEditingSeg({ ...editingSeg, locationName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><MapIcon size={12}/> 关联空间轨迹点</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                  value={editingSeg.relatedTimePointId || ''}
                  onChange={(e) => setEditingSeg({ ...editingSeg, relatedTimePointId: e.target.value })}
                >
                  <option value="">-- 不关联轨迹点 --</option>
                  {timePoints.map(tp => <option key={tp.id} value={tp.id}>{tp.label}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">时间备注 (手动)</label>
                <input className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500" placeholder="例如: 14:00" value={editingSeg.timeLabel} onChange={(e) => setEditingSeg({ ...editingSeg, timeLabel: e.target.value })} />
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/30">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-bold transition-colors">取消</button>
              <button onClick={handleSaveSegment} className="px-12 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black shadow-xl transition-all active:scale-95">确认存入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineVertical;
