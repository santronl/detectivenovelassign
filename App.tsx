
import React, { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { parseCharacterList } from './utils/parser';
import { AppState, INITIAL_STATE, Character, Space, Relationship, RelationshipDef, MapDoc, TimePoint, CharacterPlacement, ItemPlacement, Clue, CharacterGroup, Alibi, Location, TimelineSegment, TimePeriodLabel, FamilyLink, SaveSlot } from './types';
import RelationshipGraph from './components/RelationshipGraph';
import EvidenceBoard from './components/EvidenceBoard';
import AlibiMatrix from './components/AlibiMatrix';
import LocationList from './components/LocationList';
import MapCanvas from './components/MapCanvas';
import TimelineVertical from './components/TimelineVertical';
import FamilyTree from './components/FamilyTree';
import ClueModal from './components/ClueModal';
import DataExtractor from './components/DataExtractor'; 
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
  Settings2,
  Sparkles,
  Zap,
  GitBranch,
  UserPlus,
  CheckSquare,
  Square,
  Check,
  UserRoundPlus,
  Palette,
  Type,
  Ungroup,
  History,
  RotateCcw
} from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [isInitialized, setIsInitialized] = useState(false);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'graph' | 'evidence' | 'map' | 'timeline' | 'family'>('graph');
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

  const [selectedSidebarCharIds, setSelectedSidebarCharIds] = useState<Set<string>>(new Set());
  const [isExtractorOpen, setIsExtractorOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [tempGroupName, setTempGroupName] = useState("");
  const [showGroupPickerForCharId, setShowGroupPickerForCharId] = useState<string | null>(null);
  const [isBatchGroupModalOpen, setIsBatchGroupModalOpen] = useState(false);

  // Group Creation State
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#3b82f6");
  const [pendingGroupMemberIds, setPendingGroupMemberIds] = useState<string[]>([]);

  // Stage Manager State
  const [isStageManagerOpen, setIsStageManagerOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");

  // Sorting State
  const [draggedSidebarItem, setDraggedSidebarItem] = useState<{ id: string, type: 'char' | 'group', groupId?: string } | null>(null);
  const [dropTargetItem, setDropTargetItem] = useState<{ id: string, position: 'top' | 'bottom' } | null>(null);

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
      setStatusMessage("正在打包档案...");
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const zip = new JSZip();
      zip.file("data.json", JSON.stringify(state, null, 2));
      
      const imageIds = await getAllImageIdsFromDB();
      const imgFolder = zip.folder("images");
      if (imgFolder) { 
        for (const id of imageIds) { 
          const b = await loadImageFromDB(id); 
          if (b) imgFolder.file(id, b); 
        } 
      }
      
      const blobType = isMobile ? "application/octet-stream" : "application/zip";
      const content = await zip.generateAsync({ type: "blob", mimeType: blobType });
      const fileName = state.lastFileName ? state.lastFileName.replace(/\.json$/, '.mind') : `mystery-${new Date().toISOString().slice(0,10)}.mind`;
      
      if (fileHandle && !isSaveAs && !isIframe && !isMobile) {
        try {
          const options = { mode: 'readwrite' as any };
          if (await fileHandle.queryPermission(options) !== 'granted') { if (await fileHandle.requestPermission(options) !== 'granted') throw new Error('未获得写入权限'); }
          const writable = await fileHandle.createWritable(); await writable.write(content); await writable.close();
          setStatusMessage(`已同步保存至: ${fileHandle.name}`); 
          return;
        } catch (fileErr) {
          console.warn("文件句柄写入失败，回退到普通下载:", fileErr);
        }
      }

      if (!isMobile && 'showSaveFilePicker' in window && window.isSecureContext && !isIframe) {
        try {
          const handle = await (window as any).showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'MysteryMind Bundle', accept: { 'application/octet-stream': ['.mind'] } }] });
          const writable = await handle.createWritable(); await writable.write(content); await writable.close();
          setFileHandle(handle); saveFileHandle(handle); setState(prev => ({ ...prev, lastFileName: handle.name }));
          setShowExportModal(false); setStatusMessage("档案保存成功");
          return;
        } catch (err: any) { 
          if (err.name === 'AbortError') return;
          console.warn("SaveFilePicker 失败，回退到普通下载:", err);
        }
      }

      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 500);

      setShowExportModal(false);
      setStatusMessage(isMobile ? "正在存入手机下载文件夹" : "档案已导出至浏览器下载");
    } catch (err: any) { 
      setErrorMessage(err.message || "档案导出失败"); 
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      let parsedData: any;
      if (file.name.endsWith('.mind') || file.type.includes('zip') || file.type.includes('octet-stream')) {
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
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile && 'showOpenFilePicker' in window && window.isSecureContext && !isIframe) {
      try { const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: 'MM Archive', accept: { 'application/zip': ['.mind'], 'application/json': ['.json'], 'application/octet-stream': ['.mind'] } }] });
      const file = await handle.getFile(); await handleImportFile(file); setFileHandle(handle); saveFileHandle(handle);
      } catch (err: any) { if (err.name !== 'AbortError') setErrorMessage("无法打开文件"); }
    } else { fileImportRef.current?.click(); }
  };

  const handleInsertSlot = (index: number, inherit: boolean) => {
    setState(prev => {
        const newSegments: TimelineSegment[] = [];
        prev.timelineSegments.forEach(s => {
            if (s.endSlot <= index) {
                // Before insertion: No change
                newSegments.push(s);
            } else if (s.startSlot >= index) {
                // After insertion: Shift down entirely
                newSegments.push({
                    ...s,
                    startSlot: s.startSlot + 1,
                    endSlot: s.endSlot + 1
                });
            } else {
                // Spanning insertion point (start < index < end)
                if (inherit) {
                    // Extend to cover new slot
                    newSegments.push({
                        ...s,
                        endSlot: s.endSlot + 1
                    });
                } else {
                    // Split into two parts (creating a gap at `index`)
                    
                    // Part 1: Start to Index
                    if (index > s.startSlot) {
                        newSegments.push({
                            ...s,
                            endSlot: index
                        });
                    }
                    // Part 2: Index+1 to End+1
                    if (s.endSlot > index) {
                        newSegments.push({
                            ...s,
                            id: crypto.randomUUID(), // New ID for split part
                            startSlot: index + 1,
                            endSlot: s.endSlot + 1
                        });
                    }
                }
            }
        });

        const newPeriods: TimePeriodLabel[] = [];
        prev.timelinePeriods.forEach(p => {
             if (p.endSlot <= index) {
                newPeriods.push(p);
            } else if (p.startSlot >= index) {
                newPeriods.push({
                    ...p,
                    startSlot: p.startSlot + 1,
                    endSlot: p.endSlot + 1
                });
            } else {
                // Spanning
                if (inherit) {
                    newPeriods.push({
                        ...p,
                        endSlot: p.endSlot + 1
                    });
                } else {
                    if (index > p.startSlot) {
                        newPeriods.push({ ...p, endSlot: index });
                    }
                    if (p.endSlot > index) {
                        newPeriods.push({
                            ...p,
                            id: crypto.randomUUID(),
                            startSlot: index + 1,
                            endSlot: p.endSlot + 1
                        });
                    }
                }
            }
        });

        return {
            ...prev,
            timelineSlotCount: prev.timelineSlotCount + 1,
            timelineSegments: newSegments,
            timelinePeriods: newPeriods
        };
    });
    setStatusMessage(`已在 G${index+1} 处插入新格子 (${inherit ? "延续" : "断开"})`);
  };

  const handleDeleteSlot = (index: number) => {
    setState(prev => ({
        ...prev,
        timelineSlotCount: Math.max(1, prev.timelineSlotCount - 1),
        timelineSegments: prev.timelineSegments
            .map(s => {
                let start = s.startSlot;
                let end = s.endSlot;
                if (start > index) start--;
                if (end > index) end--;
                return { ...s, startSlot: start, endSlot: end };
            })
            .filter(s => s.startSlot < s.endSlot),
        timelinePeriods: prev.timelinePeriods
            .map(p => {
                let start = p.startSlot;
                let end = p.endSlot;
                if (start > index) start--;
                if (end > index) end--;
                return { ...p, startSlot: start, endSlot: end };
            })
            .filter(p => p.startSlot < p.endSlot)
    }));
    setStatusMessage("已删除时间格 G" + (index+1));
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

  const toggleCharacterInGroup = (groupId: string, characterId: string) => {
    setState(prev => ({
      ...prev,
      characterGroups: prev.characterGroups.map(g => {
        if (g.id !== groupId) return g;
        const exists = g.characterIds.includes(characterId);
        return {
          ...g,
          characterIds: exists 
            ? g.characterIds.filter(id => id !== characterId) 
            : [...g.characterIds, characterId]
        };
      })
    }));
  };

  const handleDeleteCharacter = useCallback(() => {
    if (!characterToDelete) return;
    const charId = characterToDelete.id;
    setState(prev => ({
      ...prev,
      characters: (prev.characters || []).filter(c => c.id !== charId),
      graphActiveCharacterIds: (prev.graphActiveCharacterIds || []).filter(id => id !== charId),
      itemGraphActiveIds: (prev.itemGraphActiveIds || []).filter(id => id !== charId),
      graphPeopleRelationships: (prev.graphPeopleRelationships || []).filter(r => r.source !== charId && r.target !== charId),
      graphItemRelationships: (prev.graphItemRelationships || []).filter(r => r.source !== charId && r.target !== charId),
      characterGroups: (prev.characterGroups || []).map(g => ({ ...g, characterIds: (g.characterIds || []).filter(id => id !== charId) })),
      timelineData: Object.keys(prev.timelineData || {}).reduce((acc, tid) => {
        acc[tid] = (prev.timelineData[tid] || []).filter(p => p.characterId !== charId);
        return acc;
      }, {} as Record<string, CharacterPlacement[]>),
      timelineSegments: (prev.timelineSegments || []).filter(s => s.characterId !== charId),
      familyActiveCharIds: (prev.familyActiveCharIds || []).filter(id => id !== charId),
      familyLinks: (prev.familyLinks || []).filter(l => l.child !== charId && !(l.parents || []).includes(charId) && !(l.partners || []).includes(charId))
    }));
    setCharacterToDelete(null);
    setStatusMessage(`角色 ${characterToDelete.name} 已从档案中移除`);
  }, [characterToDelete]);

  const toggleSidebarSelection = (id: string) => {
    setSelectedSidebarCharIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  const handleAddAllToGraph = () => {
    if (selectedSidebarCharIds.size === 0) return;
    const ids = Array.from(selectedSidebarCharIds);
    setState(prev => {
        if (activeTab === 'family') {
            const currentActive = prev.familyActiveCharIds || [];
            const newActive = [...new Set([...currentActive, ...ids])];
            return { ...prev, familyActiveCharIds: newActive };
        } else {
            const subTab = prev.graphSubTab;
            const targetField = subTab === 'people' ? 'graphActiveCharacterIds' : 'itemGraphActiveIds';
            const currentActive = (prev[targetField] || []) as string[];
            const newActive = [...new Set([...currentActive, ...ids])];
            return { ...prev, [targetField]: newActive };
        }
    });
    setSelectedSidebarCharIds(new Set());
    if (activeTab !== 'family') setActiveTab('graph');
    setStatusMessage(`已将 ${ids.length} 位角色添加至画布`);
  };

  const handleBatchGroup = (groupId: string) => {
    const ids = Array.from(selectedSidebarCharIds);
    setState(prev => ({
      ...prev,
      characterGroups: (prev.characterGroups || []).map(g => {
        if (g.id !== groupId) return g;
        const nextIds = [...new Set([...(g.characterIds || []), ...ids])];
        return { ...g, characterIds: nextIds };
      })
    }));
    setIsBatchGroupModalOpen(false);
    setSelectedSidebarCharIds(new Set());
    setStatusMessage(`成功将 ${ids.length} 位角色归入分组`);
  };

  const handleBatchUngroup = () => {
    if (selectedSidebarCharIds.size === 0) return;
    const idsToCheck = selectedSidebarCharIds;
    let updated = false;
    
    const newGroups = (state.characterGroups || []).map(g => {
      const newIds = g.characterIds.filter(id => !idsToCheck.has(id));
      if (newIds.length !== g.characterIds.length) updated = true;
      return { ...g, characterIds: newIds };
    });

    if (updated) {
        setState(prev => ({ ...prev, characterGroups: newGroups }));
        setStatusMessage(`已将选中的 ${selectedSidebarCharIds.size} 位对象移出所在分组`);
        setSelectedSidebarCharIds(new Set());
    } else {
        setStatusMessage("选中的对象未加入任何分组");
    }
  };

  // --- Group Creation Modal Logic ---
  const handleOpenCreateGroupModal = (ids: string[]) => {
      setPendingGroupMemberIds(ids);
      setNewGroupName("新建分组");
      setNewGroupColor('#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'));
      setIsCreateGroupModalOpen(true);
      setIsBatchGroupModalOpen(false); 
      setShowGroupPickerForCharId(null);
  };

  const handleConfirmCreateGroup = () => {
      if (!newGroupName.trim()) return;
      const newGroupId = crypto.randomUUID();
      const newGroup = { 
          id: newGroupId, 
          label: newGroupName.trim(), 
          characterIds: pendingGroupMemberIds, 
          color: newGroupColor 
      };
      
      setState(prev => ({
          ...prev,
          characterGroups: [...(prev.characterGroups || []), newGroup]
      }));
      
      setIsCreateGroupModalOpen(false);
      setSelectedSidebarCharIds(new Set()); 
      setStatusMessage(`成功创建分组 "${newGroupName}" 并添加成员`);
  };

  const handleAddManualCharacter = () => {
      const newChar: Character = {
          id: crypto.randomUUID(),
          name: '新角色',
          raw_info: '待补充'
      };
      setState(prev => ({
          ...prev,
          characters: [newChar, ...(prev.characters || [])]
      }));
      setEditingCharacter(newChar);
  };

  // --- Stage/Save Slot Logic ---
  const handleSaveStage = () => {
      if (!newStageName.trim()) return;
      
      const { saveSlots, ...dataToSave } = state;
      const newSlot: SaveSlot = {
          id: crypto.randomUUID(),
          name: newStageName.trim(),
          timestamp: Date.now(),
          data: dataToSave
      };

      setState(prev => ({
          ...prev,
          saveSlots: [newSlot, ...(prev.saveSlots || [])]
      }));
      
      setNewStageName("");
      setStatusMessage(`已保存阶段: ${newSlot.name}`);
  };

  const handleLoadStage = (slot: SaveSlot) => {
      // Keep current saveSlots, overwrite everything else with slot data
      setState(prev => ({
          ...INITIAL_STATE, // Ensure no undefined fields
          ...slot.data,
          saveSlots: prev.saveSlots
      }));
      // Need to refresh Blob URLs because IDs might have changed (though usually images persist in IndexedDB independently)
      // Actually, image IDs are just strings. The IndexedDB has all images. So refreshing URLs for the *loaded* IDs is enough.
      // We can trigger a refresh via effect or manually calling it.
      // Since `state` changes, `refreshBlobUrls` needs to run. 
      // The existing effect logic calls refreshBlobUrls when loading from DB, but not state update.
      // Let's manually trigger it.
      const tempStateForBlob = { ...slot.data, saveSlots: [] } as AppState;
      refreshBlobUrls(tempStateForBlob);
      
      setStatusMessage(`已回溯至阶段: ${slot.name}`);
      setIsStageManagerOpen(false);
  };

  const handleDeleteStage = (slotId: string) => {
      setState(prev => ({
          ...prev,
          saveSlots: (prev.saveSlots || []).filter(s => s.id !== slotId)
      }));
  };

  // --- Character Reordering Logic ---
  const handleSortDragStart = (e: React.DragEvent, id: string, type: 'char' | 'group', groupId?: string) => {
      e.stopPropagation();
      // Set drag data
      setDraggedSidebarItem({ id, type, groupId });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/mysterymind-sort", "true");
      // Prevent default text selection
  };

  const handleSortDrop = (e: React.DragEvent, targetId: string, targetType: 'char' | 'group', targetGroupId?: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTargetItem(null);

      if (!draggedSidebarItem || draggedSidebarItem.type !== 'char' || targetType !== 'char') return;
      if (draggedSidebarItem.id === targetId) return;

      const sourceId = draggedSidebarItem.id;
      const sourceGroupId = draggedSidebarItem.groupId; // undefined means Ungrouped list

      // Logic for moving characters
      setState(prev => {
          let nextGroups = [...(prev.characterGroups || [])];
          let nextCharacters = [...(prev.characters || [])];

          // 1. Remove from Source
          if (sourceGroupId) {
              // Remove from source group
              nextGroups = nextGroups.map(g => {
                  if (g.id === sourceGroupId) {
                      return { ...g, characterIds: g.characterIds.filter(id => id !== sourceId) };
                  }
                  return g;
              });
          } else {
              // Coming from Ungrouped list (which is essentially the main characters array order filtered)
              // We don't remove from 'characters' array because that holds everything.
              // But we might need to reorder 'characters' array if we are moving within ungrouped.
          }

          // 2. Insert into Target
          if (targetGroupId) {
              // Moving into a group
              nextGroups = nextGroups.map(g => {
                  if (g.id === targetGroupId) {
                      const newIds = [...g.characterIds];
                      const targetIndex = newIds.indexOf(targetId);
                      // If drag source was already in this group, we filtered it out in step 1, so index might shift.
                      // If sourceGroupId === targetGroupId, we just did a reorder.
                      // Let's simplify: Just reconstruct the specific group's ID list.
                      
                      // Case A: Reorder within same group
                      if (sourceGroupId === targetGroupId) {
                          // We filtered it out in step 1.
                          // Insert at target index.
                          if (targetIndex !== -1) {
                              newIds.splice(targetIndex, 0, sourceId);
                          } else {
                              newIds.push(sourceId); // Fallback
                          }
                          return { ...g, characterIds: newIds };
                      } else {
                          // Case B: Move from Ungrouped (or other group) to this group
                          if (targetIndex !== -1) {
                              newIds.splice(targetIndex, 0, sourceId);
                          } else {
                              newIds.push(sourceId);
                          }
                          return { ...g, characterIds: newIds };
                      }
                  }
                  return g;
              });
          } else {
              // Moving to Ungrouped list (targetGroupId is undefined)
              // This implies reordering the main `characters` array so that sourceId appears next to targetId.
              // Note: Ungrouped list is derived from `characters` filtered by !inGroup.
              // So to reorder ungrouped items visually, we must reorder `characters`.
              
              const currentChars = [...prev.characters];
              const sourceIndex = currentChars.findIndex(c => c.id === sourceId);
              const targetIndex = currentChars.findIndex(c => c.id === targetId);
              
              if (sourceIndex > -1 && targetIndex > -1) {
                  const [removed] = currentChars.splice(sourceIndex, 1);
                  // Recalculate target index because splice might have shifted it
                  const newTargetIndex = currentChars.findIndex(c => c.id === targetId);
                  currentChars.splice(newTargetIndex, 0, removed);
                  nextCharacters = currentChars;
              }

              // Also ensure we remove it from any previous group if it came from one
              if (sourceGroupId) {
                  // We already did this in Step 1 (nextGroups is updated).
              }
          }

          return {
              ...prev,
              characterGroups: nextGroups,
              characters: nextCharacters
          };
      });
      
      setDraggedSidebarItem(null);
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
          className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate cursor-text select-none"
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
          onClick={() => setState(p => ({ ...p, characterGroups: (p.characterGroups || []).filter(g => g.id !== group.id) }))}
          className="p-1 text-slate-500 hover:text-red-400"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );

  const renderCharacterCard = (char: Character, groupId?: string) => {
    const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
    const charGroups = (state.characterGroups || []).filter(g => (g.characterIds || []).includes(char.id));
    const primaryGroup = charGroups[0];
    
    let isCurrentlyActive = false;
    if (activeTab === 'family') {
        isCurrentlyActive = (state.familyActiveCharIds || []).includes(char.id);
    } else {
        if (state.graphSubTab === 'people') isCurrentlyActive = (state.graphActiveCharacterIds || []).includes(char.id);
        else if (state.graphSubTab === 'items') isCurrentlyActive = (state.itemGraphActiveIds || []).includes(char.id);
    }

    const isSelected = selectedSidebarCharIds.has(char.id);

    return (
      <div 
        key={char.id} 
        draggable={!isCurrentlyActive} 
        onDragStart={(e) => {
            if (isCurrentlyActive) return;
            if (selectedSidebarCharIds.has(char.id) && selectedSidebarCharIds.size > 1) {
                e.dataTransfer.setData("application/mysterymind-ids", JSON.stringify(Array.from(selectedSidebarCharIds)));
                e.dataTransfer.setData("application/mysterymind-type", "character");
            } else {
                e.dataTransfer.setData("application/react-dnd-char-id", char.id);
            }
        }} 
        onDragOver={(e) => {
            if (draggedSidebarItem?.type === 'char' && draggedSidebarItem.id !== char.id) {
               e.preventDefault(); // Allow drop
            }
        }}
        onDrop={(e) => {
            if (draggedSidebarItem?.type === 'char') {
               handleSortDrop(e, char.id, 'char', groupId);
            }
        }}
        style={{ borderLeft: primaryGroup ? `4px solid ${primaryGroup.color}` : '4px solid transparent', backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : (primaryGroup ? `${primaryGroup.color}10` : 'rgb(51 65 85 / 0.5)') }} 
        className={`flex items-start justify-between p-2.5 rounded-r-xl border transition-all shadow-sm group ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-700 hover:border-slate-500'} ${isCurrentlyActive ? 'border-dashed bg-slate-900/30' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <div className="flex items-start gap-2.5 truncate flex-1">
          <div className="flex flex-col gap-1 items-center mt-1">
             <div 
                draggable 
                onDragStart={(e) => handleSortDragStart(e, char.id, 'char', groupId)}
                className="text-slate-600 cursor-grab active:cursor-grabbing hover:text-slate-400"
                title="拖动排序"
             >
                <GripVertical size={12} />
             </div>
             <div onClick={(e) => { e.stopPropagation(); toggleSidebarSelection(char.id); }} className="cursor-pointer">
                {isSelected ? <CheckSquare size={14} className="text-blue-500" /> : <Square size={14} className="text-slate-600 group-hover:text-slate-400" />}
             </div>
          </div>
          {portraitUrl ? (
            <div className={`w-8 h-8 rounded-full overflow-hidden border-2 border-slate-600 bg-slate-900 shrink-0 shadow-md ${isCurrentlyActive ? 'opacity-70 grayscale' : ''}`}><img src={portraitUrl} className="w-full h-full object-cover" /></div>
          ) : (
            <div className={`w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 border-2 border-slate-700 shadow-md ${isCurrentlyActive ? 'opacity-70' : ''}`}><User size={14} /></div>
          )}
          <div className="flex flex-col truncate min-w-0 pt-0.5">
            <span className={`text-xs font-black truncate tracking-tight ${isCurrentlyActive ? 'text-slate-400' : 'text-blue-100'}`}>{char.name}</span>
            {(char.raw_info || char.note) && (
              <span className="text-[9px] text-slate-400 truncate mt-0.5 leading-tight font-normal italic">{char.raw_info || char.note}</span>
            )}
            
            {isCurrentlyActive && (
                 <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                    <Check size={8} /> 已在画布
                 </span>
            )}
            
              <div className="flex flex-wrap gap-1 mt-1.5">
                {charGroups.map(group => (
                  <button 
                    key={group.id} 
                    onClick={() => toggleCharacterInGroup(group.id, char.id)}
                    style={{ backgroundColor: `${group.color}20`, borderColor: `${group.color}40`, color: group.color }} 
                    className="px-1 py-0.5 rounded-md text-[7px] font-black border flex items-center gap-0.5 shadow-sm hover:brightness-125 transition-all group/tag"
                    title="点击移除分组"
                  >
                    <Layers size={7} /> {group.label}
                    <X size={7} className="opacity-0 group-hover/tag:opacity-100 transition-opacity ml-0.5" />
                  </button>
                ))}
                <button 
                  onClick={() => setShowGroupPickerForCharId(char.id)} 
                  className="px-1 py-0.5 rounded-md text-[7px] font-black border border-slate-700 text-slate-500 hover:text-slate-300 flex items-center gap-0.5"
                >
                  <Plus size={7} /> 分组
                </button>
              </div>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditingCharacter(char)} className="p-1 text-slate-500 hover:text-blue-400 rounded transition-colors" title="编辑详情"><Info size={12}/></button>
          <button onClick={() => setCharacterToDelete(char)} className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors" title="删除角色"><Trash2 size={12}/></button>
        </div>

        {showGroupPickerForCharId === char.id && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowGroupPickerForCharId(null)}>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 w-64 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 text-center">选择分组 - {char.name}</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                {(state.characterGroups || []).map(g => (
                  <button 
                    key={g.id} 
                    onClick={() => { toggleCharacterInGroup(g.id, char.id); setShowGroupPickerForCharId(null); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-between transition-all ${(g.characterIds || []).includes(char.id) ? 'bg-blue-600/20 border-blue-500 text-blue-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                  >
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} /> {g.label}</span>
                    {(g.characterIds || []).includes(char.id) && <CheckCircle2 size={12} />}
                  </button>
                ))}
                <button 
                  onClick={() => handleOpenCreateGroupModal([char.id])}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold border border-dashed border-slate-700 text-slate-500 hover:border-slate-500 flex items-center gap-2"
                >
                  <Plus size={12} /> 创建新分组
                </button>
                {(state.characterGroups || []).some(g => g.characterIds.includes(char.id)) && (
                    <button 
                      onClick={() => {
                          setState(prev => ({
                              ...prev,
                              characterGroups: prev.characterGroups.map(g => ({
                                  ...g,
                                  characterIds: g.characterIds.filter(id => id !== char.id)
                              }))
                          }));
                          setShowGroupPickerForCharId(null);
                          setStatusMessage(`已将 ${char.name} 移出所有分组`);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold border border-transparent text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                    >
                      <Ungroup size={12} /> 移出所有分组
                    </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderClueCard = (clue: Clue) => {
    const imageUrl = clue.imageId ? blobUrls[clue.imageId] : null;
    const clueGroups = (state.characterGroups || []).filter(g => (g.characterIds || []).includes(clue.id));
    const primaryGroup = clueGroups[0];
    const isCurrentlyActive = (state.itemGraphActiveIds || []).includes(clue.id);

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
            <div className="flex flex-wrap gap-1 mt-1.5">
              {clueGroups.map(group => (
                <button 
                  key={group.id} 
                  onClick={() => toggleCharacterInGroup(group.id, clue.id)}
                  style={{ backgroundColor: `${group.color}20`, borderColor: `${group.color}40`, color: group.color }} 
                  className="px-1 py-0.5 rounded-md text-[7px] font-black border flex items-center gap-0.5 shadow-sm hover:brightness-125"
                >
                  <Layers size={7} /> {group.label}
                </button>
              ))}
              <button 
                onClick={() => setShowGroupPickerForCharId(clue.id)} 
                className="px-1 py-0.5 rounded-md text-[7px] font-black border border-slate-700 text-slate-500 hover:text-slate-300 flex items-center gap-0.5"
              >
                <Plus size={7} /> 分组
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => { setEditingClue(clue); setIsClueModalOpen(true); }} className="p-1.5 text-slate-500 hover:text-blue-400 rounded transition-colors"><Info size={12} /></button>
          <button onClick={() => setClueToDeleteId(clue.id)} className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-colors"><Trash2 size={12}/></button>
        </div>

        {showGroupPickerForCharId === clue.id && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowGroupPickerForCharId(null)}>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 w-64 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 text-center">线索归档 - {clue.name}</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                {(state.characterGroups || []).map(g => (
                  <button 
                    key={g.id} 
                    onClick={() => { toggleCharacterInGroup(g.id, clue.id); setShowGroupPickerForCharId(null); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-between transition-all ${(g.characterIds || []).includes(clue.id) ? 'bg-amber-600/20 border-amber-500 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                  >
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} /> {g.label}</span>
                    {(g.characterIds || []).includes(clue.id) && <CheckCircle2 size={12} />}
                  </button>
                ))}
                <button 
                  onClick={() => handleOpenCreateGroupModal([clue.id])}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold border border-dashed border-slate-700 text-slate-500 hover:border-slate-500 flex items-center gap-2"
                >
                  <Plus size={12} /> 创建新分组
                </button>
                {(state.characterGroups || []).some(g => g.characterIds.includes(clue.id)) && (
                    <button 
                      onClick={() => {
                          setState(prev => ({
                              ...prev,
                              characterGroups: prev.characterGroups.map(g => ({
                                  ...g,
                                  characterIds: g.characterIds.filter(id => id !== clue.id)
                              }))
                          }));
                          setShowGroupPickerForCharId(null);
                          setStatusMessage(`已将 ${clue.name} 移出所有分组`);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold border border-transparent text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                    >
                      <Ungroup size={12} /> 移出所有分组
                    </button>
                )}
              </div>
            </div>
          </div>
        )}
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
              <button onClick={() => setIsStageManagerOpen(true)} className="flex items-center gap-2 p-2 text-slate-400 hover:text-white group"><History size={18} /> <span className="text-sm font-medium">阅读阶段</span></button>
              <div className="w-[1px] h-6 bg-slate-700 mx-1"></div>
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
          <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl relative overflow-hidden group/ext">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/ext:opacity-20 transition-opacity">
                <Sparkles size={80} className="text-blue-500" />
            </div>
            <h2 className="font-black text-white flex items-center gap-2 mb-4 uppercase tracking-tighter text-lg"><Database size={20} className="text-blue-400" />结构化数据处理</h2>
            <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">通过智能映射工具，快速将粘贴的人物列表、线索清单转换为案情模型。</p>
            <button 
                onClick={() => setIsExtractorOpen(true)}
                className="w-full group/btn relative flex items-center justify-center gap-3 py-4 bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-900/30 transition-all active:scale-[0.98]"
            >
                <Zap size={18} className="group-hover/btn:animate-pulse" /> 开始智能提取
                <div className="absolute inset-0 rounded-2xl border-2 border-white/10 group-hover/btn:border-white/20 transition-colors pointer-events-none"></div>
            </button>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col h-[600px]">
            <div className="bg-slate-900/50 border-b border-slate-700 flex flex-col">
              <div className="flex">
                <button onClick={() => { setSidebarTab('characters'); setSelectedSidebarCharIds(new Set()); }} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${sidebarTab === 'characters' ? 'text-purple-400 bg-slate-800 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}>登场人物 ({(state.characters || []).filter(c => !c.isVirtual).length})</button>
                <button onClick={() => { setSidebarTab('clues'); setSelectedSidebarCharIds(new Set()); }} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${sidebarTab === 'clues' ? 'text-amber-400 bg-slate-800 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300'}`}>证物清单 ({(state.clues || []).length})</button>
              </div>
              
              {sidebarTab === 'characters' ? (
                  selectedSidebarCharIds.size > 0 ? (
                    <div className="bg-blue-600 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-4 duration-200">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 size={12} /> 已选 {selectedSidebarCharIds.size}
                        </span>
                        <div className="flex gap-2">
                            <button onClick={handleAddAllToGraph} className="bg-white/10 hover:bg-white/20 text-white p-1 rounded transition-colors" title="添加至画布"><Plus size={14} /></button>
                            <button onClick={() => setIsBatchGroupModalOpen(true)} className="bg-white/10 hover:bg-white/20 text-white p-1 rounded transition-colors" title="批量分组"><Layers size={14} /></button>
                            <button onClick={handleBatchUngroup} className="bg-white/10 hover:bg-white/20 text-white p-1 rounded transition-colors" title="移出所有分组"><Ungroup size={14} /></button>
                            <button onClick={() => setSelectedSidebarCharIds(new Set())} className="bg-white/10 hover:bg-white/20 text-white p-1 rounded transition-colors" title="清除选择"><X size={14} /></button>
                        </div>
                    </div>
                  ) : (
                    <button 
                        onClick={handleAddManualCharacter} 
                        className="w-full py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white border-b border-slate-700/50 text-[10px] font-bold flex items-center justify-center gap-2 transition-all"
                    >
                        <UserPlus size={12} /> 添加新人物
                    </button>
                  )
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-5">
              {sidebarTab === 'characters' ? (
                <>
                  {(state.characterGroups || []).map(group => {
                    const groupMembers = (state.characters || []).filter(c => !c.isVirtual && (group.characterIds || []).includes(c.id));
                    // Allow rendering empty groups so we can drag items into them
                    return (
                      <div key={group.id} className="space-y-2 animate-in fade-in duration-300">
                        {renderGroupHeader(group)}
                        <div className="space-y-1.5 pl-1 min-h-[10px]">
                            {groupMembers.map(char => renderCharacterCard(char, group.id))}
                            {groupMembers.length === 0 && (
                                <div className="text-[9px] text-slate-600 italic pl-2 py-1">暂无成员 (拖拽添加)</div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Ungrouped Characters */}
                  <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-slate-600 shadow-sm" /><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">待定阵营</span><div className="flex-1 h-[1px] bg-gradient-to-r from-slate-700 to-transparent" /></div>
                      <div className="space-y-1.5 pl-1">
                          {(state.characters || []).filter(c => !c.isVirtual && !(state.characterGroups || []).some(g => (g.characterIds || []).includes(c.id))).map(char => renderCharacterCard(char))}
                      </div>
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingClue(null); setIsClueModalOpen(true); }} className="w-full py-2 border-2 border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all text-[10px] font-bold flex items-center justify-center gap-2 mb-4"><Plus size={14} /> 新增证物档案</button>
                  {(state.characterGroups || []).map(group => {
                    const groupClues = (state.clues || []).filter(c => (group.characterIds || []).includes(c.id));
                    if (groupClues.length === 0) return null;
                    return (
                      <div key={group.id} className="space-y-2 animate-in fade-in duration-300 mb-4">
                        {renderGroupHeader(group)}
                        <div className="space-y-1.5 pl-1">{groupClues.map(clue => renderClueCard(clue))}</div>
                      </div>
                    );
                  })}
                  {(state.clues || []).filter(c => !(state.characterGroups || []).some(g => (g.characterIds || []).includes(c.id))).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-slate-600 shadow-sm" /><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">待定逻辑链</span><div className="flex-1 h-[1px] bg-gradient-to-r from-slate-700 to-transparent" /></div>
                      <div className="space-y-1.5 pl-1">{(state.clues || []).filter(c => !(state.characterGroups || []).some(g => (g.characterIds || []).includes(c.id))).map(clue => renderClueCard(clue))}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="flex border-b border-slate-700 gap-2 overflow-x-auto custom-scrollbar">
            {[ { id: 'graph', label: '逻辑关系网', icon: Users }, { id: 'family', label: '家族谱系图', icon: GitBranch }, { id: 'evidence', label: '证物与线索', icon: Search }, { id: 'map', label: '空间轨迹', icon: MapIcon }, { id: 'timeline', label: '时间序列', icon: Clock } ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'}`}><tab.icon size={16} /> {tab.label}</button>
            ))}
          </div>

          <div className="min-h-[600px]">
            {activeTab === 'graph' && (
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-2xl border border-slate-700 w-fit overflow-x-auto max-w-full custom-scrollbar">
                    <button onClick={() => setState(p => ({...p, graphSubTab: 'people'}))} className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${state.graphSubTab === 'people' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Users size={14}/> 人物关系图</button>
                    <button onClick={() => setState(p => ({...p, graphSubTab: 'items'}))} className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${state.graphSubTab === 'items' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Package size={14}/> 物证逻辑链</button>
                </div>
                
                <RelationshipGraph 
                  viewMode={state.graphSubTab === 'items' ? 'items' : 'people'}
                  characters={(state.characters || []).filter(c => state.graphSubTab === 'people' ? (state.graphActiveCharacterIds || []).includes(c.id) : (state.itemGraphActiveIds || []).includes(c.id))} 
                  clues={state.graphSubTab === 'items' ? (state.clues || []).filter(c => (state.itemGraphActiveIds || []).includes(c.id)) : []}
                  allCharacters={state.characters || []}
                  allClues={state.clues || []}
                  relationships={state.graphSubTab === 'people' ? (state.graphPeopleRelationships || []) : (state.graphItemRelationships || [])} 
                  relationshipDefs={state.relationshipDefs} 
                  characterGroups={state.characterGroups} 
                  layout={state.graphSubTab === 'people' ? state.graphLayout : state.itemGraphLayout} 
                  blobUrls={blobUrls}
                  onAddRelationship={(s, t, r) => setState(prev => { 
                    const isItem = prev.graphSubTab === 'items';
                    const targetField = isItem ? 'graphItemRelationships' : 'graphPeopleRelationships';
                    const currentRels = prev[targetField] || [];
                    const exists = currentRels.findIndex(x => (x.source === s && x.target === t) || (x.source === t && x.target === s)); 
                    const newRels = [...currentRels]; 
                    if (exists > -1) newRels[exists] = { ...newRels[exists], relation: r }; 
                    else newRels.push({ source: s, target: t, relation: r }); 
                    return { ...prev, [targetField]: newRels }; 
                  })} 
                  onRemoveRelationship={(s, t, r) => setState(prev => {
                    const isItem = prev.graphSubTab === 'items';
                    const targetField = isItem ? 'graphItemRelationships' : 'graphPeopleRelationships';
                    return { ...prev, [targetField]: (prev[targetField] || []).filter(x => !(x.source === s && x.target === t && x.relation === r)) };
                  })} 
                  onUpdateDefs={defs => setState(prev => ({ ...prev, relationshipDefs: defs }))} 
                  onNodeDrop={(id, type, x, y) => {
                    setState(prev => {
                        const subTab = prev.graphSubTab;
                        const layoutField = subTab === 'people' ? 'graphLayout' : 'itemGraphLayout';
                        const activeField = subTab === 'people' ? 'graphActiveCharacterIds' : 'itemGraphActiveIds';
                        
                        let idsToProcess = [id];
                        try {
                           const parsed = JSON.parse(id);
                           if (Array.isArray(parsed)) idsToProcess = parsed;
                        } catch(e) {}

                        const newLayout = { ...(prev[layoutField] || {}) };
                        const currentActive = [...((prev[activeField] || []) as string[])];

                        idsToProcess.forEach((pId, idx) => {
                           const offset = idsToProcess.length > 1 ? (idx * 25) - ((idsToProcess.length-1)*12.5) : 0;
                           newLayout[pId] = { x: x + offset, y: y + offset };
                           if (!currentActive.includes(pId)) currentActive.push(pId);
                        });

                        return { ...prev, [layoutField]: newLayout, [activeField]: currentActive };
                    });
                  }} 
                  onUpdateLayout={lay => setState(prev => {
                    const subTab = prev.graphSubTab;
                    const layoutField = subTab === 'people' ? 'graphLayout' : 'itemGraphLayout';
                    return { ...prev, [layoutField]: { ...(prev[layoutField] || {}), ...lay } };
                  })} 
                  onRemoveNode={(id, type) => setState(prev => {
                    const subTab = prev.graphSubTab;
                    const relField = subTab === 'people' ? 'graphPeopleRelationships' : 'graphItemRelationships';
                    const activeField = subTab === 'people' ? 'graphActiveCharacterIds' : 'itemGraphActiveIds';
                    return { 
                      ...prev, 
                      [activeField]: ((prev[activeField] || []) as string[]).filter(x => x !== id), 
                      [relField]: ((prev[relField] || []) as Relationship[]).filter(r => r.source !== id && r.target !== id) 
                    };
                  })}
                  onAddGroup={g => setState(p => ({ ...p, characterGroups: [...(p.characterGroups || []), g] }))} 
                  onUpdateGroup={g => setState(p => ({ ...p, characterGroups: (p.characterGroups || []).map(i => i.id === g.id ? g : i) }))} 
                  onRemoveGroup={id => setState(p => ({ ...p, characterGroups: (p.characterGroups || []).filter(g => g.id !== id) }))} 
                />
              </div>
            )}
            {activeTab === 'family' && (
                <FamilyTree 
                    characters={state.characters || []}
                    activeCharIds={state.familyActiveCharIds || []}
                    familyLinks={state.familyLinks || []}
                    customOrder={state.familyCustomOrder || {}}
                    rootCoords={state.familyRootCoords || {}}
                    blobUrls={blobUrls}
                    onAddFamilyLink={l => setState(p => ({ ...p, familyLinks: [...(p.familyLinks || []), l] }))}
                    onUpdateFamilyLink={l => setState(p => ({ ...p, familyLinks: (p.familyLinks || []).map(x => x.id === l.id ? l : x) }))}
                    onRemoveFamilyLink={id => setState(p => ({ ...p, familyLinks: (p.familyLinks || []).filter(l => l.id !== id) }))}
                    onAddActiveChar={id => setState(p => ({ ...p, familyActiveCharIds: [...new Set([...(p.familyActiveCharIds || []), id])] }))}
                    onRemoveActiveChar={id => setState(p => ({
                        ...p,
                        familyActiveCharIds: (p.familyActiveCharIds || []).filter(x => x !== id),
                        familyLinks: (p.familyLinks || []).filter(l => 
                            !(l.partners || []).includes(id) && 
                            !(l.parents || []).includes(id) && 
                            l.child !== id
                        ),
                        familyRootCoords: Object.fromEntries(Object.entries(p.familyRootCoords || {}).filter(([k]) => k !== id))
                    }))}
                    onAddVirtualChar={(name) => {
                        const newChar: Character = {
                            id: crypto.randomUUID(),
                            name,
                            isVirtual: true,
                            raw_info: '虚拟占位人物'
                        };
                        setState(p => ({
                            ...p,
                            characters: [...(p.characters || []), newChar],
                            familyActiveCharIds: [...new Set([...(p.familyActiveCharIds || []), newChar.id])]
                        }));
                    }}
                    onUpdateCustomOrder={(order) => setState(p => ({ ...p, familyCustomOrder: order }))}
                    onUpdateRootCoords={(coords) => setState(p => ({ ...p, familyRootCoords: coords }))}
                />
            )}
            {activeTab === 'evidence' && (
              <div className="space-y-6">
                <div className="flex gap-4 border-b border-slate-800 pb-2">
                    {[{id:'clues', label:'公告板', icon:Search}, {id:'alibis', label:'不在场', icon:ShieldCheck}, {id:'locations', label:'地点索引', icon:MapPin}].map(t => (
                        <button key={t.id} onClick={() => setEvidenceSubTab(t.id as any)} className={`text-sm font-bold flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${evidenceSubTab === t.id ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}><t.icon size={14} /> {t.label}</button>
                    ))}
                </div>
                {evidenceSubTab === 'clues' && <EvidenceBoard clues={state.clues || []} locations={state.locations || []} blobUrls={blobUrls} onOpenModal={(clue) => { setEditingClue(clue); setIsClueModalOpen(true); }} onUpdateStatus={(id, s) => setState(p => ({ ...p, clues: (p.clues || []).map(c => c.id === id ? { ...c, status: s } : c) }))} onDeleteClue={setClueToDeleteId} />}
                {evidenceSubTab === 'alibis' && <AlibiMatrix alibis={state.alibis || []} characters={state.characters || []} timePoints={state.timePoints || []} locations={state.locations || []} onAddAlibi={a => setState(p => ({ ...p, alibis: [...(p.alibis || []), a] }))} onUpdateAlibi={(u, i) => setState(p => { const na = [...(p.alibis || [])]; na[i] = u; return { ...p, alibis: na }; })} onDeleteAlibi={i => setState(p => { const na = [...(p.alibis || [])]; return { ...p, alibis: na.filter((_, idx) => idx !== i) }; })} />}
                {evidenceSubTab === 'locations' && <LocationList locations={state.locations || []} maps={state.maps || []} spaces={state.spaces || []} clues={state.clues || []} blobUrls={blobUrls} onAddLocation={l => setState(p => ({ ...p, locations: [...(p.locations || []), l] }))} onUpdateLocation={l => setState(p => ({ ...p, locations: (p.locations || []).map(x => x.id === l.id ? l : x) }))} onDeleteLocation={id => setState(p => ({ ...p, locations: (p.locations || []).filter(x => x.id !== id) }))} onImageSave={handleEntityImageSave} />}
              </div>
            )}
            {activeTab === 'map' && <MapCanvas maps={state.maps || []} currentMapId={state.currentMapId} spaces={state.spaces || []} clues={state.clues || []} alibis={state.alibis || []} timePoints={state.timePoints || []} currentTimeId={state.currentTimeId} timelineData={state.timelineData || {}} itemTimelineData={state.itemTimelineData || {}} characters={state.characters || []} blobUrls={blobUrls} onUpdateMaps={m => setState(prev => ({ ...prev, maps: m }))} onDeleteMap={id => setState(prev => ({ ...prev, maps: (prev.maps || []).filter(m => m.id !== id) }))} onCreateMap={n => setState(p => ({ ...p, maps: [...(p.maps || []), { id: crypto.randomUUID(), name: n }], currentMapId: (p.maps || [])[(p.maps || []).length-1]?.id || 'default' }))} onSelectMap={id => setState(prev => ({ ...prev, currentMapId: id }))} onUpdateSpaces={s => setState(prev => ({ ...prev, spaces: s }))} onUpdateTimePoints={pts => setState(prev => ({ ...prev, timePoints: pts }))} onSelectTime={id => setState(prev => ({ ...prev, currentTimeId: id }))} onUpdatePlacements={(tid, pl) => setState(prev => ({ ...prev, timelineData: { ...prev.timelineData, [tid]: pl } }))} onUpdateItemPlacements={(tid, pl) => setState(prev => ({ ...prev, itemTimelineData: { ...prev.itemTimelineData, [tid]: pl } }))} onAddClue={c => setState(p => ({ ...p, clues: (p.clues || []).some(x => x.id === c.id) ? (p.clues || []).map(x => x.id === c.id ? c : x) : [...(p.clues || []), c] }))} onOpenClueModal={c => { setEditingClue(c); setIsClueModalOpen(true); }} onImageSave={handleEntityImageSave} />}
            {activeTab === 'timeline' && <TimelineVertical characters={state.characters || []} segments={state.timelineSegments || []} periods={state.timelinePeriods || []} activeCharIds={state.timelineActiveCharIds || []} charOrder={state.timelineCharOrder || []} slotCount={state.timelineSlotCount || 24} locations={state.locations || []} timePoints={state.timePoints || []} onAddSegment={s => setState(p => ({ ...p, timelineSegments: [...(p.timelineSegments || []), s] }))} onUpdateSegment={s => setState(p => ({ ...p, timelineSegments: (p.timelineSegments || []).map(x => x.id === s.id ? s : x) }))} onRemoveSegment={id => setState(p => ({ ...p, timelineSegments: (p.timelineSegments || []).filter(x => x.id !== id) }))} onUpdateActiveChars={ids => setState(p => ({ ...p, timelineActiveCharIds: ids }))} onUpdateSlotCount={c => setState(p => ({ ...p, timelineSlotCount: c }))} onUpdatePeriods={ps => setState(p => ({ ...p, timelinePeriods: ps }))} onUpdateCharOrder={o => setState(p => ({ ...p, timelineCharOrder: o }))} onInsertSlot={handleInsertSlot} onDeleteSlot={handleDeleteSlot} />}
          </div>
        </div>
      </main>

      <DataExtractor 
        isOpen={isExtractorOpen} 
        onClose={() => setIsExtractorOpen(false)} 
        onComplete={(newChars) => {
            setState(p => ({ ...p, characters: [...(p.characters || []), ...newChars] }));
            setStatusMessage(`成功提取 ${newChars.length} 位角色模型`);
        }} 
      />

      {/* Batch Group Modal */}
      {isBatchGroupModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
           <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-sm overflow-hidden animate-in zoom-in-95">
              <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                <h3 className="font-bold text-white flex items-center gap-2"><Layers size={18} className="text-blue-400" /> 批量归类 ({selectedSidebarCharIds.size} 人)</h3>
                <button onClick={() => setIsBatchGroupModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
              </div>
              <div className="p-6 space-y-3">
                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4">请选择目标分组</p>
                 <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                    {(state.characterGroups || []).map(g => (
                        <button key={g.id} onClick={() => handleBatchGroup(g.id)} className="w-full text-left p-3 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-700 hover:border-blue-500/50 transition-all flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                                <span className="text-sm font-bold text-slate-200">{g.label}</span>
                            </div>
                            <ChevronRight size={14} className="text-slate-600 group-hover:text-blue-400" />
                        </button>
                    ))}
                    <button 
                        onClick={() => handleOpenCreateGroupModal(Array.from(selectedSidebarCharIds))}
                        className="w-full text-left p-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 flex items-center gap-2"
                    >
                        <Plus size={16} /> 创建新分组
                    </button>
                 </div>
              </div>
              <div className="p-4 border-t border-slate-700 bg-slate-900/20">
                <button onClick={() => setIsBatchGroupModalOpen(false)} className="w-full py-3 text-slate-400 font-bold hover:text-white transition-colors">取消操作</button>
              </div>
           </div>
        </div>
      )}

      {/* Create Group Modal */}
      {isCreateGroupModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2 text-sm"><Layers size={16} className="text-indigo-400"/> 创建新分组</h3>
                    <button onClick={() => setIsCreateGroupModalOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 text-xs text-slate-400 flex items-center gap-2">
                        <div className="p-1 bg-indigo-500/20 rounded text-indigo-400"><CheckCircle2 size={12}/></div>
                        <span>将包含 <strong className="text-white">{pendingGroupMemberIds.length}</strong> 个对象</span>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Type size={12}/> 分组名称</label>
                        <input 
                            autoFocus
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateGroup()}
                            placeholder="输入分组名称 (如: 侦探团)"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-bold"
                        />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Palette size={12}/> 分组颜色</label>
                        <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl p-2">
                            <div className="relative w-8 h-8 shrink-0">
                                <input 
                                    type="color" 
                                    value={newGroupColor}
                                    onChange={(e) => setNewGroupColor(e.target.value)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className="w-full h-full rounded-lg shadow-sm border border-white/10" style={{ backgroundColor: newGroupColor }} />
                            </div>
                            <input 
                                value={newGroupColor}
                                onChange={(e) => setNewGroupColor(e.target.value)}
                                className="flex-1 bg-transparent text-xs font-mono text-slate-400 outline-none uppercase"
                            />
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-slate-900/30 border-t border-slate-700 flex gap-3">
                    <button onClick={() => setIsCreateGroupModalOpen(false)} className="flex-1 py-2.5 text-xs font-bold text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">取消</button>
                    <button onClick={handleConfirmCreateGroup} disabled={!newGroupName.trim()} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg transition-all">确认创建</button>
                </div>
            </div>
        </div>
      )}

      {/* Stage Manager Modal */}
      {isStageManagerOpen && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
                <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center shrink-0">
                    <h3 className="text-lg font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl"><History size={20} className="text-white"/></div>
                        阅读阶段存档
                    </h3>
                    <button onClick={() => setIsStageManagerOpen(false)} className="text-slate-400 hover:text-white"><X size={24}/></button>
                </div>
                
                <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="space-y-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Save size={12}/> 保存当前阶段</label>
                        <div className="flex gap-2">
                            <input 
                                autoFocus
                                value={newStageName}
                                onChange={(e) => setNewStageName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveStage()}
                                placeholder="如: 第一章结束 / 发现尸体..."
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                            />
                            <button 
                                onClick={handleSaveStage} 
                                disabled={!newStageName.trim()}
                                className="px-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:grayscale text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95"
                            >
                                存档
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 italic pl-1">记录此时此刻的推理状态，以便后续回溯。照片等资源将共享。</p>
                    </div>

                    <div className="border-t border-slate-700/50 pt-4 space-y-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><RotateCcw size={12}/> 历史阶段回溯</label>
                        {(state.saveSlots || []).length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/50 text-slate-600">
                                <History size={32} className="mx-auto mb-2 opacity-50"/>
                                <p className="text-xs font-bold">暂无存档记录</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {(state.saveSlots || []).map(slot => (
                                    <div key={slot.id} className="flex items-center justify-between p-3 bg-slate-700/30 border border-slate-700 rounded-xl hover:bg-slate-700/50 transition-all group">
                                        <div className="flex flex-col min-w-0 pr-4">
                                            <span className="text-sm font-bold text-slate-200 truncate">{slot.name}</span>
                                            <span className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(slot.timestamp).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleLoadStage(slot)}
                                                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/50 rounded-lg text-xs font-bold transition-all"
                                            >
                                                读取
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteStage(slot.id)}
                                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      <ClueModal isOpen={isClueModalOpen} editingClue={editingClue} locations={state.locations || []} blobUrls={blobUrls} onClose={() => { setIsClueModalOpen(false); setEditingClue(null); }} onSave={c => setState(p => ({ ...p, clues: (p.clues || []).some(x => x.id === c.id) ? (p.clues || []).map(x => x.id === c.id ? c : x) : [...(p.clues || []), c] }))} onImageSave={handleEntityImageSave} />
      {showExportModal && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300"><div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-sm overflow-hidden"><div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center"><h3 className="text-xl font-bold text-white flex items-center gap-3"><FileArchive className="text-blue-400" size={24} />打包导出</h3><button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-white"><X size={24} /></button></div><div className="p-8 space-y-4"><p className="text-sm text-slate-400">我们将所有案情数据和图片文件打包为 .mind 文件。</p><button onClick={() => exportArchive(true)} className="w-full flex items-center justify-center gap-3 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all font-bold shadow-xl shadow-blue-900/20"><Save size={20} /> 打包导出 .mind</button></div></div></div>}
      {showClearConfirm && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 animate-in fade-in duration-300"><div className="bg-slate-800 rounded-3xl border border-red-900/50 shadow-2xl w-full max-md overflow-hidden"><div className="p-8 text-center space-y-6"><div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto border border-red-500/30 shadow-lg shadow-red-900/20"><AlertTriangle className="text-red-500" size={40} /></div><div className="space-y-2"><h3 className="text-2xl font-black text-white">彻底清空案情档案?</h3><p className="text-slate-400 text-sm leading-relaxed px-4">该操作将永久删除所有未导出的本地图片和逻辑关联。</p></div><div className="flex flex-col gap-3 pt-4"><button onClick={handleResetArchive} className="w-full flex items-center justify-center gap-3 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black shadow-xl">确认清空并新建</button><button onClick={() => setShowClearConfirm(false)} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-2xl font-bold transition-all">取消</button></div></div></div></div>}
      
      {characterToDelete && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"><div className="bg-slate-800 rounded-2xl border border-red-900/50 shadow-2xl w-full max-sm animate-in zoom-in-95 duration-200 overflow-hidden"><div className="p-6 text-center"><div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30"><AlertTriangle className="text-red-500" size={32} /></div><h3 className="text-xl font-bold text-white mb-2">确认删除角色?</h3><div className="flex gap-3"><button onClick={() => setCharacterToDelete(null)} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold transition-all">取消</button><button onClick={handleDeleteCharacter} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-900/30 transition-all active:scale-95">确认删除</button></div></div></div></div>}
      
      {editingCharacter && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"><div className="bg-slate-800 rounded-3xl border border-slate-600 w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"><div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-900/50"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Users size={18} className="text-blue-400" />编辑人物档案</h3><button onClick={() => setEditingCharacter(null)} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full transition-colors"><X size={20}/></button></div><div className="p-8 space-y-6"><div className="flex flex-col items-center gap-4"><div onClick={() => charFileInputRef.current?.click()} className="w-24 h-24 rounded-full border-2 border-dashed border-slate-600 bg-slate-900/50 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-all overflow-hidden relative group"><input type="file" ref={charFileInputRef} className="hidden" accept="image/*" onChange={handleCharImageUpload} />{isCharImageLoading ? <Loader2 className="animate-spin text-blue-500" size={24} /> : editingCharacter.imageId ? <><img src={blobUrls[editingCharacter.imageId]} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera size={20} className="text-white" /></div></> : <div className="flex flex-col items-center text-slate-500 group-hover:text-blue-400"><Camera size={24} /><span className="text-[10px] mt-1 font-bold">上传照片</span></div>}</div><span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">点击更新人物头像</span></div><div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">姓名</label><input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={editingCharacter.name} onChange={e => setEditingCharacter({...editingCharacter, name: e.target.value})} /></div><div className="space-y-1.5"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">身份标签</label><input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500" value={editingCharacter.isVirtual ? '虚拟占位人物' : (editingCharacter.raw_info || '')} disabled={editingCharacter.isVirtual} onChange={e => setEditingCharacter({...editingCharacter, raw_info: e.target.value})} /></div></div><div className="space-y-1.5"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">人物笔记</label><textarea className="w-full h-32 bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" value={editingCharacter.note || ''} onChange={e => setEditingCharacter({...editingCharacter, note: e.target.value})} /></div><div className="flex justify-end gap-3 pt-4"><button onClick={() => setEditingCharacter(null)} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-bold transition-colors">取消</button><button onClick={() => { setState(p => ({ ...p, characters: (p.characters || []).map(c => c.id === editingCharacter.id ? editingCharacter : c) })); setEditingCharacter(null); }} className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-2.5 rounded-xl font-black text-sm transition-all shadow-xl active:scale-95">确认存档</button></div></div></div></div>}
    </div>
  );
};

export default App;
