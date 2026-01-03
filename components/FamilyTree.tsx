
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Character, FamilyLink } from '../types';
import { User, Heart, X, Minimize, Maximize, GitBranch, UserRoundPlus, HelpCircle, Crosshair, ArrowDown, ArrowUp, Check, Search } from 'lucide-react';
import PortalWindow from './PortalWindow';

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
const SPOUSE_GAP = 120;
const SIBLING_GAP = 40;
const COUSIN_GAP = 80;
const VERTICAL_SPACING = 200;

// Define NodePos at module level to ensure type visibility
type NodePos = { x: number, y: number, gen: number };

const FamilyTree: React.FC<Props> = ({ 
    characters, activeCharIds, familyLinks, customOrder, blobUrls,
    onAddFamilyLink, onUpdateFamilyLink, onRemoveFamilyLink, onAddActiveChar, onRemoveActiveChar,
    onAddVirtualChar, onUpdateCustomOrder
}) => {
    // Use a callback ref for SVG to ensure d3 is initialized whenever the DOM node is created (e.g., inside Portal)
    const [svgNode, setSvgNode] = useState<SVGSVGElement | null>(null);
    const svgRefCallback = useCallback((node: SVGSVGElement | null) => {
        setSvgNode(node);
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.8 });
    const [isPoppedOut, setIsPoppedOut] = useState(false);
    const [dropTarget, setDropTarget] = useState<{ id: string, zone: 'parent' | 'spouse' | 'child_single' | 'marriage_joint' | 'other_relation' } | null>(null);
    const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
    const [isAddingVirtual, setIsAddingVirtual] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [virtualName, setVirtualName] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [sidebarSearch, setSidebarSearch] = useState("");

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
                return (l.parents || []).every(p => charIds.has(p)) && l.child && charIds.has(l.child);
            }
            return false;
        });
    }, [visibleCharacters, familyLinks]);

    // --- Layout Algorithm ---
    const layoutData = useMemo(() => {
        const emptyResult = { 
            nodePositions: {} as Record<string, NodePos>, 
            bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } 
        };

        if (visibleCharacters.length === 0) return emptyResult;

        const nodePositions: Record<string, NodePos> = {};
        const placedNodes = new Set<string>();
        let currentMaxX = 0;

        const getSpouses = (id: string): string[] => {
            const spouses = new Set<string>();
            visibleLinks.forEach(l => {
                if (l.type === 'marriage' && l.partners?.includes(id)) {
                    const partner = l.partners.find(p => p !== id);
                    if (partner) spouses.add(partner);
                }
            });
            return Array.from(spouses).sort();
        };

        const getStrictChildren = (p1: string, p2: string | null): string[] => {
            const p1Spouses = getSpouses(p1);
            const children = visibleLinks
                .filter(l => {
                    if (l.type !== 'parent_child' || !l.child) return false;
                    const ps = l.parents || [];
                    if (p2) {
                        return ps.includes(p1) && ps.includes(p2);
                    } else {
                        if (!ps.includes(p1)) return false;
                        const hasOtherSpouse = ps.some(p => p !== p1 && p1Spouses.includes(p));
                        return !hasOtherSpouse;
                    }
                })
                .map(l => l.child!);
            return Array.from(new Set<string>(children)).sort((a, b) => a.localeCompare(b));
        };

        const calculateChildrenBlockWidth = (children: string[]): number => {
            if (children.length === 0) return 0;
            let totalWidth = 0;
            children.forEach(cid => {
                const spouseCount = getSpouses(cid).length;
                const childNodeWidth = (1 + spouseCount) * CARD_WIDTH + (spouseCount * SPOUSE_GAP);
                totalWidth += childNodeWidth;
            });
            totalWidth += (children.length - 1) * SIBLING_GAP;
            return totalWidth;
        };

        const shiftSubtree = (rootId: string, dx: number) => {
            if (Math.abs(dx) < 0.1) return;
            const queue = [rootId];
            const visited = new Set<string>();
            while (queue.length > 0) {
                const curr = queue.shift()!;
                if (visited.has(curr)) continue;
                visited.add(curr);
                if (nodePositions[curr]) nodePositions[curr].x += dx;
                getSpouses(curr).forEach(s => { if (!visited.has(s)) queue.push(s); });
                visibleLinks.forEach(l => {
                    if (l.type === 'parent_child' && l.parents?.includes(curr) && l.child) {
                        if (!visited.has(l.child)) queue.push(l.child);
                    }
                });
            }
        };

        const layoutSubtree = (rootId: string, gen: number, startX: number): number => {
            if (placedNodes.has(rootId)) return 0;

            const allSpouses = getSpouses(rootId);
            const leftSpouses: string[] = [];
            const rightSpouses: string[] = [];
            allSpouses.forEach((sId, idx) => {
                if (idx % 2 !== 0) leftSpouses.push(sId);
                else rightSpouses.push(sId);
            });
            leftSpouses.reverse(); 

            const nodeSequence = [...leftSpouses, rootId, ...rightSpouses];
            const gaps: number[] = new Array(Math.max(0, nodeSequence.length - 1)).fill(SPOUSE_GAP);
            
            const jointLayouts: Record<string, { children: string[], width: number }> = {};
            const spouseSingleLayouts: Record<string, { children: string[], width: number }> = {};
            const rootSingleChildren = getStrictChildren(rootId, null);
            const rootSingleWidth = calculateChildrenBlockWidth(rootSingleChildren);

            const rootIdx = leftSpouses.length;

            if (leftSpouses.length > 0) {
                const spouseId = leftSpouses[leftSpouses.length - 1];
                const jointChildren = getStrictChildren(rootId, spouseId);
                const jointWidth = calculateChildrenBlockWidth(jointChildren);
                jointLayouts[`${spouseId}-${rootId}`] = { children: jointChildren, width: jointWidth };
                
                const spouseSingleChildren = getStrictChildren(spouseId, null);
                const spouseSingleWidth = calculateChildrenBlockWidth(spouseSingleChildren);
                spouseSingleLayouts[spouseId] = { children: spouseSingleChildren, width: spouseSingleWidth };

                if (spouseSingleWidth > 0 || jointWidth > 0 || rootSingleWidth > 0) {
                    const requiredGap = Math.max(SPOUSE_GAP, spouseSingleWidth + jointWidth + rootSingleWidth - CARD_WIDTH + SIBLING_GAP);
                    gaps[rootIdx - 1] = requiredGap;
                }
            }

            if (rightSpouses.length > 0) {
                const spouseId = rightSpouses[0];
                const jointChildren = getStrictChildren(rootId, spouseId);
                const jointWidth = calculateChildrenBlockWidth(jointChildren);
                jointLayouts[`${rootId}-${spouseId}`] = { children: jointChildren, width: jointWidth };

                const spouseSingleChildren = getStrictChildren(spouseId, null);
                const spouseSingleWidth = calculateChildrenBlockWidth(spouseSingleChildren);
                spouseSingleLayouts[spouseId] = { children: spouseSingleChildren, width: spouseSingleWidth };

                if (spouseSingleWidth > 0 || jointWidth > 0 || rootSingleWidth > 0) {
                    const requiredGap = Math.max(SPOUSE_GAP, rootSingleWidth + jointWidth + spouseSingleWidth - CARD_WIDTH + SIBLING_GAP);
                    gaps[rootIdx] = requiredGap;
                }
            }

            let currentX = startX;
            nodeSequence.forEach((nodeId, idx) => {
                nodePositions[nodeId] = { x: currentX, y: gen * VERTICAL_SPACING, gen };
                placedNodes.add(nodeId);
                currentX += CARD_WIDTH;
                if (idx < gaps.length) {
                    currentX += gaps[idx];
                }
            });

            const placeAndAlignChildren = (children: string[], width: number, targetCenterX: number) => {
                if (children.length === 0) return;
                let childStartX = targetCenterX - width / 2;
                children.forEach(childId => {
                    const w = layoutSubtree(childId, gen + 1, childStartX);
                    childStartX += w + SIBLING_GAP;
                });
                
                const childNodesX = children.map(c => nodePositions[c]?.x).filter(x => x !== undefined);
                if (childNodesX.length > 0) {
                    const minX = Math.min(...childNodesX);
                    const maxX = Math.max(...childNodesX);
                    const actualCenterX = (minX + maxX + CARD_WIDTH) / 2;
                    const diff = targetCenterX - actualCenterX;
                    children.forEach(c => shiftSubtree(c, diff));
                }
            };

            if (leftSpouses.length > 0) {
                const spouseId = leftSpouses[leftSpouses.length - 1];
                const pSpouse = nodePositions[spouseId];
                const pRoot = nodePositions[rootId];
                const jointData = jointLayouts[`${spouseId}-${rootId}`];
                if (jointData) {
                    const jointCenter = (pSpouse.x + pRoot.x + CARD_WIDTH) / 2;
                    placeAndAlignChildren(jointData.children, jointData.width, jointCenter);
                }
                const singleData = spouseSingleLayouts[spouseId];
                if (singleData) {
                    const spouseCenter = pSpouse.x + CARD_WIDTH / 2;
                    placeAndAlignChildren(singleData.children, singleData.width, spouseCenter);
                }
            }

            if (rightSpouses.length > 0) {
                const spouseId = rightSpouses[0];
                const pRoot = nodePositions[rootId];
                const pSpouse = nodePositions[spouseId];
                const jointData = jointLayouts[`${rootId}-${spouseId}`];
                if (jointData) {
                    const jointCenter = (pRoot.x + pSpouse.x + CARD_WIDTH) / 2;
                    placeAndAlignChildren(jointData.children, jointData.width, jointCenter);
                }
                const singleData = spouseSingleLayouts[spouseId];
                if (singleData) {
                    const spouseCenter = pSpouse.x + CARD_WIDTH / 2;
                    placeAndAlignChildren(singleData.children, singleData.width, spouseCenter);
                }
            }

            if (rootSingleChildren.length > 0) {
                const pRoot = nodePositions[rootId];
                const rootCenter = pRoot.x + CARD_WIDTH / 2;
                placeAndAlignChildren(rootSingleChildren, rootSingleWidth, rootCenter);
                if (allSpouses.length === 0) {
                     return Math.max(currentX - startX, rootSingleWidth);
                }
            }

            return currentX - startX;
        };

        const findRoots = () => {
             const hasParents = new Set<string>();
             visibleLinks.filter(l => l.type === 'parent_child').forEach(l => {
                 if (l.child) hasParents.add(l.child);
             });
             const candidates = visibleCharacters.filter(c => !hasParents.has(c.id));
             return candidates.filter(c => {
                 const mySpouses = getSpouses(c.id);
                 if (mySpouses.some(sid => hasParents.has(sid))) return false;
                 return true;
             });
        };

        const roots = findRoots();
        const sortedRoots = roots.sort((a, b) => {
            const rootOrder = customOrder['roots'] || [];
            const idxA = rootOrder.indexOf(a.id);
            const idxB = rootOrder.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            return 0;
        });

        sortedRoots.forEach(root => {
            if (!placedNodes.has(root.id)) {
                const mySpouses = getSpouses(root.id);
                if (mySpouses.some(s => placedNodes.has(s))) return;
                const width = layoutSubtree(root.id, 0, currentMaxX);
                currentMaxX += width + COUSIN_GAP; 
            }
        });

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        Object.values(nodePositions).forEach(pos => {
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x + CARD_WIDTH);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y + CARD_HEIGHT);
        });

        if (minX === Infinity) return emptyResult;

        return { nodePositions, bounds: { minX, maxX, minY, maxY } };
    }, [visibleCharacters, visibleLinks, customOrder]);

    // --- View Handling ---
    
    // Fit to view
    const fitToView = useCallback((animate = true) => {
        if (!svgNode) return;
        const { minX, maxX, minY, maxY } = layoutData.bounds;
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // Determine container size. In popped out mode, we might not have containerRef readily available or it might be stale.
        // We can fallback to window dimensions for full screen mode if containerRef is null
        let containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        let containerHeight = containerRef.current?.clientHeight || window.innerHeight;
        
        // If embedded and container ref is missing (rare), skip
        if (!isPoppedOut && !containerRef.current) return;

        if (graphWidth === 0 || graphHeight === 0) return;
        
        const padding = 100;
        const scaleX = (containerWidth - padding * 2) / graphWidth;
        const scaleY = (containerHeight - padding * 2) / graphHeight;
        const k = Math.min(scaleX, scaleY, 1); 
        
        const centerX = (minX + maxX) / 2;
        const centerY = minY + 100;
        
        const tx = containerWidth / 2 - centerX * k;
        const ty = 100 - minY * k;

        const svg = d3.select(svgNode);
        // We need to apply this transform to the zoom behavior attached to the SVG
        const zoomBehavior = d3.zoom<SVGSVGElement, any>().scaleExtent([0.1, 5]);
        const newTransform = d3.zoomIdentity.translate(tx, ty).scale(k);
        
        if (animate) {
            svg.transition().duration(750).call(zoomBehavior.transform as any, newTransform);
        } else {
            svg.call(zoomBehavior.transform as any, newTransform);
        }
        // State update happens via the 'zoom' event listener which is triggered by .call above
    }, [layoutData, isPoppedOut, svgNode]);

    // Initialize D3 Zoom
    useEffect(() => {
        if (!svgNode) return;
        const svg = d3.select(svgNode);
        const zoomBehavior = d3.zoom<SVGSVGElement, any>()
            .scaleExtent([0.1, 5])
            .on("zoom", (event: any) => {
                setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
            });
        
        svg.call(zoomBehavior);
        
        // Important: Restore previous transform state to the new DOM node (e.g. when moving to Portal)
        // This ensures panning continues smoothly and zoom state isn't lost/reset to identity unexpectedly
        svg.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k));
        
    }, [svgNode]); // Re-run when the SVG node changes (mount/unmount)

    // Auto-fit on data change
    useEffect(() => {
        const timer = setTimeout(() => fitToView(true), 100);
        return () => clearTimeout(timer);
    }, [layoutData.bounds.minX, fitToView]);

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
        if (ids.length === 0 || !ids[0]) return;
        const sourceId = ids[0];
        if (sourceId === targetId) return;
        onAddActiveChar(sourceId);
        
        if (zone === 'spouse') {
            const exists = familyLinks.some(l => l.type === 'marriage' && (l.partners || []).includes(targetId) && (l.partners || []).includes(sourceId));
            if (!exists) onAddFamilyLink({ id: crypto.randomUUID(), type: 'marriage', partners: [targetId, sourceId] });
        } else if (zone === 'other_relation') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'other_same_level', partners: [targetId, sourceId], label: '自定义关系' });
        } else if (zone === 'parent') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [sourceId], child: targetId });
        } else if (zone === 'child_single') {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [targetId], child: sourceId });
        }
    };

    const handleDropOnJoint = (e: React.DragEvent, p1: string, p2: string) => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
        if (ids.length === 0 || !ids[0]) return;
        const childId = ids[0];
        
        onAddActiveChar(childId);
        onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [p1, p2], child: childId });
    };

    const renderLinks = () => {
        const links: React.ReactElement[] = [];
        const { nodePositions } = layoutData;

        // 婚姻连线
        familyLinks.forEach(link => {
             if (link.type === 'marriage' && link.partners && link.partners.length === 2) {
                 const p1 = nodePositions[link.partners[0]];
                 const p2 = nodePositions[link.partners[1]];
                 if (p1 && p2 && p1.y === p2.y) { 
                     const x1 = Math.min(p1.x, p2.x) + CARD_WIDTH;
                     const x2 = Math.max(p1.x, p2.x);
                     const y = p1.y + CARD_HEIGHT / 2;
                     const centerX = (x1 + x2) / 2;

                     links.push(
                         <g key={link.id}>
                             <path d={`M ${x1} ${y} L ${x2} ${y}`} stroke="#ec4899" strokeWidth={2} strokeDasharray="4,2" />
                             <circle cx={centerX} cy={y} r={4} fill="#ec4899" />
                             <Heart x={centerX - 6} y={y - 6} size={12} className="text-pink-500" fill="currentColor" />
                             <circle 
                                cx={centerX} cy={y} r={20} fill="transparent" 
                                onDragOver={(e) => { e.preventDefault(); setDropTarget({ id: link.id, zone: 'marriage_joint' }); }}
                                onDragLeave={() => setDropTarget(null)}
                                onDrop={(e) => handleDropOnJoint(e, link.partners![0], link.partners![1])}
                                stroke={dropTarget?.id === link.id ? '#ec4899' : 'none'} strokeWidth={2}
                             />
                         </g>
                     );
                 }
             }
        });

        // 亲子连线
        familyLinks.forEach(link => {
            if (link.type === 'parent_child' && link.child) {
                const childPos = nodePositions[link.child];
                if (!childPos) return;

                let parentX = 0;
                let parentY = 0;
                
                if (link.parents) {
                    const parentPositions = link.parents.map(pid => nodePositions[pid]).filter(Boolean);
                    if (parentPositions.length > 0) {
                        let minPX = Math.min(...parentPositions.map(p => p.x));
                        let maxPX = Math.max(...parentPositions.map(p => p.x + CARD_WIDTH));
                        parentX = (minPX + maxPX) / 2;
                        parentY = parentPositions[0].y + CARD_HEIGHT;
                    }
                }
                
                if (parentX !== 0) {
                    const childCenterX = childPos.x + CARD_WIDTH / 2;
                    const childTopY = childPos.y;
                    const midY = (parentY + childTopY) / 2;
                    links.push(
                        <path 
                            key={link.id}
                            d={`M ${parentX} ${parentY - CARD_HEIGHT/2} L ${parentX} ${midY} L ${childCenterX} ${midY} L ${childCenterX} ${childTopY}`}
                            fill="none" stroke="#64748b" strokeWidth={1.5}
                        />
                    );
                }
            }
        });
        return links;
    };

    const renderContent = () => (
        <div className="w-full h-full relative bg-[#0f172a] overflow-hidden" ref={containerRef}>
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button onClick={() => fitToView(true)} className="p-2 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 text-slate-300"><Crosshair size={18}/></button>
                <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-1">
                    <input 
                        className="bg-transparent text-sm px-2 py-1 outline-none text-white w-40"
                        placeholder="搜索家族成员..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            
            <svg ref={svgRefCallback} className="w-full h-full cursor-grab active:cursor-grabbing">
                <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                    {renderLinks()}
                    {Object.entries(layoutData.nodePositions).map(([id, pos]) => {
                        const char = characters.find(c => c.id === id);
                        if (!char) return null;
                        const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                        const isHovered = hoveredCharId === id;
                        
                        return (
                            <foreignObject key={id} x={pos.x} y={pos.y} width={CARD_WIDTH} height={CARD_HEIGHT}>
                                <div 
                                    className={`w-full h-full bg-slate-800 rounded-xl border-2 transition-all flex items-center p-2 gap-2 relative group 
                                        ${isHovered ? 'border-blue-400 shadow-lg shadow-blue-500/20' : 'border-slate-600'}
                                    `}
                                    onMouseEnter={() => setHoveredCharId(id)}
                                    onMouseLeave={() => setHoveredCharId(null)}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData("application/react-dnd-char-id", id);
                                    }}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDrop={(e) => handleDropOnPerson(e, id, 'parent')}
                                >
                                    <div className="absolute inset-0 z-20 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                                        <div 
                                            className="absolute right-0 top-0 bottom-0 w-6 bg-pink-500/20 hover:bg-pink-500/40 cursor-copy"
                                            title="拖拽此处建立婚姻"
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({id, zone: 'spouse'}); }}
                                            onDragLeave={() => setDropTarget(null)}
                                            onDrop={(e) => handleDropOnPerson(e, id, 'spouse')}
                                        />
                                        <div 
                                            className="absolute bottom-0 left-0 right-0 h-6 bg-blue-500/20 hover:bg-blue-500/40 cursor-copy"
                                            title="拖拽此处添加子女 (单亲)"
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({id, zone: 'child_single'}); }}
                                            onDragLeave={() => setDropTarget(null)}
                                            onDrop={(e) => handleDropOnPerson(e, id, 'child_single')}
                                        />
                                    </div>

                                    <div className="w-10 h-10 rounded-full bg-slate-900 overflow-hidden shrink-0 border border-slate-500">
                                        {portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover" /> : <User size={20} className="text-slate-500 m-2" />}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs font-bold text-slate-200 truncate">{char.name}</span>
                                        <span className="text-[10px] text-slate-500 truncate">{char.raw_info || '无信息'}</span>
                                    </div>

                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onRemoveActiveChar(id); }}
                                        className="absolute -top-2 -right-2 p-1 bg-slate-700 hover:bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all shadow-md z-30"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            </foreignObject>
                        );
                    })}
                </g>
            </svg>

            <div className="absolute bottom-6 right-6 flex gap-2">
                 <button onClick={() => setIsAddingVirtual(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-lg font-bold text-xs transition-all">
                    <UserRoundPlus size={14} /> 添加虚拟人物
                 </button>
                 <button onClick={() => setIsGuideOpen(!isGuideOpen)} className="p-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-xl shadow-lg">
                    <HelpCircle size={18} />
                 </button>
            </div>

            {/* Virtual Char Modal */}
            {isAddingVirtual && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-2xl w-80 animate-in zoom-in-95">
                        <h3 className="text-sm font-bold text-white mb-4">添加虚拟占位人物 (如: 未知生父)</h3>
                        <input 
                            autoFocus
                            value={virtualName}
                            onChange={(e) => setVirtualName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmVirtual()}
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white text-sm mb-4 outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="输入名称..."
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setIsAddingVirtual(false)} className="flex-1 py-2 text-xs font-bold text-slate-400 hover:bg-slate-700 rounded-lg">取消</button>
                            <button onClick={handleConfirmVirtual} className="flex-1 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">确认</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Guide Modal */}
            {isGuideOpen && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <HelpCircle size={18} className="text-indigo-400" /> 谱系图操作指南
                            </h3>
                            <button onClick={() => setIsGuideOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-6 text-xs text-slate-300">
                            {/* Section 1 */}
                            <div className="flex gap-4">
                                <div className="p-3 bg-slate-900 rounded-xl h-fit border border-slate-700 shrink-0">
                                    <GitBranch size={20} className="text-pink-400" />
                                </div>
                                <div className="space-y-3">
                                    <h4 className="font-bold text-white text-sm">如何建立亲属关系?</h4>
                                    <p className="opacity-70 leading-relaxed">
                                        直接拖拽人物头像到目标卡片的<strong className="text-white">特定感应区</strong>：
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-700 flex items-center gap-2">
                                            <div className="w-6 h-6 bg-pink-500/20 rounded flex items-center justify-center text-pink-400"><Heart size={12}/></div>
                                            <span>左右侧边: <span className="text-pink-400 font-bold">配偶</span></span>
                                        </div>
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-700 flex items-center gap-2">
                                            <div className="w-6 h-6 bg-indigo-500/20 rounded flex items-center justify-center text-indigo-400"><ArrowDown size={12}/></div>
                                            <span>顶部区域: <span className="text-indigo-400 font-bold">父母</span></span>
                                        </div>
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-700 flex items-center gap-2">
                                            <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center text-blue-400"><ArrowUp size={12}/></div>
                                            <span>底部区域: <span className="text-blue-400 font-bold">子女(单亲)</span></span>
                                        </div>
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-700 flex items-center gap-2">
                                            <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-white"><Heart size={10}/></div>
                                            <span>连线中心: <span className="text-white font-bold">共同子女</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2 */}
                            <div className="flex gap-4 border-t border-slate-700 pt-4">
                                <div className="p-3 bg-slate-900 rounded-xl h-fit border border-slate-700 shrink-0">
                                    <UserRoundPlus size={20} className="text-indigo-400" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white text-sm mb-1">缺失关键人物?</h4>
                                    <p className="opacity-70 leading-relaxed mb-2">
                                        使用右下角的 <span className="text-indigo-400 font-bold">添加虚拟人物</span> 功能创建占位符（如：未知生父、初代家主），以完善家族树结构。
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-700">
                            <button onClick={() => setIsGuideOpen(false)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-lg transition-all active:scale-95">
                                我明白了
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderSidebar = () => (
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-800">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input 
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
                        placeholder="搜索候选人物..."
                        value={sidebarSearch}
                        onChange={e => setSidebarSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {characters
                    .filter(c => !c.isVirtual && (sidebarSearch === "" || c.name.toLowerCase().includes(sidebarSearch.toLowerCase())))
                    .map(char => {
                        const isActive = activeCharIds.includes(char.id);
                        const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                        return (
                            <div 
                                key={char.id}
                                draggable={!isActive}
                                onDragStart={(e) => {
                                    if (isActive) return;
                                    e.dataTransfer.setData("application/react-dnd-char-id", char.id);
                                }}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${isActive ? 'bg-slate-800/50 border-slate-800 opacity-50 grayscale cursor-default' : 'bg-slate-800 border-slate-700 hover:border-blue-500 cursor-grab active:cursor-grabbing'}`}
                            >
                                <div className="w-8 h-8 rounded-full bg-slate-950 overflow-hidden shrink-0 border border-slate-600 shadow-sm">
                                    {portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover"/> : <User size={16} className="text-slate-500 m-1.5"/>}
                                </div>
                                <span className="text-xs font-bold text-slate-300 truncate flex-1">{char.name}</span>
                                {isActive && <Check size={14} className="text-blue-500"/>}
                            </div>
                        )
                    })
                }
            </div>
        </div>
    );

    return isPoppedOut ? (
        <PortalWindow onClose={() => setIsPoppedOut(false)}>
             <div className="w-full h-full flex flex-col bg-[#0f172a]">
                 <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 justify-between shrink-0">
                     <span className="font-bold text-white flex items-center gap-2"><GitBranch size={16}/> 家族谱系图 (全屏模式)</span>
                     <button onClick={() => setIsPoppedOut(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><Minimize size={18}/></button>
                 </div>
                 <div className="flex-1 flex overflow-hidden">
                    {renderSidebar()}
                    <div className="flex-1 overflow-hidden relative">
                        {renderContent()}
                    </div>
                 </div>
             </div>
        </PortalWindow>
    ) : (
        <div className="w-full h-[600px] border border-slate-700 rounded-xl overflow-hidden relative shadow-xl flex flex-col">
             {renderContent()}
             <button onClick={() => setIsPoppedOut(true)} className="absolute top-4 right-4 z-20 p-2 bg-slate-800/80 backdrop-blur border border-slate-600 rounded-lg text-slate-300 hover:text-white shadow-lg"><Maximize size={16}/></button>
        </div>
    );
};

export default FamilyTree;
