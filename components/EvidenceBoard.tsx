
import React, { useState, useEffect, useRef } from 'react';
import { Clue } from '../types';
import { Archive, AlertCircle, HelpCircle, Plus, Trash2, X, GripVertical, Search, Edit3, MapPin, AlignLeft, Image as ImageIcon, Loader2, Camera, Maximize2 } from 'lucide-react';
import { compressImage } from '../utils/imageProcessor';

interface Props {
  clues: Clue[];
  onAddClue: (clue: Clue) => void;
  onUpdateClue: (clue: Clue) => void;
  onUpdateStatus: (clueId: string, status: Clue['status']) => void;
  onDeleteClue: (clueId: string) => void;
}

const EvidenceBoard: React.FC<Props> = ({ clues, onAddClue, onUpdateClue, onUpdateStatus, onDeleteClue }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClue, setEditingClue] = useState<Clue | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const [clueName, setClueName] = useState('');
  const [clueLocation, setClueLocation] = useState('');
  const [clueDesc, setClueDesc] = useState('');
  const [clueStatus, setClueStatus] = useState<Clue['status']>('未解决');
  const [clueImageUrl, setClueImageUrl] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingClue) {
      setClueName(editingClue.name);
      setClueLocation(editingClue.found_location);
      setClueDesc(editingClue.description || '');
      setClueStatus(editingClue.status);
      setClueImageUrl(editingClue.imageUrl);
      setIsModalOpen(true);
    }
  }, [editingClue]);

  const columns = [
    { title: '未解决', status: '未解决', color: 'bg-red-900/30 border-red-700 text-red-200', bgDrag: 'bg-red-900/50', icon: HelpCircle },
    { title: '已解释', status: '已解释', color: 'bg-green-900/30 border-green-700 text-green-200', bgDrag: 'bg-green-900/50', icon: Archive },
    { title: '误导项', status: '误导项', color: 'bg-yellow-900/30 border-yellow-700 text-yellow-200', bgDrag: 'bg-yellow-900/50', icon: AlertCircle },
  ] as const;

  const handleDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData("application/react-dnd-clue-id", id);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
      e.preventDefault();
      setDragOverColumn(status);
  };

  const handleDragLeave = () => {
      setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, status: Clue['status']) => {
      e.preventDefault();
      setDragOverColumn(null);
      const clueId = e.dataTransfer.getData("application/react-dnd-clue-id");
      if (clueId) {
          onUpdateStatus(clueId, status);
      }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        // 使用更激进的压缩设置 (600px, 0.5 quality)
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
      
      if (editingClue) {
          onUpdateClue({
              ...editingClue,
              name: clueName.trim(),
              found_location: clueLocation.trim() || '未知',
              description: clueDesc.trim(),
              status: clueStatus,
              imageUrl: clueImageUrl
          });
      } else {
          const newClue: Clue = {
              id: crypto.randomUUID(),
              name: clueName.trim(),
              found_location: clueLocation.trim() || '未知',
              status: clueStatus,
              description: clueDesc.trim(),
              imageUrl: clueImageUrl
          };
          onAddClue(newClue);
      }
      
      handleCloseModal();
  };

  const handleCloseModal = () => {
    setClueName('');
    setClueLocation('');
    setClueDesc('');
    setClueStatus('未解决');
    setClueImageUrl(undefined);
    setEditingClue(null);
    setIsModalOpen(false);
  };

  const handleOpenAdd = () => {
    setEditingClue(null);
    setClueStatus('未解决');
    setClueImageUrl(undefined);
    setIsModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">证物公告板 • 拖拽卡片修改状态</p>
            <button 
                onClick={handleOpenAdd}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95"
            >
                <Plus size={18} /> 录入新证物
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-[500px]">
        {columns.map((col) => (
            <div 
                key={col.title} 
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.status)}
                className={`rounded-2xl border p-5 flex flex-col transition-all duration-300 relative
                    ${col.color.split(' ')[0]} ${col.color.split(' ')[1]}
                    ${dragOverColumn === col.status ? col.bgDrag + ' ring-4 ring-white/10 scale-[1.02]' : ''}
                `}
            >
                <div className={`flex items-center gap-3 mb-5 font-bold text-lg ${col.color.split(' ')[2]}`}>
                    <div className="p-2 rounded-lg bg-black/20">
                        <col.icon size={22} />
                    </div>
                    <h2>{col.title}</h2>
                    <span className="ml-auto text-sm font-mono opacity-60 bg-black/30 px-3 py-1 rounded-full">
                        {clues.filter(c => c.status === col.status).length}
                    </span>
                </div>
                
                <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {clues.filter(c => c.status === col.status).map(clue => (
                    <div 
                        key={clue.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, clue.id)}
                        className="bg-slate-800/95 p-4 rounded-xl border border-slate-700/80 shadow-md hover:border-slate-500 hover:bg-slate-700 transition-all cursor-grab active:cursor-grabbing group relative animate-in fade-in duration-300"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col gap-1 pr-12">
                                <h3 className="font-bold text-slate-100 leading-tight">{clue.name}</h3>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                                    <MapPin size={10} className="text-blue-500/70" />
                                    <span>{clue.found_location}</span>
                                </div>
                            </div>
                            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => setEditingClue(clue)}
                                    className="p-1.5 bg-slate-800 border border-slate-600 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                                    title="编辑详情"
                                >
                                    <Edit3 size={14} />
                                </button>
                                <button 
                                    onClick={() => onDeleteClue(clue.id)}
                                    className="p-1.5 bg-slate-800 border border-slate-600 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                                    title="销毁记录"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {clue.imageUrl && (
                            <div 
                                onClick={() => setPreviewImage(clue.imageUrl!)}
                                className="mt-3 relative aspect-video w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-700/50 cursor-zoom-in group/img"
                            >
                                <img 
                                    src={clue.imageUrl} 
                                    alt={clue.name} 
                                    loading="lazy"
                                    className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-500" 
                                />
                                <div className="absolute inset-0 bg-black/20 group-hover/img:bg-black/0 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                    <Maximize2 size={24} className="text-white drop-shadow-lg" />
                                </div>
                            </div>
                        )}
                        
                        {clue.description && (
                            <div className="mt-3 pt-3 border-t border-slate-700/50">
                                <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-3">
                                    {clue.description}
                                </p>
                            </div>
                        )}
                    </div>
                    ))}
                </div>
            </div>
        ))}
        </div>

        {isModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
                <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-md my-8 animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                        <h3 className="text-lg font-bold text-white flex items-center gap-3">
                            <div className="p-2 bg-blue-600 rounded-lg">
                                <Search size={20} className="text-white" />
                            </div>
                            {editingClue ? '编辑证物档案' : '录入新证物'}
                        </h3>
                        <button onClick={handleCloseModal} className="text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
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
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={handleImageUpload} 
                                />
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
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setClueImageUrl(undefined); }}
                                                className="p-2 bg-red-500/80 rounded-full text-white backdrop-blur hover:bg-red-500"
                                            >
                                                <Trash2 size={20} />
                                            </button>
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
                            <input 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={clueName}
                                onChange={(e) => setClueName(e.target.value)}
                                placeholder="例如: 消失的凶器"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <MapPin size={14} /> 发现地点
                            </label>
                            <input 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={clueLocation}
                                onChange={(e) => setClueLocation(e.target.value)}
                                placeholder="地点描述"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <AlignLeft size={14} /> 备注
                            </label>
                            <textarea 
                                className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all"
                                value={clueDesc}
                                onChange={(e) => setClueDesc(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/20">
                        <button onClick={handleCloseModal} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm">取消</button>
                        <button 
                            onClick={handleSubmit}
                            disabled={!clueName.trim()}
                            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all"
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        )}

        {previewImage && (
            <div 
                className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 cursor-zoom-out"
                onClick={() => setPreviewImage(null)}
            >
                <div className="relative max-w-4xl w-full h-full flex items-center justify-center animate-in zoom-in-95 duration-200">
                    <button onClick={() => setPreviewImage(null)} className="absolute top-0 right-0 p-4 text-white/50 hover:text-white"><X size={32} /></button>
                    <img src={previewImage} alt="preview" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
                </div>
            </div>
        )}
    </div>
  );
};

export default EvidenceBoard;
