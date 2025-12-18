import React, { useState, useCallback, useEffect, useRef } from 'react';
import { parseCharacterList } from './utils/parser';
import { AppState, INITIAL_STATE, Character, Space, Relationship, RelationshipDef, MapDoc, TimePoint, CharacterPlacement, Clue, CharacterGroup, SaveSlot, Alibi } from './types';
import RelationshipGraph from './components/RelationshipGraph';
import EvidenceBoard from './components/EvidenceBoard';
import AlibiMatrix from './components/AlibiMatrix';
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
  Clock,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

const WORKING_KEY = 'mystery_mind_working_v1';
const SLOTS_KEY = 'mystery_mind_slots_v1';

const generateId = () => {
  return crypto.randomUUID();
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(WORKING_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_STATE,
          ...parsed,
          characters: parsed.characters || [],
          relationships: parsed.relationships || [],
          characterGroups: parsed.characterGroups || [],
          clues: parsed.clues || [],
          alibis: parsed.alibis || [],
          maps: parsed.maps || INITIAL_STATE.maps,
          spaces: parsed.spaces || [],
          timePoints: parsed.timePoints || INITIAL_STATE.timePoints,
          timelineData: parsed.timelineData || {},
          graphActiveCharacterIds: parsed.graphActiveCharacterIds || [],
          graphLayout: parsed.graphLayout || {}
        };
      }
      return INITIAL_STATE;
    } catch (e) {
      console.error("Critical error loading working state:", e);
      return INITIAL_STATE;
    }
  });

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
  const [evidenceSubTab, setEvidenceSubTab] = useState<'clues' | 'alibis'>('clues');
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [newSaveName, setNewSaveName] = useState('');
  
  const fileImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(WORKING_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(saveSlots));
  }, [saveSlots]);

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
  };

  const handleOverwriteSave = (slotId: string) => {
    const slot = saveSlots.find(s => s.id === slotId);
    if (!slot) return;
    setSaveSlots(prev => prev.map(s => s.id === slotId ? { ...s, timestamp: Date.now(), data: state } : s));
  };

  const handleLoadSave = (slotId: string) => {
    const slot = saveSlots.find(s => s.id === slotId);
    if (!slot) return;
    setState({
      ...INITIAL_STATE,
      ...slot.data,
      characters: slot.data.characters || [],
      clues: slot.data.clues || [],
      alibis: slot.data.alibis || [],
      characterGroups: slot.data.characterGroups || []
    });
    setIsSaveModalOpen(false);
  };

  const handleDeleteSave = (slotId: string) => {
    setSaveSlots(prev => prev.filter(s => s.id !== slotId));
  };

  const handleAddAlibi = (alibi: Alibi) => {
    setState(prev => ({ ...prev, alibis: [...prev.alibis, alibi] }));
  };

  const handleUpdateAlibi = (updated: Alibi, index: number) => {
    setState(prev => {
      const newAlibis = [...prev.alibis];
      newAlibis[index] = updated;
      return { ...prev, alibis: newAlibis };
    });
  };

  const handleDeleteAlibi = (index: number) => {
    setState(prev => ({
      ...prev,
      alibis: prev.alibis.filter((_, i) => i !== index)
    }));
  };

  const handleParseCharacters = useCallback(() => {
    const newChars = parseCharacterList(inputText);
    if (newChars.length > 0) {
      setState(prev => ({ ...prev, characters: [...prev.characters, ...newChars] }));
      setInputText('');
    }
  }, [inputText]);

  const handleConfirmDeleteCharacter = () => {
    if (!characterToDelete) return;
    const charId = characterToDelete.id;

    setState(prev => {
      const updatedTimelineData = { ...prev.timelineData };
      Object.keys(updatedTimelineData).forEach(timeId => {
        updatedTimelineData[timeId] = updatedTimelineData[timeId].filter(p => p.characterId !== charId);
      });

      return {
        ...prev,
        characters: prev.characters.filter(c => c.id !== charId),
        relationships: prev.relationships.filter(r => r.source !== charId && r.target !== charId),
        graphActiveCharacterIds: prev.graphActiveCharacterIds.filter(id => id !== charId),
        characterGroups: prev.characterGroups.map(g => ({
          ...g,
          characterIds: g.characterIds.filter(id => id !== charId)
        })).filter(g => g.characterIds.length > 0),
        alibis: prev.alibis.filter(a => a.character_id !== charId),
        timelineData: updatedTimelineData
      };
    });
    setCharacterToDelete(null);
  };

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
        setState({ ...INITIAL_STATE, ...parsed });
      } catch (err) {
        console.error("Import failed", err);
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      <header className="border-b border-slate-700 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
              <BookOpen className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Mystery<span className="text-blue-500">Mind</span>
              <span className="ml-2 text-sm font-normal text-slate-400 border-l border-slate-600 pl-2 uppercase tracking-widest">推理辅助</span>
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
              <button onClick={() => fileImportRef.current?.click()} className="p-2 text-slate-400 hover:text-white" title="从文件读取存档"><Upload size={18} /></button>
              <button onClick={handleExportData} className="p-2 text-slate-400 hover:text-white" title="导出到文件"><Download size={18} /></button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
            <h2 className="font-bold text-white flex items-center gap-2 mb-4">
              <Database size={18} className="text-blue-400" />
              人物批量导入
            </h2>
            <textarea
              className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:ring-2 focus:ring-blue-500/50 resize-none outline-none font-mono"
              placeholder="01. 赫尔克里·波洛 侦探&#10;02. 阿瑟·黑斯廷斯 助手"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button
              onClick={handleParseCharacters}
              disabled={!inputText.trim()}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all"
            >
              <Users size={16} /> 解析并添加
            </button>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col max-h-[500px]">
            <div className="p-4 bg-slate-900/50 border-b border-slate-700">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Users size={18} className="text-purple-400" />
                登场人物清单 ({state.characters.length})
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {state.characters.length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-sm">暂无人物</div>
              ) : (
                state.characters.map(char => (
                  <div 
                    key={char.id} 
                    draggable 
                    onDragStart={(e) => e.dataTransfer.setData("application/react-dnd-char-id", char.id)}
                    className={`flex items-center justify-between p-2 rounded bg-slate-700/50 border border-slate-600/50 hover:border-slate-400 transition-colors group cursor-grab active:cursor-grabbing ${state.graphActiveCharacterIds.includes(char.id) ? 'opacity-40 border-blue-500/30' : ''}`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <GripVertical size={14} className="text-slate-500 shrink-0" />
                      <span className="text-sm font-medium text-blue-300 truncate cursor-pointer hover:underline" onClick={() => setEditingCharacter(char)}>{char.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingCharacter(char); }} 
                        className="p-1 text-slate-400 hover:text-white" title="编辑详情"
                      >
                        <Edit3 size={14}/>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setCharacterToDelete(char); }} 
                        className="p-1 text-slate-400 hover:text-red-400" title="删除人物"
                      >
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="flex border-b border-slate-700 gap-2">
            {[
              { id: 'graph', label: '逻辑关系网', icon: Users },
              { id: 'evidence', label: '证物与线索', icon: Search },
              { id: 'map', label: '空间轨迹', icon: MapIcon },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
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
                onUpdateGroup={g => setState(prev => ({ ...prev, characterGroups: prev.characterGroups.map(item => item.id === g.id ? g : item) }))}
                onRemoveGroup={id => setState(prev => ({ ...prev, characterGroups: prev.characterGroups.filter(g => g.id !== id) }))}
              />
            )}
            {activeTab === 'evidence' && (
              <div className="space-y-6">
                <div className="flex gap-4 border-b border-slate-800 pb-2">
                    <button 
                        onClick={() => setEvidenceSubTab('clues')}
                        className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${evidenceSubTab === 'clues' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Search size={14} /> 证物公告板
                    </button>
                    <button 
                        onClick={() => setEvidenceSubTab('alibis')}
                        className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${evidenceSubTab === 'alibis' ? 'bg-slate-800 text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <ShieldCheck size={14} /> 不在场证明矩阵
                    </button>
                </div>
                
                {evidenceSubTab === 'clues' ? (
                  <EvidenceBoard 
                    clues={state.clues} 
                    onAddClue={c => setState(prev => ({ ...prev, clues: [...prev.clues, c] }))}
                    onUpdateClue={c => setState(prev => ({ ...prev, clues: prev.clues.map(i => i.id === c.id ? c : i) }))}
                    onUpdateStatus={(id, s) => setState(prev => ({ ...prev, clues: prev.clues.map(c => c.id === id ? { ...c, status: s } : c) }))}
                    onDeleteClue={id => setState(prev => ({ ...prev, clues: prev.clues.filter(c => c.id !== id) }))}
                  />
                ) : (
                  <AlibiMatrix 
                    alibis={state.alibis} 
                    characters={state.characters}
                    onAddAlibi={handleAddAlibi}
                    onUpdateAlibi={handleUpdateAlibi}
                    onDeleteAlibi={handleDeleteAlibi}
                  />
                )}
              </div>
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

      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <Archive size={24} className="text-blue-400" />
                存档管理器
              </h2>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={24} /></button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
                  <Plus size={16} /> 创建新存档槽位
                </h3>
                <div className="flex gap-2">
                  <input 
                    value={newSaveName}
                    onChange={e => setNewSaveName(e.target.value)}
                    placeholder="输入存档描述 (如: 第三章结束)"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button 
                    onClick={handleCreateNewSave}
                    disabled={!newSaveName.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all"
                  >
                    <Save size={18} /> 保存进度
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-400 mb-2 flex items-center gap-2">
                  <FolderOpen size={16} /> 已保存的记录
                </h3>
                {saveSlots.length === 0 ? (
                  <div className="text-center py-12 text-slate-600 border-2 border-dashed border-slate-700 rounded-xl">
                    尚未发现本地存档记录
                  </div>
                ) : (
                  saveSlots.map(slot => (
                    <div key={slot.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center justify-between group hover:border-slate-500 transition-all">
                      <div className="flex-1 min-w-0 pr-4">
                        <h4 className="font-bold text-blue-300 truncate">{slot.name}</h4>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Clock size={12}/> {new Date(slot.timestamp).toLocaleString()}</span>
                          <span>{slot.data.characters.length} 角色</span>
                          <span>{slot.data.clues.length} 证物</span>
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
                          title="使用当前状态覆盖此存档"
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
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Storage: Browser Local Cache</p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Character Deletion */}
      {characterToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-800 rounded-2xl border border-red-900/50 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                <AlertTriangle className="text-red-500" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">确认删除角色?</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                你确定要删除角色 "<span className="text-red-400 font-bold">{characterToDelete.name}</span>" 吗？<br/>
                相关的<span className="text-white">关系网、轨迹、不在场证明</span>记录也将被永久移除。此操作不可撤销。
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setCharacterToDelete(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={handleConfirmDeleteCharacter}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-900/30 transition-all active:scale-95"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingCharacter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users size={18} className="text-blue-400" />
                  编辑人物: {editingCharacter.name}
              </h3>
              <button onClick={() => setEditingCharacter(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">姓名</label>
                <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" 
                    value={editingCharacter.name} 
                    onChange={e => setEditingCharacter({...editingCharacter, name: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">笔记与备注</label>
                <textarea 
                    className="w-full h-32 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" 
                    value={editingCharacter.note || ''} 
                    onChange={e => setEditingCharacter({...editingCharacter, note: e.target.value})}
                    placeholder="在此输入关于该角色的线索、动机或疑点..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditingCharacter(null)} className="px-4 py-2 text-slate-400 hover:text-white">取消</button>
                <button 
                    onClick={() => { setState(p => ({ ...p, characters: p.characters.map(c => c.id === editingCharacter.id ? editingCharacter : c) })); setEditingCharacter(null); }}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition-all"
                >
                    确认修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;