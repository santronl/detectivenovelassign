
import React, { useState } from 'react';
import { Clue, Location } from '../types';
import { Archive, AlertCircle, HelpCircle, Plus, Trash2, X, Search, Edit3, MapPin, Maximize2, Package, Link as LinkIcon } from 'lucide-react';

interface Props {
  clues: Clue[];
  locations: Location[];
  blobUrls: Record<string, string>; // 新增
  onOpenModal: (clue: Clue | null) => void;
  onUpdateStatus: (clueId: string, status: Clue['status']) => void;
  onDeleteClue: (clueId: string) => void;
}

const EvidenceBoard: React.FC<Props> = ({ clues, locations, blobUrls, onOpenModal, onUpdateStatus, onDeleteClue }) => {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
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

  return (
    <div className="h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">证物公告板 • 拖拽卡片修改状态</p>
            <button 
                onClick={() => onOpenModal(null)}
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
                    {clues.filter(c => c.status === col.status).map(clue => {
                    const isLinked = !!clue.locationId;
                    const imageUrl = clue.imageId ? blobUrls[clue.imageId] : null;
                    return (
                    <div 
                        key={clue.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, clue.id)}
                        className="bg-slate-800/95 p-4 rounded-xl border border-slate-700/80 shadow-md hover:border-slate-500 hover:bg-slate-700 transition-all cursor-grab active:cursor-grabbing group relative animate-in fade-in duration-300"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col gap-1 pr-12">
                                <h3 className="font-bold text-slate-100 leading-tight flex items-center gap-1.5">
                                    {isLinked && <LinkIcon size={12} className="text-emerald-500" />}
                                    {clue.name}
                                </h3>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                                    {isLinked ? (
                                        <div className="flex items-center gap-1 text-emerald-500/80">
                                            <Package size={10} />
                                            <span>{clue.found_location}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <MapPin size={10} className="text-blue-500/70" />
                                            <span>{clue.found_location}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => onOpenModal(clue)}
                                    className="p-1.5 bg-slate-800 border border-slate-600 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                                >
                                    <Edit3 size={14} />
                                </button>
                                <button 
                                    onClick={() => onDeleteClue(clue.id)}
                                    className="p-1.5 bg-slate-800 border border-slate-600 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {imageUrl && (
                            <div 
                                onClick={() => setPreviewImage(imageUrl)}
                                className="mt-3 relative aspect-video w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-700/50 cursor-zoom-in group/img"
                            >
                                <img 
                                    src={imageUrl} 
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
                    )})}
                </div>
            </div>
        ))}
        </div>

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
