
import React, { useState, useEffect, useRef } from 'react';
import { Clue, Location, LocationItem } from '../types';
import { Search, X, ImageIcon, Loader2, Camera, Trash2, MapPin, AlignLeft, Maximize2, Package, ChevronRight } from 'lucide-react';
import { compressImage } from '../utils/imageProcessor';

interface Props {
  isOpen: boolean;
  editingClue: Clue | null;
  locations: Location[];
  blobUrls: Record<string, string>; // 新增：Blob URL 映射
  onClose: () => void;
  onSave: (clue: Clue) => void;
  onImageSave: (entityId: string, blob: Blob) => Promise<string>; // 处理图片保存
}

const ClueModal: React.FC<Props> = ({ isOpen, editingClue, locations, blobUrls, onClose, onSave, onImageSave }) => {
  const [clueName, setClueName] = useState('');
  const [clueLocation, setClueLocation] = useState('');
  
  const [selectedLocId, setSelectedLocId] = useState<string | undefined>(undefined);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);
  
  const [clueDesc, setClueDesc] = useState('');
  const [clueStatus, setClueStatus] = useState<Clue['status']>('未解决');
  const [clueImageId, setClueImageId] = useState<string | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingClue) {
      setClueName(editingClue.name);
      setClueLocation(editingClue.found_location);
      setSelectedLocId(editingClue.locationId);
      setSelectedItemId(editingClue.locationItemId);
      setClueDesc(editingClue.description || '');
      setClueStatus(editingClue.status);
      setClueImageId(editingClue.imageId);
    } else {
      setClueName('');
      setClueLocation('');
      setSelectedLocId(undefined);
      setSelectedItemId(undefined);
      setClueDesc('');
      setClueStatus('未解决');
      setClueImageId(undefined);
    }
  }, [editingClue, isOpen]);

  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(itemId);
    if (!selectedLocId) return;
    const loc = locations.find(l => l.id === selectedLocId);
    const item = loc?.items?.find(i => i.id === itemId);
    if (item && (!clueName || clueName === '')) {
      setClueName(item.name);
    }
    if (item && item.note && (!clueDesc || clueDesc === '')) {
      setClueDesc(item.note);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        const blob = await compressImage(file, 800, 0.6);
        const imageId = await onImageSave(editingClue?.id || 'new', blob);
        setClueImageId(imageId);
      } catch (err) {
        console.error("Image processing failed", err);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleSubmit = () => {
    if (!clueName.trim()) return;
    
    let finalLocation = clueLocation;
    if (selectedLocId) {
      const loc = locations.find(l => l.id === selectedLocId);
      const item = loc?.items?.find(i => i.id === selectedItemId);
      finalLocation = item ? `${loc?.name} > ${item.name}` : (loc?.name || clueLocation);
    }

    onSave({
      id: editingClue?.id || crypto.randomUUID(),
      name: clueName.trim(),
      found_location: finalLocation.trim() || '未知',
      locationId: selectedLocId,
      locationItemId: selectedItemId,
      status: clueStatus,
      description: clueDesc.trim(),
      imageId: clueImageId
    });
    
    // 关键修复：保存后关闭弹窗
    onClose();
  };

  const currentImageUrl = clueImageId ? blobUrls[clueImageId] : null;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
        <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-4xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-xl shadow-lg shadow-amber-900/20">
                <Search size={22} className="text-slate-900" />
              </div>
              {editingClue ? '编辑证物档案' : '录入新证物'}
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full transition-all">
              <X size={24} />
            </button>
          </div>
          
          <div className="p-8 flex flex-col md:flex-row gap-8 overflow-y-auto max-h-[75vh] custom-scrollbar">
            <div className="w-full md:w-5/12 flex flex-col gap-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <ImageIcon size={14} /> 证物图像实录
              </label>
              <div 
                onClick={() => !currentImageUrl && fileInputRef.current?.click()}
                className={`relative group aspect-square w-full rounded-2xl border-2 border-dashed transition-all overflow-hidden
                  ${currentImageUrl ? 'border-amber-500/30 bg-slate-900 shadow-inner' : 'border-slate-700 hover:border-amber-500/50 bg-slate-900/50 hover:bg-slate-900 cursor-pointer'}
                `}
              >
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-3 h-full justify-center">
                    <Loader2 className="animate-spin text-amber-500" size={40} />
                    <span className="text-xs text-slate-400 font-medium">深度扫描图像中...</span>
                  </div>
                ) : currentImageUrl ? (
                  <>
                    <img src={currentImageUrl} alt="preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 px-4">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowFullImage(true); }}
                        className="p-3 bg-white/10 rounded-full text-white backdrop-blur-md border border-white/20 hover:bg-white/20 transition-colors"
                      >
                        <Maximize2 size={24} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="p-3 bg-white/10 rounded-full text-white backdrop-blur-md border border-white/20 hover:bg-white/20 transition-colors"
                      >
                        <Camera size={24} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setClueImageId(undefined); }} 
                        className="p-3 bg-red-500/60 rounded-full text-white backdrop-blur-md border border-red-400/20 hover:bg-red-500/80 transition-colors"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-500 group-hover:text-amber-400 transition-colors h-full w-full justify-center">
                    <Camera size={48} strokeWidth={1} className="opacity-40" />
                    <span className="text-xs font-bold uppercase tracking-tighter text-center">点击上传实勘照片</span>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full md:w-7/12 flex flex-col gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Search size={12} /> 证物全称 <span className="text-amber-500">*</span>
                  </label>
                  <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm font-bold focus:ring-2 focus:ring-amber-500/50 outline-none transition-all placeholder:text-slate-700" 
                    value={clueName} 
                    onChange={(e) => setClueName(e.target.value)} 
                    placeholder="请输入证物描述..." 
                    autoFocus 
                  />
                </div>

                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-700/50 space-y-4">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={12} /> 发现来源关联 (空间索引)
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600">选择案发地点</label>
                      <select 
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-amber-500"
                        value={selectedLocId || ''}
                        onChange={(e) => {
                          setSelectedLocId(e.target.value || undefined);
                          setSelectedItemId(undefined);
                        }}
                      >
                        <option value="">-- 手动录入地点 --</option>
                        {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600">室内具体物品/摆设</label>
                      <select 
                        disabled={!selectedLocId}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-30"
                        value={selectedItemId || ''}
                        onChange={(e) => handleItemSelect(e.target.value)}
                      >
                        <option value="">-- 选择具体物品 --</option>
                        {selectedLocId && locations.find(l => l.id === selectedLocId)?.items?.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!selectedLocId && (
                    <div className="space-y-1.5 pt-2 animate-in fade-in">
                      <label className="text-[10px] font-bold text-slate-600">手动描述发现位置</label>
                      <input 
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-amber-500 transition-all placeholder:text-slate-700" 
                        value={clueLocation} 
                        onChange={(e) => setClueLocation(e.target.value)} 
                        placeholder="如: 后花园枯井旁..." 
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-2 min-h-[200px]">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <AlignLeft size={14} /> 证物详记 / 逻辑推论
                </label>
                <textarea 
                  className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-2xl p-5 text-white text-sm leading-relaxed focus:ring-2 focus:ring-amber-500/50 outline-none resize-none transition-all custom-scrollbar placeholder:text-slate-800 font-mono" 
                  value={clueDesc} 
                  onChange={(e) => setClueDesc(e.target.value)} 
                  placeholder="记录该证物的物理特征、关联人物、或是目前的疑点..."
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-700 flex justify-end gap-4 bg-slate-900/30">
            <button onClick={onClose} className="px-8 py-3 text-slate-400 hover:text-white text-sm font-bold transition-colors">废弃更改</button>
            <button 
              onClick={handleSubmit} 
              disabled={!clueName.trim()} 
              className="px-12 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:grayscale text-slate-900 rounded-2xl text-sm font-black shadow-xl shadow-amber-900/20 transition-all active:scale-95"
            >
              存档记录
            </button>
          </div>
        </div>
      </div>

      {showFullImage && currentImageUrl && (
        <div 
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 cursor-zoom-out"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowFullImage(false)} className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors z-[310]">
              <X size={32} />
            </button>
            <img 
              src={currentImageUrl} 
              alt="clue full size" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg border border-white/10" 
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ClueModal;
