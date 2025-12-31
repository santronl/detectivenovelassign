
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Character, FamilyLink } from '../types';
import { User, Heart, ArrowDown, ArrowUp, Maximize, Minimize, GitBranch, X, UserMinus, MousePointer2, UserRoundPlus, ChevronLeft, ChevronRight, Hash, GripHorizontal, Crosshair } from 'lucide-react';

interface Props {
  characters: Character[];
  activeCharIds: string[];
  familyLinks: FamilyLink[];
  customOrder: Record<string, string[]>;
  blobUrls: Record<string, string>;
  onAddFamilyLink: (link: FamilyLink) => void;
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

const LINEAGE_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#0ea5e9',
];

const FamilyTree: React.FC<Props> = ({ 
    characters, activeCharIds, familyLinks, customOrder, blobUrls,
    onAddFamilyLink, onRemoveFamilyLink, onAddActiveChar, onRemoveActiveChar,
    onAddVirtualChar, onUpdateCustomOrder
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.8 });
    const [isExpanded, setIsExpanded] = useState(false);
    const [dropTarget, setDropTarget] = useState<{ id: string, zone: 'parent' | 'spouse' | 'child_single' | 'marriage_joint' } | null>(null);
    const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
    const [isAddingVirtual, setIsAddingVirtual] = useState(false);
    const [virtualName, setVirtualName] = useState("");

    const visibleCharacters = useMemo(() => {
        const activeSet = new Set(activeCharIds);
        return characters.filter(c => activeSet.has(c.id));
    }, [characters, activeCharIds]);

    const visibleLinks = useMemo(() => {
        const charIds = new Set(visibleCharacters.map(c => c.id));
        return familyLinks.filter(l => {
            if (l.type === 'marriage') return (l.partners || []).every(p => charIds.has(p));
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
            if (!groups[parentKey]) groups[parentKey] = { parents: l.parents || [], children: [] };
            if (l.child) groups[parentKey].children.push({ childId: l.child, linkId: l.id });
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

    const layoutData = useMemo(() => {
        if (visibleCharacters.length === 0) return { nodePositions: {}, nodeOrder: {}, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
        const nodePositions: Record<string, { x: number, y: number }> = {};
        const nodeOrder: Record<string, number> = {};
        const generations: Record<string, number> = {};
        const charIds = visibleCharacters.map(c => c.id);
        
        const roots = charIds.filter(id => !visibleLinks.some(l => l.type === 'parent_child' && l.child === id));
        const computeGeneration = (id: string, gen: number, visited: Set<string>) => {
            if (visited.has(id)) return;
            visited.add(id);
            generations[id] = Math.max(generations[id] || 0, gen);
            visibleLinks.filter(l => l.type === 'parent_child' && (l.parents || []).includes(id)).forEach(l => {
                if (l.child) computeGeneration(l.child, gen + 1, visited);
            });
        };
        roots.forEach(r => computeGeneration(r, 0, new Set()));

        for (let i = 0; i < 3; i++) {
            visibleLinks.filter(l => l.type === 'marriage').forEach(l => {
                const [p1, p2] = l.partners || [];
                if (p1 && p2 && generations[p1] !== undefined && generations[p2] !== undefined) {
                    const maxGen = Math.max(generations[p1], generations[p2]);
                    generations[p1] = maxGen; generations[p2] = maxGen;
                }
            });
        }

        const nodesByGen: Record<number, string[]> = {};
        Object.entries(generations).forEach(([id, g]) => {
            if (!nodesByGen[g]) nodesByGen[g] = [];
            nodesByGen[g].push(id);
        });

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        Object.entries(nodesByGen).forEach(([gStr, ids]) => {
            const g = parseInt(gStr);
            const remaining = new Set(ids);
            const finalSortedIds: string[] = [];
            const allInGen = [...Array.from(remaining)];
            const processedInGen = new Set<string>();

            allInGen.forEach(id => {
                if (processedInGen.has(id)) return;
                const partners = visibleLinks
                    .filter(l => l.type === 'marriage' && (l.partners || []).includes(id))
                    .map(l => (l.partners || []).find(p => p !== id))
                    .filter(p => p && new Set(allInGen).has(p)) as string[];

                if (partners.length === 0) {
                    finalSortedIds.push(id);
                    processedInGen.add(id);
                } else {
                    const hub = id;
                    const p1 = partners[0];
                    const others = partners.slice(1);
                    finalSortedIds.push(p1, hub, ...others);
                    processedInGen.add(hub);
                    partners.forEach(p => processedInGen.add(p));
                }
            });

            const rowWidth = finalSortedIds.length * (CARD_WIDTH + HORIZONTAL_SPACING);
            finalSortedIds.forEach((id, i) => {
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
        return { nodePositions, nodeOrder, bounds: { minX, maxX, minY, maxY } };
    }, [visibleCharacters, visibleLinks, childGroups]);

    // 改进的视野自适应算法
    const fitToView = useCallback((animate = true) => {
        if (!svgRef.current || !containerRef.current || visibleCharacters.length === 0) return;
        
        const { minX, maxX, minY, maxY } = layoutData.bounds;
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight;
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;

        if (containerWidth === 0 || containerHeight === 0) return;

        const padding = 120;
        const scale = Math.min(
            (containerWidth - padding) / graphWidth,
            (containerHeight - padding) / graphHeight,
            1.1 // 稍微降低最大比例，防止全屏时卡片过大
        );

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const tx = containerWidth / 2 - centerX * scale;
        const ty = containerHeight / 2 - centerY * scale;

        const svg = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 5]);

        if (animate) {
            svg.transition().duration(800).ease(d3.easeCubicOut).call(
                zoomBehavior.transform as any,
                d3.zoomIdentity.translate(tx, ty).scale(scale)
            );
        } else {
            svg.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(tx, ty).scale(scale));
        }
    }, [layoutData, visibleCharacters]);

    // 使用 ResizeObserver 监听物理尺寸变化
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => {
            fitToView(true);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [fitToView]);

    // 初始化缩放行为
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 5])
            .on("zoom", (e) => setTransform({ x: e.transform.x, y: e.transform.y, k: e.transform.k }));
        svg.call(zoomBehavior);
    }, []);

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

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const singleId = e.dataTransfer.getData("application/react-dnd-char-id");
        if (singleId) onAddActiveChar(singleId);
    };

    const handleDropOnPerson = (e: React.DragEvent, targetId: string, zone: 'parent' | 'spouse' | 'child_single') => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        const sourceId = e.dataTransfer.getData("application/react-dnd-char-id");
        if (!sourceId || sourceId === targetId) return;
        onAddActiveChar(sourceId);
        if (zone === 'spouse') {
            const exists = familyLinks.some(l => l.type === 'marriage' && (l.partners || []).includes(targetId) && (l.partners || []).includes(sourceId));
            if (!exists) onAddFamilyLink({ id: crypto.randomUUID(), type: 'marriage', partners: [targetId, sourceId] });
        } else if (zone === 'parent') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [sourceId], child: targetId });
        } else if (zone === 'child_single') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [targetId], child: sourceId });
        }
    };

    /**
     * Fix: Implement handleMoveChild to allow reordering siblings in the family tree.
     */
    const handleMoveChild = useCallback((parents: string[], childId: string, direction: 'left' | 'right') => {
        const parentKey = [...parents].sort().join(',');
        const group = childGroups.find(g => g.parents.sort().join(',') === parentKey);
        if (!group) return;

        const childrenIds = group.children.map(c => c.childId);
        const currentIndex = childrenIds.indexOf(childId);
        if (currentIndex === -1) return;

        const newOrder = [...childrenIds];
        if (direction === 'left' && currentIndex > 0) {
            [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
        } else if (direction === 'right' && currentIndex < newOrder.length - 1) {
            [newOrder[currentIndex + 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex + 1]];
        } else {
            return;
        }

        onUpdateCustomOrder({
            ...customOrder,
            [parentKey]: newOrder
        });
    }, [childGroups, customOrder, onUpdateCustomOrder]);

    return (
        <div 
            ref={containerRef}
            className={`relative flex flex-col transition-all duration-700 ease-in-out overflow-hidden
                ${isExpanded ? 'fixed inset-0 z-[2000] bg-[#020617] w-screen h-screen' : 'h-full min-h-[650px] bg-slate-900/20 border border-slate-800 rounded-3xl'}`}
            style={isExpanded ? { top: 0, left: 0 } : {}}
            onDragOver={e => e.preventDefault()}
            onDrop={handleCanvasDrop}
        >
            {/* Toolbar Buttons */}
            <div className="absolute top-8 left-8 z-[20] pointer-events-none flex flex-col gap-2">
                <div className="bg-slate-900/90 backdrop-blur px-6 py-4 rounded-3xl border border-slate-700/50 shadow-2xl flex items-center gap-4 pointer-events-auto">
                    <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-900/20"><GitBranch size={22} className="text-white" /></div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">高级谱系动态管理</h3>
                        <p className="text-[10px] text-slate-500 font-bold italic">全屏视野已优化，支持超大规模家族逻辑映射。</p>
                    </div>
                </div>
            </div>

            <div className="absolute top-8 right-8 z-[20] flex gap-3">
                <button onClick={() => fitToView()} className="p-4 bg-slate-800/90 hover:bg-slate-700 text-indigo-400 rounded-2xl border border-slate-700 shadow-2xl transition-all active:scale-90" title="回到视野中心">
                    <Crosshair size={22} />
                </button>
                <button onClick={() => setIsAddingVirtual(true)} className="flex items-center gap-3 px-6 py-4 bg-slate-800/90 hover:bg-slate-700 text-white rounded-2xl border border-slate-700 shadow-2xl transition-all font-black text-xs active:scale-95">
                    <UserRoundPlus size={20} className="text-indigo-400" /> 占位符
                </button>
                <button onClick={() => setIsExpanded(!isExpanded)} className={`p-4 rounded-2xl border border-slate-700 shadow-2xl transition-all active:scale-95 ${isExpanded ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800/90 text-slate-400 hover:bg-slate-700'}`}>
                    {isExpanded ? <Minimize size={22} /> : <Maximize size={22} />}
                </button>
            </div>

            {/* Virtual Node Modal */}
            {isAddingVirtual && (
                <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
                    <div className="bg-slate-800 border border-slate-700 rounded-[40px] p-10 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <UserRoundPlus size={22} className="text-indigo-400" /> 创建虚拟占位符
                        </h3>
                        <input 
                            autoFocus 
                            value={virtualName} 
                            onChange={e => setVirtualName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (onAddVirtualChar(virtualName.trim()), setVirtualName(""), setIsAddingVirtual(false))}
                            placeholder="如：长房长子..." 
                            className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-6 py-5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 mb-6 shadow-inner"
                        />
                        <div className="flex gap-4">
                            <button onClick={() => setIsAddingVirtual(false)} className="flex-1 py-4 text-xs text-slate-400 font-bold border border-slate-700 rounded-2xl hover:bg-slate-700 transition-colors">取消</button>
                            <button onClick={() => { if(virtualName.trim()) { onAddVirtualChar(virtualName.trim()); setVirtualName(""); setIsAddingVirtual(false); } }} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black shadow-xl shadow-indigo-900/30">确认创建</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden relative">
                <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-auto" onDragOver={e => e.preventDefault()} onDrop={handleCanvasDrop}>
                    <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                        {/* Marriage Connection Layer */}
                        {visibleLinks.filter(l => l.type === 'marriage').map(link => {
                            const p1 = layoutData.nodePositions[link.partners![0]];
                            const p2 = layoutData.nodePositions[link.partners![1]];
                            if (!p1 || !p2) return null;
                            const o1 = layoutData.nodeOrder[link.partners![0]];
                            const o2 = layoutData.nodeOrder[link.partners![1]];
                            const x1 = p1.x + CARD_WIDTH / 2;
                            const x2 = p2.x + CARD_WIDTH / 2;
                            const y = p1.y + CARD_HEIGHT / 2;
                            const midX = Math.abs(o1-o2) === 1 ? (x1 + x2) / 2 : (x2 > x1 ? x2 - (CARD_WIDTH+HORIZONTAL_SPACING)/2 : x2 + (CARD_WIDTH+HORIZONTAL_SPACING)/2);
                            const isOver = dropTarget?.id === link.id && dropTarget.zone === 'marriage_joint';
                            const isHighlighted = !!hoveredCharId && (link.partners || []).includes(hoveredCharId);
                            
                            return (
                                <g key={link.id} style={{ opacity: !!hoveredCharId && !isHighlighted ? 0.2 : 1 }} className="transition-opacity duration-300">
                                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="#f472b6" strokeWidth={isHighlighted || isOver ? 4 : 2} strokeDasharray="6,4" />
                                    <g transform={`translate(${midX}, ${y})`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: link.id, zone: 'marriage_joint'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDropTarget(null); const sId = e.dataTransfer.getData("application/react-dnd-char-id"); if(sId) onAddFamilyLink({id: crypto.randomUUID(), type: 'parent_child', parents: link.partners, child: sId}); }} className="cursor-pointer group/joint">
                                        <circle r={18} fill={isHighlighted || isOver ? "#f472b6" : "#1e293b"} stroke={isHighlighted || isOver ? "white" : "#f472b6"} strokeWidth={1.5} className="transition-transform group-hover/joint:scale-110" />
                                        <g transform="translate(-7, -7)"><Heart size={14} className={isHighlighted || isOver ? "text-white" : "text-pink-500"} /></g>
                                    </g>
                                </g>
                            );
                        })}

                        {/* Lineage Path Layer */}
                        {childGroups.map((group, gIdx) => {
                            const p1Id = group.parents[0];
                            const p2Id = group.parents[1];
                            const pos1 = layoutData.nodePositions[p1Id];
                            const pos2 = layoutData.nodePositions[p2Id];
                            if (!pos1) return null;
                            
                            let startX = pos1.x + CARD_WIDTH / 2;
                            if (pos2) {
                                const o1 = layoutData.nodeOrder[p1Id];
                                const o2 = layoutData.nodeOrder[p2Id];
                                startX = Math.abs(o1-o2) === 1 ? (pos1.x + pos2.x + CARD_WIDTH)/2 : (pos2.x > pos1.x ? pos2.x + CARD_WIDTH/2 - (CARD_WIDTH+HORIZONTAL_SPACING)/2 : pos2.x + CARD_WIDTH/2 + (CARD_WIDTH+HORIZONTAL_SPACING)/2);
                            }
                            
                            const firstChildPos = layoutData.nodePositions[group.children[0]?.childId];
                            if (!firstChildPos) return null;
                            const startY = pos1.y + CARD_HEIGHT / 2;
                            const midY = (startY + CARD_HEIGHT / 2 + firstChildPos.y) / 2;
                            const childXs = group.children.map(c => layoutData.nodePositions[c.childId]?.x + CARD_WIDTH/2).filter(x => !isNaN(x));
                            const minX = Math.min(...childXs, startX);
                            const maxX = Math.max(...childXs, startX);
                            const color = LINEAGE_COLORS[gIdx % LINEAGE_COLORS.length];
                            const groupHighlighted = !!hoveredCharId && (group.parents.includes(hoveredCharId) || group.children.some(c => c.childId === hoveredCharId));
                            
                            return (
                                <g key={`group-${gIdx}`} style={{ opacity: !!hoveredCharId && !groupHighlighted ? 0.1 : 1 }} className="transition-opacity duration-300">
                                    <line x1={startX} y1={startY} x2={startX} y2={midY} stroke={color} strokeWidth={groupHighlighted ? 3 : 2} />
                                    <line x1={minX} y1={midY} x2={maxX} y2={midY} stroke={color} strokeWidth={groupHighlighted ? 3 : 2} />
                                    {group.children.map(child => {
                                        const cPos = layoutData.nodePositions[child.childId];
                                        if (!cPos) return null;
                                        return <line key={child.linkId} x1={cPos.x + CARD_WIDTH/2} y1={midY} x2={cPos.x + CARD_WIDTH/2} y2={cPos.y} stroke={color} strokeWidth={groupHighlighted ? 3 : 2} />;
                                    })}
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {/* Character Card DOM Layer */}
                <div className="absolute inset-0 pointer-events-none" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0' }}>
                    {visibleCharacters.map(char => {
                        const pos = layoutData.nodePositions[char.id];
                        if (!pos) return null;
                        const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                        const isHighlighted = !!hoveredCharId && relatedEntityIds?.has(char.id);

                        return (
                            <div 
                                key={char.id} 
                                className="absolute pointer-events-auto group/card" 
                                draggable 
                                onDragStart={(e) => { e.dataTransfer.setData("application/react-dnd-char-id", char.id); e.stopPropagation(); }}
                                onMouseEnter={() => setHoveredCharId(char.id)} 
                                onMouseLeave={() => setHoveredCharId(null)} 
                                style={{ left: pos.x, top: pos.y, width: CARD_WIDTH, height: CARD_HEIGHT, opacity: !!hoveredCharId && !isHighlighted ? 0.3 : 1, transition: 'all 0.4s cubic-bezier(0.19, 1, 0.22, 1)' }}
                            >
                                <div className={`w-full h-full rounded-3xl border transition-all shadow-2xl flex items-center p-3 relative overflow-hidden z-10 cursor-grab active:cursor-grabbing 
                                    ${char.isVirtual ? 'border-slate-600 border-dashed bg-slate-900/60 grayscale' : isHighlighted ? 'border-indigo-400 bg-slate-700 ring-4 ring-indigo-500/20' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}
                                `}>
                                    <div className={`w-11 h-11 rounded-2xl border shrink-0 flex items-center justify-center overflow-hidden shadow-inner ${char.isVirtual ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-slate-700'}`}>
                                        {char.isVirtual ? <Hash size={18} className="text-slate-700" /> : portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover" /> : <User size={24} className="text-slate-600" />}
                                    </div>
                                    <div className="ml-4 flex flex-col truncate min-w-0">
                                        <span className={`text-[12px] font-black truncate leading-tight ${char.isVirtual ? 'text-slate-500 italic' : 'text-white'}`}>{char.name}</span>
                                        <span className="text-[9px] text-slate-500 mt-1 truncate font-bold uppercase tracking-tighter">{char.isVirtual ? '占位符' : (char.note || char.raw_info || '登场人物')}</span>
                                    </div>
                                    <div className="absolute top-2 right-3 opacity-0 group-hover/card:opacity-100 transition-all">
                                        <button onClick={() => onRemoveActiveChar(char.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl"><UserMinus size={14} /></button>
                                    </div>
                                </div>
                                
                                {/* Sensitive Drop Zones */}
                                <div className={`absolute -top-12 left-4 right-4 h-10 flex flex-col items-center justify-center rounded-t-3xl border-t-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'parent' ? 'bg-indigo-600/30 border-indigo-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'parent'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'parent')}>
                                     <ArrowDown size={16} className="text-indigo-400" /><span className="text-[8px] font-black text-indigo-300 uppercase">作为父母</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -left-12 w-10 flex flex-col items-center justify-center rounded-l-3xl border-l-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'spouse' ? 'bg-pink-600/30 border-pink-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'spouse'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'spouse')}>
                                     <Heart size={16} className="text-pink-400" /><span className="text-[8px] font-black text-pink-300 uppercase rotate-180" style={{ writingMode: 'vertical-rl' }}>建立婚约</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -right-12 w-10 flex flex-col items-center justify-center rounded-r-3xl border-r-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'spouse' ? 'bg-pink-600/30 border-pink-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'spouse'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'spouse')}>
                                     <Heart size={16} className="text-pink-400" /><span className="text-[8px] font-black text-pink-300 uppercase" style={{ writingMode: 'vertical-rl' }}>建立婚约</span>
                                </div>
                                <div className={`absolute -bottom-12 left-4 right-4 h-10 flex flex-col items-center justify-center rounded-b-3xl border-b-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'child_single' ? 'bg-blue-600/30 border-blue-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'child_single'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'child_single')}>
                                     <span className="text-[8px] font-black text-blue-300 uppercase flex items-center gap-1">作为子女 <ArrowUp size={12}/></span>
                                </div>

                                {/* Horizontal Sort Buttons */}
                                {childGroups.find(g => g.children.some(c => c.childId === char.id))?.children.length! > 1 && (
                                    <div className="absolute -bottom-7 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover/card:opacity-100 transition-all z-20">
                                        <button onClick={(e) => { e.stopPropagation(); handleMoveChild(childGroups.find(g => g.children.some(c => c.childId === char.id))?.parents!, char.id, 'left'); }} className="p-2 bg-indigo-600 border border-indigo-400 text-white rounded-xl shadow-xl active:scale-90"><ChevronLeft size={16} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleMoveChild(childGroups.find(g => g.children.some(c => c.childId === char.id))?.parents!, char.id, 'right'); }} className="p-2 bg-indigo-600 border border-indigo-400 text-white rounded-xl shadow-xl active:scale-90"><ChevronRight size={16} /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Expansion Floating Legend */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-2xl border border-slate-700 px-10 py-6 rounded-[40px] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)] flex items-center gap-12 z-30 animate-in slide-in-from-bottom-10">
                <div className="flex items-center gap-4 pr-10 border-r border-slate-700/50">
                    <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-500 rounded-2xl flex items-center justify-center"><GitBranch size={18} className="text-indigo-500" /></div>
                    <span className="text-[12px] font-black text-slate-300 uppercase tracking-[0.2em]">智能谱系画布</span>
                </div>
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-3">
                        <MousePointer2 size={18} className="text-indigo-400" />
                        <span className="text-[12px] font-bold text-slate-400 whitespace-nowrap">自由映射：拖拽卡片至连接点以建立关系。</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Crosshair size={18} className="text-indigo-400" />
                        <span className="text-[12px] font-bold text-slate-400 whitespace-nowrap">自动归位：已针对全屏视野优化居中对齐。</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FamilyTree;
