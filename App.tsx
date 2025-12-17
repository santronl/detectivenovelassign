import React, { useState, useCallback, useEffect, useRef } from 'react';
import { parseCharacterList } from './utils/parser';
import { AppState, INITIAL_STATE, Character, Space, Relationship, RelationshipDef, MapDoc, TimePoint, CharacterPlacement, Clue } from './types';
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
  X
} from 'lucide-react';

const STORAGE_KEY = 'mystery_mind_save_v1';

// Safe ID Generator
const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

const App: React.FC = () => {
  // Initialize state from LocalStorage if available
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
          const parsed = JSON.parse(saved);
          // Merge with INITIAL_STATE to ensure new fields (like graphLayout) exist in old saves
          return { ...INITIAL_STATE, ...parsed };
      }
      return INITIAL_STATE;
    } catch (e) {
      console.error("Failed to load local save", e);
      return INITIAL_STATE;
    }
  });

  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'graph' | 'evidence' | 'map'>('graph');
  
  // Character Editing State
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  
  const fileImportRef = useRef<HTMLInputElement>(null);

  // Auto-save effect
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Auto-save failed", e);
    }
  }, [state]);

  const handleParseCharacters = useCallback(() => {
    const newChars = parseCharacterList(inputText);
    if (newChars.length > 0) {
      // Ensure imported chars have IDs if parser didn't guarantee unique ones (parser uses randomUUID, which is fine mostly)
      setState(prev => ({
        ...prev,
        characters: [...prev.characters, ...newChars]
      }));
      setInputText('');
      alert(`成功导入 ${newChars.length} 名角色`);
    } else {
      alert('未识别到符合格式的角色。请确保格式如：01. 姓名 描述');
    }
  }, [inputText]);

  // Data Persistence Handlers
  const handleExportData = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `mystery-mind-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = ev.target?.result;
        if (typeof result === 'string') {
          const parsed = JSON.parse(result) as AppState;
          // Basic validation to ensure it has required fields
          if (parsed.characters && parsed.relationships && parsed.maps) {
            if (confirm("导入将覆盖当前所有进度，确定继续吗？")) {
                // Ensure we merge with initial state to avoid missing keys in imported file
                setState({ ...INITIAL_STATE, ...parsed });
                alert("存档读取成功！");
            }
          } else {
            alert("文件格式不正确，无法读取存档。");
          }
        }
      } catch (err) {
        console.error("Import failed", err);
        alert("读取文件失败，请检查文件是否损坏。");
      }
      // Reset input value so same file can be selected again
      if (fileImportRef.current) fileImportRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Map & Timeline Handlers
  const handleUpdateMaps = (maps: MapDoc[]) => setState(prev => ({ ...prev, maps }));
  
  // New Atomic Create Map Handler
  const handleCreateMap = (name: string) => {
    const newId = generateId();
    setState(prev => ({
        ...prev,
        maps: [...prev.maps, { id: newId, name }],
        currentMapId: newId
    }));
  };

  const handleSelectMap = (id: string) => setState(prev => ({ ...prev, currentMapId: id }));
  const handleUpdateSpaces = (spaces: Space[]) => setState(prev => ({ ...prev, spaces }));
  
  const handleUpdateTimePoints = (pts: TimePoint[]) => setState(prev => ({ ...prev, timePoints: pts }));
  const handleSelectTime = (id: string) => setState(prev => ({ ...prev, currentTimeId: id }));
  
  const handleUpdatePlacements = (timeId: string, placements: CharacterPlacement[]) => {
      setState(prev => ({
          ...prev,
          timelineData: {
              ...prev.timelineData,
              [timeId]: placements
          }
      }));
  };

  const handleAddRelationship = (source: string, target: string, relation: string) => {
    // Check if exists
    const exists = state.relationships.some(
      r => (r.source === source && r.target === target) || (r.source === target && r.target === source)
    );
    
    if (exists) {
        setState(prev => ({
            ...prev,
            relationships: prev.relationships.map(r => 
                (r.source === source && r.target === target) || (r.source === target && r.target === source)
                ? { ...r, relation }
                : r
            )
        }));
    } else {
        setState(prev => ({
            ...prev,
            relationships: [...prev.relationships, { source, target, relation }]
        }));
    }
  };

  const handleUpdateRelationshipDefs = (defs: RelationshipDef[]) => {
    setState(prev => ({ ...prev, relationshipDefs: defs }));
  };

  const handleUpdateGraphLayout = (layout: Record<string, { x: number; y: number }>) => {
    setState(prev => ({
        ...prev,
        graphLayout: { ...prev.graphLayout, ...layout }
    }));
  };

  // Drag and Drop Logic
  const handleCharacterDragStart = (e: React.DragEvent, charId: string) => {
    e.dataTransfer.setData("application/react-dnd-char-id", charId);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleGraphNodeDrop = (charId: string) => {
    if (!state.graphActiveCharacterIds.includes(charId)) {
        setState(prev => ({
            ...prev,
            graphActiveCharacterIds: [...prev.graphActiveCharacterIds, charId]
        }));
    }
  };

  // Character Editing Logic
  const handleSaveCharacter = (updatedChar: Character) => {
    setState(prev => ({
        ...prev,
        characters: prev.characters.map(c => c.id === updatedChar.id ? updatedChar : c)
    }));
    setEditingCharacter(null);
  };

  const handleDeleteCharacter = (id: string) => {
      if (confirm("确定要删除这个角色吗？相关的关系和位置数据可能会失效。")) {
          setState(prev => ({
              ...prev,
              characters: prev.characters.filter(c => c.id !== id),
              relationships: prev.relationships.filter(r => r.source !== id && r.target !== id),
              graphActiveCharacterIds: prev.graphActiveCharacterIds.filter(cid => cid !== id)
              // We keep timeline data as is, it will just filter out naturally in MapCanvas
          }));
          setEditingCharacter(null);
      }
  };

  // Clue / Evidence Logic
  const handleAddClue = (clue: Clue) => {
      setState(prev => ({
          ...prev,
          clues: [...prev.clues, clue]
      }));
  };

  const handleUpdateClueStatus = (clueId: string, newStatus: Clue['status']) => {
      setState(prev => ({
          ...prev,
          clues: prev.clues.map(c => c.id === clueId ? { ...c, status: newStatus } : c)
      }));
  };

  const handleDeleteClue = (clueId: string) => {
      if(confirm("确定删除这条证物/线索吗？")) {
          setState(prev => ({
              ...prev,
              clues: prev.clues.filter(c => c.id !== clueId)
          }));
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <BookOpen className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Mystery<span className="text-blue-500">Mind</span>
              <span className="ml-2 text-sm font-normal text-slate-400 border-l border-slate-600 pl-2">推理辅助引擎</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500 font-mono hidden sm:block">
              {state.characters.length} CHARS • {state.clues.length} CLUES
            </div>
            
            <div className="flex items-center gap-2 border-l border-slate-700 pl-4">
              <input 
                type="file" 
                ref={fileImportRef}
                onChange={handleImportData}
                accept=".json"
                className="hidden"
              />
              <button 
                onClick={() => fileImportRef.current?.click()}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                title="导入存档"
              >
                <Upload size={18} />
              </button>
              <button 
                onClick={handleExportData}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                title="导出存档"
              >
                <Download size={18} />
              </button>
              <div title="已自动保存到本地" className="p-2 text-green-500/50 cursor-default">
                  <Save size={18} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Input & Context */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Input Panel (Simplified for Manual Use) */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Database size={18} className="text-blue-400" />
                批量导入角色
              </h2>
            </div>

            <textarea
              className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none font-mono"
              placeholder="输入角色列表，例如:
01. 赫尔克里·波洛 侦探
02. 黑斯廷斯 助手"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />

            <div className="mt-4 flex justify-between items-center">
                <div className="text-[10px] text-slate-500">
                    自动识别格式：编号. 姓名 描述
                </div>
                <button
                  onClick={handleParseCharacters}
                  disabled={!inputText.trim()}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Users size={16} />
                  解析列表
                </button>
            </div>
          </div>

          {/* Character List Preview (Draggable) */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg flex flex-col max-h-[400px]">
            {/* Header - Fixed */}
            <div className="p-5 pb-0 shrink-0">
                <h2 className="font-bold text-white flex items-center gap-2 mb-4 pb-2 border-b border-slate-700">
                  <Users size={18} className="text-purple-400" />
                  登场人物 ({state.characters.length})
                </h2>
            </div>
            
            {/* List - Scrollable */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 pt-0">
                <div className="space-y-2">
                  {state.characters.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">暂无角色</p>
                  ) : (
                    state.characters.map(char => (
                      <div 
                        key={char.id} 
                        draggable
                        onDragStart={(e) => handleCharacterDragStart(e, char.id)}
                        className={`flex items-center justify-between p-2 rounded transition-colors group cursor-grab active:cursor-grabbing border border-transparent hover:border-slate-600 ${
                            state.graphActiveCharacterIds.includes(char.id) ? 'bg-slate-700/50 opacity-50' : 'bg-slate-700 hover:bg-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical size={14} className="text-slate-500" />
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                            {char.name.charAt(0)}
                          </div>
                          <div className="flex-1">
                            <div 
                                onClick={(e) => { e.preventDefault(); setEditingCharacter(char); }}
                                className="text-sm font-medium text-blue-300 hover:text-blue-100 cursor-pointer underline decoration-dotted underline-offset-4 w-fit"
                                title="点击编辑角色信息"
                            >
                                {char.name}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                {char.note ? (
                                    <span className="text-yellow-500/80 mr-1">[{char.note.substring(0, 5)}...]</span>
                                ) : null}
                                {char.role || char.raw_info}
                            </div>
                          </div>
                          
                          {/* Quick Edit Icon */}
                          <button 
                            onClick={() => setEditingCharacter(char)}
                            className="p-1.5 text-slate-500 hover:text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                              <Edit3 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-2 text-[10px] text-slate-500 text-center pt-2">
                    提示: 拖拽角色到关系网或地图中。点击人名可添加备注。
                </div>
            </div>
          </div>
        </div>

        {/* Right Column: Visualization & Data */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            {[
              { id: 'graph', label: '人物关系网', icon: Users },
              { id: 'evidence', label: '证物公告板', icon: Search },
              { id: 'map', label: '空间与时间轨迹', icon: MapIcon },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-[500px]">
            {activeTab === 'graph' && (
                <RelationshipGraph 
                    characters={state.characters.filter(c => state.graphActiveCharacterIds.includes(c.id))} 
                    relationships={state.relationships} 
                    relationshipDefs={state.relationshipDefs || []}
                    layout={state.graphLayout}
                    onAddRelationship={handleAddRelationship}
                    onUpdateDefs={handleUpdateRelationshipDefs}
                    onNodeDrop={handleGraphNodeDrop}
                    onUpdateLayout={handleUpdateGraphLayout}
                />
            )}
            
            {activeTab === 'evidence' && (
                <EvidenceBoard 
                    clues={state.clues} 
                    onAddClue={handleAddClue}
                    onUpdateStatus={handleUpdateClueStatus}
                    onDeleteClue={handleDeleteClue}
                />
            )}
            
            {activeTab === 'map' && (
              <div className="flex flex-col gap-8 h-full">
                <MapCanvas 
                  maps={state.maps}
                  currentMapId={state.currentMapId}
                  spaces={state.spaces}
                  
                  timePoints={state.timePoints}
                  currentTimeId={state.currentTimeId}
                  timelineData={state.timelineData}
                  characters={state.characters}

                  onUpdateMaps={handleUpdateMaps}
                  onCreateMap={handleCreateMap}
                  onSelectMap={handleSelectMap}
                  onUpdateSpaces={handleUpdateSpaces}
                  
                  onUpdateTimePoints={handleUpdateTimePoints}
                  onSelectTime={handleSelectTime}
                  onUpdatePlacements={handleUpdatePlacements}
                />
                
                {state.spaces.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-slate-300 mb-4 px-1 border-l-4 border-blue-500 pl-3">区域列表 (所有地图)</h3>
                    <MapVisualizer spaces={state.spaces} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Character Edit Modal */}
      {editingCharacter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Edit3 size={18} className="text-blue-400" />
                        编辑角色信息
                    </h3>
                    <button onClick={() => setEditingCharacter(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">角色姓名</label>
                        <input 
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingCharacter.name}
                            onChange={(e) => setEditingCharacter({ ...editingCharacter, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">身份 / 职业 (简短描述)</label>
                        <input 
                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingCharacter.role || editingCharacter.raw_info || ''}
                            onChange={(e) => setEditingCharacter({ ...editingCharacter, role: e.target.value })}
                            placeholder="例如: 侦探, 受害人妻子"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1 flex justify-between">
                            详细备注 (用户笔记)
                            <span className="text-slate-600 font-normal">可记录疑点、作案动机等</span>
                        </label>
                        <textarea 
                            className="w-full h-32 bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm leading-relaxed"
                            value={editingCharacter.note || ''}
                            onChange={(e) => setEditingCharacter({ ...editingCharacter, note: e.target.value })}
                            placeholder="在此输入关于该角色的详细笔记..."
                        />
                    </div>
                     {/* Read-only Description */}
                     {editingCharacter.description && (
                         <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                             <div className="text-[10px] uppercase text-purple-400 font-bold mb-1 flex items-center gap-1">详细描述</div>
                             <p className="text-xs text-slate-400">{editingCharacter.description}</p>
                         </div>
                     )}
                </div>

                <div className="p-4 border-t border-slate-700 flex justify-between bg-slate-800/50 rounded-b-xl">
                    <button 
                        onClick={() => handleDeleteCharacter(editingCharacter.id)}
                        className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded flex items-center gap-2 text-sm transition-colors"
                    >
                        <Trash2 size={16} /> 删除角色
                    </button>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setEditingCharacter(null)}
                            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
                        >
                            取消
                        </button>
                        <button 
                            onClick={() => handleSaveCharacter(editingCharacter)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold flex items-center gap-2"
                        >
                            <Save size={16} /> 保存修改
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