
import React, { useState, useEffect, useRef } from 'react';
import { Clue } from '../types';
import { Search, X, ImageIcon, Loader2, Camera, Trash2, MapPin, AlignLeft } from 'lucide-react';
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
        const base64 = await compressImage(file, 600, 0.5);
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-md my-8 animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Search size={20} className="text-white" />
            </div>
            {editingClue ? '编辑证物档案' : '录入新证物'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
        </div>
        
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <ImageIcon size={14} /> 证物图像 (自动压缩)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative group aspect-video w-full rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden
                ${clueImageUrl ? 'border-blue-500/50 bg-slate-900' : 'border-slate-700 hover:border-blue-500/50 bg-slate-900/50 hover:bg-slate-900'}
              `}
            >
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
              {isCompressing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <span className="text-xs text-slate-400">优化中...</span>
                </div>
              ) : clueImageUrl ? (
                <>
                  <img src={clueImageUrl} alt="preview" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <div className="p-2 bg-white/10 rounded-full text-white backdrop-blur"><Camera size={20} /></div>
                    <button onClick={(e) => { e.stopPropagation(); setClueImageUrl(undefined); }} className="p-2 bg-red-500/80 rounded-full text-white backdrop-blur hover:bg-red-500"><Trash2 size={20} /></button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-blue-400 transition-colors">
                  <Camera size={32} strokeWidth={1.5} />
                  <span className="text-xs font-medium">点击上传照片</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <Search size={14} /> 证物名称 <span className="text-red-500">*</span>
            </label>
            <input className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={clueName} onChange={(e) => setClueName(e.target.value)} placeholder="例如: 消失的凶器" autoFocus />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <MapPin size={14} /> 发现地点
            </label>
            <input className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={clueLocation} onChange={(e) => setClueLocation(e.target.value)} placeholder="地点描述" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <AlignLeft size={14} /> 备注
            </label>
            <textarea className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all" value={clueDesc} onChange={(e) => setClueDesc(e.target.value)} />
          </div>
        </div>

        <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/20">
          <button onClick={onClose} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm">取消</button>
          <button onClick={handleSubmit} disabled={!clueName.trim()} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all">保存</button>
        </div>
      </div>
    </div>
  );
};

export default ClueModal;
