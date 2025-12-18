
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { parseCharacterList } from './utils/parser';
import { AppState, INITIAL_STATE, Character, Space, Relationship, RelationshipDef, MapDoc, TimePoint, CharacterPlacement, Clue, CharacterGroup, Alibi } from './types';
import RelationshipGraph from './components/RelationshipGraph';
import EvidenceBoard from './components/EvidenceBoard';
import AlibiMatrix from './components/AlibiMatrix';
import MapCanvas from './components/MapCanvas';
import { saveToIndexedDB, loadFromIndexedDB, saveFileHandle, loadFileHandle } from './services/storage';
import { 
  Users, 
  Map as MapIcon, 
  Search, 
  Database, 
  BookOpen,
  GripVertical,
  Edit3,
  Trash2,
  X,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Save,
  FilePlus,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  Link2,
  Link2Off,
  AlertCircle,
  Info
} from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isInitialized, setIsInitialized] = useState(false);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'graph' | 'evidence' | 'map'>('graph');
  const [evidenceSubTab, setEvidenceSubTab] = useState<'clues' | 'alibis'>('clues');
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // 检测是否处于 Iframe 环境
  const isIframe = window.self !== window.top;
  
  // File System Access API Handle
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  
  const fileImportRef = useRef<HTMLInputElement>(null);

  // Status message timer
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Load state and file handle from IndexedDB on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        const saved = await loadFromIndexedDB();
        const savedHandle = await loadFileHandle();
        
        if (saved) {
          setState({
            ...INITIAL_STATE,
            ...saved,
            characters: saved.characters || [],
            relationships: saved.relationships || [],
            clues: saved.clues || [],
            alibis: saved.alibis || [],
            lastFileName: saved.lastFileName || null
          });
        }
        
        // 尝试载入句柄（仅在非 iframe 且安全上下文中有效）
        if (savedHandle && !isIframe) {
          setFileHandle(savedHandle);
        }
      } catch (e) {
        console.error("Failed to load from IndexedDB:", e);
      } finally {
        setIsInitialized(true);
      }
    };
    initStorage();
  }, [isIframe]);

  // Save state to IndexedDB whenever it changes
  useEffect(() => {
    if (!isInitialized) return;
    
    const save = async () => {
      try {
        await saveToIndexedDB(state);
      } catch (e) {
        console.error("Failed to save state to IndexedDB:", e);
      }
    };
    save();
  }, [state, isInitialized]);

  // Save file handle to IndexedDB whenever it changes
  useEffect(() => {
    if (!isInitialized || isIframe) return;
    
    const save = async () => {
      try {
        await saveFileHandle(fileHandle);
      } catch (e) {
        console.error("Failed to save file handle to IndexedDB:", e);
      }
    };
    save();
  }, [fileHandle, isInitialized, isIframe]);

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
      setStatusMessage("人物解析成功");
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
    setStatusMessage("人物已删除");
  };

  // --- File System Access API Logic ---

  /**
   * Standard blob download fallback (Works in ALL environments)
   */
  const triggerLegacyDownload = (filename: string) => {
    try {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowExportModal(false);
      setStatusMessage("档案已成功下载 (兼容模式)");
    } catch (e) {
      console.error("Legacy download failed:", e);
      setErrorMessage("浏览器下载组件异常");
    }
  };

  /**
   * Native "Save As" using showSaveFilePicker
   */
  const handleSaveAs = async () => {
    const fallbackName = state.lastFileName || `mystery-mind-${new Date().toISOString().slice(0,10)}.json`;
    
    try {
      if ('showSaveFilePicker' in window && window.isSecureContext && !isIframe) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fallbackName,
          types: [{
            description: 'MysteryMind Archive',
            accept: { 'application/json': ['.json'] },
          }],
        });
        
        const writable = await handle.createWritable();
        const dataStr = JSON.stringify(state, null, 2);
        await writable.write(dataStr);
        await writable.close();
        
        setFileHandle(handle);
        setState(prev => ({ ...prev, lastFileName: handle.name }));
        setShowExportModal(false);
        setStatusMessage("文件已关联并保存成功");
      } else {
        triggerLegacyDownload(fallbackName);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn("Modern Save As blocked or failed, falling back to legacy download.", err);
      triggerLegacyDownload(fallbackName);
    }
  };

  /**
   * Performs silent overwrite if handle exists.
   */
  const handleOverwrite = async () => {
    const fallbackName = state.lastFileName || 'mystery_archive.json';
    
    if (!fileHandle || isIframe) {
      await handleSaveAs();
      return;
    }

    try {
      const options = { mode: 'readwrite' };
      const permission = await fileHandle.queryPermission(options);
      
      if (permission !== 'granted') {
        const request = await fileHandle.requestPermission(options);
        if (request !== 'granted') {
          triggerLegacyDownload(fallbackName);
          return;
        }
      }

      const writable = await fileHandle.createWritable();
      const dataStr = JSON.stringify(state, null, 2);
      await writable.write(dataStr);
      await writable.close();
      
      setShowExportModal(false);
      setStatusMessage("静默覆盖保存成功");
    } catch (err: any) {
      console.warn("Overwrite failed, falling back to standard save.", err);
      await handleSaveAs();
    }
  };

  /**
   * Modern Import using showOpenFilePicker
   */
  const handleOpenFile = async () => {
    try {
      if ('showOpenFilePicker' in window && window.isSecureContext && !isIframe) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'MysteryMind Archive',
            accept: { 'application/json': ['.json'] },
          }],
          multiple: false
        });
        
        const file = await handle.getFile();
        const content = await file.text();
        const parsed = JSON.parse(content);
        
        setFileHandle(handle);
        setState({ 
          ...INITIAL_STATE, 
          ...parsed, 
          lastFileName: handle.name 
        });
        setStatusMessage(`已建立文件关联: ${handle.name}`);
      } else {
        fileImportRef.current?.click();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn("Modern OpenFile blocked or failed, using legacy input.", err);
      fileImportRef.current?.click();
    }
  };

  const handleExportData = () => {
    setShowExportModal(true);
  };

  const handleImportLegacy = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        setFileHandle(null); 
        setState({ 
          ...INITIAL_STATE, 
          ...parsed, 
          lastFileName: fileName 
        });
        setStatusMessage(`导入成功 (受限于当前浏览器环境，未建立持久关联)`);
      } catch (err) {
        console.error("Import failed", err);
        setErrorMessage("导入失败，请检查文件格式。");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-500" size={48} />
          <p className="animate-pulse font-medium tracking-widest uppercase text-xs">正在连接思维数据库...</p>
        </div>
      </div>
    );
  }

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
            
            <div className="ml-4 flex items-center gap-2">
              {statusMessage && (
                <div className="flex items-center gap-2 text-xs font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full border border-green-400/30 animate-in fade-in slide-in-from-left-2 shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                  <CheckCircle2 size={12} />
                  {statusMessage}
                </div>
              )}
              {errorMessage && (
                <div className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/30 animate-in shake-in duration-300 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                  <AlertCircle size={12} />
                  {errorMessage}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${fileHandle ? 'bg-green-900/20 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                 {fileHandle ? <Link2 size={12}/> : <Link2Off size={12}/>}
                 {fileHandle ? '已关联本地文件' : isIframe ? '沙盒环境受限' : '未关联文件'}
              </div>
              <input type="file" ref={fileImportRef} onChange={handleImportLegacy} accept=".json" className="hidden" />
              <button 
                onClick={handleOpenFile} 
                className="flex items-center gap-2 p-2 text-slate-400 hover:text-white transition-colors group" 
                title="打开存档文件"
              >
                <FolderOpen size={18} className="group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">打开</span>
              </button>
              <button 
                onClick={handleExportData} 
                className="flex items-center gap-2 p-2 text-slate-400 hover:text-white transition-colors group" 
                title="保存或导出存档"
              >
                <Save size={18} className="group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">保存</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
            <h2 className="font-bold text-white flex items-center gap-2 mb-4">
              <Database size={18} className="text-blue-400" />
              数据批量提取
            </h2>
            <textarea
              className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:ring-2 focus:ring-blue-500/50 resize-none outline-none font-mono"
              placeholder="请逐行输入人物信息...&#10;例如: 01. 赫尔克里·波洛 侦探"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className="mt-4">
              <button
                onClick={handleParseCharacters}
                disabled={!inputText.trim()}
                className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border border-slate-600 shadow-md"
                title="逐行解析角色"
              >
                <Users size={16} /> 简单提取
              </button>
            </div>
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
                      <div className="flex flex-col truncate min-w-0">
                        <span className="text-sm font-medium text-blue-300 truncate cursor-pointer hover:underline" onClick={() => setEditingCharacter(char)}>
                          {char.name}
                        </span>
                        {char.raw_info && (
                          <span className="text-[10px] text-slate-500 truncate mt-0.5 font-normal">
                            {char.raw_info}
                          </span>
                        )}
                      </div>
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
                onRemoveNode={id => setState(prev => ({ 
                  ...prev, 
                  graphActiveCharacterIds: prev.graphActiveCharacterIds.filter(cid => cid !== id),
                  relationships: prev.relationships.filter(r => r.source !== id && r.target !== id),
                  characterGroups: prev.characterGroups.map(g => ({
                    ...g,
                    characterIds: g.characterIds.filter(memberId => memberId !== id)
                  })).filter(g => g.characterIds.length > 0)
                }))}
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
                onCreateMap={n => { const id = crypto.randomUUID(); setState(prev => ({ ...prev, maps: [...prev.maps, { id, name: n }], currentMapId: id })) }}
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

      {showExportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Save className="text-blue-400" size={24} />
                导出/保存档案
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <p className="text-slate-400 text-sm leading-relaxed">
                系统检测到您当前正基于 <span className="text-blue-300 font-mono italic">"{state.lastFileName || '新建文档'}"</span> 进行编辑。
                请选择如何保存您的推理记录：
              </p>
              
              {isIframe && (
                <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-2xl text-yellow-200/80 text-xs leading-relaxed">
                  <Info className="shrink-0 text-yellow-500" size={18} />
                  <p>
                    当前检测到您正在<strong>跨域沙盒环境</strong>中浏览。受浏览器安全策略限制，系统无法直接修改您的本地磁盘文件。点击下方按钮将触发标准“下载”操作。
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={handleOverwrite}
                  className="flex flex-col items-center gap-4 p-6 bg-slate-900/50 border border-slate-700 rounded-2xl hover:border-blue-500 hover:bg-slate-700/50 transition-all group text-center"
                >
                  <div className="p-4 bg-blue-900/30 rounded-full text-blue-400 group-hover:scale-110 transition-transform">
                    <RefreshCw size={32} />
                  </div>
                  <div className="space-y-1">
                    <span className="block font-bold text-white">直接覆盖保存</span>
                    <span className="block text-[10px] text-slate-500 truncate max-w-[140px]">
                      {fileHandle && !isIframe ? '静默写入源文件' : '导出下载'}
                    </span>
                  </div>
                </button>

                <button 
                  onClick={handleSaveAs}
                  className="flex flex-col items-center gap-4 p-6 bg-slate-900/50 border border-slate-700 rounded-2xl hover:border-green-500 hover:bg-slate-700/50 transition-all group text-center"
                >
                  <div className="p-4 bg-green-900/30 rounded-full text-green-400 group-hover:scale-110 transition-transform">
                    <FilePlus size={32} />
                  </div>
                  <div className="space-y-1">
                    <span className="block font-bold text-white">另存为新档案</span>
                    <span className="block text-[10px] text-slate-500">
                      创建副本或选取新位置
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="px-8 py-4 bg-slate-900/50 text-center">
              <p className="text-[10px] text-slate-500 italic">
                {fileHandle && !isIframe ? '当前已建立文件关联，支持直接覆盖。' : '提示：由于环境限制，所有保存操作将作为文件下载处理。'}
              </p>
            </div>
          </div>
        </div>
      )}

      {characterToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-800 rounded-2xl border border-red-900/50 shadow-2xl w-full max-sm animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                <AlertTriangle className="text-red-500" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">确认删除角色?</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                你确定要删除角色 "<span className="text-red-400 font-bold">{characterToDelete.name}</span>" 吗？<br/>
                相关的<span className="text-white">关系网、轨迹、不在场证明</span>记录也将被永久移除。
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
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">姓名</label>
                <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" 
                    value={editingCharacter.name} 
                    onChange={e => setEditingCharacter({...editingCharacter, name: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">身份 / 初始描述</label>
                <input 
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:ring-2 focus:ring-blue-500" 
                    value={editingCharacter.raw_info || ''} 
                    onChange={e => setEditingCharacter({...editingCharacter, raw_info: e.target.value})} 
                    placeholder="例如: 侦探, 受害者的好友..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">笔记与备注</label>
                <textarea 
                    className="w-full h-32 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" 
                    value={editingCharacter.note || ''} 
                    onChange={e => setEditingCharacter({...editingCharacter, note: e.target.value})}
                    placeholder="在此输入关于该角色的线索、动机 or 疑点..."
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
