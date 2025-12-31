
import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { Character, FamilyLink } from '../types';
import { User, Trash2, Heart, ArrowDown, ArrowUp, Maximize, Minimize, GitBranch, X, UserMinus, MousePointer2, UserRoundPlus, ChevronLeft, ChevronRight, Hash, GripHorizontal } from 'lucide-react';

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
            if (l.type === 'marriage') {
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

    // 预处理子代组
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
        if (visibleCharacters.length === 0) return { nodePositions: {}, nodeOrder: {} };
        const nodePositions: Record<string, { x: number, y: number }> = {};
        const nodeOrder: Record<string, number> = {};
        const generations: Record<string, number> = {};
        const charIds = visibleCharacters.map(c => c.id);
        
        // 1. 计算代际
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

        // 对齐配偶代际
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

        // 2. 核心布局逻辑：按代排列并处理伴侣关系
        Object.entries(nodesByGen).forEach(([gStr, ids]) => {
            const g = parseInt(gStr);
            const remaining = new Set(ids);
            const finalSortedIds: string[] = [];

            // 按照父代关联顺序预排序
            const preSortedFromParents: string[] = [];
            childGroups.forEach(group => {
                group.children.forEach(c => {
                    if (remaining.has(c.childId)) {
                        preSortedFromParents.push(c.childId);
                        remaining.delete(c.childId);
                    }
                });
            });
            // 补齐剩下的未关联节点
            const allInGen = [...preSortedFromParents, ...Array.from(remaining)];
            const genSet = new Set(allInGen);
            const processedInGen = new Set<string>();

            // 对每一代内部，进行社交单元排列（Hub-Spoke优化稳定模型）
            allInGen.forEach(id => {
                if (processedInGen.has(id)) return;

                // 找到该节点的所有伴侣
                const partners = visibleLinks
                    .filter(l => l.type === 'marriage' && (l.partners || []).includes(id))
                    .map(l => (l.partners || []).find(p => p !== id))
                    .filter(p => p && genSet.has(p)) as string[];

                if (partners.length === 0) {
                    finalSortedIds.push(id);
                    processedInGen.add(id);
                } else {
                    // 稳定排序逻辑：确保新增伴侣不改变已有伴侣和Hub的位置
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
                nodePositions[id] = {
                    x: (i * (CARD_WIDTH + HORIZONTAL_SPACING)) - (rowWidth / 2) + 600,
                    y: g * VERTICAL_SPACING + 120
                };
                nodeOrder[id] = i;
            });
        });
        return { nodePositions, nodeOrder };
    }, [visibleCharacters, visibleLinks, childGroups]);

    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 5])
            .on("zoom", (e) => setTransform({ x: e.transform.x, y: e.transform.y, k: e.transform.k }));
        svg.call(zoomBehavior);
    }, []);

    const getSourceIdsFromEvent = (e: React.DragEvent): string[] => {
        const singleId = e.dataTransfer.getData("application/react-dnd-char-id");
        if (singleId) return [singleId];
        const bulk = e.dataTransfer.getData("application/mysterymind-ids");
        if (bulk) {
            try { const parsed = JSON.parse(bulk); if (Array.isArray(parsed)) return parsed; } catch(err) {}
        }
        return [];
    };

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const ids = getSourceIdsFromEvent(e);
        ids.forEach(id => onAddActiveChar(id));
    };

    const handleDropOnPerson = (e: React.DragEvent, targetId: string, zone: 'parent' | 'spouse' | 'child_single') => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        const ids = getSourceIdsFromEvent(e);
        if (ids.length === 0) return;
        const sourceId = ids[0];
        if (sourceId === targetId) return;

        onAddActiveChar(sourceId);
        if (zone === 'spouse') {
            const exists = familyLinks.some(l => l.type === 'marriage' && (l.partners || []).includes(targetId) && (l.partners || []).includes(sourceId));
            if (!exists) onAddFamilyLink({ id: crypto.randomUUID(), type: 'marriage', partners: [targetId, sourceId] });
        } else if (zone === 'parent') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [sourceId], child: targetId });
        } else if (zone === 'child_single') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [targetId], child: sourceId });
        }
        if (ids.length > 1) ids.slice(1).forEach(id => onAddActiveChar(id));
    };

    const handleDropOnMarriage = (e: React.DragEvent, linkId: string) => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        const ids = getSourceIdsFromEvent(e);
        const link = familyLinks.find(l => l.id === linkId);
        if (ids.length === 0 || !link || !link.partners) return;
        const sourceId = ids[0];
        onAddActiveChar(sourceId);
        onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [link.partners[0], link.partners[1]], child: sourceId });
        if (ids.length > 1) ids.slice(1).forEach(id => onAddActiveChar(id));
    };

    const handleMoveChild = (parents: string[], childId: string, direction: 'left' | 'right') => {
        const parentKey = [...parents].sort().join(',');
        const group = childGroups.find(g => g.parents.sort().join(',') === parentKey);
        if (!group) return;
        const currentOrder = group.children.map(c => c.childId);
        const idx = currentOrder.indexOf(childId);
        if (idx === -1) return;
        const newOrder = [...currentOrder];
        
        if (direction === 'left' && idx > 0) {
            [newOrder[idx], newOrder[idx-1]] = [newOrder[idx-1], newOrder[idx]];
        } else if (direction === 'right' && idx < newOrder.length - 1) {
            [newOrder[idx], newOrder[idx+1]] = [newOrder[idx+1], newOrder[idx]];
        } else {
            return;
        }
        
        onUpdateCustomOrder({ ...customOrder, [parentKey]: newOrder });
    };

    const handleConfirmVirtual = () => {
        if (!virtualName.trim()) return;
        onAddVirtualChar(virtualName.trim());
        setVirtualName("");
        setIsAddingVirtual(false);
    };

    return (
        <div 
            ref={containerRef}
            className={`relative flex flex-col transition-all overflow-hidden ${isExpanded ? 'fixed inset-0 z-[500] bg-slate-950 p-6' : 'h-full min-h-[650px] bg-slate-900/20 border border-slate-800 rounded-3xl'}`}
            onDragOver={e => e.preventDefault()}
            onDrop={handleCanvasDrop}
        >
            {/* UI Buttons and Info omitted for brevity but they should remain as in previous version */}
            <div className="absolute top-6 left-6 z-20 pointer-events-none flex flex-col gap-2">
                <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3 pointer-events-auto">
                    <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg"><GitBranch size={16} className="text-white" /></div>
                    <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">高级多源谱系管理</h3>
                        <p className="text-[9px] text-slate-500 font-bold italic">支持内部自由拖拽建立关系，节点跨代关联更自由。</p>
                    </div>
                </div>
            </div>

            <div className="absolute top-6 right-6 z-20 flex gap-2">
                <button onClick={() => setIsAddingVirtual(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl border border-slate-700 shadow-xl transition-all font-bold text-xs active:scale-95">
                    <UserRoundPlus size={16} /> 添加虚拟占位符
                </button>
                <button onClick={() => setIsExpanded(!isExpanded)} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95">
                    {isExpanded ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-auto" onDragOver={e => e.preventDefault()} onDrop={handleCanvasDrop}>
                    <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                        {/* 连线层 */}
                        {visibleLinks.filter(l => l.type === 'marriage').map(link => {
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
                            if (Math.abs(order1 - order2) === 1) {
                                midX = (x1 + x2) / 2;
                            } else {
                                const gapHalf = partnerGap / 2;
                                midX = (x2 > x1) ? (x2 - gapHalf) : (x2 + gapHalf);
                            }

                            const isOver = dropTarget?.id === link.id && dropTarget.zone === 'marriage_joint';
                            const isHighlighted = relatedEntityIds?.has(link.id);
                            const dim = !!hoveredCharId && !isHighlighted;
                            
                            return (
                                <g key={link.id} style={{ opacity: dim ? 0.2 : 1 }} className="transition-opacity duration-300">
                                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="#f472b6" strokeWidth={isHighlighted || isOver ? 4 : 2} strokeDasharray="5,3" />
                                    
                                    {/* 修复点：将圆圈和心形封装在一个组内进行中心定位和统一缩放 */}
                                    <g 
                                        transform={`translate(${midX}, ${y})`}
                                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: link.id, zone: 'marriage_joint'}); }} 
                                        onDragLeave={() => setDropTarget(null)} 
                                        onDrop={e => handleDropOnMarriage(e, link.id)} 
                                        className="cursor-pointer group/joint"
                                    >
                                        <circle 
                                            r={18} 
                                            fill={isHighlighted || isOver ? "#f472b6" : "#1e293b"} 
                                            stroke={isHighlighted || isOver ? "white" : "#f472b6"} 
                                            strokeWidth={1.5} 
                                            className="transition-transform duration-200 group-hover/joint:scale-110" 
                                            style={{ transformOrigin: '0 0', transformBox: 'fill-box' }}
                                        />
                                        <g transform="translate(-7, -7)" className="transition-transform duration-200 group-hover/joint:scale-110" style={{ pointerEvents: 'none', transformOrigin: '7px 7px', transformBox: 'fill-box' }}>
                                            <Heart size={14} className={isHighlighted || isOver ? "text-white" : "text-pink-500"} />
                                        </g>
                                    </g>
                                </g>
                            );
                        })}

                        {childGroups.map((group, gIdx) => {
                            let startX: number, startY: number;
                            const parentPositions = group.parents.map(pid => layoutData.nodePositions[pid]).filter(Boolean);
                            if (parentPositions.length === 0) return null;
                            
                            if (group.parents.length === 2) {
                                const p1Id = group.parents[0];
                                const p2Id = group.parents[1];
                                const link = visibleLinks.find(l => l.type === 'marriage' && (l.partners || []).includes(p1Id) && (l.partners || []).includes(p2Id));
                                
                                if (link) {
                                    const p1 = layoutData.nodePositions[p1Id];
                                    const p2 = layoutData.nodePositions[p2Id];
                                    const order1 = layoutData.nodeOrder[p1Id];
                                    const order2 = layoutData.nodeOrder[p2Id];
                                    const x1 = p1.x + CARD_WIDTH / 2;
                                    const x2 = p2.x + CARD_WIDTH / 2;
                                    const partnerGap = CARD_WIDTH + HORIZONTAL_SPACING;
                                    
                                    if (Math.abs(order1 - order2) === 1) {
                                        startX = (x1 + x2) / 2;
                                    } else {
                                        const gapHalf = partnerGap / 2;
                                        startX = (x2 > x1) ? (x2 - gapHalf) : (x2 + gapHalf);
                                    }
                                    startY = p1.y + CARD_HEIGHT / 2;
                                } else {
                                    const p1 = parentPositions[0]; const p2 = parentPositions[1];
                                    startX = (p1.x + p2.x + CARD_WIDTH) / 2; startY = p1.y + CARD_HEIGHT / 2;
                                }
                            } else {
                                const p = parentPositions[0]; startX = p.x + CARD_WIDTH / 2; startY = p.y + CARD_HEIGHT;
                            }
                            
                            const firstChildPos = layoutData.nodePositions[group.children[0]?.childId];
                            if (!firstChildPos) return null;
                            const parentBottomY = (group.parents.length === 2) ? (parentPositions[0].y + CARD_HEIGHT) : startY;
                            const childTopY = firstChildPos.y;
                            const midY = (parentBottomY + childTopY) / 2;
                            const childXs = group.children.map(c => layoutData.nodePositions[c.childId]?.x).filter(x => x !== undefined) as number[];
                            const minChildX = Math.min(...childXs) + CARD_WIDTH / 2;
                            const maxChildX = Math.max(...childXs) + CARD_WIDTH / 2;
                            const lineageColor = LINEAGE_COLORS[gIdx % LINEAGE_COLORS.length];
                            const groupIsHighlighted = group.parents.some(p => hoveredCharId === p) || group.children.some(c => hoveredCharId === c.childId);
                            const dim = !!hoveredCharId && !groupIsHighlighted;
                            return (
                                <g key={`group-${gIdx}`} style={{ opacity: dim ? 0.1 : 1 }} className="transition-opacity duration-300">
                                    <line x1={startX} y1={startY} x2={startX} y2={midY} stroke={lineageColor} strokeWidth={groupIsHighlighted ? 3 : 2} />
                                    <line x1={Math.min(startX, minChildX)} y1={midY} x2={Math.max(startX, maxChildX)} y2={midY} stroke={lineageColor} strokeWidth={groupIsHighlighted ? 3 : 2} />
                                    {group.children.map(child => {
                                        const cPos = layoutData.nodePositions[child.childId];
                                        if (!cPos) return null;
                                        const endX = cPos.x + CARD_WIDTH / 2;
                                        return <line key={child.linkId} x1={endX} y1={midY} x2={endX} y2={cPos.y} stroke={lineageColor} strokeWidth={hoveredCharId === child.childId || groupIsHighlighted ? 3 : 2} />;
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
                        const parentGroup = childGroups.find(g => g.children.some(c => c.childId === char.id));

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
                                        <span className="text-[9px] text-slate-500 mt-0.5 truncate font-bold uppercase tracking-widest">{char.isVirtual ? '虚拟占位符' : (char.note || char.raw_info || '登场人物')}</span>
                                    </div>
                                    <div className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-all flex gap-1">
                                        <div className="p-1 text-slate-600"><GripHorizontal size={10} /></div>
                                        <button onClick={() => onRemoveActiveChar(char.id)} className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg"><UserMinus size={12} /></button>
                                    </div>
                                </div>
                                
                                {/* Connection Zones */}
                                <div className={`absolute -top-12 left-2 right-2 h-10 flex flex-col items-center justify-center rounded-t-2xl border-t-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'parent' ? 'bg-indigo-600/30 border-indigo-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'parent'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'parent')}>
                                     <ArrowDown size={14} className="text-indigo-400" /><span className="text-[7px] font-black text-indigo-300 uppercase">设为父母</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -left-12 w-10 flex flex-col items-center justify-center rounded-l-2xl border-l-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'spouse' ? 'bg-pink-600/30 border-pink-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'spouse'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'spouse')}>
                                     <Heart size={14} className="text-pink-400" /><span className="text-[7px] font-black text-pink-300 uppercase rotate-180" style={{ writingMode: 'vertical-rl' }}>登记配偶</span>
                                </div>
                                <div className={`absolute top-0 bottom-0 -right-12 w-10 flex flex-col items-center justify-center rounded-r-2xl border-r-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'spouse' ? 'bg-pink-600/30 border-pink-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'spouse'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'spouse')}>
                                     <Heart size={14} className="text-pink-400" /><span className="text-[7px] font-black text-pink-300 uppercase" style={{ writingMode: 'vertical-rl' }}>登记配偶</span>
                                </div>
                                <div className={`absolute -bottom-12 left-2 right-2 h-10 flex flex-col items-center justify-center rounded-b-2xl border-b-2 border-dashed transition-all ${dropTarget?.id === char.id && dropTarget.zone === 'child_single' ? 'bg-blue-600/30 border-blue-400 opacity-100' : 'opacity-0 group-hover/card:opacity-60 border-slate-700/50'}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: char.id, zone: 'child_single'}); }} onDragLeave={() => setDropTarget(null)} onDrop={e => handleDropOnPerson(e, char.id, 'child_single')}>
                                     <span className="text-[7px] font-black text-blue-300 uppercase flex items-center gap-1">设为子女 <ArrowUp size={10}/></span>
                                </div>

                                {/* Order Buttons */}
                                {parentGroup && parentGroup.children.length > 1 && (
                                    <div className="absolute -bottom-6 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover/card:opacity-100 transition-all z-20">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleMoveChild(parentGroup.parents, char.id, 'left'); }} 
                                            className="p-1.5 rounded-lg bg-indigo-600 border border-indigo-400 text-white hover:bg-indigo-500 active:scale-90 shadow-lg transition-all"
                                            title="移至左侧 (年长)"
                                        >
                                            <ChevronLeft size={14} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleMoveChild(parentGroup.parents, char.id, 'right'); }} 
                                            className="p-1.5 rounded-lg bg-indigo-600 border border-indigo-400 text-white hover:bg-indigo-500 active:scale-90 shadow-lg transition-all"
                                            title="移至右侧 (年幼)"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            {/* Legend bottom omitted for brevity but should remain */}
        </div>
    );
};

export default FamilyTree;
