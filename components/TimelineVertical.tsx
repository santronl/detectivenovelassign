
import React, { useState } from 'react';
import { Character, TimelineSegment, Location } from '../types';
import { Plus, Trash2, Clock, MapPin, UserPlus, X, Edit2, Calendar } from 'lucide-react';

interface Props {
  characters: Character[];
  segments: TimelineSegment[];
  activeCharIds: string[];
  slotCount: number;
  locations: Location[];
  onAddSegment: (seg: TimelineSegment) => void;
  onRemoveSegment: (id: string) => void;
  onUpdateActiveChars: (ids: string[]) => void;
  onUpdateSlotCount: (count: number) => void;
}

const SLOT_HEIGHT = 50; // 每格高度 50px
const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

const TimelineVertical: React.FC<Props> = ({
  characters,
  segments,
  activeCharIds,
  slotCount,
  locations,
  onAddSegment,
  onRemoveSegment,
  onUpdateActiveChars,
  onUpdateSlotCount
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeg, setEditingSeg] = useState<Partial<TimelineSegment> | null>(null);

  const activeCharacters = characters.filter(c => activeCharIds.includes(c.id));

  const handleOpenAdd = (charId?: string, slotIdx?: number) => {
    setEditingSeg({
      id: crypto.randomUUID(),
      characterId: charId || activeCharIds[0] || '',
      startSlot: slotIdx ?? 0,
      endSlot: (slotIdx ?? 0) + 1,
      locationName: '',
      timeLabel: '',
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingSeg && editingSeg.characterId && editingSeg.locationName) {
      onAddSegment(editingSeg as TimelineSegment);
      setIsModalOpen(false);
      setEditingSeg(null);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">总格数:</span>
            <input 
              type="number" 
              className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm text-blue-400 font-mono focus:ring-1 focus:ring-blue-500 outline-none"
              value={slotCount}
              onChange={(e) => onUpdateSlotCount(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div className="h-6 w-[1px] bg-slate-700" />
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-slate-400" />
            <div className="flex flex-wrap gap-1 max-w-md">
              {characters.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    const next = activeCharIds.includes(c.id) 
                      ? activeCharIds.filter(id => id !== c.id)
                      : [...activeCharIds, c.id];
                    onUpdateActiveChars(next);
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                    activeCharIds.includes(c.id) 
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md' 
                      : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button 
          onClick={() => handleOpenAdd()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95"
        >
          <Plus size={18} /> 添加活动记录
        </button>
      </div>

      {/* 时间线主体 */}
      <div className="flex-1 bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl relative flex flex-col">
        {/* 表头 */}
        <div className="flex border-b border-slate-700 bg-slate-800/80 backdrop-blur sticky top-0 z-20">
          <div className="w-16 shrink-0 border-r border-slate-700 flex items-center justify-center font-mono text-[10px] text-slate-500 font-bold uppercase">时间轴</div>
          <div className="flex-1 flex min-w-0">
            {activeCharacters.map(char => (
              <div key={char.id} className="flex-1 min-w-[150px] border-r border-slate-700/50 py-3 text-center">
                <span className="text-sm font-black text-blue-300 tracking-tight">{char.name}</span>
              </div>
            ))}
            {activeCharIds.length === 0 && (
              <div className="flex-1 py-10 text-center text-slate-600 italic text-sm">请点击上方按钮选取要分析的角色轨道...</div>
            )}
          </div>
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <div className="flex min-h-full">
            {/* 时间坐标轴刻度 */}
            <div className="w-16 shrink-0 border-r border-slate-700 bg-slate-800/20 relative z-10">
              {Array.from({ length: slotCount }).map((_, i) => (
                <div key={i} style={{ height: `${SLOT_HEIGHT}px` }} className="flex flex-col items-center justify-start pt-1 border-b border-slate-800/50">
                  <span className="text-[10px] font-mono font-bold text-slate-600">G{i+1}</span>
                </div>
              ))}
            </div>

            {/* 角色轨道区 */}
            <div className="flex-1 flex min-w-0 relative">
              {/* 背景网格 */}
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: slotCount }).map((_, i) => (
                  <div key={i} style={{ height: `${SLOT_HEIGHT}px` }} className="w-full border-b border-slate-800/50" />
                ))}
              </div>

              {activeCharacters.map(char => (
                <div 
                  key={char.id} 
                  className="flex-1 min-w-[150px] border-r border-slate-800/30 relative group"
                  onDoubleClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const slotIdx = Math.floor(y / SLOT_HEIGHT);
                    handleOpenAdd(char.id, slotIdx);
                  }}
                >
                  {/* 该角色的片段 */}
                  {segments.filter(s => s.characterId === char.id).map(seg => {
                    const top = seg.startSlot * SLOT_HEIGHT;
                    const height = (seg.endSlot - seg.startSlot) * SLOT_HEIGHT;
                    return (
                      <div
                        key={seg.id}
                        style={{ 
                          top: `${top + 4}px`, 
                          height: `${height - 8}px`,
                          backgroundColor: `${seg.color}22`,
                          borderColor: seg.color
                        }}
                        className="absolute left-2 right-2 rounded-lg border-l-4 shadow-lg group/seg transition-all hover:scale-[1.02] hover:z-20 p-2 overflow-hidden flex flex-col justify-center"
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-black uppercase text-white/90 truncate drop-shadow-sm flex items-center gap-1">
                            <MapPin size={10} style={{ color: seg.color }} /> {seg.locationName}
                          </span>
                          <button 
                            onClick={() => onRemoveSegment(seg.id)}
                            className="opacity-0 group-hover/seg:opacity-100 p-0.5 bg-red-500/80 rounded hover:bg-red-500 text-white transition-opacity"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                        {seg.timeLabel && (
                          <div className="flex items-center gap-1 text-[9px] font-mono text-white/50 bg-black/20 px-1 py-0.5 rounded w-fit">
                            <Clock size={8} /> {seg.timeLabel}
                          </div>
                        )}
                        {/* 拖动提示或装饰 */}
                        <div className="absolute right-1 bottom-1 opacity-10">
                           <Calendar size={24} style={{ color: seg.color }} />
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

      {/* 录入 Modal */}
      {isModalOpen && editingSeg && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-blue-400" /> 轨迹记录
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">选择角色</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  value={editingSeg.characterId}
                  onChange={(e) => setEditingSeg({ ...editingSeg, characterId: e.target.value })}
                >
                  {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">起始格 (G1...)</label>
                  <input 
                    type="number" min="0" max={slotCount - 1}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none"
                    value={editingSeg.startSlot}
                    onChange={(e) => setEditingSeg({ ...editingSeg, startSlot: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">终止格 (G2...)</label>
                  <input 
                    type="number" min={editingSeg.startSlot || 0} max={slotCount}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none"
                    value={editingSeg.endSlot}
                    onChange={(e) => setEditingSeg({ ...editingSeg, endSlot: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">备注地点</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-600" size={16} />
                  <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="例如: 别墅图书馆, 死角..."
                    value={editingSeg.locationName}
                    list="location-hints"
                    onChange={(e) => setEditingSeg({ ...editingSeg, locationName: e.target.value })}
                  />
                  <datalist id="location-hints">
                    {locations.map(l => <option key={l.id} value={l.name} />)}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">时间标签 (选填)</label>
                <div className="relative">
                  <Edit2 className="absolute left-3 top-3 text-slate-600" size={16} />
                  <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="例如: 12:45 - 13:00"
                    value={editingSeg.timeLabel}
                    onChange={(e) => setEditingSeg({ ...editingSeg, timeLabel: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase">标记颜色</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button 
                      key={c} 
                      onClick={() => setEditingSeg({ ...editingSeg, color: c })}
                      style={{ backgroundColor: c }}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${editingSeg.color === c ? 'border-white scale-110' : 'border-transparent opacity-50'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/20">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-bold">取消</button>
              <button onClick={handleSave} className="px-10 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-black shadow-xl shadow-blue-900/20 transition-all active:scale-95">完成录入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineVertical;
