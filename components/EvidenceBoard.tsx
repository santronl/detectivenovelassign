import React, { useState, useEffect } from 'react';
import { Clue } from '../types';
import { Archive, AlertCircle, HelpCircle, Plus, Trash2, X, GripVertical, Search, Edit3, MapPin, AlignLeft } from 'lucide-react';

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
  
  // Clue Form State
  const [clueName, setClueName] = useState('');
  const [clueLocation, setClueLocation] = useState('');
  const [clueDesc, setClueDesc] = useState('');
  const [clueStatus, setClueStatus] = useState<Clue['status']>('未解决');

  // Sync form with editing state
  useEffect(() => {
    if (editingClue) {
      setClueName(editingClue.name);
      setClueLocation(editingClue.found_location);
      setClueDesc(editingClue.description || '');
      setClueStatus(editingClue.status);
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

  const handleSubmit = () => {
      if (!clueName.trim()) return;
      
      if (editingClue) {
          onUpdateClue({
              ...editingClue,
              name: clueName.trim(),
              found_location: clueLocation.trim() || '未知',
              description: clueDesc.trim(),
              status: clueStatus // Directly update status from modal
          });
      } else {
          const newClue: Clue = {
              id: crypto.randomUUID(),
              name: clueName.trim(),
              found_location: clueLocation.trim() || '未知',
              status: clueStatus,
              description: clueDesc.trim()
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
    setEditingClue(null);
    setIsModalOpen(false);
  };

  const handleOpenAdd = () => {
    setEditingClue(null);
    setClueStatus('未解决');
    setIsModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
        {/* Header Actions */}
        <div className="flex justify-between items-center mb-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">证物公告板 • 拖拽卡片修改状态</p>
            <button 
                onClick={handleOpenAdd}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95"
            >
                <Plus size={18} /> 录入新证物
            </button>
        </div>

        {/* Columns */}
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
                            <h3 className="font-bold text-slate-100 pr-12 leading-tight">{clue.name}</h3>
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
                        
                        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 font-medium">
                            <MapPin size={12} className="text-blue-500/70" />
                            <span>{clue.found_location}</span>
                        </div>
                        
                        {clue.description && (
                            <div className="mt-3 pt-3 border-t border-slate-700/50">
                                <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-3">
                                    {clue.description}
                                </p>
                            </div>
                        )}
                        
                        <div className="absolute bottom-3 right-3 text-slate-600 opacity-20 pointer-events-none">
                            <GripVertical size={20} />
                        </div>
                    </div>
                    ))}
                    
                    {clues.filter(c => c.status === col.status).length === 0 && (
                        <div className="text-center py-16 text-slate-600/40 italic text-sm border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-2">
                            <Archive size={32} strokeWidth={1} />
                            暂无记录
                        </div>
                    )}
                </div>
            </div>
        ))}
        </div>

        {/* Add/Edit Clue Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                    <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                        <h3 className="text-lg font-bold text-white flex items-center gap-3">
                            <div className="p-2 bg-blue-600 rounded-lg">
                                <Search size={20} className="text-white" />
                            </div>
                            {editingClue ? '编辑证物档案' : '录入新证物'}
                        </h3>
                        <button onClick={handleCloseModal} className="text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
                    </div>
                    
                    <div className="p-6 space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <Search size={14} /> 证物名称 <span className="text-red-500">*</span>
                            </label>
                            <input 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={clueName}
                                onChange={(e) => setClueName(e.target.value)}
                                placeholder="例如: 消失的凶器, 染血的手帕"
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
                                placeholder="例如: 二楼书房密室"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <Edit3 size={14} /> 状态归类
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {columns.map(col => (
                                    <button
                                        key={col.status}
                                        onClick={() => setClueStatus(col.status)}
                                        className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${
                                            clueStatus === col.status 
                                            ? 'bg-blue-600 border-blue-400 text-white shadow-lg' 
                                            : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                                        }`}
                                    >
                                        {col.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <AlignLeft size={14} /> 详细描述与疑点
                            </label>
                            <textarea 
                                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all leading-relaxed"
                                value={clueDesc}
                                onChange={(e) => setClueDesc(e.target.value)}
                                placeholder="详细记录该证物的物理特征、潜在用途或目击情况..."
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/20">
                        <button 
                            onClick={handleCloseModal}
                            className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleSubmit}
                            disabled={!clueName.trim()}
                            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                        >
                            {editingClue ? '保存修改' : '确认录入'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default EvidenceBoard;