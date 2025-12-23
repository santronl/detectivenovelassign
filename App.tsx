
import React, { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { parseCharacterList } from './utils/parser';
import { AppState, INITIAL_STATE, Character, Space, Relationship, RelationshipDef, MapDoc, TimePoint, CharacterPlacement, ItemPlacement, Clue, CharacterGroup, Alibi, Location } from './types';
import RelationshipGraph from './components/RelationshipGraph';
import EvidenceBoard from './components/EvidenceBoard';
import AlibiMatrix from './components/AlibiMatrix';
import LocationList from './components/LocationList';
import MapCanvas from './components/MapCanvas';
import ClueModal from './components/ClueModal';
import { saveToIndexedDB, loadFromIndexedDB, saveFileHandle, loadFileHandle, saveImageToDB, loadImageFromDB, getAllImageIdsFromDB, deleteImageFromDB } from './services/storage';
import { compressImage } from './utils/imageProcessor';
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
  Package,
  Info,
  Plus,
  MapPin,
  Camera,
  User,
  FileArchive,
  ArrowUpCircle
} from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isInitialized, setIsInitialized] = useState(false);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'graph' | 'evidence' | 'map'>('graph');
  const [evidenceSubTab, setEvidenceSubTab] = useState<'clues' | 'alibis' | 'locations'>('clues');
  const [sidebarTab, setSidebarTab] = useState<'characters' | 'clues'>('characters');
  
  // 运行时图片 Blob URL 管理
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  
  // Modals State
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [isCharImageLoading, setIsCharImageLoading] = useState(false);
  const charFileInputRef = useRef<HTMLInputElement>(null);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [editingClue, setEditingClue] = useState<Clue | null>(null);
  const [isClueModalOpen, setIsClueModalOpen] = useState(false);
  const [clueToDeleteId, setClueToDeleteId] = useState<string | null>(null);
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const isIframe = window.self !== window.top;
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  // 初始化时清理 URL，防止内存泄漏
  useEffect(() => {
    return () => {
      Object.values(blobUrls).forEach((url) => URL.revokeObjectURL(url as string));
    };
  }, []);

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

  // 加载图片 Blob 并在运行时创建 URL
  const refreshBlobUrls = async (entities: AppState) => {
    const ids = new Set<string>();
    
    if (entities.characters) {
      for (const c of entities.characters) {
        if (typeof c.imageId === 'string') ids.add(c.imageId);
      }
    }
    if (entities.clues) {
      for (const c of entities.clues) {
        if (typeof c.imageId === 'string') ids.add(c.imageId);
      }
    }
    if (entities.locations) {
      for (const l of entities.locations) {
        if (typeof l.imageId === 'string') ids.add(l.imageId);
      }
    }
    if (entities.maps) {
      for (const m of entities.maps) {
        if (typeof m.imageId === 'string') ids.add(m.imageId);
      }
    }

    const newUrls: Record<string, string> = { ...blobUrls };
    for (const id of ids) {
      if (!newUrls[id]) {
        const blob = await loadImageFromDB(id);
        if (blob) {
          newUrls[id] = URL.createObjectURL(blob);
        }
      }
    }
    setBlobUrls(newUrls);
  };

  useEffect(() => {
    const initStorage = async () => {
      try {
        const saved = await loadFromIndexedDB();
        const savedHandle = await loadFileHandle();
        
        if (saved) {
          setState({
            ...INITIAL_STATE,
            ...saved,
          });
          await refreshBlobUrls(saved);
        }
        
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

  useEffect(() => {
    if (!isInitialized) return;
    const timeoutId = setTimeout(async () => {
      try { 
        await saveToIndexedDB(state); 
      } catch (e) { console.error(e); }
    }, 2000); 
    return () => clearTimeout(timeoutId);
  }, [state, isInitialized]);

  // 统一处理图片保存
  const handleEntityImageSave = async (id: string, blob: Blob) => {
    const imageId = `img_${crypto.randomUUID()}`;
    await saveImageToDB(imageId, blob);
    const url = URL.createObjectURL(blob);
    setBlobUrls(prev => ({ ...prev, [imageId]: url }));
    return imageId;
  };

  const handleCharImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCharImageLoading(true);
      try {
        const blob = await compressImage(file, 400, 0.7);
        const imageId = await handleEntityImageSave(editingCharacter?.id || 'new_char', blob);
        if (editingCharacter) {
          setEditingCharacter({ ...editingCharacter, imageId });
        }
      } catch (err: any) {
        setErrorMessage("图片处理失败");
      } finally {
        setIsCharImageLoading(false);
      }
    }
  };

  // 迁移逻辑：将旧版 Base64 转换为 IndexedDB 存储
  const migrateLegacyData = async (data: any): Promise<AppState> => {
    const migrateImage = async (base64?: string) => {
      if (!base64 || !base64.startsWith('data:')) return undefined;
      try {
        const response = await fetch(base64);
        const blob = await response.blob();
        const id = `img_migrated_${crypto.randomUUID()}`;
        await saveImageToDB(id, blob);
        return id;
      } catch (e) {
        console.error("Migration failed for image", e);
        return undefined;
      }
    };

    const newState = { ...INITIAL_STATE, ...data };

    // 人物
    if (newState.characters) {
      for (const char of newState.characters) {
        const oldUrl = (char as any).imageUrl;
        if (oldUrl && !char.imageId) {
          char.imageId = await migrateImage(oldUrl);
          delete (char as any).imageUrl;
        }
      }
    }
    // 证物
    if (newState.clues) {
      for (const clue of newState.clues) {
        const oldUrl = (clue as any).imageUrl;
        if (oldUrl && !clue.imageId) {
          clue.imageId = await migrateImage(oldUrl);
          // Fix: Correct variable name from char to clue on line 228
          delete (clue as any).imageUrl;
        }
      }
    }
    return newState;
  };

  // 核心：打包导出或覆盖保存
  const exportArchive = async (isSaveAs: boolean) => {
    try {
      const zip = new JSZip();
      const cleanState = { ...state };
      zip.file("data.json", JSON.stringify(cleanState, null, 2));
      
      const imageIds = await getAllImageIdsFromDB();
      const imgFolder = zip.folder("images");
      if (imgFolder) {
        for (const id of imageIds) {
          const blob = await loadImageFromDB(id);
          if (blob) {
            imgFolder.file(id, blob);
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const fileName = state.lastFileName ? state.lastFileName.replace(/\.json$/, '.mind') : `mystery-${new Date().toISOString().slice(0,10)}.mind`;

      // 如果有已有的句柄且不是另存为
      if (fileHandle && !isSaveAs && !isIframe) {
        // 请求权限（如果需要）
        // Fix: Replace FileSystemPermissionMode with any on line 259 to avoid build error
        const options = { mode: 'readwrite' as any };
        if (await fileHandle.queryPermission(options) !== 'granted') {
          if (await fileHandle.requestPermission(options) !== 'granted') {
            throw new Error('未获得写入权限');
          }
        }
        
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        setStatusMessage(`已同步保存至: ${fileHandle.name}`);
        return;
      }

      // 另存为或初始保存
      if ('showSaveFilePicker' in window && window.isSecureContext && !isIframe) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'MysteryMind Bundle',
              accept: { 'application/zip': ['.mind'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          setFileHandle(handle);
          saveFileHandle(handle); // 存入 IndexedDB
          setState(prev => ({ ...prev, lastFileName: handle.name }));
          setShowExportModal(false);
          setStatusMessage("档案打包并保存成功");
        } catch (err: any) {
          if (err.name !== 'AbortError') throw err;
        }
      } else {
        // 降级：直接下载
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        setShowExportModal(false);
        setStatusMessage("档案已下载 (.mind)");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "档案保存失败");
    }
  };

  // 核心：智能导入 (支持 .mind 或 .json)
  const handleImportFile = async (file: File) => {
    const isZip = file.name.endsWith('.mind') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
    const isJson = file.name.endsWith('.json') || file.type === 'application/json';

    try {
      let parsedData: any;

      if (isZip) {
        const zip = await JSZip.loadAsync(file);
        const dataFile = zip.file("data.json");
        if (!dataFile) throw new Error("无效的存档文件：缺少 data.json");

        const jsonData = await dataFile.async("string");
        parsedData = JSON.parse(jsonData);

        const imgFolder = zip.folder("images");
        if (imgFolder) {
          const promises: Promise<void>[] = [];
          imgFolder.forEach((relativePath: string, fileObj: JSZip.JSZipObject) => {
            const id = relativePath;
            promises.push(fileObj.async("blob").then((blob: Blob) => saveImageToDB(id, blob)));
          });
          await Promise.all(promises);
        }
      } else if (isJson) {
        const text = await file.text();
        parsedData = JSON.parse(text);
        setStatusMessage("检测到旧版 JSON，正在进行格式升级...");
      } else {
        throw new Error("不支持的文件类型");
      }

      // 执行迁移逻辑
      const migratedState = await migrateLegacyData(parsedData);
      
      setState({ ...migratedState, lastFileName: file.name.replace(/\.json$/, '.mind') });
      await refreshBlobUrls(migratedState);
      
      setStatusMessage(isJson ? "旧版档案已成功迁移至新系统" : "档案加载成功");
    } catch (err: any) {
      console.error(err);
      setErrorMessage("导入失败：文件损坏或格式不正确");
    }
  };

  const handleOpenFile = async () => {
    if ('showOpenFilePicker' in window && window.isSecureContext && !isIframe) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'MysteryMind Archive',
            accept: { 'application/zip': ['.mind'], 'application/json': ['.json'] },
          }],
        });
        const file = await handle.getFile();
        await handleImportFile(file);
        setFileHandle(handle);
        saveFileHandle(handle);
      } catch (err: any) {
        if (err.name !== 'AbortError') setErrorMessage("无法打开文件");
      }
    } else {
      fileImportRef.current?.click();
    }
  };

  // 其余 Handle 逻辑...
  const handleAddLocation = (loc: Location) => setState(p => ({ ...p, locations: [...p.locations, loc] }));
  const handleUpdateLocation = (loc: Location) => setState(p => ({ ...p, locations: p.locations.map(l => l.id === loc.id ? loc : l) }));
  const handleDeleteLocation = (id: string) => setState(p => ({ 
    ...p, 
    locations: p.locations.filter(l => l.id !== id),
    alibis: p.alibis.map(a => a.locationId === id ? { ...a, locationId: undefined } : a),
    clues: p.clues.map(c => c.locationId === id ? { ...c, locationId: undefined, locationItemId: undefined } : c)
  }));

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
        const currentPlacements = updatedTimelineData[timeId] as CharacterPlacement[];
        updatedTimelineData[timeId] = currentPlacements.filter(p => p.characterId !== charId);
      });
      return {
        ...prev,
        characters: prev.characters.filter(c => c.id !== charId),
        relationships: prev.relationships.filter(r => r.source !== charId && r.target !== charId),
        graphActiveCharacterIds: prev.graphActiveCharacterIds.filter(id => id !== charId),
        alibis: prev.alibis.map(a => ({
          ...a,
          character_ids: a.character_ids.filter(id => id !== charId)
        })).filter(a => a.character_ids.length > 0), 
        timelineData: updatedTimelineData
      };
    });
    setCharacterToDelete(null);
    setStatusMessage("人物已删除");
  };

  const handleDeleteMap = (mapId: string) => {
    if (state.maps.length <= 1) {
      setErrorMessage("至少需要保留一个场景");
      return;
    }
    setState(prev => {
      const newMaps = prev.maps.filter(m => m.id !== mapId);
      const newCurrentMapId = prev.currentMapId === mapId ? newMaps[0].id : prev.currentMapId;
      const newSpaces = prev.spaces.filter(s => s.mapId !== mapId);
      const newTimelineData = { ...prev.timelineData };
      Object.keys(newTimelineData).forEach(timeId => {
        const currentPlacements = newTimelineData[timeId] as CharacterPlacement[];
        newTimelineData[timeId] = currentPlacements.filter(p => p.mapId !== mapId);
      });
      const newItemTimelineData = { ...prev.itemTimelineData };
      Object.keys(newItemTimelineData).forEach(timeId => {
        const currentItemPlacements = newItemTimelineData[timeId] as ItemPlacement[];
        newItemTimelineData[timeId] = currentItemPlacements.filter(p => p.clueId !== mapId);
      });
      return {
        ...prev,
        maps: newMaps,
        currentMapId: newCurrentMapId,
        spaces: newSpaces,
        timelineData: newTimelineData,
        itemTimelineData: newItemTimelineData,
        locations: prev.locations.map(l => l.mapId === mapId ? { ...l, mapId: undefined, spaceId: undefined } : l)
      };
    });
    setStatusMessage("场景及关联数据已删除");
  };

  const handleSaveClue = async (clue: Clue) => {
    setState(prev => {
      const exists = prev.clues.find(c => c.id === clue.id);
      if (exists) { return { ...prev, clues: prev.clues.map(c => c.id === clue.id ? clue : c) }; }
      else { return { ...prev, clues: [...prev.clues, clue] }; }
    });
    setIsClueModalOpen(false);
    setEditingClue(null);
  };

  const handleDeleteClue = (id: string) => {
    setState(prev => ({
      ...prev,
      clues: prev.clues.filter(c => c.id !== id),
      itemTimelineData: Object.fromEntries(
        Object.entries(prev.itemTimelineData).map(([timeId, placements]) => [
          timeId,
          (placements as ItemPlacement[]).filter(p => p.clueId !== id)
        ])
      )
    }));
    setClueToDeleteId(null);
    setStatusMessage("证物已销毁");
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

  const handleRemoveRelationship = (source: string, target: string) => {
    setState(prev => ({
      ...prev,
      relationships: prev.relationships.filter(r => 
        !((r.source === source && r.target === target) || (r.source === target && r.target === source))
      )
    }));
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-500" size={48} />
          <p className="animate-pulse font-medium tracking-widest uppercase text-xs text-center">正在连接思维数据库...</p>
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
                  <CheckCircle2 size={12} /> {statusMessage}
                </div>
              )}
              {errorMessage && (
                <div className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/30 animate-in shake-in duration-300 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                  <AlertCircle size={12} /> {errorMessage}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${fileHandle ? 'bg-green-900/20 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                 {fileHandle ? <Link2 size={12}/> : <Link2Off size={12}/>} {fileHandle ? '已关联本地文件' : isIframe ? '沙盒环境受限' : '未关联文件'}
              </div>
              <input type="file" ref={fileImportRef} onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} accept=".mind,.json" className="hidden" />
              <button onClick={handleOpenFile} className="flex items-center gap-2 p-2 text-slate-400 hover:text-white group"><FolderOpen size={18} className="group-hover:scale-110 transition-transform" /> <span className="text-sm font-medium">导入存档</span></button>
              
              {fileHandle && (
                <button onClick={() => exportArchive(false)} className="flex items-center gap-2 p-2 text-blue-400 hover:text-blue-300 group"><Save size={18} className="group-hover:scale-110 transition-transform" /> <span className="text-sm font-bold">覆盖保存</span></button>
              )}
              
              <button onClick={() => exportArchive(true)} className="flex items-center gap-2 p-2 text-slate-400 hover:text-white group"><FileArchive size={18} className="group-hover:scale-110 transition-transform" /> <span className="text-sm font-medium">另存为...</span></button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
            <h2 className="font-bold text-white flex items-center gap-2 mb-4"><Database size={18} className="text-blue-400" />数据批量提取</h2>
            <textarea className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:ring-2 focus:ring-blue-500/50 resize-none outline-none font-mono" placeholder="请逐行输入人物信息..." value={inputText} onChange={(e) => setInputText(e.target.value)} />
            <div className="mt-4"><button onClick={handleParseCharacters} disabled={!inputText.trim()} className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border border-slate-600 shadow-md"><Users size={16} /> 简单提取</button></div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col h-[500px]">
            <div className="bg-slate-900/50 border-b border-slate-700 flex">
              <button onClick={() => setSidebarTab('characters')} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-all ${sidebarTab === 'characters' ? 'text-purple-400 bg-slate-800 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}><Users size={14} /> 登场人物 ({state.characters.length})</button>
              <button onClick={() => setSidebarTab('clues')} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-all ${sidebarTab === 'clues' ? 'text-amber-400 bg-slate-800 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300'}`}><Package size={14} /> 证物清单 ({state.clues.length})</button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {sidebarTab === 'characters' ? (
                state.characters.map(char => {
                  const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                  return (
                    <div key={char.id} draggable onDragStart={(e) => e.dataTransfer.setData("application/react-dnd-char-id", char.id)} className={`flex items-center justify-between p-3 rounded bg-slate-700/50 border border-slate-600/50 hover:border-slate-400 transition-colors group cursor-grab active:cursor-grabbing ${state.graphActiveCharacterIds.includes(char.id) ? 'opacity-40 border-blue-500/30' : ''}`}>
                      <div className="flex items-center gap-3 truncate flex-1">
                        <GripVertical size={14} className="text-slate-500 shrink-0" />
                        {portraitUrl ? (
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-600 bg-slate-900 shrink-0">
                            <img src={portraitUrl} alt={char.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 border border-slate-600">
                            <User size={14} />
                          </div>
                        )}
                        <div className="flex flex-col truncate min-w-0">
                          <span className="text-sm font-bold text-blue-300 truncate">{char.name}</span>
                          {(char.note || char.raw_info) && <span className="text-[10px] text-slate-400 truncate mt-0.5 leading-tight font-normal italic">{char.note || char.raw_info}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setEditingCharacter(char); }} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-600 rounded transition-colors"><Info size={14}/></button><button onClick={(e) => { e.stopPropagation(); setCharacterToDelete(char); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"><Trash2 size={14}/></button></div>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-2">
                  <button onClick={() => { setEditingClue(null); setIsClueModalOpen(true); }} className="w-full py-2 border-2 border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all text-xs font-bold flex items-center justify-center gap-2 mb-2"><Plus size={14} /> 新增证物</button>
                  {state.clues.map(clue => {
                    const thumbUrl = clue.imageId ? blobUrls[clue.imageId] : null;
                    return (
                      <div key={clue.id} draggable onDragStart={(e) => e.dataTransfer.setData("application/react-dnd-clue-id", clue.id)} className="flex items-center justify-between p-3 rounded bg-slate-700/50 border border-slate-600/50 hover:border-amber-500/50 transition-colors group cursor-grab active:cursor-grabbing">
                        <div className="flex items-center gap-3 truncate flex-1">
                          {thumbUrl ? (
                            <div className="w-8 h-8 rounded border border-slate-600 overflow-hidden shrink-0">
                              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <Package size={14} className="text-amber-500 shrink-0" />
                          )}
                          <div className="flex flex-col truncate min-w-0"><span className="text-sm font-bold text-amber-200 truncate">{clue.name}</span>{clue.description && <span className="text-[10px] text-slate-400 truncate mt-0.5 leading-tight font-normal italic">{clue.description}</span>}</div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setEditingClue(clue); setIsClueModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-600 rounded transition-colors"><Info size={14} /></button><button onClick={(e) => { e.stopPropagation(); setClueToDeleteId(clue.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"><Trash2 size={14} /></button></div>
                      </div>
                    );
                  })}
                </div>
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
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}><tab.icon size={16} /> {tab.label}</button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {activeTab === 'graph' && (
              <RelationshipGraph characters={state.characters.filter(c => state.graphActiveCharacterIds.includes(c.id))} relationships={state.relationships} relationshipDefs={state.relationshipDefs} characterGroups={state.characterGroups} layout={state.graphLayout} onAddRelationship={handleAddRelationship} onRemoveRelationship={handleRemoveRelationship} onUpdateDefs={defs => setState(prev => ({ ...prev, relationshipDefs: defs }))} onNodeDrop={id => !state.graphActiveCharacterIds.includes(id) && setState(prev => ({ ...prev, graphActiveCharacterIds: [...prev.graphActiveCharacterIds, id] }))} onUpdateLayout={lay => setState(prev => ({ ...prev, graphLayout: { ...prev.graphLayout, ...lay } }))} onRemoveNode={id => setState(prev => ({ ...prev, graphActiveCharacterIds: prev.graphActiveCharacterIds.filter(cid => cid !== id), relationships: prev.relationships.filter(r => r.source !== id && r.target !== id), characterGroups: prev.characterGroups.map(g => ({ ...g, characterIds: g.characterIds.filter(m => m !== id) })).filter(g => g.characterIds.length > 0) }))} onAddGroup={g => setState(p => ({ ...p, characterGroups: [...p.characterGroups, g] }))} onUpdateGroup={g => setState(p => ({ ...p, characterGroups: p.characterGroups.map(i => i.id === g.id ? g : i) }))} onRemoveGroup={id => setState(p => ({ ...p, characterGroups: p.characterGroups.filter(g => g.id !== id) }))} />
            )}
            {activeTab === 'evidence' && (
              <div className="space-y-6">
                <div className="flex gap-4 border-b border-slate-800 pb-2">
                    <button onClick={() => setEvidenceSubTab('clues')} className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${evidenceSubTab === 'clues' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><Search size={14} /> 证物公告板</button>
                    <button onClick={() => setEvidenceSubTab('alibis')} className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${evidenceSubTab === 'alibis' ? 'bg-slate-800 text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}><ShieldCheck size={14} /> 不在场证明</button>
                    <button onClick={() => setEvidenceSubTab('locations')} className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${evidenceSubTab === 'locations' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}><MapPin size={14} /> 地点索引</button>
                </div>
                {evidenceSubTab === 'clues' && <EvidenceBoard clues={state.clues} locations={state.locations} blobUrls={blobUrls} onOpenModal={(clue) => { setEditingClue(clue); setIsClueModalOpen(true); }} onUpdateStatus={(id, s) => setState(p => ({ ...p, clues: p.clues.map(c => c.id === id ? { ...c, status: s } : c) }))} onDeleteClue={setClueToDeleteId} />}
                {evidenceSubTab === 'alibis' && <AlibiMatrix alibis={state.alibis} characters={state.characters} timePoints={state.timePoints} locations={state.locations} onAddAlibi={handleAddAlibi} onUpdateAlibi={handleUpdateAlibi} onDeleteAlibi={handleDeleteAlibi} />}
                {evidenceSubTab === 'locations' && <LocationList locations={state.locations} maps={state.maps} spaces={state.spaces} clues={state.clues} blobUrls={blobUrls} onAddLocation={handleAddLocation} onUpdateLocation={handleUpdateLocation} onDeleteLocation={handleDeleteLocation} onImageSave={handleEntityImageSave} />}
              </div>
            )}
            {activeTab === 'map' && (
              <MapCanvas maps={state.maps} currentMapId={state.currentMapId} spaces={state.spaces} clues={state.clues} alibis={state.alibis} timePoints={state.timePoints} currentTimeId={state.currentTimeId} timelineData={state.timelineData} itemTimelineData={state.itemTimelineData} characters={state.characters} blobUrls={blobUrls} onUpdateMaps={m => setState(prev => ({ ...prev, maps: m }))} onDeleteMap={handleDeleteMap} onCreateMap={n => { const id = crypto.randomUUID(); setState(prev => ({ ...prev, maps: [...prev.maps, { id, name: n }], currentMapId: id })) }} onSelectMap={id => setState(prev => ({ ...prev, currentMapId: id }))} onUpdateSpaces={s => setState(prev => ({ ...prev, spaces: s }))} onUpdateTimePoints={pts => setState(prev => ({ ...prev, timePoints: pts }))} onSelectTime={id => setState(prev => ({ ...prev, currentTimeId: id }))} onUpdatePlacements={(tid, placements) => setState(prev => ({ ...prev, timelineData: { ...prev.timelineData, [tid]: placements } }))} onUpdateItemPlacements={(tid, placements) => setState(prev => ({ ...prev, itemTimelineData: { ...prev.itemTimelineData, [tid]: placements } }))} onAddClue={handleSaveClue} onOpenClueModal={(clue) => { setEditingClue(clue); setIsClueModalOpen(true); }} onImageSave={handleEntityImageSave} />
            )}
          </div>
        </div>
      </main>

      <ClueModal 
        isOpen={isClueModalOpen} 
        editingClue={editingClue} 
        locations={state.locations}
        blobUrls={blobUrls}
        onClose={() => { setIsClueModalOpen(false); setEditingClue(null); }} 
        onSave={handleSaveClue} 
        onImageSave={handleEntityImageSave}
      />

      {showExportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white flex items-center gap-3"><FileArchive className="text-blue-400" size={24} />打包导出</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-4">
              <p className="text-sm text-slate-400">我们将所有案情数据和图片文件打包为 <code className="text-blue-400 font-bold">.mind</code> 文件。您可以安全地在其他设备加载此文件。</p>
              <button onClick={() => exportArchive(true)} className="w-full flex items-center justify-center gap-3 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all font-bold shadow-xl shadow-blue-900/20">
                <Save size={20} /> 打包导出 .mind
              </button>
            </div>
          </div>
        </div>
      )}

      {characterToDelete && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"><div className="bg-slate-800 rounded-2xl border border-red-900/50 shadow-2xl w-full max-sm animate-in zoom-in-95 duration-200 overflow-hidden"><div className="p-6 text-center"><div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30"><AlertTriangle className="text-red-500" size={32} /></div><h3 className="text-xl font-bold text-white mb-2">确认删除角色?</h3><div className="flex gap-3"><button onClick={() => setCharacterToDelete(null)} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold transition-all">取消</button><button onClick={handleConfirmDeleteCharacter} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-900/30 transition-all active:scale-95">确认删除</button></div></div></div></div>}
      
      {editingCharacter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 rounded-3xl border border-slate-600 w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users size={18} className="text-blue-400" />
                编辑人物档案
              </h3>
              <button onClick={() => setEditingCharacter(null)} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full transition-colors">
                <X size={20}/>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex flex-col items-center gap-4">
                <div 
                  onClick={() => charFileInputRef.current?.click()}
                  className="w-24 h-24 rounded-full border-2 border-dashed border-slate-600 bg-slate-900/50 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-all overflow-hidden relative group"
                >
                  <input type="file" ref={charFileInputRef} className="hidden" accept="image/*" onChange={handleCharImageUpload} />
                  {isCharImageLoading ? (
                    <Loader2 className="animate-spin text-blue-500" size={24} />
                  ) : editingCharacter.imageId ? (
                    <>
                      <img src={blobUrls[editingCharacter.imageId]} alt="portrait" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera size={20} className="text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-slate-500 group-hover:text-blue-400">
                      <Camera size={24} />
                      <span className="text-[10px] mt-1 font-bold">上传照片</span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">点击更新人物头像</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">姓名</label>
                  <input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={editingCharacter.name} onChange={e => setEditingCharacter({...editingCharacter, name: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">身份标签</label>
                  <input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500" value={editingCharacter.raw_info || ''} onChange={e => setEditingCharacter({...editingCharacter, raw_info: e.target.value})} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">人物笔记 / 逻辑推演</label>
                <textarea className="w-full h-32 bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" value={editingCharacter.note || ''} onChange={e => setEditingCharacter({...editingCharacter, note: e.target.value})} />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setEditingCharacter(null)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-bold transition-colors">取消</button>
                <button 
                  onClick={() => { setState(p => ({ ...p, characters: p.characters.map(c => c.id === editingCharacter.id ? editingCharacter : c) })); setEditingCharacter(null); }} 
                  className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-2.5 rounded-xl font-black text-sm transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                >
                  确认存档
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
