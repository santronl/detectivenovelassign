
import React, { useState, useEffect, useMemo } from 'react';
import { Character } from '../types';
import { 
  X, 
  Check, 
  Settings2, 
  Type, 
  ChevronRight, 
  AlertCircle, 
  FileText, 
  Table,
  Fingerprint,
  GitMerge,
  List,
  ArrowDownLeft,
  Layout,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  RotateCcw,
  UserPlus,
  ArrowRight,
  Info,
  Split,
  ChevronDown,
  Users,
  Contact2
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (characters: Character[]) => void;
}

type TokenRole = 'ignore' | 'name' | 'note';
type ExtractionMode = 'normal' | 'genealogy';

interface BlockMapping {
    index: number;
    role: TokenRole;
}

// 扩展本地 Character 类型以携带原始行信息
interface ExtractedCharacter extends Character {
  _sourceLineText?: string;
}

const DataExtractor: React.FC<Props> = ({ isOpen, onClose, onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [rawText, setRawText] = useState("");
  
  // 待处理的原始行池
  const [linePool, setLinePool] = useState<{id: string, text: string}[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  
  // 已暂存的角色（来自多轮提取）
  const [stagedCharacters, setStagedCharacters] = useState<ExtractedCharacter[]>([]);
  
  // 分隔符配置
  const [delimiterType, setDelimiterType] = useState<'auto' | 'custom'>('auto');
  const [customDelimiter, setCustomDelimiter] = useState("");

  // 当前轮次的解析配置
  const [mode, setMode] = useState<ExtractionMode>('normal');
  const [mappings, setMappings] = useState<BlockMapping[]>([]);

  // 1. 初始化行池
  useEffect(() => {
    if (step === 1 && rawText) {
        const lines = rawText.split('\n')
            .filter(l => l.trim().length > 0)
            .map(l => ({ id: crypto.randomUUID(), text: l }));
        setLinePool(lines);
    }
  }, [rawText, step]);

  const getBlocks = (line: string) => {
    const indentMatch = line.match(/^([ \t　]+)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const content = line.trim();
    if (!content) return [];

    let parts: string[];
    if (delimiterType === 'custom' && customDelimiter) {
        parts = content.split(customDelimiter).map(p => p.trim());
    } else {
        parts = content.split(/[ \t　]+/).map(p => p.trim());
    }
    
    return indent ? ["", ...parts] : parts;
  };

  const selectedLines = useMemo(() => 
    linePool.filter(l => selectedLineIds.has(l.id)), 
    [linePool, selectedLineIds]
  );

  const templateBlocks = useMemo(() => {
    if (selectedLines.length === 0) return [];
    const firstNormal = selectedLines.find(l => !/^[ \t　]/.test(l.text)) || selectedLines[0];
    return getBlocks(firstNormal.text);
  }, [selectedLines, delimiterType, customDelimiter]);

  useEffect(() => {
    if (templateBlocks.length > 0) {
        setMappings(templateBlocks.map((_, i) => ({
            index: i,
            role: i === 0 ? 'name' : (i === 1 ? 'name' : (i === 2 ? 'note' : 'ignore'))
        })));
    }
  }, [templateBlocks]);

  const cycleRole = (index: number) => {
    setMappings(prev => prev.map(m => {
        if (m.index !== index) return m;
        const roles: TokenRole[] = ['ignore', 'name', 'note'];
        const nextRole = roles[(roles.indexOf(m.role) + 1) % roles.length];
        return { ...m, role: nextRole };
    }));
  };

  const currentBatchResults = useMemo(() => {
    if (selectedLines.length === 0) return [];
    
    const results: ExtractedCharacter[] = [];
    let currentSurname = "";

    selectedLines.forEach((lineObj) => {
        const line = lineObj.text;
        const blocks = getBlocks(line);
        const isIndented = /^[ \t　]/.test(line);
        
        let nameParts: string[] = [];
        let noteParts: string[] = [];

        mappings.forEach(m => {
            const val = blocks[m.index] || "";
            if (m.role === 'name' && val) nameParts.push(val);
            if (m.role === 'note' && val) noteParts.push(val);
        });

        if (nameParts.length > 0 || noteParts.length > 0) {
            let fullName = nameParts.join("");
            if (mode === 'genealogy') {
                if (!isIndented) {
                    const firstPart = nameParts[0] || "";
                    currentSurname = firstPart.length > 2 ? firstPart.substring(0, 2) : firstPart;
                } else if (isIndented && currentSurname) {
                    if (!fullName.includes(currentSurname)) fullName = currentSurname + fullName;
                }
            }
            if (fullName) {
                results.push({ 
                    id: crypto.randomUUID(), 
                    name: fullName, 
                    note: noteParts.join(" ") || undefined,
                    _sourceLineText: line 
                });
            }
        }
    });
    return results;
  }, [selectedLines, mappings, mode, delimiterType, customDelimiter]);

  const handleStageCurrentBatch = () => {
    if (currentBatchResults.length === 0) return;
    setStagedCharacters(prev => [...prev, ...currentBatchResults]);
    setLinePool(prev => prev.filter(l => !selectedLineIds.has(l.id)));
    setSelectedLineIds(new Set());
  };

  const handleRemoveStaged = (index: number) => {
    const charToRemove = stagedCharacters[index];
    if (charToRemove._sourceLineText) {
        const restoredLine = { id: crypto.randomUUID(), text: charToRemove._sourceLineText };
        setLinePool(prev => [restoredLine, ...prev]);
    }
    setStagedCharacters(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleComplete = () => {
    const finalCharacters = stagedCharacters.map(({ _sourceLineText, ...char }) => char);
    onComplete(finalCharacters);
    setRawText("");
    setLinePool([]);
    setStagedCharacters([]);
    setStep(1);
    onClose();
  };

  const toggleLine = (id: string) => {
    setSelectedLineIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-800 rounded-[40px] border border-slate-700 shadow-2xl w-full max-w-7xl flex flex-col h-[90vh] overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-indigo-600 rounded-xl shadow-lg">
              <UserPlus className="text-white" size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">人物名录提取助手</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Character Roster Extraction Tool</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-full border border-slate-700">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">待同步人数:</span>
                <span className="text-sm font-black text-indigo-400">{stagedCharacters.length}</span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {step === 1 ? (
            <div className="flex-1 p-10 flex flex-col gap-6 items-center justify-center animate-in fade-in slide-in-from-bottom-4">
              <div className="w-full max-w-2xl space-y-4">
                <div className="flex items-center gap-3 text-indigo-400">
                  <Contact2 size={20} />
                  <span className="text-sm font-black uppercase tracking-tighter">第一步：粘贴人物列表或关系表</span>
                </div>
                <div className="bg-slate-900 rounded-[32px] p-6 border border-slate-700 shadow-inner">
                  <textarea 
                    autoFocus
                    className="w-full h-80 bg-transparent text-slate-200 text-sm font-mono focus:outline-none resize-none custom-scrollbar leading-relaxed"
                    placeholder="在这里粘贴小说的人物介绍、家族名单或角色关系表...&#10;示例：&#10;金田一耕助 —— 名侦探，头脑聪明。&#10;古馆恭三 —— 律师，犬神家遗产管理人。"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                  />
                </div>
                <button 
                  disabled={!rawText.trim()}
                  onClick={() => setStep(2)}
                  className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-3xl font-black text-lg shadow-xl transition-all"
                >
                  进入解析与映射模式 <ChevronRight className="inline ml-2" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Left: Line Pool Picker */}
              <div className="w-1/4 border-r border-slate-700 flex flex-col bg-slate-900/20">
                <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/40">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">原始行池 ({linePool.length})</span>
                    <div className="flex gap-2">
                        <button onClick={() => setSelectedLineIds(new Set(linePool.map(l => l.id)))} className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300">全选</button>
                        <button onClick={() => setSelectedLineIds(new Set())} className="text-[9px] font-bold text-slate-500">清除</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {linePool.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 p-10 text-center italic">
                            <CheckCircle2 size={40} className="mb-2" />
                            <p className="text-xs">该批次已处理</p>
                        </div>
                    ) : (
                        linePool.map(line => {
                            const isIndented = /^[ \t　]/.test(line.text);
                            return (
                                <div 
                                    key={line.id} 
                                    onClick={() => toggleLine(line.id)}
                                    className={`p-3 rounded-xl text-[11px] font-mono border cursor-pointer transition-all group relative overflow-hidden
                                        ${selectedLineIds.has(line.id) ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-100' : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:bg-slate-800'}
                                    `}
                                >
                                    <div className="flex items-center gap-2">
                                        {isIndented && <ArrowDownLeft size={10} className="text-slate-600" />}
                                        <span className="truncate pr-6">{line.text}</span>
                                    </div>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {selectedLineIds.has(line.id) ? <CheckCircle2 size={12} className="text-indigo-500" /> : <Circle size={12} className="text-slate-700 group-hover:text-slate-500" />}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
              </div>

              {/* Middle: Config & Extract */}
              <div className="flex-1 flex flex-col border-r border-slate-700 bg-slate-800/20">
                <div className="p-5 border-b border-slate-700 bg-slate-900/40">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">提取逻辑配置</span>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
                    {selectedLines.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-10 animate-pulse">
                            <ArrowRight size={48} className="mb-4 opacity-20" />
                            <p className="text-sm font-bold">请从左侧行池中勾选人物行</p>
                            <p className="text-xs mt-2 opacity-50">建议一次只处理格式相同的文本行（如：名录中的主要人物）</p>
                        </div>
                    ) : (
                        <>
                            {/* Mode Selection */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">排版模式</span>
                                    {mode === 'genealogy' && (
                                        <div className="flex items-center gap-1.5 text-[9px] text-purple-400 font-bold bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/30 animate-in fade-in">
                                            <Info size={10} /> 说明：识别首行为姓氏，缩进子行将自动补齐该姓氏。
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => setMode('normal')} className={`p-4 rounded-2xl border-2 text-left transition-all group ${mode === 'normal' ? 'bg-indigo-600/10 border-indigo-500 shadow-lg shadow-indigo-900/20' : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'}`}>
                                        <div className="flex items-center gap-3 mb-1"><Users size={18} className={mode === 'normal' ? 'text-indigo-400' : 'text-slate-600 group-hover:text-indigo-300'} /><span className="text-sm font-black">标准人物表</span></div>
                                        <p className="text-[10px] text-slate-500">每一行都是独立的角色（如：侦探、助手、律师）。</p>
                                    </button>
                                    <button onClick={() => setMode('genealogy')} className={`p-4 rounded-2xl border-2 text-left transition-all group ${mode === 'genealogy' ? 'bg-purple-600/10 border-purple-500 shadow-lg shadow-purple-900/20' : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'}`}>
                                        <div className="flex items-center gap-3 mb-1"><GitMerge size={18} className={mode === 'genealogy' ? 'text-purple-400' : 'text-slate-600 group-hover:text-purple-300'} /><span className="text-sm font-black">家族/谱系表</span></div>
                                        <p className="text-[10px] text-slate-500">适用于通过缩进展示的横沟正史风格大家族名单。</p>
                                    </button>
                                </div>
                            </div>

                            {/* Delimiter Config */}
                            <div className="space-y-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">列分割符号设定</span>
                                <div className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-2xl border border-slate-700">
                                    <div className="flex bg-slate-950 p-1 rounded-xl">
                                        <button onClick={() => setDelimiterType('auto')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${delimiterType === 'auto' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>智能空白</button>
                                        <button onClick={() => setDelimiterType('custom')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${delimiterType === 'custom' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>自定义符号</button>
                                    </div>
                                    {delimiterType === 'custom' && (
                                        <div className="flex-1 relative animate-in slide-in-from-left-2">
                                            <Split className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                                            <input 
                                                value={customDelimiter}
                                                onChange={(e) => setCustomDelimiter(e.target.value)}
                                                placeholder="输入符号, 如 '——' 或 ':'..."
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Column Mapping */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">指认字段含义（点击切换）</span>
                                </div>
                                <div className="flex flex-wrap gap-3 p-6 bg-slate-900 rounded-2xl border border-slate-700 shadow-inner">
                                    {templateBlocks.map((block, idx) => {
                                        const role = mappings.find(m => m.index === idx)?.role || 'ignore';
                                        return (
                                            <button 
                                                key={idx} 
                                                onClick={() => cycleRole(idx)} 
                                                className={`px-5 py-3 rounded-2xl border transition-all flex flex-col items-center gap-2 group/col ${role === 'name' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-100' : role === 'note' ? 'bg-amber-600/20 border-amber-500 text-amber-100' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'}`}
                                            >
                                                <div className="text-[9px] uppercase font-black opacity-50 tracking-tighter">列 {idx + 1}</div>
                                                <span className="font-mono text-xs font-black truncate max-w-[100px]">{block || '(空)'}</span>
                                                <div className={`text-[10px] font-black px-2 py-0.5 rounded shadow-sm transition-all ${role === 'name' ? 'bg-indigo-500 text-white' : role === 'note' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-400 group-hover/col:text-slate-200'}`}>
                                                    {role === 'name' ? '识别人名' : role === 'note' ? '识别简介' : '跳过此列'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Batch Preview */}
                            <div className="space-y-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">本次提取结果预览 (共 {currentBatchResults.length} 位)</span>
                                <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-y-auto max-h-64 custom-scrollbar divide-y divide-slate-800/50 shadow-inner">
                                    {currentBatchResults.length === 0 ? (
                                        <div className="p-10 text-center italic text-slate-600 text-xs">请配置正确的字段映射</div>
                                    ) : (
                                        currentBatchResults.map((char, i) => (
                                            <div key={i} className="px-5 py-3 flex items-center justify-between text-xs animate-in fade-in slide-in-from-left-1" style={{ animationDelay: `${i * 20}ms` }}>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                                    <span className="font-black text-indigo-100">{char.name}</span>
                                                </div>
                                                <span className="text-slate-500 italic truncate max-w-[250px] font-medium">{char.note || '-'}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 border-t border-slate-700 bg-slate-900/50">
                    <button 
                        disabled={currentBatchResults.length === 0}
                        onClick={handleStageCurrentBatch}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-[24px] font-black text-sm shadow-xl shadow-indigo-900/30 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                        <Plus size={20} /> 存入下方同步队列
                    </button>
                </div>
              </div>

              {/* Right: Final Staged Review */}
              <div className="w-1/4 flex flex-col bg-slate-900/40">
                <div className="p-5 border-b border-slate-700 bg-slate-900/40 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Users size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">待同步角色预览</span>
                    </div>
                    <button 
                        onClick={() => { setLinePool(prev => [...prev, ...rawText.split('\n').filter(l => l.trim().length > 0).map(l => ({id: crypto.randomUUID(), text: l}))]); setStagedCharacters([]); }} 
                        className="p-1.5 text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1 group" 
                        title="清空当前同步队列"
                    >
                        <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-950/20 shadow-inner">
                    {stagedCharacters.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-10 text-center grayscale">
                            <Users size={48} className="mb-3" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-center">队列为空<br/>请从左侧开始提取</p>
                        </div>
                    ) : (
                        stagedCharacters.map((char, i) => (
                            <div key={i} className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700 relative group shadow-sm hover:border-emerald-500/30 transition-all animate-in zoom-in-95">
                                <div className="text-[11px] font-black text-white">{char.name}</div>
                                {char.note && <div className="text-[10px] text-slate-500 truncate mt-1 leading-tight">{char.note}</div>}
                                <button 
                                    onClick={() => handleRemoveStaged(i)}
                                    className="absolute -top-1.5 -right-1.5 p-1.5 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110 active:scale-90"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
                <div className="p-5 border-t border-slate-700 bg-slate-900/80">
                    <button 
                        disabled={stagedCharacters.length === 0}
                        onClick={handleComplete}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white rounded-2xl font-black text-xs shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                        <Fingerprint size={18} /> 确认并录入人物志 ({stagedCharacters.length})
                    </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataExtractor;
