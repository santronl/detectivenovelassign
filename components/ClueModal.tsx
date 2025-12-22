
import React, { useState, useEffect, useRef } from 'react';
import { Clue } from '../types';
import { Search, X, ImageIcon, Loader2, Camera, Trash2, MapPin, AlignLeft, Maximize2 } from 'lucide-react';
import { compressImage } from '../utils/imageProcessor';

interface Props {
  isOpen: boolean;
  editingClue: Clue | null;
  onClose: () => void;
  onSave: (clue: Clue) => void;
}

const ClueModal: React.FC<Props> = ({ isOpen, editingClue, onClose, onSave }) => {
  const [clueName, setClueName] = useState('');
  const [clueLocation, setClueLocation] = useState('');
  const [clueDesc, setClueDesc] = useState('');
  const [clueStatus, setClueStatus] = useState<Clue['status']>('未解决');
  const [clueImageUrl, setClueImageUrl] = useState<string | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingClue) {
      setClueName(editingClue.name);
      setClueLocation(editingClue.found_location);
      setClueDesc(editingClue.description || '');
      setClueStatus(editingClue.status);
      setClueImageUrl(editingClue.imageUrl);
    } else {
      setClueName('');
      setClueLocation('');
      setClueDesc('');
      setClueStatus('未解决');
      setClueImageUrl(undefined);
    }
  }, [editingClue, isOpen]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        const base64 = await compressImage(file, 800, 0.6);
        setClueImageUrl(base64);
      } catch (err) {
        console.error("Image processing failed", err);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleSubmit = () => {
    if (!clueName.trim()) return;
    onSave({
      id: editingClue?.id || crypto.randomUUID(),
      name: clueName.trim(),
      found_location: clueLocation.trim() || '未知',
      status: clueStatus,
      description: clueDesc.trim(),
      imageUrl: clueImageUrl
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
        <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-4xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-xl shadow-lg shadow-amber-900/20">
                <Search size={22} className="text-slate-900" />
              </div>
              {editingClue ? '编辑证物档案' : '录入新证物'}
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full transition-all">
              <X size={24}/>
            </button>
          </div>
          
          {/* Main Content Split Layout */}
          <div className="p-8 flex flex-col md:flex-row gap-8 overflow-y-auto max-h-[75vh] custom-scrollbar">
            
            {/* Left Side: Image Upload (Occupies roughly 40%) */}
            <div className="w-full md:w-5/12 flex flex-col gap-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <ImageIcon size={14} /> 证物图像实录
              </label>
              <div 
                onClick={() => !clueImageUrl && fileInputRef.current?.click()}
                className={`relative group aspect-square w-full rounded-2xl border-2 border-dashed transition-all overflow-hidden
                  ${clueImageUrl ? 'border-amber-500/30 bg-slate-900 shadow-inner' : 'border-slate-700 hover:border-amber-500/50 bg-slate-900/50 hover:bg-slate-900 cursor-pointer'}
                `}
              >
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-amber-500" size={40} />
                    <span className="text-xs text-slate-400 font-medium">深度扫描图像中...</span>
                  </div>
                ) : clueImageUrl ? (
                  <>
                    <img src={clueImageUrl} alt="preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 px-4">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowFullImage(true); }}
                        className="p-3 bg-white/10 rounded-full text-white backdrop-blur-md border border-white/20 hover:bg-white/20 transition-colors"
                        title="查看大图"
                      >
                        <Maximize2 size={24} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="p-3 bg-white/10 rounded-full text-white backdrop-blur-md border border-white/20 hover:bg-white/20 transition-colors"
                        title="更换图片"
                      >
                        <Camera size={24} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setClueImageUrl(undefined); }} 
                        className="p-3 bg-red-500/60 rounded-full text-white backdrop-blur-md border border-red-400/20 hover:bg-red-500/80 transition-colors"
                        title="删除图片"
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
              <p className="text-[10px] text-slate-600 text-center italic">点击查看大图或管理图片，大图将以原比例呈现</p>
            </div>

            {/* Right Side: Details & Remarks (Occupies remaining 60%) */}
            <div className="w-full md:w-7/12 flex flex-col gap-6">
              
              {/* Top Row: Name & Location (Compact) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Search size={12} /> 证物全称 <span className="text-amber-500">*</span>
                  </label>
                  <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:ring-2 focus:ring-amber-500/50 outline-none transition-all placeholder:text-slate-700" 
                    value={clueName} 
                    onChange={(e) => setClueName(e.target.value)} 
                    placeholder="请输入证物描述..." 
                    autoFocus 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={12} /> 发现位置
                  </label>
                  <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-amber-500/50 outline-none transition-all placeholder:text-slate-700" 
                    value={clueLocation} 
                    onChange={(e) => setClueLocation(e.target.value)} 
                    placeholder="具体发现位置..." 
                  />
                </div>
              </div>

              {/* Bottom Section: Remarks (Main Area) */}
              <div className="flex-1 flex flex-col gap-2 min-h-[250px]">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <AlignLeft size={14} /> 证物详记 / 逻辑推论
                </label>
                <textarea 
                  className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-2xl p-5 text-white text-sm leading-relaxed focus:ring-2 focus:ring-amber-500/50 outline-none resize-none transition-all custom-scrollbar placeholder:text-slate-800 font-mono" 
                  value={clueDesc} 
                  onChange={(e) => setClueDesc(e.target.value)} 
                  placeholder="在此记录该证物的物理特征、关联人物、或是目前的疑点..."
                />
              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-slate-700 flex justify-end gap-4 bg-slate-900/30">
            <button 
              onClick={onClose} 
              className="px-8 py-3 text-slate-400 hover:text-white text-sm font-bold transition-colors"
            >
              废弃更改
            </button>
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

      {/* Full Image Preview Modal */}
      {showFullImage && clueImageUrl && (
        <div 
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 cursor-zoom-out"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowFullImage(false)} 
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors z-[310]"
            >
              <X size={32} />
            </button>
            <img 
              src={clueImageUrl} 
              alt="clue full size" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" 
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ClueModal;
