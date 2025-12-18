import React, { useState, useCallback, useEffect, useRef } from 'react';
import { parseCharacterList } from './utils/parser';
import { AppState, INITIAL_STATE, Character, Space, Relationship, RelationshipDef, MapDoc, TimePoint, CharacterPlacement, Clue, CharacterGroup, SaveSlot } from './types';
import RelationshipGraph from './components/RelationshipGraph';
import EvidenceBoard from './components/EvidenceBoard';
import MapVisualizer from './components/MapVisualizer';
import MapCanvas from './components/MapCanvas';
import { 
  Users, 
  Map as MapIcon, 
  Search, 
  Database, 
  BookOpen,
  GripVertical,
  Download,
  Upload,
  Save,
  Edit3,
  Trash2,
  X,
  Archive,
  Plus,
  FolderOpen,
  Clock
} from 'lucide-react';

const WORKING_KEY = 'mystery_mind_working_v1';
const SLOTS_KEY = 'mystery_mind_slots_v1';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

const App: React.FC = () => {
  // Main State
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(WORKING_KEY);
      if (saved) return { ...INITIAL_STATE, ...JSON.parse(saved) };
      return INITIAL_STATE;
    } catch (e) {
      return INITIAL_STATE;
    }
  });

  // Save Slots State
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>(() => {
    try {
      const saved = localStorage.getItem(SLOTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'graph' | 'evidence' | 'map'>('graph');
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [newSaveName, setNewSaveName] = useState('');
  
  const fileImportRef = useRef<HTMLInputElement>(null);

  // Auto-save working state
  useEffect(() => {
    localStorage.setItem(WORKING_KEY, JSON.stringify(state));
  }, [state]);

  // Sync slots to local storage
  useEffect(() => {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(saveSlots));
  }, [saveSlots]);

  // --- Save Management Handlers ---
  const handleCreateNewSave = () => {
    if (!newSaveName.trim()) return;
    const newSlot: SaveSlot = {
      id: generateId(),
      name: newSaveName.trim(),
      timestamp: Date.now(),
      data: state
    };
    setSaveSlots(prev => [newSlot, ...prev]);
    setNewSaveName('');
    alert('新存档已创建');
  };

  const handleOverwriteSave = (slotId: string) => {
    const slot = saveSlots.find(s => s.id === slotId);
    if (!slot) return;
    if (confirm(`确定要覆盖存档 "${slot.name}" 吗？`)) {
      setSaveSlots(prev => prev.map(s => s.id === slotId ? { ...s, timestamp: Date.now(), data: state } : s));
      alert('存档已更新');
    }
  };

  const handleLoadSave = (slotId: string) => {
    const slot = saveSlots.find(s => s.id === slotId);
    if (!slot) return;
    if (confirm(`读取存档 "${slot.name}" 会覆盖当前未保存的进度，确定吗？`)) {
      setState(slot.data);
      setIsSaveModalOpen(false);
      alert('存档读取成功');
    }
  };

  const handleDeleteSave = (slotId: string) => {
    if (confirm('确定要删除这个存档吗？此操作不可撤销。')) {
      setSaveSlots(prev => prev.filter(s => s.id !== slotId));
    }
  };

  // --- Core State Handlers ---
  const handleParseCharacters = useCallback(() => {
    const newChars = parseCharacterList(inputText);
    if (newChars.length > 0) {
      setState(prev => ({ ...prev, characters: [...prev.characters, ...newChars] }));
      setInputText('');
    } else {
      alert('格式错误，请检查输入');
    }
  }, [inputText]);

  const handleExportData = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mystery-mind-full-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (confirm("导入将覆盖当前进度，确定继续吗？")) {
          setState({ ...INITIAL_STATE, ...parsed });
        }
      } catch (err) {
        alert("无效的存档文件");
      }
    };
    reader.readAsText(file);
  };

  const handleAddRelationship = (source: string, target: string, relation: string) => {
    setState(prev => {
      const exists = prev.relationships.findIndex(r => (r.source === source && r.target === target) || (r.source === target && r.target === source));
      const newRels = [...prev.relationships];
      if (exists > -1) newRels[exists] = { ...newRels[exists], relation };
      else newRels.push({ source, target, relation });
      return { ...prev, relationships: newRels };
    });
  };

  const handleUpdateGroup = (updated: CharacterGroup) => {
    setState(prev => ({ ...prev, characterGroups: prev.characterGroups.map(g => g.id === updated.id ? updated : g) }));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
              <BookOpen className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Mystery<span className="text-blue-500">Mind</span>
              <span className="ml-2 text-sm font-normal text-slate-400 border-l border-slate-600 pl-2">推理辅助</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSaveModalOpen(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition-all active:scale-95"
            >
              <Archive size={16} className="text-blue-400" />
              存档中心
            </button>
            <div className="flex items-center gap-2 border-l border-slate-700 pl-4">
              <input type="file" ref={fileImportRef} onChange={handleImportData} accept=".json" className="hidden" />
              <button onClick={() => fileImportRef.current?.click()} className="p-2 text-slate-400 hover:text-white" title="从文件读取"><Upload size={18} /></button>
              <button onClick={handleExportData} className="p-2 text-slate-400 hover:text-white" title="导出到文件"><Download size={18} /></button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Add */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
            <h2 className="font-bold text-white flex items-center gap-2 mb-4">
              <Database size={18} className="text-blue-400" />
              导入人物
            </h2>
            <textarea
              className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:ring-2 focus:ring-blue-500/50 resize-none outline-none font-mono"
              placeholder="01. 姓名 描述"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button
              onClick={handleParseCharacters}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all"
            >
              <Users size={16} /> 解析并添加
            </button>
          </div>

          {/* Character List */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col max-h-[500px]">
            <div className="p-4 bg-slate-900/50 border-b border-slate-700">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Users size={18} className="text-purple-400" />
                登场人物 ({state.characters.length})
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {state.characters.map(char => (
                <div 
                  key={char.id} 
                  draggable 
                  onDragStart={(e) => e.dataTransfer.setData("application/react-dnd-char-id", char.id)}
                  className={`flex items-center justify-between p-2 rounded bg-slate-700/50 border border-slate-600/50 hover:border-slate-400 transition-colors group cursor-grab active:cursor-grabbing ${state.graphActiveCharacterIds.includes(char.id) ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <GripVertical size={14} className="text-slate-500 shrink-0" />
                    <span className="text-sm font-medium text-blue-300 truncate" onClick={() => setEditingCharacter(char)}>{char.name}</span>
                  </div>
                  <button onClick={() => setEditingCharacter(char)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white"><Edit3 size={14}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Tabs */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex border-b border-slate-700 gap-2">
            {[
              { id: 'graph', label: '关系网', icon: Users },
              { id: 'evidence', label: '线索墙', icon: Search },
              { id: 'map', label: '时空轨迹', icon: MapIcon },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <tab.icon size={16} /> {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {activeTab === 'graph' && (
              <RelationshipGraph 
                characters={state.characters.filter(c => state.graphActiveCharacterIds.includes(c.id))} 
                relationships={state.relationships} 
                relationshipDefs={state.relationshipDefs}
                characterGroups={state.characterGroups}
                layout={state.graphLayout}
                onAddRelationship={handleAddRelationship}
                onUpdateDefs={defs => setState(prev => ({ ...prev, relationshipDefs: defs }))}
                onNodeDrop={id => !state.graphActiveCharacterIds.includes(id) && setState(prev => ({ ...prev, graphActiveCharacterIds: [...prev.graphActiveCharacterIds, id] }))}
                onUpdateLayout={lay => setState(prev => ({ ...prev, graphLayout: { ...prev.graphLayout, ...lay } }))}
                onRemoveNode={id => setState(prev => ({ ...prev, graphActiveCharacterIds: prev.graphActiveCharacterIds.filter(cid => cid !== id) }))}
                onAddGroup={g => setState(prev => ({ ...prev, characterGroups: [...prev.characterGroups, g] }))}
                onUpdateGroup={handleUpdateGroup}
                onRemoveGroup={id => setState(prev => ({ ...prev, characterGroups: prev.characterGroups.filter(g => g.id !== id) }))}
              />
            )}
            {activeTab === 'evidence' && (
              <EvidenceBoard 
                clues={state.clues} 
                onAddClue={c => setState(prev => ({ ...prev, clues: [...prev.clues, c] }))}
                onUpdateClue={c => setState(prev => ({ ...prev, clues: prev.clues.map(i => i.id === c.id ? c : i) }))}
                onUpdateStatus={(id, s) => setState(prev => ({ ...prev, clues: prev.clues.map(c => c.id === id ? { ...c, status: s } : c) }))}
                onDeleteClue={id => setState(prev => ({ ...prev, clues: prev.clues.filter(c => c.id !== id) }))}
              />
            )}
            {activeTab === 'map' && (
              <MapCanvas 
                maps={state.maps} currentMapId={state.currentMapId} spaces={state.spaces}
                timePoints={state.timePoints} currentTimeId={state.currentTimeId} timelineData={state.timelineData} characters={state.characters}
                onUpdateMaps={m => setState(prev => ({ ...prev, maps: m }))}
                onCreateMap={n => { const id = generateId(); setState(prev => ({ ...prev, maps: [...prev.maps, { id, name: n }], currentMapId: id })) }}
                onSelectMap={id => setState(prev => ({ ...prev, currentMapId: id }))}
                onUpdateSpaces={s => setState(prev => ({ ...prev, spaces: s }))}
                onUpdateTimePoints={p => setState(prev => ({ ...prev, timePoints: p }))}
                onSelectTime={id => setState(prev => ({ ...prev, currentTimeId: id }))}
                onUpdatePlacements={(tid, p) => setState(prev => ({ ...prev, timelineData: { ...prev.timelineData, [tid]: p } }))}
              />
            )}
          </div>
        </div>
      </main>

      {/* Save Management Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-2xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <Archive size={24} className="text-blue-400" />
                存档管理器
              </h2>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* New Save Form */}
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
                  <Plus size={16} /> 创建新存档
                </h3>
                <div className="flex gap-2">
                  <input 
                    value={newSaveName}
                    onChange={e => setNewSaveName(e.target.value)}
                    placeholder="输入存档名称 (例如: 案发第一阶段)"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button 
                    onClick={handleCreateNewSave}
                    disabled={!newSaveName.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
                  >
                    <Save size={18} /> 保存
                  </button>
                </div>
              </div>

              {/* Slot List */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-400 mb-2 flex items-center gap-2">
                  <FolderOpen size={16} /> 已有存档列表
                </h3>
                {saveSlots.length === 0 ? (
                  <div className="text-center py-12 text-slate-600 border-2 border-dashed border-slate-700 rounded-xl">
                    暂无本地存档
                  </div>
                ) : (
                  saveSlots.map(slot => (
                    <div key={slot.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center justify-between group hover:border-slate-500 transition-all">
                      <div className="flex-1 min-w-0 pr-4">
                        <h4 className="font-bold text-blue-300 truncate">{slot.name}</h4>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Clock size={12}/> {new Date(slot.timestamp).toLocaleString()}</span>
                          <span>{slot.data.characters.length} 人物</span>
                          <span>{slot.data.clues.length} 线索</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleLoadSave(slot.id)}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          读取
                        </button>
                        <button 
                          onClick={() => handleOverwriteSave(slot.id)}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-yellow-600 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          覆盖
                        </button>
                        <button 
                          onClick={() => handleDeleteSave(slot.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/30 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">存档保存在当前浏览器本地缓存中</p>
            </div>
          </div>
        </div>
      )}

      {/* Character Modal Placeholder (Keep logic as is) */}
      {editingCharacter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">编辑人物: {editingCharacter.name}</h3>
              <button onClick={() => setEditingCharacter(null)}><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <input 
                className="w-full bg-slate-900 border border-slate-700 rounded p-2" 
                value={editingCharacter.name} 
                onChange={e => setEditingCharacter({...editingCharacter, name: e.target.value})} 
              />
              <textarea 
                className="w-full h-24 bg-slate-900 border border-slate-700 rounded p-2" 
                value={editingCharacter.note || ''} 
                onChange={e => setEditingCharacter({...editingCharacter, note: e.target.value})}
                placeholder="添加备注..."
              />
              <button 
                onClick={() => { setState(p => ({ ...p, characters: p.characters.map(c => c.id === editingCharacter.id ? editingCharacter : c) })); setEditingCharacter(null); }}
                className="w-full bg-blue-600 py-2 rounded font-bold"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;