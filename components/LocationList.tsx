
import React, { useState } from 'react';
import { Location, MapDoc, Space, LocationItem } from '../types';
import { MapPin, Plus, Trash2, Edit3, X, AlignLeft, Info, Link as LinkIcon, Package, FileText, ChevronRight } from 'lucide-react';

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
  const [items, setItems] = useState<LocationItem[]>([]);

  const handleOpenAdd = () => {
    setEditingLoc(null);
    setName('');
    setNote('');
    setMapId('');
    setSpaceId('');
    setItems([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (loc: Location) => {
    setEditingLoc(loc);
    setName(loc.name);
    setNote(loc.note || '');
    setMapId(loc.mapId || '');
    setSpaceId(loc.spaceId || '');
    setItems(loc.items || []);
    setIsModalOpen(true);
  };

  const handleAddItem = () => {
    const newItem: LocationItem = {
      id: crypto.randomUUID(),
      name: '',
      note: ''
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof LocationItem, value: string) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const data: Location = {
      id: editingLoc?.id || crypto.randomUUID(),
      name: name.trim(),
      note: note.trim(),
      mapId: mapId || undefined,
      spaceId: spaceId || undefined,
      items: items.filter(i => i.name.trim() !== '') // 过滤掉空名称的物品
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.map(loc => (
          <div key={loc.id} className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-md hover:border-emerald-500/40 transition-all group flex flex-col gap-4 relative">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-900/30 rounded-lg text-emerald-400">
                  <MapPin size={20} />
                </div>
                <h3 className="font-bold text-white text-lg">{loc.name}</h3>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleOpenEdit(loc)} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg"><Edit3 size={16}/></button>
                <button onClick={() => onDeleteLocation(loc.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg"><Trash2 size={16}/></button>
              </div>
            </div>

            {loc.note && (
              <p className="text-xs text-slate-400 italic bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 leading-relaxed">
                {loc.note}
              </p>
            )}

            {loc.items && loc.items.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                  <Package size={12} /> 室内物品清单 ({loc.items.length})
                </div>
                <div className="flex flex-wrap gap-2 max-h-20 overflow-hidden relative">
                  {loc.items.slice(0, 5).map(item => (
                    <span key={item.id} className="px-2 py-1 bg-slate-700/50 text-[10px] text-slate-300 rounded-md border border-slate-600/50 truncate max-w-[120px]" title={item.note}>
                      {item.name}
                    </span>
                  ))}
                  {loc.items.length > 5 && (
                    <span className="px-2 py-1 bg-slate-900/80 text-[10px] text-emerald-400 rounded-md border border-emerald-900/50 font-bold">
                      +{loc.items.length - 5}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-auto pt-3 border-t border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <LinkIcon size={12} />
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
          <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-700 rounded-3xl text-slate-600 bg-slate-800/20">
            <MapPin size={56} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">尚未定义地点列表</p>
            <p className="text-xs mt-2 opacity-50">点击右上方按钮开始规范化空间与室内物品管理</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-600 shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600 rounded-xl">
                  <MapPin size={20} className="text-white" />
                </div>
                <h3 className="font-bold text-white text-lg">
                  {editingLoc ? '编辑地点详情' : '录入空间档案'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-700 rounded-full transition-colors">
                <X size={24} className="text-slate-400"/>
              </button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Edit3 size={12}/> 地点名称
                  </label>
                  <input 
                    autoFocus
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-bold" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="如: 密室A, 二楼阳台..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <LinkIcon size={12}/> 关联场景
                  </label>
                  <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none transition-all"
                    value={mapId}
                    onChange={e => {
                      setMapId(e.target.value);
                      setSpaceId('');
                    }}
                  >
                    <option value="">-- 不关联地图层 --</option>
                    {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                {mapId && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 col-span-full">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <ChevronRight size={12} /> 具体标注区域 (绘制区域)
                    </label>
                    <select 
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                      value={spaceId}
                      onChange={e => setSpaceId(e.target.value)}
                    >
                      <option value="">-- 全图/未标记区域 --</option>
                      {spaces.filter(s => s.mapId === mapId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* 室内备注 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <AlignLeft size={14} /> 环境描述与线索备注
                </label>
                <textarea 
                  className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-xs leading-relaxed outline-none resize-none focus:ring-2 focus:ring-emerald-500/50 transition-all" 
                  value={note} 
                  onChange={e => setNote(e.target.value)} 
                  placeholder="记录该地点的特殊性，例如：窗户紧闭、空气中有淡淡的杏仁味..."
                />
              </div>

              {/* 物品清单 */}
              <div className="space-y-4 pt-4 border-t border-slate-700/50">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Package size={14} /> 室内物品清单 (场景摆设)
                  </label>
                  <button 
                    onClick={handleAddItem}
                    className="text-[10px] font-black bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-600 transition-all flex items-center gap-1.5"
                  >
                    <Plus size={12}/> 添加物品
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={item.id} className="bg-slate-900/30 border border-slate-700/50 p-4 rounded-2xl flex flex-col gap-3 animate-in slide-in-from-right-2 duration-300">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <input 
                            placeholder="物品名称 (如: 红木写字台)" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 font-bold outline-none focus:ring-1 focus:ring-emerald-500/30"
                            value={item.name}
                            onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="relative">
                        <FileText className="absolute left-3 top-2.5 text-slate-600" size={12} />
                        <textarea 
                          placeholder="物品备注 (位置、细节、血迹...)"
                          className="w-full h-16 bg-slate-900/50 border border-slate-700/50 rounded-xl pl-8 pr-3 py-2 text-[11px] text-slate-400 outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none leading-normal"
                          value={item.note}
                          onChange={(e) => handleUpdateItem(item.id, 'note', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-slate-700/50 rounded-2xl text-slate-600 italic text-[11px]">
                      暂无物品登记，点击“添加物品”来细化空间搜查结果
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/40 rounded-b-3xl">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-medium transition-colors">放弃</button>
              <button onClick={handleSubmit} className="px-10 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black shadow-xl shadow-emerald-900/20 active:scale-95 transition-all">保存档案</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationList;
