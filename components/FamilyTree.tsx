
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Character, FamilyLink } from '../types';
import { User, Heart, ArrowDown, ArrowUp, Maximize, Minimize, GitBranch, X, UserMinus, MousePointer2, UserRoundPlus, ChevronLeft, ChevronRight, Hash, GripHorizontal, Crosshair, Link2, Edit3, HelpCircle, MousePointer, MoveHorizontal } from 'lucide-react';

interface Props {
  characters: Character[];
  activeCharIds: string[];
  familyLinks: FamilyLink[];
  customOrder: Record<string, string[]>;
  blobUrls: Record<string, string>;
  onAddFamilyLink: (link: FamilyLink) => void;
  onUpdateFamilyLink?: (link: FamilyLink) => void;
  onRemoveFamilyLink: (linkId: string) => void;
  onAddActiveChar: (charId: string) => void;
  onRemoveActiveChar: (charId: string) => void;
  onAddVirtualChar: (name: string) => void;
  onUpdateCustomOrder: (order: Record<string, string[]>) => void;
}

const CARD_WIDTH = 160;
const CARD_HEIGHT = 80;
const HORIZONTAL_SPACING = 160;
const VERTICAL_SPACING = 240;
const BORDER_RADIUS = 12; // 用于连线转角的圆角半径

const LINEAGE_COLORS = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#f43f5e', // Rose
    '#84cc16', // Lime
    '#0ea5e9', // Sky
];

