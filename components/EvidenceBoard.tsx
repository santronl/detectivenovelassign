import React, { useState, useEffect } from 'react';
import { Clue } from '../types';
import { Archive, AlertCircle, HelpCircle, Plus, Trash2, X, GripVertical, Search, Edit3 } from 'lucide-react';

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

  // Sync form with editing state
  useEffect(() => {
    if (editingClue) {
      setClueName(editingClue.name);
      setClueLocation(editingClue.found_location);
      setClueDesc(editingClue.description || '');
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
              description: clueDesc.trim()
          });
      } else {
          const newClue: Clue = {
              id: crypto.randomUUID(),
              name: clueName.trim(),
              found_location: clueLocation.trim() || '未知',
              status: '未解决', // Default status
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
    setEditingClue(null);
    setIsModalOpen(false);
  };

  const handleOpenAdd = () => {
    setEditingClue(null);
    setIsModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
        {/* Header Actions */}
        <div className="flex justify-end mb-4">
            <button 
                onClick={handleOpenAdd}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all active:scale-95"
            >
                <Plus size={16} /> 添加新线索
            </button>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-[500px]">
        {columns.map((col) => (
            <div 
                key={col.title} 
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.status)}
                className={`rounded-lg border p-4 flex flex-col transition-colors duration-200
                    ${col.color.split(' ')[0]} ${col.color.split(' ')[1]}
                    ${dragOverColumn === col.status ? col.bgDrag + ' ring-2 ring-white/20' : ''}
                `}
            >
                <div className={`flex items-center gap-2 mb-4 font-bold text-lg ${col.color.split(' ')[2]}`}>
                    <col.icon size={20} />
                    <h2>{col.title}</h2>
                    <span className="ml-auto text-xs opacity-50 bg-black/20 px-2 py-0.5 rounded-full">
                        {clues.filter(c => c.status === col.status).length}
                    </span>
                </div>
                
                <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {clues.filter(c => c.status === col.status).map(clue => (
                    <div 
                        key={clue.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, clue.id)}
                        className="bg-slate-800/90 p-3 rounded border border-slate-600 shadow-sm hover:border-slate-400 hover:bg-slate-700 transition-all cursor-grab active:cursor-grabbing group relative"
                    >
                        <div className="flex items-start justify-between">
                            <h3 className="font-semibold text-slate-100 pr-12">{clue.name}</h3>
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => setEditingClue(clue)}
                                    className="p-1 text-slate-500 hover:text-blue-400 rounded transition-colors"
                                    title="编辑"
                                >
                                    <Edit3 size={14} />
                                </button>
                                <button 
                                    onClick={() => onDeleteClue(clue.id)}
                                    className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                                    title="删除"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <span className="opacity-70">📍</span> {clue.found_location}
                        </p>
                        
                        {clue.description && (
                            <p className="text-sm text-slate-300 mt-2 leading-snug border-t border-slate-700/50 pt-2">
                                {clue.description}
                            </p>
                        )}
                        
                        <div className="absolute bottom-2 right-2 text-slate-600 opacity-0 group-hover:opacity-20 pointer-events-none">
                            <GripVertical size={24} />
                        </div>
                    </div>
                    ))}
                    
                    {clues.filter(c => c.status === col.status).length === 0 && (
                        <div className="text-center py-12 text-slate-500/50 italic text-sm border-2 border-dashed border-slate-700/50 rounded-lg">
                            拖拽至此处
                        </div>
                    )}
                </div>
            </div>
        ))}
        </div>

        {/* Add/Edit Clue Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-sm animate-in fade-in zoom-in duration-200">
                    <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Search size={18} className="text-blue-400" />
                            {editingClue ? '编辑线索' : '添加新线索'}
                        </h3>
                        <button onClick={handleCloseModal} className="text-slate-400 hover:text-white"><X size={20}/></button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">线索 / 物品名称 <span className="text-red-400">*</span></label>
                            <input 
                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={clueName}
                                onChange={(e) => setClueName(e.target.value)}
                                placeholder="例如: 沾血的匕首"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">发现地点</label>
                            <input 
                                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={clueLocation}
                                onChange={(e) => setClueLocation(e.target.value)}
                                placeholder="例如: 书房地毯下"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">详情描述</label>
                            <textarea 
                                className="w-full h-24 bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                value={clueDesc}
                                onChange={(e) => setClueDesc(e.target.value)}
                                placeholder="描述物品的状态、特征或疑点..."
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-700 flex justify-end gap-2 bg-slate-800/50 rounded-b-xl">
                        <button 
                            onClick={handleCloseModal}
                            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleSubmit}
                            disabled={!clueName.trim()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-bold"
                        >
                            {editingClue ? '保存修改' : '添加'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default EvidenceBoard;