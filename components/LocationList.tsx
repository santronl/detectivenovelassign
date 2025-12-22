
import React, { useState, useRef } from 'react';
import { Location, MapDoc, Space, LocationItem, Clue } from '../types';
import { compressImage } from '../utils/imageProcessor';
import { MapPin, Plus, Trash2, Edit3, X, AlignLeft, Info, Link as LinkIcon, Package, FileText, ChevronRight, Award, Camera, Loader2, Image as ImageIcon } from 'lucide-react';

interface Props {
  locations: Location[];
  maps: MapDoc[];
  spaces: Space[];
  clues: Clue[];
  blobUrls: Record<string, string>; // 新增
  onAddLocation: (loc: Location) => void;
  onUpdateLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
  onImageSave: (entityId: string, blob: Blob) => Promise<string>; // 处理图片保存
}

const LocationList: React.FC<Props> = ({ locations, maps, spaces, clues, blobUrls, onAddLocation, onUpdateLocation, onDeleteLocation, onImageSave }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [mapId, setMapId] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [imageId, setImageId] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<LocationItem[]>([]);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenAdd = () => {
    setEditingLoc(null);
    setName('');
    setNote('');
    setMapId('');
    setSpaceId('');
    setImageId(undefined);
    setItems([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (loc: Location) => {
    setEditingLoc(loc);
    setName(loc.name);
    setNote(loc.note || '');
    setMapId(loc.mapId || '');
    setSpaceId(loc.spaceId || '');
    setImageId(loc.imageId);
    setItems(loc.items || []);
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsImageLoading(true);
      try {
        const blob = await compressImage(file, 800, 0.6);
        const newImageId = await onImageSave(editingLoc?.id || 'new_loc', blob);
        setImageId(newImageId);
      } catch (err) {
        console.error("Failed to process location image", err);
      } finally {
        setIsImageLoading(false);
      }
    }
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

  const handleUpdateItem = (id: string, field: keyof LocationItem, value: any) => {
    let finalItems = items.map(item => {
      if (item.id === id) {
        let updated = { ...item, [field]: value };
        if (field === 'clueId' && value) {
          const clue = clues.find(c => c.id === value);
          if (clue) {
            if (!updated.name) updated.name = clue.name;
            if (!updated.note) updated.note = clue.description || '';
          }
        }
        return updated;
      }
      return item;
    });
    setItems(finalItems);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const data: Location = {
      id: editingLoc?.id || crypto.randomUUID(),
      name: name.trim(),
      note: note.trim(),
      mapId: mapId || undefined,
      spaceId: spaceId || undefined,
      imageId,
      items: items.filter(i => i.name.trim() !== '' || i.clueId)
    };
    if (editingLoc) onUpdateLocation(data);
    else onAddLocation(data);
    setIsModalOpen(false);
  };

  const currentImageUrl = imageId ? blobUrls[imageId] : null;

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
        {locations.map(loc => {
          const portraitUrl = loc.imageId ? blobUrls[loc.imageId] : null;
          return (
            <div key={loc.id} className="bg-slate-800 border border-slate-700 p-0 rounded-2xl shadow-md hover:border-emerald-500/40 transition-all group overflow-hidden flex flex-col relative">
              {portraitUrl ? (
                <div className="h-32 w-full relative group/img">
                  <img src={portraitUrl} alt={loc.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-900/40" />
                </div>
              ) : (
                <div className="h-20 w-full bg-slate-900/50 flex items-center justify-center text-slate-700 border-b border-slate-700/50">
                  <ImageIcon size={32} strokeWidth={1} />
                </div>
              )}
              
              <div className="p-5 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-900/30 rounded-lg text-emerald-400">
                      <MapPin size={20} />
                    </div>
                    <h3 className="font-bold text-white text-lg">{loc.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenEdit(loc)} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"><Edit3 size={16}/></button>
                    <button onClick={() => onDeleteLocation(loc.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"><Trash2 size={16}/></button>
                  </div>
                </div>

                {loc.note && (
                  <p className="text-xs text-slate-400 italic bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 leading-relaxed line-clamp-2">
                    {loc.note}
                  </p>
                )}

                {loc.items && loc.items.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                      <Package size={12} /> 室内物品清单 ({loc.items.length})
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-20 overflow-hidden relative">
                      {loc.items.slice(0, 3).map(item => (
                        <span key={item.id} className={`px-2 py-1 text-[10px] rounded-md border truncate max-w-[120px] flex items-center gap-1 ${item.clueId ? 'bg-amber-900/30 text-amber-300 border-amber-500/30 font-bold' : 'bg-slate-700/50 text-slate-300 border-slate-600/50'}`} title={item.note}>
                          {item.clueId && <Award size={10} />}
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-3 border-t border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <LinkIcon size={12} />
                    {loc.mapId ? (
                      <span className="text-emerald-500/80 truncate max-w-[150px]">{maps.find(m => m.id === loc.mapId)?.name}</span>
                    ) : (
                      <span className="italic">未关联地图</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {locations.length === 0 && (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-700 rounded-3xl text-slate-600 bg-slate-800/20">
            <MapPin size={56} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">尚未定义地点列表</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
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
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Camera size={12}/> 场景照片实录 (存档自动包含)
                </label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/50 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 transition-all overflow-hidden group"
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                  {isImageLoading ? (
                    <Loader2 className="animate-spin text-emerald-500" size={32} />
                  ) : currentImageUrl ? (
                    <img src={currentImageUrl} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-slate-600 group-hover:text-emerald-400">
                      <ImageIcon size={32} className="mb-2" />
                      <span className="text-[10px] font-black uppercase">上传案发地实勘照片</span>
                    </div>
                  )}
                </div>
              </div>

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
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <AlignLeft size={14} /> 环境描述与线索备注
                </label>
                <textarea 
                  className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-sm leading-relaxed outline-none resize-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono" 
                  value={note} 
                  onChange={e => setNote(e.target.value)} 
                  placeholder="在此记录关键环境细节..."
                />
              </div>

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
                    <div key={item.id} className={`border p-4 rounded-2xl flex flex-col gap-3 transition-all ${item.clueId ? 'bg-amber-900/10 border-amber-500/30' : 'bg-slate-900/30 border-slate-700/50'}`}>
                      <div className="flex gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <input 
                              placeholder="物品名称 (如: 红木写字台)" 
                              className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 transition-all ${item.clueId ? 'text-amber-400 font-bold border-amber-500/50 focus:ring-amber-500/30' : 'text-slate-200 border-slate-700 focus:ring-emerald-500/30'}`}
                              value={item.name}
                              onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                            />
                            <select
                              className="w-48 bg-slate-800 border border-slate-700 rounded-xl px-2 py-2 text-[10px] text-slate-400 outline-none focus:ring-1 focus:ring-amber-500/30"
                              value={item.clueId || ''}
                              onChange={(e) => handleUpdateItem(item.id, 'clueId', e.target.value || undefined)}
                            >
                              <option value="">-- 关联证物 --</option>
                              {clues.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/40 rounded-b-3xl">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-bold transition-colors">放弃</button>
              <button onClick={handleSubmit} className="px-10 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black shadow-xl shadow-emerald-900/20 active:scale-95 transition-all">保存地点档案</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationList;
