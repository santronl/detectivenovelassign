
import React, { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { parseCharacterList } from './utils/parser';
import { AppState, INITIAL_STATE, Character, Space, Relationship, RelationshipDef, MapDoc, TimePoint, CharacterPlacement, ItemPlacement, Clue, CharacterGroup, Alibi, Location, TimelineSegment, TimePeriodLabel } from './types';
import RelationshipGraph from './components/RelationshipGraph';
import EvidenceBoard from './components/EvidenceBoard';
import AlibiMatrix from './components/AlibiMatrix';
import LocationList from './components/LocationList';
import MapCanvas from './components/MapCanvas';
import TimelineVertical from './components/TimelineVertical';
import ClueModal from './components/ClueModal';
import { saveToIndexedDB, loadFromIndexedDB, saveFileHandle, loadFileHandle, saveImageToDB, loadImageFromDB, getAllImageIdsFromDB, deleteImageFromDB, clearAllData } from './services/storage';
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
  LogOut,
  Clock,
  Layers,
  ChevronRight,
  Settings2
} from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isInitialized, setIsInitialized] = useState(false);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'graph' | 'evidence' | 'map' | 'timeline'>('graph');
  const [evidenceSubTab, setEvidenceSubTab] = useState<'clues' | 'alibis' | 'locations'>('clues');
  const [sidebarTab, setSidebarTab] = useState<'characters' | 'clues'>('characters');
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [isCharImageLoading, setIsCharImageLoading] = useState(false);
  const charFileInputRef = useRef<HTMLInputElement>(null);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [editingClue, setEditingClue] = useState<Clue | null>(null);
  const [isClueModalOpen, setIsClueModalOpen] = useState(false);
  const [clueToDeleteId, setClueToDeleteId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isIframe = window.self !== window.top;
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  // 分组编辑状态
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [tempGroupName, setTempGroupName] = useState("");

  useEffect(() => {
    return () => { Object.keys(blobUrls).forEach(k => URL.revokeObjectURL(blobUrls[k])); };
  }, []);

  useEffect(() => { if (statusMessage) { const t = setTimeout(() => setStatusMessage(null), 4000); return () => clearTimeout(t); } }, [statusMessage]);
  useEffect(() => { if (errorMessage) { const t = setTimeout(() => setErrorMessage(null), 6000); return () => clearTimeout(t); } }, [errorMessage]);

  const refreshBlobUrls = async (entities: AppState) => {
    const ids = new Set<string>();
    [...(entities.characters||[]), ...(entities.clues||[]), ...(entities.locations||[]), ...(entities.maps||[])].forEach(e => { if(e.imageId) ids.add(e.imageId); });
    const newUrls: Record<string, string> = { ...blobUrls };
    for (const id of ids) { if (!newUrls[id]) { const blob = await loadImageFromDB(id); if (blob) newUrls[id] = URL.createObjectURL(blob); } }
    setBlobUrls(newUrls);
  };

  useEffect(() => {
    const initStorage = async () => {
      try {
        const saved = await loadFromIndexedDB();
        const savedHandle = await loadFileHandle();
        if (saved) { setState({ ...INITIAL_STATE, ...saved }); await refreshBlobUrls(saved); }
        if (savedHandle && !isIframe) setFileHandle(savedHandle);
      } catch (e) { console.error(e); } finally { setIsInitialized(true); }
    };
    initStorage();
  }, [isIframe]);

  useEffect(() => {
    if (!isInitialized) return;
    const timeoutId = setTimeout(async () => { try { await saveToIndexedDB(state); } catch (e) { console.error(e); } }, 2000); 
    return () => clearTimeout(timeoutId);
  }, [state, isInitialized]);

  const handleEntityImageSave = async (id: string, blob: Blob) => {
    const imageId = `img_${crypto.randomUUID()}`;
    await saveImageToDB(imageId, blob);
    setBlobUrls(prev => ({ ...prev, [imageId]: URL.createObjectURL(blob) }));
    return imageId;
  };

  const handleCharImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCharImageLoading(true);
      try {
        const blob = await compressImage(file, 400, 0.7);
        const imageId = await handleEntityImageSave(editingCharacter?.id || 'new_char', blob);
        if (editingCharacter) setEditingCharacter({ ...editingCharacter, imageId });
      } catch (err: any) { setErrorMessage("图片处理失败"); } finally { setIsCharImageLoading(false); }
    }
  };

  const handleResetArchive = async () => {
    try {
      Object.keys(blobUrls).forEach(k => URL.revokeObjectURL(blobUrls[k])); setBlobUrls({});
      await clearAllData(); await saveFileHandle(null);
      setState(INITIAL_STATE); setFileHandle(null); setInputText(''); setShowClearConfirm(false);
      setStatusMessage("已退出当前案情，全新画布已就绪");
    } catch (err) { setErrorMessage("清空数据失败，请刷新页面重试"); }
  };

  const exportArchive = async (isSaveAs: boolean) => {
    try {
      const zip = new JSZip();
      zip.file("data.json", JSON.stringify(state, null, 2));
      const imageIds = await getAllImageIdsFromDB();
      const imgFolder = zip.folder("images");
      if (imgFolder) { for (const id of imageIds) { const b = await loadImageFromDB(id); if (b) imgFolder.file(id, b); } }
      const content = await zip.generateAsync({ type: "blob" });
      const fileName = state.lastFileName ? state.lastFileName.replace(/\.json$/, '.mind') : `mystery-${new Date().toISOString().slice(0,10)}.mind`;
      if (fileHandle && !isSaveAs && !isIframe) {
        const options = { mode: 'readwrite' as any };
        if (await fileHandle.queryPermission(options) !== 'granted') { if (await fileHandle.requestPermission(options) !== 'granted') throw new Error('未获得写入权限'); }
        const writable = await fileHandle.createWritable(); await writable.write(content); await writable.close();
        setStatusMessage(`已同步保存至: ${fileHandle.name}`); return;
      }
      if ('showSaveFilePicker' in window && window.isSecureContext && !isIframe) {
        try {
          const handle = await (window as any).showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'MysteryMind Bundle', accept: { 'application/zip': ['.mind'] } }] });
          const writable = await handle.createWritable(); await writable.write(content); await writable.close();
          setFileHandle(handle); saveFileHandle(handle); setState(prev => ({ ...prev, lastFileName: handle.name }));
          setShowExportModal(false); setStatusMessage("档案打包并保存成功");
        } catch (err: any) { if (err.name !== 'AbortError') throw err; }
      } else {
        const url = URL.createObjectURL(content); const link = document.createElement('a');
        link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
        setShowExportModal(false); setStatusMessage("档案已下载 (.mind)");
      }
    } catch (err: any) { setErrorMessage(err.message || "档案保存失败"); }
  };

  const handleImportFile = async (file: File) => {
    try {
      let parsedData: any;
      if (file.name.endsWith('.mind') || file.type.includes('zip')) {
        const zip = await JSZip.loadAsync(file);
        const dataFile = zip.file("data.json"); if (!dataFile) throw new Error("无效存档");
        parsedData = JSON.parse(await dataFile.async("string"));
        const imgFolder = zip.folder("images");
        if (imgFolder) { const ps: Promise<void>[] = []; imgFolder.forEach((p, f) => ps.push(f.async("blob").then(b => saveImageToDB(p, b)))); await Promise.all(ps); }
      } else { parsedData = JSON.parse(await file.text()); }
      setState({ ...INITIAL_STATE, ...parsedData, lastFileName: file.name.replace(/\.json$/, '.mind') });
      await refreshBlobUrls(parsedData); setStatusMessage("档案加载成功");
    } catch (err: any) { setErrorMessage("导入失败"); }
  };

  const handleOpenFile = async () => {
    if ('showOpenFilePicker' in window && window.isSecureContext && !isIframe) {
      try { const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: 'MM Archive', accept: { 'application/zip': ['.mind'], 'application/json': ['.json'] } }] });
      const file = await handle.getFile(); await handleImportFile(file); setFileHandle(handle); saveFileHandle(handle);
      } catch (err: any) { if (err.name !== 'AbortError') setErrorMessage("无法打开文件"); }
    } else { fileImportRef.current?.click(); }
  };

  const handleInsertSlot = (index: number) => {
    setState(prev => ({
        ...prev,
        timelineSlotCount: prev.timelineSlotCount + 1,
        timelineSegments: prev.timelineSegments.map(s => ({
            ...s,
            startSlot: s.startSlot >= index ? s.startSlot + 1 : s.startSlot,
            endSlot: s.endSlot > index ? s.endSlot + 1 : s.endSlot
        })),
        timelinePeriods: prev.timelinePeriods.map(p => ({
            ...p,
            startSlot: p.startSlot >= index ? p.startSlot + 1 : p.startSlot,
            endSlot: p.endSlot > index ? p.endSlot + 1 : p.endSlot
        }))
    }));
    setStatusMessage("已在 G" + (index+1) + " 后插入新格子");
  };

  const updateGroupColor = (groupId: string, color: string) => {
    setState(p => ({
      ...p,
      characterGroups: p.characterGroups.map(g => g.id === groupId ? { ...g, color } : g)
    }));
  };

  const updateGroupName = (groupId: string) => {
    if (!tempGroupName.trim()) return;
    setState(p => ({
      ...p,
      characterGroups: p.characterGroups.map(g => g.id === groupId ? { ...g, label: tempGroupName.trim() } : g)
    }));
    setEditingGroupId(null);
  };

  const renderGroupHeader = (group: CharacterGroup) => (
    <div className="flex items-center gap-2 px-1 group/gh relative">
      <div className="relative flex items-center justify-center w-3 h-3">
        <input 
          type="color" 
          value={group.color} 
          onChange={(e) => updateGroupColor(group.id, e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: group.color }} />
      </div>
      
      {editingGroupId === group.id ? (
        <input 
          autoFocus
          className="flex-1 bg-slate-900 border border-blue-500 rounded px-1.5 py-0.5 text-[9px] text-white outline-none"
          value={tempGroupName}
          onChange={e => setTempGroupName(e.target.value)}
          onBlur={() => updateGroupName(group.id)}
          onKeyDown={e => e.key === 'Enter' && updateGroupName(group.id)}
        />
      ) : (
        <span 
          onDoubleClick={() => { setEditingGroupId(group.id); setTempGroupName(group.label); }}
          className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate"
        >
          {group.label}
        </span>
      )}
      
      <div className="flex-1 h-[1px] bg-gradient-to-r from-slate-700 to-transparent" />
      
      <div className="flex items-center gap-1 opacity-0 group-hover/gh:opacity-100 transition-opacity">
        <button 
          onClick={() => { setEditingGroupId(group.id); setTempGroupName(group.label); }}
          className="p-1 text-slate-500 hover:text-blue-400"
        >
          <Edit3 size={10} />
        </button>
        <button 
          onClick={() => setState(p => ({ ...p, characterGroups: p.characterGroups.filter(g => g.id !== group.id) }))}
          className="p-1 text-slate-500 hover:text-red-400"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );

  const renderCharacterCard = (char: Character) => {
    const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
    const charGroups = state.characterGroups.filter(g => g.characterIds.includes(char.id));
    const primaryGroup = charGroups[0];
    const isCurrentlyActive = state.graphSubTab === 'people' ? state.graphActiveCharacterIds.includes(char.id) : state.itemGraphActiveIds.includes(char.id);

    return (
      <div key={char.id} draggable onDragStart={(e) => e.dataTransfer.setData("application/react-dnd-char-id", char.id)} style={{ borderLeft: primaryGroup ? `4px solid ${primaryGroup.color}` : '4px solid transparent', backgroundColor: primaryGroup ? `${primaryGroup.color}10` : 'rgb(51 65 85 / 0.5)' }} className={`flex items-start justify-between p-2.5 rounded-r-xl border-y border-r border-slate-700 hover:border-slate-500 transition-all group cursor-grab active:cursor-grabbing shadow-sm ${isCurrentlyActive ? 'opacity-40 grayscale-[0.5]' : ''}`}>
        <div className="flex items-start gap-2.5 truncate flex-1">
          <GripVertical size={12} className="text-slate-600 shrink-0 mt-1" />
          {portraitUrl ? (
            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-slate-600 bg-slate-900 shrink-0 shadow-md"><img src={portraitUrl} className="w-full h-full object-cover" /></div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 border-2 border-slate-700 shadow-md"><User size={14} /></div>
          )}
          <div className="flex flex-col truncate min-w-0 pt-0.5">
            <span className="text-xs font-black text-blue-100 truncate tracking-tight">{char.name}</span>
            {(char.note || char.raw_info) && (
              <span className="text-[9px] text-slate-400 truncate mt-0.5 leading-tight font-normal italic">{char.note || char.raw_info}</span>
            )}
            {charGroups.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {charGroups.map(group => (
                  <div key={group.id} style={{ backgroundColor: `${group.color}20`, borderColor: `${group.color}40`, color: group.color }} className="px-1 py-0.5 rounded-md text-[7px] font-black border flex items-center gap-0.5 shadow-sm"><Layers size={7} /> {group.label}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditingCharacter(char)} className="p-1.5 text-slate-500 hover:text-blue-400 rounded-lg transition-colors"><Info size={12}/></button>
          <button onClick={() => setCharacterToDelete(char)} className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition-colors"><Trash2 size={12}/></button>
        </div>
      </div>
    );
  };

  const renderClueCard = (clue: Clue) => {
    const imageUrl = clue.imageId ? blobUrls[clue.imageId] : null;
    const clueGroups = state.characterGroups.filter(g => g.characterIds.includes(clue.id));
    const primaryGroup = clueGroups[0];
    const isCurrentlyActive = state.itemGraphActiveIds.includes(clue.id);

    return (
      <div key={clue.id} draggable onDragStart={(e) => e.dataTransfer.setData("application/react-dnd-clue-id", clue.id)} style={{ borderLeft: primaryGroup ? `4px solid ${primaryGroup.color}` : '4px solid transparent', backgroundColor: primaryGroup ? `${primaryGroup.color}10` : 'rgb(51 65 85 / 0.5)' }} className={`flex items-start justify-between p-2.5 rounded-r-xl border-y border-r border-slate-700 hover:border-amber-500/50 transition-colors group cursor-grab active:cursor-grabbing ${isCurrentlyActive ? 'opacity-40 grayscale-[0.5]' : ''}`}>
        <div className="flex items-start gap-2.5 truncate flex-1">
          <GripVertical size={12} className="text-slate-600 shrink-0 mt-1" />
          {imageUrl ? (
            <div className="w-8 h-8 rounded border border-slate-600 overflow-hidden shrink-0 shadow-sm"><img src={imageUrl} className="w-full h-full object-cover" /></div>
          ) : (
            <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-amber-500/50 shrink-0 border border-slate-700 shadow-sm"><Package size={14} /></div>
          )}
          <div className="flex flex-col truncate min-w-0 pt-0.5">
            <span className="text-xs font-black text-amber-100 truncate tracking-tight">{clue.name}</span>
            {clue.description && <span className="text-[9px] text-slate-400 truncate mt-0.5 leading-tight font-normal italic">{clue.description}</span>}
            {clueGroups.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {clueGroups.map(group => (
                  <div key={group.id} style={{ backgroundColor: `${group.color}20`, borderColor: `${group.color}40`, color: group.color }} className="px-1 py-0.5 rounded-md text-[7px] font-black border flex items-center gap-0.5 shadow-sm"><Layers size={7} /> {group.label}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => { setEditingClue(clue); setIsClueModalOpen(true); }} className="p-1.5 text-slate-500 hover:text-blue-400 rounded transition-colors"><Info size={12} /></button>
          <button onClick={() => setClueToDeleteId(clue.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-colors"><Trash2 size={12}/></button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      <header className="border-b border-slate-700 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20"><BookOpen className="text-white" size={24} /></div>
            <h1 className="text-xl font-bold tracking-tight text-white">Mystery<span className="text-blue-500">Mind</span><span className="ml-2 text-sm font-normal text-slate-400 border-l border-slate-600 pl-2 uppercase tracking-widest">推理辅助</span></h1>
            <div className="ml-4 flex items-center gap-2">
              {statusMessage && <div className="flex items-center gap-2 text-xs font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full border border-green-400/30 animate-in fade-in slide-in-from-left-2 shadow-[0_0_10px_rgba(34,197,94,0.1)]"><CheckCircle2 size={12} /> {statusMessage}</div>}
              {errorMessage && <div className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/30 animate-in shake-in duration-300 shadow-[0_0_10px_rgba(239,68,68,0.1)]"><AlertCircle size={12} /> {errorMessage}</div>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${fileHandle ? 'bg-green-900/20 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>{fileHandle ? <Link2 size={12}/> : <Link2Off size={12}/>} {fileHandle ? '已关联本地文件' : isIframe ? '沙盒受限' : '未关联文件'}</div>
              <button onClick={() => setShowClearConfirm(true)} className="flex items-center gap-2 p-2 text-slate-400 hover:text-red-400 group transition-colors"><FilePlus size={18} /><span className="text-sm font-medium">新建档案</span></button>
              <div className="w-[1px] h-6 bg-slate-700 mx-2"></div>
              <input type="file" ref={fileImportRef} onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} accept=".mind,.json" className="hidden" />
              <button onClick={handleOpenFile} className="flex items-center gap-2 p-2 text-slate-400 hover:text-white group"><FolderOpen size={18} /> <span className="text-sm font-medium">导入存档</span></button>
              {fileHandle && <button onClick={() => exportArchive(false)} className="flex items-center gap-2 p-2 text-blue-400 hover:text-blue-300 group"><Save size={18} /> <span className="text-sm font-bold">保存</span></button>}
              <button onClick={() => exportArchive(true)} className="flex items-center gap-2 p-2 text-slate-400 hover:text-white group"><FileArchive size={18} /> <span className="text-sm font-medium">导出</span></button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 shadow-lg">
            <h2 className="font-bold text-white flex items-center gap-2 mb-4"><Database size={18} className="text-blue-400" />数据提取</h2>
            <textarea className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:ring-2 focus:ring-blue-500/50 resize-none outline-none font-mono" placeholder="请逐行输入人物信息..." value={inputText} onChange={(e) => setInputText(e.target.value)} />
            <div className="mt-4"><button onClick={() => { const ns = parseCharacterList(inputText); if(ns.length) setState(p=>({...p, characters: [...p.characters, ...ns]})); setInputText(''); setStatusMessage("已解析"); }} className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border border-slate-600 shadow-md"><Users size={16} /> 简单提取</button></div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col h-[600px]">
            <div className="bg-slate-900/50 border-b border-slate-700 flex">
              <button onClick={() => setSidebarTab('characters')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${sidebarTab === 'characters' ? 'text-purple-400 bg-slate-800 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}>登场人物 ({state.characters.length})</button>
              <button onClick={() => setSidebarTab('clues')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${sidebarTab === 'clues' ? 'text-amber-400 bg-slate-800 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300'}`}>证物清单 ({state.clues.length})</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-5">
              {sidebarTab === 'characters' ? (
                <>
                  {state.characterGroups.map(group => {
                    const groupMembers = state.characters.filter(c => group.characterIds.includes(c.id));
                    if (groupMembers.length === 0) return null;
                    return (
                      <div key={group.id} className="space-y-2 animate-in fade-in duration-300">
                        {renderGroupHeader(group)}
                        <div className="space-y-1.5 pl-1">{groupMembers.map(char => renderCharacterCard(char))}</div>
                      </div>
                    );
                  })}
                  {state.characters.filter(c => !state.characterGroups.some(g => g.characterIds.includes(c.id))).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-slate-600 shadow-sm" /><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">待定阵营</span><div className="flex-1 h-[1px] bg-gradient-to-r from-slate-700 to-transparent" /></div>
                      <div className="space-y-1.5 pl-1">{state.characters.filter(c => !state.characterGroups.some(g => g.characterIds.includes(c.id))).map(char => renderCharacterCard(char))}</div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingClue(null); setIsClueModalOpen(true); }} className="w-full py-2 border-2 border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all text-[10px] font-bold flex items-center justify-center gap-2 mb-4"><Plus size={14} /> 新增证物档案</button>
                  
                  {state.characterGroups.map(group => {
                    const groupClues = state.clues.filter(c => group.characterIds.includes(c.id));
                    if (groupClues.length === 0) return null;
                    return (
                      <div key={group.id} className="space-y-2 animate-in fade-in duration-300 mb-4">
                        {renderGroupHeader(group)}
                        <div className="space-y-1.5 pl-1">{groupClues.map(clue => renderClueCard(clue))}</div>
                      </div>
                    );
                  })}

                  {state.clues.filter(c => !state.characterGroups.some(g => g.characterIds.includes(c.id))).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-slate-600 shadow-sm" /><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">待定逻辑链</span><div className="flex-1 h-[1px] bg-gradient-to-r from-slate-700 to-transparent" /></div>
                      <div className="space-y-1.5 pl-1">{state.clues.filter(c => !state.characterGroups.some(g => g.characterIds.includes(c.id))).map(clue => renderClueCard(clue))}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="flex border-b border-slate-700 gap-2">
            {[ { id: 'graph', label: '逻辑关系网', icon: Users }, { id: 'evidence', label: '证物与线索', icon: Search }, { id: 'map', label: '空间轨迹', icon: MapIcon }, { id: 'timeline', label: '时间序列', icon: Clock } ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}><tab.icon size={16} /> {tab.label}</button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {activeTab === 'graph' && (
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-2xl border border-slate-700 w-fit">
                    <button onClick={() => setState(p => ({...p, graphSubTab: 'people'}))} className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${state.graphSubTab === 'people' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Users size={14}/> 人物关系图</button>
                    <button onClick={() => setState(p => ({...p, graphSubTab: 'items'}))} className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${state.graphSubTab === 'items' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Package size={14}/> 物证逻辑链</button>
                </div>
                
                <RelationshipGraph 
                  viewMode={state.graphSubTab}
                  characters={state.characters.filter(c => state.graphSubTab === 'people' ? state.graphActiveCharacterIds.includes(c.id) : state.itemGraphActiveIds.includes(c.id))} 
                  clues={state.graphSubTab === 'items' ? state.clues.filter(c => state.itemGraphActiveIds.includes(c.id)) : []}
                  relationships={state.graphSubTab === 'people' ? state.graphPeopleRelationships : state.graphItemRelationships} 
                  relationshipDefs={state.relationshipDefs} 
                  characterGroups={state.characterGroups} 
                  layout={state.graphSubTab === 'people' ? state.graphLayout : state.itemGraphLayout} 
                  onAddRelationship={(s, t, r) => setState(prev => { 
                    const isPeople = prev.graphSubTab === 'people';
                    const targetField = isPeople ? 'graphPeopleRelationships' : 'graphItemRelationships';
                    const currentRels = prev[targetField];
                    
                    const exists = currentRels.findIndex(x => (x.source === s && x.target === t) || (x.source === t && x.target === s)); 
                    const newRels = [...currentRels]; 
                    if (exists > -1) newRels[exists] = { ...newRels[exists], relation: r }; 
                    else newRels.push({ source: s, target: t, relation: r }); 
                    
                    return { ...prev, [targetField]: newRels }; 
                  })} 
                  onRemoveRelationship={(s, t, r) => setState(prev => {
                    const isPeople = prev.graphSubTab === 'people';
                    const targetField = isPeople ? 'graphPeopleRelationships' : 'graphItemRelationships';
                    return { ...prev, [targetField]: prev[targetField].filter(x => !(x.source === s && x.target === t && x.relation === r)) };
                  })} 
                  onUpdateDefs={defs => setState(prev => ({ ...prev, relationshipDefs: defs }))} 
                  onNodeDrop={(id, type) => {
                    setState(prev => {
                        if (prev.graphSubTab === 'people') {
                            if (type === 'character' && !prev.graphActiveCharacterIds.includes(id)) {
                                return { ...prev, graphActiveCharacterIds: [...prev.graphActiveCharacterIds, id] };
                            }
                        } else {
                            if (!prev.itemGraphActiveIds.includes(id)) {
                                return { ...prev, itemGraphActiveIds: [...prev.itemGraphActiveIds, id] };
                            }
                        }
                        return prev;
                    });
                  }} 
                  onUpdateLayout={lay => setState(prev => ({ ...prev, [prev.graphSubTab === 'people' ? 'graphLayout' : 'itemGraphLayout']: { ...prev[prev.graphSubTab === 'people' ? 'graphLayout' : 'itemGraphLayout'], ...lay } }))} 
                  onRemoveNode={(id, type) => setState(prev => {
                    const isPeople = prev.graphSubTab === 'people';
                    const relField = isPeople ? 'graphPeopleRelationships' : 'graphItemRelationships';
                    const activeField = isPeople ? 'graphActiveCharacterIds' : 'itemGraphActiveIds';
                    
                    return { 
                      ...prev, 
                      [activeField]: (prev[activeField] as string[]).filter(x => x !== id), 
                      [relField]: (prev[relField] as Relationship[]).filter(r => r.source !== id && r.target !== id) 
                    };
                  })}
                  onAddGroup={g => setState(p => ({ ...p, characterGroups: [...p.characterGroups, g] }))} 
                  onUpdateGroup={g => setState(p => ({ ...p, characterGroups: p.characterGroups.map(i => i.id === g.id ? g : i) }))} 
                  onRemoveGroup={id => setState(p => ({ ...p, characterGroups: p.characterGroups.filter(g => g.id !== id) }))} 
                />
              </div>
            )}
            {activeTab === 'evidence' && (
              <div className="space-y-6">
                <div className="flex gap-4 border-b border-slate-800 pb-2">
                    {[{id:'clues', label:'公告板', icon:Search}, {id:'alibis', label:'不在场', icon:ShieldCheck}, {id:'locations', label:'地点索引', icon:MapPin}].map(t => (
                        <button key={t.id} onClick={() => setEvidenceSubTab(t.id as any)} className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${evidenceSubTab === t.id ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><t.icon size={14} /> {t.label}</button>
                    ))}
                </div>
                {evidenceSubTab === 'clues' && <EvidenceBoard clues={state.clues} locations={state.locations} blobUrls={blobUrls} onOpenModal={(clue) => { setEditingClue(clue); setIsClueModalOpen(true); }} onUpdateStatus={(id, s) => setState(p => ({ ...p, clues: p.clues.map(c => c.id === id ? { ...c, status: s } : c) }))} onDeleteClue={setClueToDeleteId} />}
                {evidenceSubTab === 'alibis' && <AlibiMatrix alibis={state.alibis} characters={state.characters} timePoints={state.timePoints} locations={state.locations} onAddAlibi={a => setState(p => ({ ...p, alibis: [...p.alibis, a] }))} onUpdateAlibi={(u, i) => setState(p => { const na = [...p.alibis]; na[i] = u; return { ...p, alibis: na }; })} onDeleteAlibi={i => setState(p => { const na = [...p.alibis]; return { ...p, alibis: na.filter((_, idx) => idx !== i) }; })} />}
                {evidenceSubTab === 'locations' && <LocationList locations={state.locations} maps={state.maps} spaces={state.spaces} clues={state.clues} blobUrls={blobUrls} onAddLocation={l => setState(p => ({ ...p, locations: [...p.locations, l] }))} onUpdateLocation={l => setState(p => ({ ...p, locations: p.locations.map(x => x.id === l.id ? l : x) }))} onDeleteLocation={id => setState(p => ({ ...p, locations: p.locations.filter(x => x.id !== id) }))} onImageSave={handleEntityImageSave} />}
              </div>
            )}
            {activeTab === 'map' && <MapCanvas maps={state.maps} currentMapId={state.currentMapId} spaces={state.spaces} clues={state.clues} alibis={state.alibis} timePoints={state.timePoints} currentTimeId={state.currentTimeId} timelineData={state.timelineData} itemTimelineData={state.itemTimelineData} characters={state.characters} blobUrls={blobUrls} onUpdateMaps={m => setState(prev => ({ ...prev, maps: m }))} onDeleteMap={id => setState(prev => ({ ...prev, maps: prev.maps.filter(m => m.id !== id) }))} onCreateMap={n => setState(p => ({ ...p, maps: [...p.maps, { id: crypto.randomUUID(), name: n }], currentMapId: p.maps[p.maps.length-1].id }))} onSelectMap={id => setState(prev => ({ ...prev, currentMapId: id }))} onUpdateSpaces={s => setState(prev => ({ ...prev, spaces: s }))} onUpdateTimePoints={pts => setState(prev => ({ ...prev, timePoints: pts }))} onSelectTime={id => setState(prev => ({ ...prev, currentTimeId: id }))} onUpdatePlacements={(tid, pl) => setState(prev => ({ ...prev, timelineData: { ...prev.timelineData, [tid]: pl } }))} onUpdateItemPlacements={(tid, pl) => setState(prev => ({ ...prev, itemTimelineData: { ...prev.itemTimelineData, [tid]: pl } }))} onAddClue={c => setState(p => ({ ...p, clues: p.clues.some(x => x.id === c.id) ? p.clues.map(x => x.id === c.id ? c : x) : [...p.clues, c] }))} onOpenClueModal={c => { setEditingClue(c); setIsClueModalOpen(true); }} onImageSave={handleEntityImageSave} />}
            {activeTab === 'timeline' && <TimelineVertical characters={state.characters} segments={state.timelineSegments} periods={state.timelinePeriods} activeCharIds={state.timelineActiveCharIds} charOrder={state.timelineCharOrder} slotCount={state.timelineSlotCount} locations={state.locations} timePoints={state.timePoints} onAddSegment={s => setState(p => ({ ...p, timelineSegments: [...p.timelineSegments, s] }))} onRemoveSegment={id => setState(p => ({ ...p, timelineSegments: p.timelineSegments.filter(x => x.id !== id) }))} onUpdateActiveChars={ids => setState(p => ({ ...p, timelineActiveCharIds: ids }))} onUpdateSlotCount={c => setState(p => ({ ...p, timelineSlotCount: c }))} onUpdatePeriods={ps => setState(p => ({ ...p, timelinePeriods: ps }))} onUpdateCharOrder={o => setState(p => ({ ...p, timelineCharOrder: o }))} onInsertSlot={handleInsertSlot} />}
          </div>
        </div>
      </main>

      <ClueModal isOpen={isClueModalOpen} editingClue={editingClue} locations={state.locations} blobUrls={blobUrls} onClose={() => { setIsClueModalOpen(false); setEditingClue(null); }} onSave={c => setState(p => ({ ...p, clues: p.clues.some(x => x.id === c.id) ? p.clues.map(x => x.id === c.id ? c : x) : [...p.clues, c] }))} onImageSave={handleEntityImageSave} />
      {showExportModal && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300"><div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-sm overflow-hidden"><div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center"><h3 className="text-xl font-bold text-white flex items-center gap-3"><FileArchive className="text-blue-400" size={24} />打包导出</h3><button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-white"><X size={24} /></button></div><div className="p-8 space-y-4"><p className="text-sm text-slate-400">我们将所有案情数据和图片文件打包为 .mind 文件。</p><button onClick={() => exportArchive(true)} className="w-full flex items-center justify-center gap-3 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all font-bold shadow-xl shadow-blue-900/20"><Save size={20} /> 打包导出 .mind</button></div></div></div>}
      {showClearConfirm && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 animate-in fade-in duration-300"><div className="bg-slate-800 rounded-3xl border border-red-900/50 shadow-2xl w-full max-md overflow-hidden"><div className="p-8 text-center space-y-6"><div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto border border-red-500/30 shadow-lg shadow-red-900/20"><AlertTriangle className="text-red-500" size={40} /></div><div className="space-y-2"><h3 className="text-2xl font-black text-white">彻底清空案情档案?</h3><p className="text-slate-400 text-sm leading-relaxed px-4">该操作将永久删除所有未导出的本地图片和逻辑关联。</p></div><div className="flex flex-col gap-3 pt-4"><button onClick={handleResetArchive} className="w-full flex items-center justify-center gap-3 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black shadow-xl">确认清空并新建</button><button onClick={() => setShowClearConfirm(false)} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-2xl font-bold transition-all">取消</button></div></div></div></div>}
      {characterToDelete && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"><div className="bg-slate-800 rounded-2xl border border-red-900/50 shadow-2xl w-full max-sm animate-in zoom-in-95 duration-200 overflow-hidden"><div className="p-6 text-center"><div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30"><AlertTriangle className="text-red-500" size={32} /></div><h3 className="text-xl font-bold text-white mb-2">确认删除角色?</h3><div className="flex gap-3"><button onClick={() => setCharacterToDelete(null)} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold transition-all">取消</button><button onClick={() => setState(p => ({ 
          ...p, 
          characters: p.characters.filter(c => c.id !== characterToDelete.id), 
          graphPeopleRelationships: p.graphPeopleRelationships.filter(r => r.source !== characterToDelete.id && r.target !== characterToDelete.id),
          graphItemRelationships: p.graphItemRelationships.filter(r => r.source !== characterToDelete.id && r.target !== characterToDelete.id) 
        }))} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-900/30 transition-all active:scale-95">确认删除</button></div></div></div></div>}
      {editingCharacter && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"><div className="bg-slate-800 rounded-3xl border border-slate-600 w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"><div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-900/50"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Users size={18} className="text-blue-400" />编辑人物档案</h3><button onClick={() => setEditingCharacter(null)} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full transition-colors"><X size={20}/></button></div><div className="p-8 space-y-6"><div className="flex flex-col items-center gap-4"><div onClick={() => charFileInputRef.current?.click()} className="w-24 h-24 rounded-full border-2 border-dashed border-slate-600 bg-slate-900/50 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-all overflow-hidden relative group"><input type="file" ref={charFileInputRef} className="hidden" accept="image/*" onChange={handleCharImageUpload} />{isCharImageLoading ? <Loader2 className="animate-spin text-blue-500" size={24} /> : editingCharacter.imageId ? <><img src={blobUrls[editingCharacter.imageId]} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera size={20} className="text-white" /></div></> : <div className="flex flex-col items-center text-slate-500 group-hover:text-blue-400"><Camera size={24} /><span className="text-[10px] mt-1 font-bold">上传照片</span></div>}</div><span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">点击更新人物头像</span></div><div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">姓名</label><input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={editingCharacter.name} onChange={e => setEditingCharacter({...editingCharacter, name: e.target.value})} /></div><div className="space-y-1.5"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">身份标签</label><input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500" value={editingCharacter.raw_info || ''} onChange={e => setEditingCharacter({...editingCharacter, raw_info: e.target.value})} /></div></div><div className="space-y-1.5"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">人物笔记</label><textarea className="w-full h-32 bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" value={editingCharacter.note || ''} onChange={e => setEditingCharacter({...editingCharacter, note: e.target.value})} /></div><div className="flex justify-end gap-3 pt-4"><button onClick={() => setEditingCharacter(null)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-bold transition-colors">取消</button><button onClick={() => { setState(p => ({ ...p, characters: p.characters.map(c => c.id === editingCharacter.id ? editingCharacter : c) })); setEditingCharacter(null); }} className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-2.5 rounded-xl font-black text-sm transition-all shadow-xl active:scale-95">确认存档</button></div></div></div></div>}
    </div>
  );
};

export default App;