const FamilyTree: React.FC<Props> = ({ 
    characters, activeCharIds, familyLinks, customOrder, blobUrls,
    onAddFamilyLink, onUpdateFamilyLink, onRemoveFamilyLink, onAddActiveChar, onRemoveActiveChar,
    onAddVirtualChar, onUpdateCustomOrder
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.8 });
    const [isExpanded, setIsExpanded] = useState(false);
    const [dropTarget, setDropTarget] = useState<{ id: string, zone: 'parent' | 'spouse' | 'child_single' | 'marriage_joint' | 'other_relation' } | null>(null);
    const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
    const [isAddingVirtual, setIsAddingVirtual] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [virtualName, setVirtualName] = useState("");
    
    // 关系标签编辑状态
    const [editingLink, setEditingLink] = useState<FamilyLink | null>(null);
    const [tempLinkLabel, setTempLinkLabel] = useState("");

    const visibleCharacters = useMemo(() => {
        const activeSet = new Set(activeCharIds);
        return characters.filter(c => activeSet.has(c.id));
    }, [characters, activeCharIds]);

    const visibleLinks = useMemo(() => {
        const charIds = new Set(visibleCharacters.map(c => c.id));
        return familyLinks.filter(l => {
            if (l.type === 'marriage' || l.type === 'other_same_level') {
                return (l.partners || []).every(p => charIds.has(p));
            }
            if (l.type === 'parent_child') {
                const parentsOk = (l.parents || []).every(p => charIds.has(p));
                const childOk = l.child && charIds.has(l.child);
                return parentsOk && childOk;
            }
            return false;
        });
    }, [visibleCharacters, familyLinks]);

    const childGroups = useMemo(() => {
        const groups: Record<string, { parents: string[], children: { childId: string, linkId: string }[] }> = {};
        visibleLinks.filter(l => l.type === 'parent_child').forEach(l => {
            const parentKey = (l.parents || []).sort().join(',');
            if (!groups[parentKey]) {
                groups[parentKey] = { parents: l.parents || [], children: [] };
            }
            if (l.child) {
                groups[parentKey].children.push({ childId: l.child, linkId: l.id });
            }
        });

        const result = Object.values(groups);
        result.forEach(group => {
            const parentKey = group.parents.sort().join(',');
            const order = customOrder[parentKey];
            if (order) {
                group.children.sort((a, b) => {
                    const idxA = order.indexOf(a.childId);
                    const idxB = order.indexOf(b.childId);
                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }
        });
        return result;
    }, [visibleLinks, customOrder]);

    const relatedEntityIds = useMemo(() => {
        if (!hoveredCharId) return null;
        const related = new Set<string>([hoveredCharId]);
        visibleLinks.forEach(l => {
            if ((l.partners || []).includes(hoveredCharId)) {
                (l.partners || []).forEach(p => related.add(p));
                related.add(l.id);
            }
            if ((l.parents || []).includes(hoveredCharId) || l.child === hoveredCharId) {
                (l.parents || []).forEach(p => related.add(p));
                if (l.child) related.add(l.child);
                related.add(l.id);
            }
        });
        return related;
    }, [hoveredCharId, visibleLinks]);

    const layoutData = useMemo(() => {
        if (visibleCharacters.length === 0) return { nodePositions: {}, nodeOrder: {}, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
        const nodePositions: Record<string, { x: number, y: number }> = {};
        const nodeOrder: Record<string, number> = {};
        const generations: Record<string, number> = {};
        const charIds = visibleCharacters.map(c => c.id);
        
        charIds.forEach(id => generations[id] = 0);

        let changed = true;
        let iteration = 0;
        const MAX_ITERATIONS = 50;

        while (changed && iteration < MAX_ITERATIONS) {
            changed = false;
            iteration++;
            visibleLinks.filter(l => l.type === 'parent_child').forEach(l => {
                const parents = l.parents || [];
                const child = l.child;
                if (child) {
                    const maxParentGen = parents.length > 0 ? Math.max(...parents.map(p => generations[p] || 0)) : -1;
                    if (generations[child] < maxParentGen + 1) {
                        generations[child] = maxParentGen + 1;
                        changed = true;
                    }
                }
            });
            visibleLinks.filter(l => l.type === 'marriage' || l.type === 'other_same_level').forEach(l => {
                const partners = l.partners || [];
                if (partners.length === 2) {
                    const g1 = generations[partners[0]];
                    const g2 = generations[partners[1]];
                    if (g1 !== g2) {
                        const max = Math.max(g1, g2);
                        generations[partners[0]] = max;
                        generations[partners[1]] = max;
                        changed = true;
                    }
                }
            });
        }

        const nodesByGen: Record<number, string[]> = {};
        Object.entries(generations).forEach(([id, g]) => {
            if (!nodesByGen[g]) nodesByGen[g] = [];
            nodesByGen[g].push(id);
        });

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        const sortedGenKeys = Object.keys(nodesByGen).map(Number).sort((a, b) => a - b);
        sortedGenKeys.forEach(g => {
            const ids = nodesByGen[g];
            const remaining = new Set(ids);
            let allInGen: string[] = [];

            if (g === 0) {
                const rootOrder = customOrder['roots'] || [];
                allInGen = [...rootOrder].filter(id => remaining.has(id));
                ids.forEach(id => { if (!allInGen.includes(id)) allInGen.push(id); });
            } else {
                const preSortedFromParents: string[] = [];
                const sortedChildGroups = [...childGroups].sort((a, b) => {
                    const avgXa = a.parents.reduce((acc, p) => acc + (nodePositions[p]?.x || 0), 0) / (a.parents.length || 1);
                    const avgXb = b.parents.reduce((acc, p) => acc + (nodePositions[p]?.x || 0), 0) / (b.parents.length || 1);
                    return avgXa - avgXb;
                });
                sortedChildGroups.forEach(group => {
                    group.children.forEach(c => {
                        if (remaining.has(c.childId)) {
                            preSortedFromParents.push(c.childId);
                            remaining.delete(c.childId);
                        }
                    });
                });
                allInGen = [...preSortedFromParents, ...Array.from(remaining)];
            }

            const genSet = new Set(allInGen);
            const processedInGen = new Set<string>();
            const groupedAllInGen: string[] = [];

            allInGen.forEach(id => {
                if (processedInGen.has(id)) return;
                const partners = visibleLinks
                    .filter(l => (l.type === 'marriage' || l.type === 'other_same_level') && (l.partners || []).includes(id))
                    .map(l => (l.partners || []).find(p => p !== id))
                    .filter(p => p && genSet.has(p)) as string[];

                if (partners.length === 0) {
                    groupedAllInGen.push(id);
                    processedInGen.add(id);
                } else {
                    const hub = id;
                    const p1 = partners[0];
                    const others = partners.slice(1);
                    groupedAllInGen.push(p1, hub, ...others);
                    processedInGen.add(hub);
                    partners.forEach(p => processedInGen.add(p));
                }
            });

            const rowWidth = (groupedAllInGen.length - 1) * (CARD_WIDTH + HORIZONTAL_SPACING);
            groupedAllInGen.forEach((id, i) => {
                const x = (i * (CARD_WIDTH + HORIZONTAL_SPACING)) - (rowWidth / 2);
                const y = g * VERTICAL_SPACING;
                nodePositions[id] = { x, y };
                nodeOrder[id] = i;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x + CARD_WIDTH);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y + CARD_HEIGHT);
            });
        });

        if (minX === Infinity) return { nodePositions: {}, nodeOrder: {}, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
        return { nodePositions, nodeOrder, bounds: { minX, maxX, minY, maxY } };
    }, [visibleCharacters, visibleLinks, childGroups, customOrder]);

    const fitToView = useCallback((animate = true) => {
        if (!svgRef.current || !containerRef.current || visibleCharacters.length === 0) return;
        const { minX, maxX, minY, maxY } = layoutData.bounds;
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        if (graphWidth === 0 || graphHeight === 0) return;
        const padding = 80;
        const scaleX = (containerWidth - padding * 2) / graphWidth;
        const scaleY = (containerHeight - padding * 2) / graphHeight;
        const k = Math.min(scaleX, scaleY, 1.2); 
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const tx = containerWidth / 2 - centerX * k;
        const ty = containerHeight / 2 - centerY * k;
        const svg = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 5]);
        if (animate) {
            svg.transition().duration(750).call(zoomBehavior.transform as any, d3.zoomIdentity.translate(tx, ty).scale(k));
        } else {
            svg.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(tx, ty).scale(k));
        }
    }, [layoutData, visibleCharacters]);

    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 5])
            .on("zoom", (e) => setTransform({ x: e.transform.x, y: e.transform.y, k: e.transform.k }));
        svg.call(zoomBehavior);
        fitToView(false);
    }, [visibleCharacters.length, fitToView]);

    useEffect(() => {
        const timer = setTimeout(() => fitToView(true), 400);
        return () => clearTimeout(timer);
    }, [isExpanded, fitToView]);

    const handleMoveNode = (charId: string, direction: 'left' | 'right') => {
        const parentGroup = childGroups.find(g => g.children.some(c => c.childId === charId));
        if (parentGroup) {
            const parentKey = parentGroup.parents.sort().join(',');
            const currentOrder = parentGroup.children.map(c => c.childId);
            const idx = currentOrder.indexOf(charId);
            const newOrder = [...currentOrder];
            if (direction === 'left' && idx > 0) [newOrder[idx], newOrder[idx-1]] = [newOrder[idx-1], newOrder[idx]];
            else if (direction === 'right' && idx < newOrder.length - 1) [newOrder[idx], newOrder[idx+1]] = [newOrder[idx+1], newOrder[idx]];
            else return;
            onUpdateCustomOrder({ ...customOrder, [parentKey]: newOrder });
            return;
        }
        const roots = visibleCharacters.filter(c => !visibleLinks.some(l => l.type === 'parent_child' && l.child === c.id)).map(c => c.id);
        if (roots.includes(charId)) {
            const currentRootOrder = customOrder['roots'] || roots;
            let baseOrder = [...currentRootOrder].filter(r => roots.includes(r));
            roots.forEach(r => { if (!baseOrder.includes(r)) baseOrder.push(r); });
            const idx = baseOrder.indexOf(charId);
            const newOrder = [...baseOrder];
            if (direction === 'left' && idx > 0) [newOrder[idx], newOrder[idx-1]] = [newOrder[idx-1], newOrder[idx]];
            else if (direction === 'right' && idx < newOrder.length - 1) [newOrder[idx], newOrder[idx+1]] = [newOrder[idx+1], newOrder[idx]];
            else return;
            onUpdateCustomOrder({ ...customOrder, ['roots']: newOrder });
        }
    };

    const handleConfirmVirtual = () => {
        if (!virtualName.trim()) return;
        onAddVirtualChar(virtualName.trim());
        setVirtualName("");
        setIsAddingVirtual(false);
    };

    const handleDropOnPerson = (e: React.DragEvent, targetId: string, zone: 'parent' | 'spouse' | 'child_single' | 'other_relation') => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
        if (ids.length === 0) return;
        const sourceId = ids[0];
        if (sourceId === targetId) return;
        onAddActiveChar(sourceId);
        if (zone === 'spouse') {
            const exists = familyLinks.some(l => l.type === 'marriage' && (l.partners || []).includes(targetId) && (l.partners || []).includes(sourceId));
            if (!exists) onAddFamilyLink({ id: crypto.randomUUID(), type: 'marriage', partners: [targetId, sourceId] });
        } else if (zone === 'other_relation') {
            const exists = familyLinks.some(l => l.type === 'other_same_level' && (l.partners || []).includes(targetId) && (l.partners || []).includes(sourceId));
            if (!exists) onAddFamilyLink({ id: crypto.randomUUID(), type: 'other_same_level', partners: [targetId, sourceId], label: '自定义关系' });
        } else if (zone === 'parent') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [sourceId], child: targetId });
        } else if (zone === 'child_single') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [targetId], child: sourceId });
        }
        if (ids.length > 1) ids.slice(1).forEach((id:string) => onAddActiveChar(id));
    };

    const handleDropOnMarriage = (e: React.DragEvent, linkId: string) => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
        const link = familyLinks.find(l => l.id === linkId);
        if (ids.length === 0 || !link || !link.partners) return;
        const sourceId = ids[0];
        onAddActiveChar(sourceId);
        onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [link.partners[0], link.partners[1]], child: sourceId });
        if (ids.length > 1) ids.slice(1).forEach((id:string) => onAddActiveChar(id));
    };

    const handleUpdateLinkLabel = () => {
        if (editingLink && onUpdateFamilyLink) {
            onUpdateFamilyLink({ ...editingLink, label: tempLinkLabel.trim() });
        }
        setEditingLink(null);
    };

    /**
     * 生成带有圆角的正交连接路径
     */
    const generateRoundedPath = (x1: number, y1: number, x2: number, y2: number, midY: number) => {
        const r = BORDER_RADIUS;
        const isXRight = x2 > x1;
        
        // 如果 X 轴位移很小，直接画直线
        if (Math.abs(x2 - x1) < r * 2) {
            return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
        }

        return `
            M ${x1} ${y1}
            L ${x1} ${midY - r}
            Q ${x1} ${midY} ${x1 + (isXRight ? r : -r)} ${midY}
            L ${x2 - (isXRight ? r : -r)} ${midY}
            Q ${x2} ${midY} ${x2} ${midY + r}
            L ${x2} ${y2}
        `;
    };

    return (
        <div 
            ref={containerRef}
            className={`relative flex flex-col transition-all overflow-hidden border border-slate-800 rounded-3xl
                ${isExpanded ? 'fixed inset-0 z-[1000] bg-slate-950 p-6 !rounded-none !border-none' : 'h-full min-h-[650px] bg-slate-900/20'}`}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
                e.preventDefault();
                const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
                ids.forEach((id:string) => onAddActiveChar(id));
            }}
        >
            <div className="absolute top-6 left-6 z-20 pointer-events-none flex flex-col gap-2">
                <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3 pointer-events-auto">
                    <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg"><GitBranch size={16} className="text-white" /></div>
                    <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">高级谱系排版视图</h3>
                        <p className="text-[9px] text-slate-500 font-bold italic">每一层级代表一代。点击关系节点可自定义标签内容。</p>
                    </div>
                </div>
            </div>

            <div className="absolute top-6 right-6 z-20 flex gap-2">
                <button onClick={() => fitToView()} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95" title="自适应视图中心">
                    <Crosshair size={20} />
                </button>
                <button onClick={() => setIsAddingVirtual(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl border border-slate-700 shadow-xl transition-all font-bold text-xs active:scale-95">
                    <UserRoundPlus size={16} /> 添加占位符
                </button>
                <button onClick={() => setIsGuideOpen(true)} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95" title="操作指南">
                    <HelpCircle size={20} />
                </button>
                <button onClick={() => setIsExpanded(!isExpanded)} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95">
                    {isExpanded ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
            </div>

            {isAddingVirtual && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <UserRoundPlus size={18} className="text-indigo-400" /> 创建虚拟节点
                        </h3>
                        <input 
                            autoFocus value={virtualName} onChange={e => setVirtualName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleConfirmVirtual()}
                            placeholder="如：未知父亲" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setIsAddingVirtual(false)} className="flex-1 py-3 text-xs text-slate-400 font-bold border border-slate-700 rounded-xl">取消</button>
                            <button onClick={handleConfirmVirtual} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg">确认创建</button>
                        </div>
                    </div>
                </div>
            )}

            {isGuideOpen && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 w-full max-w-3xl shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-600 rounded-xl shadow-lg"><HelpCircle className="text-white" size={24} /></div>
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">家族谱系图操作指南</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Genealogy Tree User Guide</p>
                                </div>
                            </div>
                            <button onClick={() => setIsGuideOpen(false)} className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"><X size={24}/></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-4">
                            <section className="space-y-4">
                                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><MousePointer size={14}/> 1. 添加人物到视图</h4>
                                <p className="text-sm text-slate-300 leading-relaxed">从左侧侧边栏中勾选人物，或直接按住侧边栏的人物卡片<strong>拖拽</strong>到谱系图空白处。已在图中的人物会变灰无法重复添加。</p>
                             section>

                            <section className="space-y-4">
                                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><GitBranch size={14}/> 2. 建立血缘/社会关系</h4>
                                <p className="text-sm text-slate-300 leading-relaxed">将左侧的人物卡片<strong>拖拽并悬停</strong>到视图中已有人物卡片的特定感应区：</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-2">
                                        <div className="flex items-center gap-2 text-indigo-300 font-black text-[11px]"><ArrowDown size={12}/> 顶部 - 设为父母</div>
                                        <p className="text-[10px] text-slate-500">将拖拽的人物识别为目标人物的长辈。</p>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-2">
                                        <div className="flex items-center gap-2 text-blue-300 font-black text-[11px]"><ArrowUp size={12}/> 底部 - 设为子女</div>
                                        <p className="text-[10px] text-slate-500">将拖拽的人物识别为目标人物的后代。</p>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-2">
                                        <div className="flex items-center gap-2 text-pink-300 font-black text-[11px]"><Heart size={12}/> 两侧边缘 - 登记配偶</div>
                                        <p className="text-[10px] text-slate-500">两人将对齐在同一代水平线上，产生婚姻连线。</p>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-2">
                                        <div className="flex items-center gap-2 text-indigo-300 font-black text-[11px]"><Link2 size={12}/> 两侧内侧 - 其他关系</div>
                                        <p className="text-[10px] text-slate-500">用于建立非婚姻的同级关系，如好友或对手。</p>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><Edit3 size={14}/> 3. 连线与标签编辑</h4>
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    • <strong>点击</strong>婚姻或通用关系线中心的图标（心形/连接符）可以修改该关系的<strong>名称标签</strong>或删除该条连线。<br/>
                                    • <strong>拖拽</strong>人物至两个配偶之间的连线中心点，可将该人物设为两人的<strong>共同子女</strong>。
                                </p>
                            </section>

                            <section className="space-y-4">
                                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"><MoveHorizontal size={14}/> 4. 布局微调</h4>
                                <p className="text-sm text-slate-300 leading-relaxed">
                                    • <strong>左右移动</strong>：悬停卡片会出现箭头按钮，可调整同辈节点之间的左右顺序。<br/>
                                    • <strong>虚拟节点</strong>：点击右上角添加占位符，用于代表“死者”或“未出现但存在的家族成员”。
                                </p>
                            </section>
                        </div>

                        <div className="pt-6 border-t border-slate-700 mt-6 bg-slate-800/50">
                            <button onClick={() => setIsGuideOpen(false)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-900/30 active:scale-[0.98] transition-all">我明白了</button>
                        </div>
                    </div>
                </div>
            )}

            {editingLink && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Edit3 size={18} className="text-blue-400" /> 自定义关系名称
                        </h3>
                        <input 
                            autoFocus value={tempLinkLabel} onChange={e => setTempLinkLabel(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateLinkLabel()}
                            placeholder="如：盟友、仇敌、情人..." 
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setEditingLink(null)} className="flex-1 py-3 text-xs text-slate-400 font-bold border border-slate-700 rounded-xl">取消</button>
                            <button onClick={handleUpdateLinkLabel} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg">确认修改</button>
                        </div>
                        <button onClick={() => { onRemoveFamilyLink(editingLink.id); setEditingLink(null); }} className="w-full mt-2 py-3 bg-red-900/20 text-red-400 border border-red-900/50 rounded-xl text-[10px] font-black uppercase hover:bg-red-900/40 transition-all">删除此关系</button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden relative">
                <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-auto">
                    <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>
                    <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                        {/* 婚姻/同级连线 */}
                        {visibleLinks.filter(l => l.type === 'marriage' || l.type === 'other_same_level').map(link => {
                            const p1Id = link.partners![0];
                            const p2Id = link.partners![1];
                            const p1 = layoutData.nodePositions[p1Id];
                            const p2 = layoutData.nodePositions[p2Id];
                            if (!p1 || !p2) return null;
                            const order1 = layoutData.nodeOrder[p1Id];
                            const order2 = layoutData.nodeOrder[p2Id];
                            const x1 = p1.x + CARD_WIDTH / 2;
                            const x2 = p2.x + CARD_WIDTH / 2;
                            const y = p1.y + CARD_HEIGHT / 2;
                            let midX;
                            const partnerGap = CARD_WIDTH + HORIZONTAL_SPACING;
                            if (Math.abs(order1 - order2) === 1) midX = (x1 + x2) / 2;
                            else midX = (x2 > x1) ? (x2 - partnerGap / 2) : (x2 + partnerGap / 2);

                            const isHighlighted = relatedEntityIds?.has(link.id);
                            const dim = !!hoveredCharId && !isHighlighted;
                            const color = link.type === 'marriage' ? "#f472b6" : "#6366f1";
                            
                            return (
                                <g key={link.id} style={{ opacity: dim ? 0.2 : 1 }} className="transition-opacity duration-300">
                                    <line x1={x1} y1={y} x2={x2} y2={y} stroke={isHighlighted ? color : "#4b5563"} strokeWidth={isHighlighted ? 4 : 2} strokeDasharray={isHighlighted ? "none" : "5,3"} filter={isHighlighted ? "url(#glow)" : ""} />
                                    <g 
                                        transform={`translate(${midX}, ${y})`}
                                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: link.id, zone: 'marriage_joint'}); }} 
                                        onDragLeave={() => setDropTarget(null)} 
                                        onDrop={e => handleDropOnMarriage(e, link.id)} 
                                        onClick={(e) => { e.stopPropagation(); setEditingLink(link); setTempLinkLabel(link.label || ''); }}
                                        className="cursor-pointer group/joint"
                                    >
                                        <circle r={18} fill={isHighlighted ? color : "#1e293b"} stroke={isHighlighted ? "white" : color} strokeWidth={1.5} className="transition-all duration-300 group-hover/joint:scale-110 shadow-lg" />
                                        <g transform="translate(-7, -7)" className="transition-transform duration-200" style={{ pointerEvents: 'none' }}>
                                            {link.type === 'marriage' ? <Heart size={14} className={isHighlighted ? "text-white" : "text-pink-500"} /> : <Link2 size={14} className={isHighlighted ? "text-white" : "text-indigo-400"} />}
                                        </g>
                                        {link.label && (
                                            <text 
                                                y={32} 
                                                textAnchor="middle" 
                                                fill={isHighlighted ? "white" : "#94a3b8"} 
                                                className="text-[10px] font-black uppercase tracking-tighter pointer-events-none"
                                            >
                                                {link.label}
                                            </text>
                                        )}
                                    </g>
                                </g>
                            );
                        })}

                        {/* 亲子连线 */}
                        {childGroups.map((group, gIdx) => {
                            let startX: number, startY: number;
                            const parentPositions = group.parents.map(pid => layoutData.nodePositions[pid]).filter(Boolean);
                            if (parentPositions.length === 0) return null;
                            
                            if (group.parents.length === 2) {
                                const p1Id = group.parents[0];
                                const p2Id = group.parents[1];
                                const link = visibleLinks.find(l => (l.type === 'marriage' || l.type === 'other_same_level') && (l.partners || []).includes(p1Id) && (l.partners || []).includes(p2Id));
                                const p1 = layoutData.nodePositions[p1Id];
                                const p2 = layoutData.nodePositions[p2Id];
                                const order1 = layoutData.nodeOrder[p1Id];
                                const order2 = layoutData.nodeOrder[p2Id];
                                const x1 = p1.x + CARD_WIDTH / 2;
                                const x2 = p2.x + CARD_WIDTH / 2;
                                if (Math.abs(order1 - order2) === 1) startX = (x1 + x2) / 2;
                                else startX = (x2 > x1) ? (x2 - (CARD_WIDTH + HORIZONTAL_SPACING) / 2) : (x2 + (CARD_WIDTH + HORIZONTAL_SPACING) / 2);
                                startY = p1.y + CARD_HEIGHT / 2;
                            } else {
                                const p = parentPositions[0]; startX = p.x + CARD_WIDTH / 2; startY = p.y + CARD_HEIGHT;
                            }
                            
                            const firstChildPos = layoutData.nodePositions[group.children[0]?.childId];
                            if (!firstChildPos) return null;
                            const parentBottomY = (group.parents.length === 2) ? (parentPositions[0].y + CARD_HEIGHT) : startY;
                            const childTopY = firstChildPos.y;
                            const midY = (parentBottomY + childTopY) / 2;
                            const lineageColor = LINEAGE_COLORS[gIdx % LINEAGE_COLORS.length];
                            const groupIsHighlighted = group.parents.some(p => hoveredCharId === p) || group.children.some(c => hoveredCharId === c.childId);
                            const dim = !!hoveredCharId && !groupIsHighlighted;

                            return (
                                <g key={`group-${gIdx}`} style={{ opacity: dim ? 0.1 : 1 }} className="transition-all duration-300">
                                    <line x1={startX} y1={startY} x2={startX} y2={midY} stroke={lineageColor} strokeWidth={groupIsHighlighted ? 3 : 2} />
                                    {group.children.map(child => {
                                        const cPos = layoutData.nodePositions[child.childId];
                                        if (!cPos) return null;
                                        const endX = cPos.x + CARD_WIDTH / 2;
                                        const isHighlighted = hoveredCharId === child.childId || groupIsHighlighted;
                                        return (
                                            <path 
                                                key={child.linkId}
                                                d={generateRoundedPath(startX, midY, endX, cPos.y, midY)}
                                                fill="none"
                                                stroke={lineageColor}
                                                strokeWidth={isHighlighted ? 3 : 2}
                                                strokeLinejoin="round"
                                                filter={isHighlighted ? "url(#glow)" : ""}
                                                className="transition-all duration-300"
                                            />
                                        );
                                    })}
                                </g>
                            );
                        })}
                    </g>
                </svg>

                <div className="absolute inset-0 pointer-events-none" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0' }}>
                    {visibleCharacters.map(char => {
                        const pos = layoutData.nodePositions[char.id];
                        if (!pos) return null;
                        const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                        const isHighlighted = relatedEntityIds?.has(char.id);
                        const dim = !!hoveredCharId && !isHighlighted;
                        
                        return (
                            <div 
                                key={char.id} 
                                className="absolute pointer-events-auto group/card" 
                                draggable 
                                onDragStart={(e) => {
                                    e.dataTransfer.setData("application/react-dnd-char-id", char.id);
                                    e.stopPropagation();
                                }}
                                onMouseEnter={() => setHoveredCharId(char.id)} 
                                onMouseLeave={() => setHoveredCharId(null)} 
                                style={{ left: pos.x, top: pos.y, width: CARD_WIDTH, height: CARD_HEIGHT, opacity: dim ? 0.3 : 1, transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                            >
                                <div className={`w-full h-full rounded-2xl border transition-all shadow-2xl flex items-center p-3 relative overflow-hidden z-10 cursor-grab active:cursor-grabbing 
                                    ${char.isVirtual ? 'border-slate-600 border-dashed bg-slate-900/60 grayscale' : isHighlighted ? 'border-indigo-400 bg-slate-700 ring-4 ring-indigo-500/20' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}
                                `}>
                                    <div className={`w-10 h-10 rounded-full border shrink-0 flex items-center justify-center overflow-hidden ${char.isVirtual ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-slate-700'}`}>
                                        {char.isVirtual ? <Hash size={16} className="text-slate-700" /> : portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover" /> : <User size={20} className="text-slate-600" />}
                                    </div>
                                    <div className="ml-3 flex flex-col truncate min-w-0">
                                        <span className={`text-[11px] font-black truncate ${char.isVirtual ? 'text-slate-500 italic' : 'text-white'}`}>{char.name}</span>
                                        <span className="text-[9px] text-slate-500 mt-0.5 truncate font-bold uppercase tracking-widest leading-none">{char.isVirtual ? '虚拟占位符' : (char.note || char.raw_info || '登场人物')}</span>
                                    </div>
                                    
                                    <div className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-all flex gap-1 bg-slate-900/80 backdrop-blur-sm p-1 rounded-lg border border-slate-700 shadow-xl">
                                        <button onClick={(e) => { e.stopPropagation(); handleMoveNode(char.id, 'left'); }} className="p-1 text-slate-400 hover:text-indigo-400" title="向左移"><ChevronLeft size={12} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleMoveNode(char.id, 'right'); }} className="p-1 text-slate-400 hover:text-indigo-400" title="向右移"><ChevronRight size={12} /></button>
                                        <div className="w-[1px] h-3 bg-slate-700 mx-0.5 mt-1"></div>
                                        <button onClick={() => onRemoveActiveChar(char.id)} className="p-1 text-slate-500 hover:text-red-400"><UserMinus size={12} /></button>
                                    </div>
                                </div>
                                
                                <div className={`absolute -top-12 left-2 right-2 h-10 flex flex-col items-center justify-center rounded-t-2xl border-t-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'parent' ? 'bg-indigo-600/30 border-indigo-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'parent'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'parent')}>
                                     <ArrowDown size={14} className="text-indigo-400" /><span className="text-[7px] font-black text-indigo-300 uppercase">设为父母</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -left-20 w-16 flex flex-col items-center justify-center rounded-l-2xl border-l-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'spouse' ? 'bg-pink-600/30 border-pink-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'spouse'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'spouse')}>
                                     <Heart size={14} className="text-pink-400" /><span className="text-[7px] font-black text-pink-300 uppercase" style={{ writingMode: 'vertical-rl' }}>登记配偶</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -left-10 w-10 flex flex-col items-center justify-center rounded-l-2xl border-l-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'other_relation' ? 'bg-blue-600/30 border-blue-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'other_relation'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'other_relation')}>
                                     <Link2 size={14} className="text-blue-400" /><span className="text-[7px] font-black text-blue-300 uppercase" style={{ writingMode: 'vertical-rl' }}>其他关系</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -right-10 w-10 flex flex-col items-center justify-center rounded-r-2xl border-r-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'other_relation' ? 'bg-blue-600/30 border-blue-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'other_relation'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'other_relation')}>
                                     <Link2 size={14} className="text-blue-400" /><span className="text-[7px] font-black text-blue-300 uppercase" style={{ writingMode: 'vertical-rl' }}>其他关系</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -right-20 w-16 flex flex-col items-center justify-center rounded-r-2xl border-r-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'spouse' ? 'bg-pink-600/30 border-pink-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'spouse'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'spouse')}>
                                     <Heart size={14} className="text-pink-400" /><span className="text-[7px] font-black text-pink-300 uppercase" style={{ writingMode: 'vertical-rl' }}>登记配偶</span>
                                </div>
                                <div className={`absolute -bottom-12 left-2 right-2 h-10 flex flex-col items-center justify-center rounded-b-2xl border-b-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'child_single' ? 'bg-blue-600/30 border-blue-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'child_single'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'child_single')}>
                                     <span className="text-[7px] font-black text-blue-300 uppercase flex items-center gap-1">设为子女 <ArrowUp size={10}/></span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/80 backdrop-blur-md border border-slate-700 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-8 z-30 animate-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
                    <div className="w-4 h-4 bg-indigo-500/20 border border-indigo-500 rounded-full flex items-center justify-center"><GitBranch size={8} className="text-indigo-500" /></div>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">动态谱系路由</span>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-indigo-400">
                        <Link2 size={14} />
                        <span className="text-[10px] font-bold text-slate-400 text-nowrap">支持添加除婚姻外的同级关系（如：好友、死对头）。</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FamilyTree;
