import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Character, FamilyLink } from '../types';
import { User, Heart, ArrowDown, ArrowUp, Maximize, Minimize, GitBranch, X, UserMinus, MousePointer2, UserRoundPlus, ChevronLeft, ChevronRight, Hash, GripHorizontal, Crosshair, Link2, Edit3, HelpCircle, MousePointer, MoveHorizontal, Search, ExternalLink } from 'lucide-react';
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
const SPOUSE_GAP = 40; // 基础夫妻间隙
const SIBLING_GAP = 40; // 兄弟姐妹之间的间隙
const COUSIN_GAP = 80; // 堂表亲（不同家庭）之间的间隙
const VERTICAL_SPACING = 200; // 代际高度

const FamilyTree: React.FC<Props> = ({ 
    characters, activeCharIds, familyLinks, customOrder, blobUrls,
    onAddFamilyLink, onUpdateFamilyLink, onRemoveFamilyLink, onAddActiveChar, onRemoveActiveChar,
    onAddVirtualChar, onUpdateCustomOrder
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.8 });
    const [isPoppedOut, setIsPoppedOut] = useState(false);
    const [dropTarget, setDropTarget] = useState<{ id: string, zone: 'parent' | 'spouse' | 'child_single' | 'marriage_joint' | 'other_relation' } | null>(null);
    const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
    const [isAddingVirtual, setIsAddingVirtual] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [virtualName, setVirtualName] = useState("");
    const [editingLink, setEditingLink] = useState<FamilyLink | null>(null);
    const [tempLinkLabel, setTempLinkLabel] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

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

    // --- 新的布局算法 (Fixed Asymmetric Gap Calculation) ---

    const layoutData = useMemo(() => {
        if (visibleCharacters.length === 0) return { nodePositions: {}, links: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };

        const nodePositions: Record<string, { x: number, y: number, gen: number }> = {};
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

            // 2. 计算左侧配偶的 Gap (修正版：不对称碰撞检测)
            if (leftSpouses.length > 0) {
                const spouseId = leftSpouses[leftSpouses.length - 1];
                
                const jointChildren = getStrictChildren(rootId, spouseId);
                const jointWidth = calculateChildrenBlockWidth(jointChildren);
                jointLayouts[`${spouseId}-${rootId}`] = { children: jointChildren, width: jointWidth };
                
                const spouseSingleChildren = getStrictChildren(spouseId, null);
                const spouseSingleWidth = calculateChildrenBlockWidth(spouseSingleChildren);
                spouseSingleLayouts[spouseId] = { children: spouseSingleChildren, width: spouseSingleWidth };

                // 【关键修复】分别计算两侧的碰撞需求，取最大值
                // 情况A：左边配偶的单亲子女 撞到 中间的共同子女
                // 公式推导：(SpouseSingle + Joint - CardWidth)
                const collisionRiskLeft = spouseSingleWidth + jointWidth;
                
                // 情况B：中间的共同子女 撞到 右边Root的单亲子女
                const collisionRiskRight = jointWidth + rootSingleWidth;
                
                // 取最坏情况
                const maxRiskWidth = Math.max(collisionRiskLeft, collisionRiskRight);
                
                // 如果任一侧有子女，则应用计算出的Gap；否则使用基础夫妻间隙
                if (spouseSingleWidth > 0 || jointWidth > 0 || rootSingleWidth > 0) {
                    // 保留 SIBLING_GAP 作为缓冲
                    const requiredGap = Math.max(SPOUSE_GAP, maxRiskWidth - CARD_WIDTH + SIBLING_GAP);
                    gaps[rootIdx - 1] = requiredGap;
                }
            }

            // 3. 计算右侧配偶的 Gap (修正版：不对称碰撞检测)
            if (rightSpouses.length > 0) {
                const spouseId = rightSpouses[0];
                
                const jointChildren = getStrictChildren(rootId, spouseId);
                const jointWidth = calculateChildrenBlockWidth(jointChildren);
                jointLayouts[`${rootId}-${spouseId}`] = { children: jointChildren, width: jointWidth };

                const spouseSingleChildren = getStrictChildren(spouseId, null);
                const spouseSingleWidth = calculateChildrenBlockWidth(spouseSingleChildren);
                spouseSingleLayouts[spouseId] = { children: spouseSingleChildren, width: spouseSingleWidth };

                // 同上，检查两侧碰撞
                // 左侧是 Root 单亲，右侧是 Spouse 单亲，中间是 Joint
                const collisionRiskLeft = rootSingleWidth + jointWidth;
                const collisionRiskRight = jointWidth + spouseSingleWidth;
                
                const maxRiskWidth = Math.max(collisionRiskLeft, collisionRiskRight);

                if (spouseSingleWidth > 0 || jointWidth > 0 || rootSingleWidth > 0) {
                    const requiredGap = Math.max(SPOUSE_GAP, maxRiskWidth - CARD_WIDTH + SIBLING_GAP);
                    gaps[rootIdx] = requiredGap;
                }
            }

            // 4. 放置节点
            let currentX = startX;
            nodeSequence.forEach((nodeId, idx) => {
                nodePositions[nodeId] = { x: currentX, y: gen * VERTICAL_SPACING, gen };
                placedNodes.add(nodeId);
                currentX += CARD_WIDTH;
                if (idx < gaps.length) {
                    currentX += gaps[idx];
                }
            });

            // 5. 递归放置子女
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

            // 5a. 左侧配偶相关
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

            // 5b. 右侧配偶相关
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

            // 5c. Root 单亲
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

        if (minX === Infinity) return { nodePositions: {}, links: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };

        return { nodePositions, bounds: { minX, maxX, minY, maxY } };
    }, [visibleCharacters, visibleLinks, customOrder]);

    // 视图自适应
    const fitToView = useCallback((animate = true) => {
        if (!svgRef.current || (!containerRef.current && !isPoppedOut)) return;
        const { minX, maxX, minY, maxY } = layoutData.bounds;
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        let containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        let containerHeight = containerRef.current?.clientHeight || window.innerHeight;

        if (graphWidth === 0 || graphHeight === 0) return;
        
        const padding = 100;
        const scaleX = (containerWidth - padding * 2) / graphWidth;
        const scaleY = (containerHeight - padding * 2) / graphHeight;
        const k = Math.min(scaleX, scaleY, 1); 
        
        const centerX = (minX + maxX) / 2;
        const centerY = minY + 100; // 偏上一点
        
        const tx = containerWidth / 2 - centerX * k;
        const ty = 100 - minY * k; // 顶部留白

        const svg = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 5]);
        
        const transform = d3.zoomIdentity.translate(tx, ty).scale(k);
        
        if (animate) {
            svg.transition().duration(750).call(zoomBehavior.transform as any, transform);
        } else {
            svg.call(zoomBehavior.transform as any, transform);
        }
    }, [layoutData, isPoppedOut]);

    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 5])
            .on("zoom", (event: any) => {
                setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
            });
        svg.call(zoomBehavior);
    }, []);

    useEffect(() => {
        // 数据变化后延迟适应视图
        const timer = setTimeout(() => fitToView(true), 100);
        return () => clearTimeout(timer);
    }, [layoutData.bounds.minX, fitToView]);

    // --- 交互处理 ---

    const handleConfirmVirtual = () => {
        if (!virtualName.trim()) return;
        onAddVirtualChar(virtualName.trim());
        setVirtualName("");
        setIsAddingVirtual(false);
    };

    const handleUpdateLinkLabel = () => {
        if (editingLink && onUpdateFamilyLink) {
            onUpdateFamilyLink({ ...editingLink, label: tempLinkLabel });
            setEditingLink(null);
        }
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
        if (ids.length > 1) ids.slice(1).forEach((id:string) => onAddActiveChar(id));
    };

    const handleDropOnMarriage = (e: React.DragEvent, linkId: string) => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
        const link = familyLinks.find(l => l.id === linkId);
        if (ids.length === 0 || !link || !link.partners || !ids[0]) return;
        
        const sourceId = ids[0];
        onAddActiveChar(sourceId);
        // 添加为该对夫妻的子女
        onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [link.partners[0], link.partners[1]], child: sourceId });
        
        if (ids.length > 1) ids.slice(1).forEach((id:string) => onAddActiveChar(id));
    };

    // 渲染内容
    const renderContent = () => (
        <>
            {/* HUD / Controls */}
            <div className="absolute top-6 right-6 z-20 flex gap-2 pointer-events-auto">
                <button onClick={() => fitToView()} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95" title="自适应视图中心">
                    <Crosshair size={20} />
                </button>
                <button onClick={() => setIsAddingVirtual(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl border border-slate-700 shadow-xl transition-all font-bold text-xs active:scale-95">
                    <UserRoundPlus size={16} /> 添加占位符
                </button>
                <button onClick={() => setIsGuideOpen(true)} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95" title="操作指南">
                    <HelpCircle size={20} />
                </button>
                <button onClick={() => setIsPoppedOut(!isPoppedOut)} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95" title="在新窗口中打开">
                    {isPoppedOut ? <Minimize size={20} /> : <ExternalLink size={20} />}
                </button>
            </div>

            <div className="absolute top-6 left-6 z-20 pointer-events-none flex flex-col gap-2">
                <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3 pointer-events-auto">
                    <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg"><GitBranch size={16} className="text-white" /></div>
                    <div>
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">代际家谱视图</h3>
                        <p className="text-[9px] text-slate-500 font-bold italic">每一层代表一代人，夫妻横向对齐</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-auto cursor-move">
                    <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                        
                        {/* 1. 绘制婚姻连线 */}
                        {visibleLinks.filter(l => l.type === 'marriage').map(link => {
                            const p1 = layoutData.nodePositions[link.partners![0]];
                            const p2 = layoutData.nodePositions[link.partners![1]];
                            if (!p1 || !p2) return null;
                            
                            const x1 = p1.x;
                            const x2 = p2.x;
                            
                            // 总是从左侧卡片的右边连到右侧卡片的左边
                            const leftNode = x1 < x2 ? p1 : p2;
                            const rightNode = x1 < x2 ? p2 : p1;
                            
                            const startX = leftNode.x + CARD_WIDTH;
                            const endX = rightNode.x;
                            const y = leftNode.y + CARD_HEIGHT / 2;
                            const midX = (startX + endX) / 2;

                            return (
                                <g key={link.id} className="group/marriage">
                                    <line x1={startX} y1={y} x2={endX} y2={y} stroke="#f472b6" strokeWidth={3} />
                                    {/* 婚姻节点 (Drop Zone) */}
                                    <g 
                                        transform={`translate(${midX}, ${y})`}
                                        onClick={(e) => { e.stopPropagation(); setEditingLink(link); setTempLinkLabel(link.label || ''); }}
                                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id: link.id, zone: 'marriage_joint'}); }} 
                                        onDragLeave={() => setDropTarget(null)} 
                                        onDrop={e => handleDropOnMarriage(e, link.id)} 
                                        className="cursor-pointer transition-transform hover:scale-125"
                                    >
                                        <circle r={24} fill="transparent" /> {/* 扩大感应区 */}
                                        <circle r={10} fill="#f472b6" stroke="#fff" strokeWidth={2} />
                                        <Heart size={10} className="text-white" x={-5} y={-5} />
                                    </g>
                                </g>
                            );
                        })}

                        {/* 2. 绘制亲子连线 (倒T型) */}
                        {visibleLinks.filter(l => l.type === 'parent_child' && l.child).map(link => {
                            const childPos = layoutData.nodePositions[link.child!];
                            if (!childPos) return null;

                            // 寻找可见的父母节点
                            const visibleParentIds = (link.parents || []).filter(pid => !!layoutData.nodePositions[pid]);
                            
                            if (visibleParentIds.length === 0) return null;

                            let startX = 0;
                            let startY = 0;
                            
                            if (visibleParentIds.length >= 2) {
                                // 双亲：从两个父母的几何中心发出
                                const p1 = layoutData.nodePositions[visibleParentIds[0]];
                                const p2 = layoutData.nodePositions[visibleParentIds[1]];
                                
                                startX = (p1.x + p2.x + CARD_WIDTH) / 2;
                                startY = p1.y + CARD_HEIGHT / 2; // 从婚姻线高度发出
                            } else {
                                // 单亲：从该父母卡片底部中心发出
                                const p = layoutData.nodePositions[visibleParentIds[0]];
                                startX = p.x + CARD_WIDTH / 2;
                                startY = p.y + CARD_HEIGHT;
                            }

                            const endX = childPos.x + CARD_WIDTH / 2;
                            const endY = childPos.y;
                            
                            // 曼哈顿路径
                            const midY = startY + (endY - startY) / 2;
                            const pathData = `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;

                            return (
                                <path 
                                    key={link.id}
                                    d={pathData}
                                    fill="none"
                                    stroke="#64748b"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="opacity-50 hover:opacity-100 transition-opacity"
                                />
                            );
                        })}

                        {/* 3. 绘制节点卡片 */}
                        {Object.entries(layoutData.nodePositions).map(([id, pos]) => {
                            const char = characters.find(c => c.id === id);
                            if (!char) return null;
                            const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                            const isHighlighted = hoveredCharId === id;
                            const isActive = !!hoveredCharId;

                            return (
                                <foreignObject 
                                    key={id} 
                                    x={pos.x} 
                                    y={pos.y} 
                                    width={CARD_WIDTH} 
                                    height={CARD_HEIGHT}
                                    className="overflow-visible"
                                >
                                    <div 
                                        draggable 
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData("application/react-dnd-char-id", char.id);
                                            e.stopPropagation();
                                        }}
                                        onMouseEnter={() => setHoveredCharId(char.id)} 
                                        onMouseLeave={() => setHoveredCharId(null)} 
                                        className={`w-full h-full rounded-xl border-2 bg-slate-800 flex items-center p-2 relative shadow-lg group transition-all duration-300
                                            ${char.isVirtual ? 'border-dashed border-slate-600 opacity-80' : 'border-slate-600 hover:border-indigo-400'}
                                            ${isHighlighted ? 'scale-105 z-10 ring-4 ring-indigo-500/30' : isActive ? 'opacity-40' : ''}
                                        `}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-slate-700 shrink-0 overflow-hidden border border-slate-500">
                                            {portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover" /> : <User size={20} className="text-slate-400 m-2" />}
                                        </div>
                                        <div className="ml-2 flex flex-col min-w-0">
                                            <span className="text-xs font-bold text-white truncate">{char.name}</span>
                                            <span className="text-[9px] text-slate-400 truncate">{char.raw_info || '...'}</span>
                                        </div>

                                        {/* Delete Button */}
                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onRemoveActiveChar(char.id); }} 
                                                className="p-1.5 bg-slate-900/90 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 border border-slate-700/50 shadow-sm backdrop-blur-sm transition-colors"
                                                title="从当前视图移除"
                                            >
                                                <UserMinus size={14} />
                                            </button>
                                        </div>

                                        {/* Drop Zones */}
                                        {/* Parent (Top) */}
                                        <div className={`absolute -top-6 left-0 right-0 h-6 flex justify-center items-center transition-opacity ${dropTarget?.id === id && dropTarget.zone === 'parent' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                             onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id, zone: 'parent'}); }}
                                             onDrop={e => handleDropOnPerson(e, id, 'parent')}>
                                            <div className="bg-indigo-600 text-white text-[8px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow"><ArrowDown size={8}/> 父母</div>
                                        </div>
                                        {/* Child (Bottom) */}
                                        <div className={`absolute -bottom-6 left-0 right-0 h-6 flex justify-center items-center transition-opacity ${dropTarget?.id === id && dropTarget.zone === 'child_single' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                             onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id, zone: 'child_single'}); }}
                                             onDrop={e => handleDropOnPerson(e, id, 'child_single')}>
                                            <div className="bg-blue-600 text-white text-[8px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow"><ArrowUp size={8}/> 子女</div>
                                        </div>
                                        {/* Spouse (Sides) */}
                                        <div className={`absolute top-0 bottom-0 -right-8 w-8 flex justify-center items-center transition-opacity ${dropTarget?.id === id && dropTarget.zone === 'spouse' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                             onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id, zone: 'spouse'}); }}
                                             onDrop={e => handleDropOnPerson(e, id, 'spouse')}>
                                            <div className="bg-pink-600 text-white p-1 rounded-full shadow"><Heart size={10}/></div>
                                        </div>
                                        <div className={`absolute top-0 bottom-0 -left-8 w-8 flex justify-center items-center transition-opacity ${dropTarget?.id === id && dropTarget.zone === 'spouse' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                             onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget({id, zone: 'spouse'}); }}
                                             onDrop={e => handleDropOnPerson(e, id, 'spouse')}>
                                            <div className="bg-pink-600 text-white p-1 rounded-full shadow"><Heart size={10}/></div>
                                        </div>
                                    </div>
                                </foreignObject>
                            );
                        })}
                    </g>
                </svg>
            </div>

            {/* Modals & Dialogs (Same as before) */}
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
        </>
    );

    if (isPoppedOut) {
        return (
            <>
                <div ref={containerRef} className="h-full min-h-[650px] bg-slate-900/10 border border-dashed border-slate-700 rounded-3xl flex flex-col items-center justify-center text-slate-500 animate-pulse">
                    <ExternalLink size={48} className="mb-4 opacity-50" />
                    <h3 className="font-bold text-lg text-slate-400">谱系图已在新窗口打开</h3>
                    <p className="text-xs mt-2">请在弹出窗口中进行编辑操作</p>
                    <button onClick={() => setIsPoppedOut(false)} className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white border border-slate-600 transition-all">
                        恢复到主窗口
                    </button>
                </div>
                <PortalWindow onClose={() => setIsPoppedOut(false)}>
                    <div className="flex h-full w-full bg-slate-900">
                        {/* Sidebar in Popout */}
                        <div className="w-72 bg-slate-800/50 border-r border-slate-700 flex flex-col">
                            <div className="p-4 border-b border-slate-700 bg-slate-900/50">
                                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 mb-3">
                                    <User size={14} className="text-blue-400"/> 登场人物列表
                                </h3>
                                <input 
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="搜索人物..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                                {characters
                                    .filter(c => !c.isVirtual && (searchTerm === "" || c.name.includes(searchTerm)))
                                    .map(char => {
                                    const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
                                    const isActive = activeCharIds.includes(char.id);
                                    return (
                                        <div 
                                            key={char.id}
                                            draggable={!isActive}
                                            onDragStart={(e) => {
                                                if (isActive) return;
                                                e.dataTransfer.setData("application/react-dnd-char-id", char.id);
                                            }}
                                            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${isActive ? 'bg-slate-900/50 border-slate-800 opacity-50 grayscale cursor-default' : 'bg-slate-800 border-slate-700 hover:border-blue-500 hover:bg-slate-700 cursor-grab active:cursor-grabbing hover:shadow-md'}`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                                                {portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover" /> : <User size={14} className="text-slate-500" />}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold text-slate-200 truncate">{char.name}</span>
                                                <span className="text-[9px] text-slate-500 truncate">{char.raw_info || char.note || "无描述"}</span>
                                            </div>
                                            {isActive && <div className="ml-auto"><div className="w-2 h-2 bg-green-500 rounded-full" /></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Graph in Popout */}
                        <div 
                            className="flex-1 relative overflow-hidden bg-slate-900" 
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
                                ids.forEach((id:string) => id && onAddActiveChar(id));
                            }}
                        >
                            {renderContent()}
                        </div>
                    </div>
                </PortalWindow>
            </>
        );
    }

    return (
        <div 
            ref={containerRef}
            className="relative flex flex-col transition-all overflow-hidden border border-slate-800 rounded-3xl h-full min-h-[650px] bg-slate-900/20"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
                e.preventDefault();
                const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
                ids.forEach((id:string) => id && onAddActiveChar(id));
            }}
        >
            {renderContent()}
        </div>
    );
};

export default FamilyTree;