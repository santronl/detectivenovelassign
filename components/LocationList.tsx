
import React, { useState } from 'react';
import { Location, MapDoc, Space } from '../types';
import { MapPin, Plus, Trash2, Edit3, X, AlignLeft, Info, Link as LinkIcon } from 'lucide-react';

interface Props {
  locations: Location[];
  maps: MapDoc[];
  spaces: Space[];
  onAddLocation: (loc: Location) => void;
  onUpdateLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
}

const LocationList: React.FC<Props> = ({ locations, maps, spaces, onAddLocation, onUpdateLocation, onDeleteLocation }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [mapId, setMapId] = useState('');
  const [spaceId, setSpaceId] = useState('');

  const handleOpenAdd = () => {
    setEditingLoc(null);
    setName('');
    setNote('');
    setMapId('');
    setSpaceId('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (loc: Location) => {
    setEditingLoc(loc);
    setName(loc.name);
    setNote(loc.note || '');
    setMapId(loc.mapId || '');
    setSpaceId(loc.spaceId || '');
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const data: Location = {
      id: editingLoc?.id || crypto.randomUUID(),
      name: name.trim(),
      note: note.trim(),
      mapId: mapId || undefined,
      spaceId: spaceId || undefined
    };
    if (editingLoc) onUpdateLocation(data);
    else onAddLocation(data);
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">地点索引 • 规范化案发空间管理</p>
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
        >
          <Plus size={18} /> 新增关键地点
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.map(loc => (
          <div key={loc.id} className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-md hover:border-emerald-500/40 transition-all group flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-900/30 rounded-lg text-emerald-400">
                  <MapPin size={18} />
                </div>
                <h3 className="font-bold text-white">{loc.name}</h3>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleOpenEdit(loc)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg"><Edit3 size={14}/></button>
                <button onClick={() => onDeleteLocation(loc.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg"><Trash2 size={14}/></button>
              </div>
            </div>

            {loc.note && (
              <p className="text-xs text-slate-400 italic line-clamp-2 bg-slate-900/50 p-2 rounded-lg border border-slate-700/50">
                {loc.note}
              </p>
            )}

            <div className="mt-auto pt-2 border-t border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <LinkIcon size={10} />
                {loc.mapId ? (
                  <span className="text-emerald-500/80">关联场景: {maps.find(m => m.id === loc.mapId)?.name}</span>
                ) : (
                  <span className="italic">未关联地图</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {locations.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-700 rounded-3xl text-slate-600">
            <MapPin size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">尚未定义地点列表，点击上方按钮开始规范化地点管理</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-600 shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-3xl">
              <h3 className="font-bold text-white flex items-center gap-2">
                <MapPin size={18} className="text-emerald-400" />
                {editingLoc ? '编辑地点档案' : '录入新地点'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">地点名称</label>
                <input 
                  autoFocus
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500/50" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="如: 密室A, 二楼阳台..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">关联地图层</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
                  value={mapId}
                  onChange={e => {
                    setMapId(e.target.value);
                    setSpaceId('');
                  }}
                >
                  <option value="">-- 不关联 --</option>
                  {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              {mapId && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">具体标注区域</label>
                  <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
                    value={spaceId}
                    onChange={e => setSpaceId(e.target.value)}
                  >
                    <option value="">-- 全图关联 --</option>
                    {spaces.filter(s => s.mapId === mapId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">环境备注</label>
                <textarea 
                  className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-xs leading-relaxed outline-none resize-none focus:ring-2 focus:ring-emerald-500/50" 
                  value={note} 
                  onChange={e => setNote(e.target.value)} 
                  placeholder="描述地点的特殊性、关键物品或逻辑意义..."
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/30 rounded-b-3xl">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 text-sm">取消</button>
              <button onClick={handleSubmit} className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg">确认保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationList;
