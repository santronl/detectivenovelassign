
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Character, FamilyLink } from '../types';
import { User, Heart, X, Minimize, Maximize, GitBranch, UserRoundPlus, HelpCircle, ArrowDown, ArrowUp, Check, Search, ArrowUpDown, MousePointer2 } from 'lucide-react';
import PortalWindow from './PortalWindow';

interface Props {
  characters: Character[];
  activeCharIds: string[];
  familyLinks: FamilyLink[];
  customOrder: Record<string, string[]>;
  rootCoords: Record<string, { x: number; y: number }>;
  blobUrls: Record<string, string>;
  onAddFamilyLink: (link: FamilyLink) => void;
  onUpdateFamilyLink?: (link: FamilyLink) => void;
  onRemoveFamilyLink: (linkId: string) => void;
  onAddActiveChar: (charId: string) => void;
  onRemoveActiveChar: (charId: string) => void;
  onAddVirtualChar: (name: string) => void;
  onUpdateCustomOrder: (order: Record<string, string[]>) => void;
  onUpdateRootCoords: (coords: Record<string, { x: number; y: number }>) => void;
}

const CARD_WIDTH = 160;
const CARD_HEIGHT = 80;
const SPOUSE_GAP = 120;
const SIBLING_GAP = 40;
const COUSIN_GAP = 80;
const VERTICAL_SPACING = 200;

type NodePos = { x: number, y: number, gen: number };
type SubtreeStats = { width: number; lBound: number; rBound: number };

const FamilyTree: React.FC<Props> = ({ 
    characters, activeCharIds, familyLinks, customOrder, rootCoords, blobUrls,
    onAddFamilyLink, onUpdateFamilyLink, onRemoveFamilyLink, onAddActiveChar, onRemoveActiveChar,
    onAddVirtualChar, onUpdateCustomOrder, onUpdateRootCoords
}) => {
    const [svgNode, setSvgNode] = useState<SVGSVGElement | null>(null);
    const svgRefCallback = useCallback((node: SVGSVGElement | null) => {
        setSvgNode(node);
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<{x: number, y: number, k: number}>({ x: 0, y: 0, k: 0.8 });
    const [isPoppedOut, setIsPoppedOut] = useState(false);
    const [dropTarget, setDropTarget] = useState<{ id: string, zone: 'parent' | 'spouse_left' | 'spouse_right' | 'child_single' | 'marriage_joint' } | null>(null);
    const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
    const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
    const [draggingCharId, setDraggingCharId] = useState<string | null>(null);
    const [isAddingVirtual, setIsAddingVirtual] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [virtualName, setVirtualName] = useState("");
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

    // --- Helpers for Relationship Logic ---
    const getSpouses = useCallback((id: string) => {
        const spouses = new Set<string>();
        visibleLinks.forEach(l => {
            if (l.type === 'marriage' && l.partners?.includes(id)) {
                const partner = l.partners.find(p => p !== id);
                if (partner) spouses.add(partner);
            }
        });
        
        const spouseList = Array.from(spouses);
        const orderKey = `spouses_${id}`;
        const definedOrder = customOrder[orderKey];

        if (definedOrder && definedOrder.length > 0) {
            spouseList.sort((a, b) => {
                const idxA = definedOrder.indexOf(a);
                const idxB = definedOrder.indexOf(b);
                if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        } else {
            spouseList.sort();
        }
        
        return spouseList;
    }, [visibleLinks, customOrder]);

    const getParents = useCallback((childId: string) => {
        const parents = new Set<string>();
        visibleLinks.forEach(l => {
            if (l.type === 'parent_child' && l.child === childId && l.parents) {
                l.parents.forEach(p => parents.add(p));
            }
        });
        return Array.from(parents).sort();
    }, [visibleLinks]);

    const getCommonParentKey = useCallback((id1: string, id2: string) => {
        const p1 = getParents(id1);
        const p2 = getParents(id2);
        
        if (p1.length === 0 && p2.length === 0) return 'roots';

        if (p1.length !== p2.length) return null;
        const sortedP1 = [...p1].sort();
        const sortedP2 = [...p2].sort();
        
        for(let i=0; i<sortedP1.length; i++) {
            if (sortedP1[i] !== sortedP2[i]) return null;
        }
        
        return `children_${sortedP1.join('_')}`;
    }, [getParents]);

    // Lifted from layoutData to be accessible for bias calculation
    const getStrictChildren = useCallback((p1: string, p2: string | null): string[] => {
        const p1Spouses = getSpouses(p1);
        const rawChildren = visibleLinks
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
        
        const uniqueChildren = Array.from(new Set<string>(rawChildren));
        
        const parentKey = p2 
            ? `children_${[p1, p2].sort().join('_')}` 
            : `children_${p1}`;
        
        const order = customOrder[parentKey];
        if (order && order.length > 0) {
            uniqueChildren.sort((a, b) => {
                const idxA = order.indexOf(a);
                const idxB = order.indexOf(b);
                if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        } else {
            uniqueChildren.sort((a, b) => a.localeCompare(b));
        }
        
        return uniqueChildren;
    }, [visibleLinks, getSpouses, customOrder]);

    /**
     * Determines layout bias (Flip or Default) for spouses based on adjacent siblings.
     * Default (Right-first): Index 0 -> Right, Index 1 -> Left
     * Flip (Left-first): Index 0 -> Left, Index 1 -> Right
     */
    const getSpouseLayoutBias = useCallback((charId: string): 'default' | 'flip' => {
        const parents = getParents(charId);
        let siblings: string[] = [];
        
        if (parents.length === 0) {
            // Check Root Order
            const hasParents = new Set<string>();
            visibleLinks.forEach(l => { if (l.type === 'parent_child' && l.child) hasParents.add(l.child); });
            const roots = visibleCharacters.filter(c => !hasParents.has(c.id));
            
            const rootOrder = customOrder['roots'];
            if (rootOrder) {
                siblings = roots.map(r => r.id).sort((a,b) => {
                    const idxA = rootOrder.indexOf(a);
                    const idxB = rootOrder.indexOf(b);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return 0;
                });
            } else {
                siblings = roots.map(r => r.id).sort();
            }
        } else {
            const p1 = parents[0];
            const p2 = parents.length > 1 ? parents[1] : null;
            siblings = getStrictChildren(p1, p2);
        }
        
        // If I am the FIRST sibling (Left-most), my siblings are to my Right.
        // Therefore, I should prefer placing spouses to my LEFT (away from siblings).
        if (siblings.length > 0 && siblings[0] === charId) return 'flip';
        
        return 'default';
    }, [getParents, visibleLinks, visibleCharacters, customOrder, getStrictChildren]);

    // --- Layout Algorithm ---
    const layoutData = useMemo((): { nodePositions: Record<string, NodePos>, bounds: { minX: number, maxX: number, minY: number, maxY: number } } => {
        const emptyResult = { 
            nodePositions: {} as Record<string, NodePos>, 
            bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } 
        };

        if (visibleCharacters.length === 0) return emptyResult;

        const nodePositions: Record<string, NodePos> = {};
        const placedNodes = new Set<string>();
        let currentMaxX = 0;

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

        // blockId: Optional ID to prevent shifting (e.g., the root we are expanding from)
        const shiftSubtree = (rootId: string, dx: number, blockId?: string) => {
            if (Math.abs(dx) < 0.1) return;
            const queue = [rootId];
            const visited = new Set<string>();
            if (blockId) visited.add(blockId); // Block the barrier node from moving

            while (queue.length > 0) {
                const curr = queue.shift()!;
                if (visited.has(curr)) continue;
                visited.add(curr);
                if (nodePositions[curr]) nodePositions[curr].x += dx;
                
                // Propagate to Spouses
                getSpouses(curr).forEach(s => { if (!visited.has(s)) queue.push(s); });
                
                // Propagate to Children
                visibleLinks.forEach(l => {
                    if (l.type === 'parent_child' && l.parents?.includes(curr) && l.child) {
                        if (!visited.has(l.child)) queue.push(l.child);
                    }
                });
            }
        };

        const layoutSubtree = (rootId: string, gen: number, startX: number, startY: number): SubtreeStats => {
            if (placedNodes.has(rootId)) return { width: 0, lBound: startX, rBound: startX };

            const allSpouses = getSpouses(rootId);
            const leftSpouses: string[] = [];
            const rightSpouses: string[] = [];
            
            // Apply Placement Bias
            const bias = getSpouseLayoutBias(rootId);
            
            allSpouses.forEach((sId, idx) => {
                const isEven = idx % 2 === 0;
                let goRight = true;

                if (bias === 'default') {
                     // Default: Even -> Right, Odd -> Left
                     goRight = isEven;
                } else {
                     // Flip: Even -> Left, Odd -> Right
                     goRight = !isEven;
                }

                if (goRight) rightSpouses.push(sId);
                else leftSpouses.push(sId);
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
                nodePositions[nodeId] = { x: currentX, y: startY + gen * VERTICAL_SPACING, gen };
                placedNodes.add(nodeId);
                currentX += CARD_WIDTH;
                if (idx < gaps.length) {
                    currentX += gaps[idx];
                }
            });

            // Initialize bounds with the root row extent
            let statsL = startX;
            let statsR = currentX;
            const rootRowWidth = statsR - statsL;

            const placeAndAlignChildren = (children: string[], width: number, targetCenterX: number): { l: number, r: number } | null => {
                if (children.length === 0) return null;
                let childStartX = targetCenterX - width / 2;
                
                // 1. Initial Layout & Stats Collection
                const childStats: { id: string, stats: SubtreeStats }[] = [];
                children.forEach(childId => {
                    const s = layoutSubtree(childId, gen + 1, childStartX, startY);
                    childStats.push({ id: childId, stats: s });
                    childStartX += s.width + SIBLING_GAP;
                });

                // 2. Collision Detection (Left-to-Right)
                // Ensure the left bound of a child is to the right of the right bound of previous child
                for (let i = 0; i < childStats.length - 1; i++) {
                    const current = childStats[i];
                    const next = childStats[i+1];
                    
                    if (current.stats.rBound + SIBLING_GAP > next.stats.lBound) {
                        const shift = (current.stats.rBound + SIBLING_GAP) - next.stats.lBound;
                        shiftSubtree(next.id, shift);
                        next.stats.lBound += shift;
                        next.stats.rBound += shift;
                        // Shift naturally propagates to subsequent siblings in next iterations of this loop
                    }
                }

                // 3. Re-center group under parent
                const childNodesX = children.map(c => nodePositions[c]?.x).filter(x => x !== undefined);
                if (childNodesX.length > 0) {
                    const minRootX = Math.min(...childNodesX);
                    const maxRootX = Math.max(...childNodesX);
                    const currentGroupCenter = (minRootX + maxRootX + CARD_WIDTH) / 2;
                    const correction = targetCenterX - currentGroupCenter;
                    
                    if (Math.abs(correction) > 0.1) {
                        children.forEach(c => shiftSubtree(c, correction));
                        childStats.forEach(item => {
                            item.stats.lBound += correction;
                            item.stats.rBound += correction;
                        });
                    }
                }

                // Collect bounds for this specific group
                let groupL = Infinity;
                let groupR = -Infinity;

                childStats.forEach(item => {
                    // Track for return
                    groupL = Math.min(groupL, item.stats.lBound);
                    groupR = Math.max(groupR, item.stats.rBound);

                    // Update parent's overall bounds
                    statsL = Math.min(statsL, item.stats.lBound);
                    statsR = Math.max(statsR, item.stats.rBound);
                });

                return { l: groupL, r: groupR };
            };

            // 1. Place Root's Single Children (To establish baseline bounds)
            let rootSingleBounds: { l: number, r: number } | null = null;
            if (rootSingleChildren.length > 0) {
                const pRoot = nodePositions[rootId];
                const rootCenter = pRoot.x + CARD_WIDTH / 2;
                rootSingleBounds = placeAndAlignChildren(rootSingleChildren, rootSingleWidth, rootCenter);
            }

            if (leftSpouses.length > 0) {
                const spouseId = leftSpouses[leftSpouses.length - 1];
                const pSpouse = nodePositions[spouseId];
                const pRoot = nodePositions[rootId];
                
                const jointData = jointLayouts[`${spouseId}-${rootId}`];
                let jointBounds: { l: number, r: number } | null = null;
                
                if (jointData) {
                    const jointCenter = (pSpouse.x + pRoot.x + CARD_WIDTH) / 2;
                    jointBounds = placeAndAlignChildren(jointData.children, jointData.width, jointCenter);

                    // --- Collision Detection for Left Spouses ---
                    // Overlap between: Joint Children (Left) vs Root Single Children (Right)
                    if (jointBounds && rootSingleBounds) {
                        const dist = rootSingleBounds.l - jointBounds.r;
                        if (dist < SIBLING_GAP) {
                            const overlap = SIBLING_GAP - dist;
                            // Shift Spouse (and joint children) to the Left to make space
                            shiftSubtree(spouseId, -overlap * 2, rootId);
                            // Correct children back right
                            jointData.children.forEach(child => shiftSubtree(child, overlap));

                            jointBounds.l -= overlap;
                            jointBounds.r -= overlap;
                            statsL = Math.min(statsL, jointBounds.l);
                        }
                    }
                }
                const singleData = spouseSingleLayouts[spouseId];
                let singleBounds: { l: number, r: number } | null = null;
                if (singleData) {
                    const currentSpouseX = nodePositions[spouseId].x; // Might have shifted
                    const spouseCenter = currentSpouseX + CARD_WIDTH / 2;
                    singleBounds = placeAndAlignChildren(singleData.children, singleData.width, spouseCenter);
                }

                // Check collision: SpouseSingle (Left) vs Joint (Right)
                if (singleBounds && jointBounds) {
                     const dist = jointBounds.l - singleBounds.r;
                     if (dist < SIBLING_GAP) {
                         const overlap = SIBLING_GAP - dist;
                         // Shift Spouse left by 2*overlap
                         shiftSubtree(spouseId, -overlap * 2, rootId);
                         // Correct Joint children back right by overlap
                         if (jointData) jointData.children.forEach(child => shiftSubtree(child, overlap));
                         
                         // Update bounds
                         singleBounds.l -= overlap * 2;
                         singleBounds.r -= overlap * 2;
                         jointBounds.l -= overlap; // Moved -2O then +O = -O
                         jointBounds.r -= overlap;
                         
                         statsL = Math.min(statsL, singleBounds.l);
                     }
                }
                if (singleBounds) {
                    statsL = Math.min(statsL, singleBounds.l);
                    statsR = Math.max(statsR, singleBounds.r);
                }
            }

            if (rightSpouses.length > 0) {
                const spouseId = rightSpouses[0];
                const pRoot = nodePositions[rootId];
                const pSpouse = nodePositions[spouseId];
                
                const jointData = jointLayouts[`${rootId}-${spouseId}`];
                let jointBounds: { l: number, r: number } | null = null;

                if (jointData) {
                    const jointCenter = (pRoot.x + pSpouse.x + CARD_WIDTH) / 2;
                    jointBounds = placeAndAlignChildren(jointData.children, jointData.width, jointCenter);

                    // --- Collision Detection for Right Spouses ---
                    // Overlap between: Root Single Children (Left) vs Joint Children (Right)
                    if (rootSingleBounds && jointBounds) {
                        const overlap = (rootSingleBounds.r + SIBLING_GAP) - jointBounds.l;
                        if (overlap > 0) {
                            const shiftB = overlap * 2;
                            shiftSubtree(spouseId, shiftB, rootId);
                            // Correct joint children back left
                            jointData.children.forEach(child => shiftSubtree(child, -overlap));

                            jointBounds.l += overlap;
                            jointBounds.r += overlap;
                            statsR = Math.max(statsR, jointBounds.r);
                        }
                    }
                }

                const singleData = spouseSingleLayouts[spouseId];
                let singleBounds: { l: number, r: number } | null = null;
                if (singleData) {
                    const currentSpouseX = nodePositions[spouseId].x;
                    const spouseCenter = currentSpouseX + CARD_WIDTH / 2;
                    singleBounds = placeAndAlignChildren(singleData.children, singleData.width, spouseCenter);
                }

                // Check collision: Joint (Left) vs SpouseSingle (Right)
                if (jointBounds && singleBounds) {
                    const overlap = (jointBounds.r + SIBLING_GAP) - singleBounds.l;
                    if (overlap > 0) {
                        const shiftB = overlap * 2;
                        shiftSubtree(spouseId, shiftB, rootId);
                        // Correct joint children back left
                        if (jointData) jointData.children.forEach(child => shiftSubtree(child, -overlap));
                        
                        // Update bounds
                        singleBounds.l += overlap * 2;
                        singleBounds.r += overlap * 2;
                        jointBounds.l += overlap;
                        jointBounds.r += overlap;
                        
                        statsR = Math.max(statsR, singleBounds.r);
                    }
                }
                if (singleBounds) {
                    statsL = Math.min(statsL, singleBounds.l);
                    statsR = Math.max(statsR, singleBounds.r);
                }
            }

            return { width: rootRowWidth, lBound: statsL, rBound: statsR };
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
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.name.localeCompare(b.name);
        });

        sortedRoots.forEach(root => {
            if (!placedNodes.has(root.id)) {
                const mySpouses = getSpouses(root.id);
                if (mySpouses.some(s => placedNodes.has(s))) return;
                
                let rootX = currentMaxX;
                let rootY = 0;
                
                // Use manual coordinate if available
                if (rootCoords[root.id]) {
                    rootX = rootCoords[root.id].x;
                    rootY = rootCoords[root.id].y;
                }

                const stats = layoutSubtree(root.id, 0, rootX, rootY);
                
                // Ensure next root starts after this root's complete subtree
                if (!rootCoords[root.id]) {
                    currentMaxX = Math.max(currentMaxX, stats.rBound + COUSIN_GAP);
                } else {
                    currentMaxX = Math.max(currentMaxX, rootX + stats.width + COUSIN_GAP);
                }
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
    }, [visibleCharacters, visibleLinks, customOrder, getSpouses, rootCoords, getStrictChildren, getSpouseLayoutBias]);

    // --- View Handling ---
    
    // Fit to view
    const fitToView = useCallback((animate = true) => {
        if (!svgNode) return;
        const { minX, maxX, minY, maxY } = layoutData.bounds;
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        let containerWidth = containerRef.current?.clientWidth || window.innerWidth;
        let containerHeight = containerRef.current?.clientHeight || window.innerHeight;
        
        if (!isPoppedOut && !containerRef.current) return;

        if (graphWidth === 0 || graphHeight === 0) return;
        
        const padding = 100;
        const scaleX = (containerWidth - padding * 2) / graphWidth;
        const scaleY = (containerHeight - padding * 2) / graphHeight;
        const k = Math.min(scaleX, scaleY, 1); 
        
        const centerX = (minX + maxX) / 2;
        // const centerY = (minY + maxY) / 2;
        
        const tx = containerWidth / 2 - centerX * k;
        const ty = 100 - minY * k;

        const svg = d3.select(svgNode);
        const zoomBehavior = d3.zoom<SVGSVGElement, any>().scaleExtent([0.1, 5]);
        const newTransform = d3.zoomIdentity.translate(tx, ty).scale(k);
        
        if (animate) {
            svg.transition().duration(750).call(zoomBehavior.transform as any, newTransform);
        } else {
            svg.call(zoomBehavior.transform as any, newTransform);
        }
    }, [layoutData, isPoppedOut, svgNode]);

    // Initialize D3 Zoom
    useEffect(() => {
        if (!svgNode) return;
        const svg = d3.select(svgNode);
        const zoomBehavior = d3.zoom<SVGSVGElement, any>()
            .scaleExtent([0.1, 5])
            .filter((event) => {
                // IMPORTANT: Conflict Resolution
                // If dragging a character (target is inside .node-card), ignore zoom/pan.
                const target = event.target as HTMLElement;
                if (target.closest('.node-card')) return false;
                
                // Allow wheel scrolling
                if (event.type === 'wheel') return true;
                
                // Standard behavior (ignore secondary clicks)
                return !event.ctrlKey && !event.button;
            })
            .on("zoom", (event) => {
                const e = event as any;
                const t = e.transform || { x: 0, y: 0, k: 1 };
                setTransform({ x: t.x, y: t.y, k: t.k });
            });
        
        svg.call(zoomBehavior);
        const t = transform;
        svg.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(t.x, t.y).scale(t.k));
        
    }, [svgNode]);

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

    const handleDropOnPerson = (e: React.DragEvent, targetId: string, zone: 'parent' | 'spouse_left' | 'spouse_right' | 'child_single' | 'marriage_joint') => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        setHoveredCharId(null);
        setDragOverNodeId(null);
        const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
        if (ids.length === 0 || !ids[0]) return;
        const sourceId = ids[0];
        if (sourceId === targetId) return;
        onAddActiveChar(sourceId);
        
        if (zone === 'spouse_left' || zone === 'spouse_right') {
            // Check if link exists
            const exists = familyLinks.some(l => l.type === 'marriage' && (l.partners || []).includes(targetId) && (l.partners || []).includes(sourceId));
            if (!exists) onAddFamilyLink({ id: crypto.randomUUID(), type: 'marriage', partners: [targetId, sourceId] });

            const bias = getSpouseLayoutBias(targetId);
            const currentSpouses = getSpouses(targetId).filter(id => id !== sourceId);
            
            // Reconstruct the intended layout buckets
            const leftBucket: string[] = [];
            const rightBucket: string[] = [];
            
            currentSpouses.forEach((sid, idx) => {
                const isEven = idx % 2 === 0;
                // Default: Even=Right, Odd=Left
                // Flip: Even=Left, Odd=Right
                const goRight = bias === 'default' ? isEven : !isEven;
                
                if (goRight) rightBucket.push(sid);
                else leftBucket.push(sid);
            });
            
            // Add new spouse to requested bucket
            if (zone === 'spouse_left') leftBucket.push(sourceId); // Add to end of left side
            else rightBucket.unshift(sourceId); // Add to start of right side (closest to self)
            
            // Reconstruct single array by interleaving based on bias
            const newOrder: string[] = [];
            let l = 0, r = 0;
            const total = leftBucket.length + rightBucket.length;
            
            for (let i = 0; i < total; i++) {
                const isEven = i % 2 === 0;
                const shouldPickFromRight = bias === 'default' ? isEven : !isEven;
                
                if (shouldPickFromRight) {
                    if (r < rightBucket.length) newOrder.push(rightBucket[r++]);
                    else if (l < leftBucket.length) newOrder.push(leftBucket[l++]);
                } else {
                    if (l < leftBucket.length) newOrder.push(leftBucket[l++]);
                    else if (r < rightBucket.length) newOrder.push(rightBucket[r++]);
                }
            }

            onUpdateCustomOrder({
                ...customOrder,
                [`spouses_${targetId}`]: newOrder
            });

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

    const handleSmartDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault(); e.stopPropagation();
        setDropTarget(null);
        setHoveredCharId(null);
        setDraggingCharId(null);
        setDragOverNodeId(null);
        
        const ids = (e.dataTransfer.getData("application/mysterymind-ids") ? JSON.parse(e.dataTransfer.getData("application/mysterymind-ids")) : [e.dataTransfer.getData("application/react-dnd-char-id")]);
        if (ids.length === 0 || !ids[0]) return;
        const sourceId = ids[0];
        if (sourceId === targetId) return;

        // Try Reorder
        const parentKey = getCommonParentKey(sourceId, targetId);
        if (parentKey) {
            let siblings: string[] = [];
            
            if (parentKey === 'roots') {
                const hasParents = new Set<string>();
                visibleLinks.filter(l => l.type === 'parent_child').forEach(l => {
                    if (l.child) hasParents.add(l.child);
                });
                const candidates = visibleCharacters.filter(c => !hasParents.has(c.id));
                siblings = candidates.map(c => c.id);
            } else {
                const parents = getParents(targetId); 
                siblings = visibleLinks
                    .filter(l => l.type === 'parent_child' && l.child)
                    .filter(l => {
                        const lParents = (l.parents || []).sort();
                        if (lParents.length !== parents.length) return false;
                        return lParents.every((p, i) => p === parents[i]);
                    })
                    .map(l => l.child!);
            }
            siblings = Array.from(new Set(siblings));

            // Get current sort to determine precise insertion index
            const existingSort = customOrder[parentKey] || [];
            
            // Reconstruct the full current order of siblings (including any not in customOrder yet but visually sorted)
            const currentSortedSiblings = [...siblings].sort((a, b) => {
                const idxA = existingSort.indexOf(a);
                const idxB = existingSort.indexOf(b);
                if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
            
            const oldSourceIdx = currentSortedSiblings.indexOf(sourceId);
            const oldTargetIdx = currentSortedSiblings.indexOf(targetId);
            
            // Create new list without source
            const newSiblings = currentSortedSiblings.filter(id => id !== sourceId);
            const newTargetIdx = newSiblings.indexOf(targetId);
            
            let insertAt = newTargetIdx;
            
            // Logic: 
            // If dragging from left to right (source < target), insert AFTER target.
            // If dragging from right to left (source > target), insert BEFORE target.
            if (oldSourceIdx !== -1 && oldTargetIdx !== -1) {
                if (oldSourceIdx < oldTargetIdx) {
                    insertAt = newTargetIdx + 1;
                } else {
                    insertAt = newTargetIdx;
                }
            }

            newSiblings.splice(insertAt, 0, sourceId);
            
            onUpdateCustomOrder({
                ...customOrder,
                [parentKey]: newSiblings
            });
            return;
        }

        // Fallback: Default to 'parent' drop (Add relationship)
        onAddActiveChar(sourceId);
        const exists = familyLinks.some(l => l.type === 'parent_child' && l.child === sourceId && l.parents?.includes(targetId));
        if (!exists) {
            onAddFamilyLink({ id: crypto.randomUUID(), type: 'parent_child', parents: [targetId], child: sourceId });
        }
    };

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDraggingCharId(null);
        setDragOverNodeId(null);
        const rawIds = e.dataTransfer.getData("application/mysterymind-ids");
        const singleId = e.dataTransfer.getData("application/react-dnd-char-id");
        
        let ids: string[] = [];
        if (rawIds) {
            try {
                ids = JSON.parse(rawIds);
            } catch (e) {}
        } else if (singleId) {
            ids = [singleId];
        }

        if (ids.length === 0) return;

        // If not dragged onto the container, just add them
        if (!containerRef.current) {
             ids.forEach(id => onAddActiveChar(id));
             return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        // Calculate dropped position in SVG coordinates
        const dropX = (e.clientX - rect.left - transform.x) / transform.k;
        const dropY = (e.clientY - rect.top - transform.y) / transform.k;

        // Update root coordinates with absolute positions
        // Stagger slightly if dropping multiple items
        const newRootCoords = { ...rootCoords };
        ids.forEach((id, i) => {
            newRootCoords[id] = {
                x: dropX + (i * 20),
                y: dropY + (i * 20)
            };
        });
        
        onUpdateRootCoords(newRootCoords);

        // Also update standard order logic for consistency, though absolute coords override it visually
        const visualRoots = Object.entries(layoutData.nodePositions as Record<string, NodePos>)
            .filter(([_, pos]) => pos.gen === 0)
            .sort((a, b) => a[1].x - b[1].x);

        let insertBeforeId: string | null = null;
        for (const [id, pos] of visualRoots) {
            if (dropX < pos.x + CARD_WIDTH / 2) {
                insertBeforeId = id;
                break;
            }
        }

        const currentRootOrder = customOrder['roots'] ? [...customOrder['roots']] : [];
        if (currentRootOrder.length === 0 && visualRoots.length > 0) {
            visualRoots.forEach(([id]) => currentRootOrder.push(id));
        }

        const newRootOrder = [...currentRootOrder];
        if (insertBeforeId) {
            const idx = newRootOrder.indexOf(insertBeforeId);
            if (idx !== -1) {
                newRootOrder.splice(idx, 0, ...ids);
            } else {
                newRootOrder.push(...ids);
            }
        } else {
            newRootOrder.push(...ids);
        }

        onUpdateCustomOrder({
            ...customOrder,
            'roots': newRootOrder
        });

        ids.forEach(id => onAddActiveChar(id));
    };

    const renderLinks = () => {
        const links: React.ReactElement[] = [];
        const { nodePositions } = layoutData;

        // Marriage Links
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

        // Parent-Child Links
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

    const renderNode = (char: Character, pos: NodePos) => {
        const portraitUrl = char.imageId ? blobUrls[char.imageId] : null;
        const isHovered = hoveredCharId === char.id;
        
        // Check if dragging node is a sibling of this node
        const isSiblingReorder = draggingCharId && draggingCharId !== char.id && getCommonParentKey(draggingCharId, char.id) !== null;

        // Show drop zones if we are dragging internally OR if we are dragging externally (draggingCharId is null) over this node
        // AND we are currently hovering this node.
        const showDropZones = isHovered && (
            (draggingCharId && draggingCharId !== char.id) || 
            (!draggingCharId && dragOverNodeId === char.id)
        );
        
        return (
            <foreignObject 
                key={char.id} 
                x={pos.x} y={pos.y} width={CARD_WIDTH} height={CARD_HEIGHT}
                className="overflow-visible"
            >
                <div 
                    className={`node-card relative w-full h-full rounded-xl border-2 bg-slate-800 shadow-xl transition-all group select-none ${isHovered ? 'z-50' : 'z-0'}`}
                    style={{ borderColor: isHovered ? '#3b82f6' : '#1e293b' }}
                    draggable
                    onMouseDown={(e) => e.stopPropagation()} 
                    onDragStart={(e) => {
                        e.dataTransfer.setData("application/react-dnd-char-id", char.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingCharId(char.id);
                    }}
                    onDragEnd={() => {
                        setDraggingCharId(null);
                        setDragOverNodeId(null);
                    }}
                    onDragOver={(e) => { 
                        e.preventDefault(); 
                        setHoveredCharId(char.id); 
                        setDragOverNodeId(char.id);
                    }}
                    onDragLeave={(e) => {
                        // Crucial fix: Prevent flickering by checking if we are entering a child element (like the drop zones)
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setHoveredCharId(null); 
                        setDropTarget(null); 
                        setDragOverNodeId(null);
                    }}
                    onDrop={(e) => {
                         setDragOverNodeId(null);
                         // If dropped on specific zones, handled by child divs.
                         // If dropped here (on center), treat as smart drop/reorder
                         if (!dropTarget) {
                            handleSmartDrop(e, char.id);
                         }
                    }}
                    onMouseEnter={() => setHoveredCharId(char.id)}
                    onMouseLeave={() => setHoveredCharId(null)}
                >
                    {/* Content */}
                    <div className="flex items-center gap-3 p-3 h-full relative z-10 pointer-events-none">
                        <div className={`w-10 h-10 rounded-full bg-slate-900 border-2 overflow-hidden shrink-0 ${char.gender === 'F' ? 'border-pink-500/50' : char.gender === 'M' ? 'border-blue-500/50' : 'border-slate-500/50'}`}>
                             {portraitUrl ? <img src={portraitUrl} className="w-full h-full object-cover" /> : <User size={20} className="m-2 text-slate-500" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-200 truncate">{char.name}</div>
                            <div className="text-[9px] text-slate-500 truncate">{char.isVirtual ? '占位节点' : (char.raw_info || char.note || '无描述')}</div>
                        </div>
                    </div>

                    {/* Interactive overlay for Delete (Always visible on hover) */}
                    {isHovered && !draggingCharId && !dragOverNodeId && (
                        <button 
                            onMouseDown={(e) => { e.stopPropagation(); onRemoveActiveChar(char.id); }}
                            className="absolute top-1 right-1 p-1.5 text-slate-400 hover:text-red-400 bg-slate-800/80 rounded-full z-50 pointer-events-auto hover:bg-slate-700"
                            title="从谱系图中移除"
                        >
                            <X size={12}/>
                        </button>
                    )}

                    {/* Sibling Reorder Visual Feedback */}
                    {isSiblingReorder && isHovered && !dropTarget && (
                        <div className="absolute inset-0 flex items-center justify-center bg-blue-600/20 rounded-xl z-20 pointer-events-none animate-pulse">
                            <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                <ArrowUpDown size={10} /> 交换顺序
                            </div>
                        </div>
                    )}

                    {/* Drop Zones (Visible when dragging another node over this node) */}
                    {showDropZones && (
                        <>
                            {/* Top: Add Parent */}
                            <div 
                                className={`absolute -top-4 left-0 right-0 h-4 flex items-center justify-center bg-blue-500/20 border-t-2 border-x-2 border-blue-500/50 rounded-t-lg transition-colors z-40 cursor-pointer ${dropTarget?.zone === 'parent' ? 'bg-blue-500/50' : ''}`}
                                onDragEnter={() => setDropTarget({ id: char.id, zone: 'parent' })}
                                onDrop={(e) => handleDropOnPerson(e, char.id, 'parent')}
                            >
                                <ArrowUp size={10} className="text-blue-300"/>
                            </div>
                            
                            {/* Bottom: Add Child */}
                            <div 
                                className={`absolute -bottom-4 left-0 right-0 h-4 flex items-center justify-center bg-green-500/20 border-b-2 border-x-2 border-green-500/50 rounded-b-lg transition-colors z-40 cursor-pointer ${dropTarget?.zone === 'child_single' ? 'bg-green-500/50' : ''}`}
                                onDragEnter={() => setDropTarget({ id: char.id, zone: 'child_single' })}
                                onDrop={(e) => handleDropOnPerson(e, char.id, 'child_single')}
                            >
                                <ArrowDown size={10} className="text-green-300"/>
                            </div>

                            {/* Right: Add Spouse (Right) */}
                            <div 
                                className={`absolute top-0 -right-6 bottom-0 w-6 flex items-center justify-center bg-pink-500/20 border-y-2 border-r-2 border-pink-500/50 rounded-r-lg transition-colors z-40 cursor-pointer ${dropTarget?.zone === 'spouse_right' ? 'bg-pink-500/50' : ''}`}
                                onDragEnter={() => setDropTarget({ id: char.id, zone: 'spouse_right' })}
                                onDrop={(e) => handleDropOnPerson(e, char.id, 'spouse_right')}
                            >
                                <Heart size={10} className="text-pink-300"/>
                            </div>

                            {/* Left: Add Spouse (Left) */}
                            <div 
                                className={`absolute top-0 -left-6 bottom-0 w-6 flex items-center justify-center bg-pink-500/20 border-y-2 border-l-2 border-pink-500/50 rounded-l-lg transition-colors z-40 cursor-pointer ${dropTarget?.zone === 'spouse_left' ? 'bg-pink-500/50' : ''}`}
                                onDragEnter={() => setDropTarget({ id: char.id, zone: 'spouse_left' })}
                                onDrop={(e) => handleDropOnPerson(e, char.id, 'spouse_left')}
                            >
                                <Heart size={10} className="text-pink-300"/>
                            </div>
                        </>
                    )}
                </div>
            </foreignObject>
        );
    };

    const renderContent = () => (
        <div 
            className="w-full h-full relative bg-[#0f172a] overflow-hidden" 
            ref={containerRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
        >
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-1">
                    <input 
                        className="bg-transparent text-sm px-2 py-1 outline-none text-white w-40"
                        placeholder="搜索谱系成员..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search size={16} className="text-slate-500 m-1.5" />
                </div>
            </div>

            <div className="absolute top-4 right-4 z-10 flex gap-2">
                {isAddingVirtual ? (
                    <div className="flex bg-slate-800 rounded-lg border border-blue-500 p-1 animate-in slide-in-from-right">
                        <input 
                            autoFocus
                            className="bg-transparent text-sm px-2 py-1 outline-none text-white w-32"
                            placeholder="输入名称..."
                            value={virtualName}
                            onChange={(e) => setVirtualName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmVirtual()}
                        />
                        <button onClick={handleConfirmVirtual} className="p-1 text-blue-400 hover:text-white"><Check size={16}/></button>
                        <button onClick={() => setIsAddingVirtual(false)} className="p-1 text-slate-500 hover:text-white"><X size={16}/></button>
                    </div>
                ) : (
                    <button onClick={() => setIsAddingVirtual(true)} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg transition-all">
                        <UserRoundPlus size={14} /> 添加虚拟节点
                    </button>
                )}
                <button onClick={() => setIsGuideOpen(!isGuideOpen)} className={`p-2 rounded-lg border transition-all ${isGuideOpen ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                    <HelpCircle size={18} />
                </button>
                <button onClick={() => setIsPoppedOut(!isPoppedOut)} className="p-2 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 text-slate-300">
                    {isPoppedOut ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
            </div>

            {isGuideOpen && (
                <div className="absolute top-16 right-4 z-20 w-80 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl text-xs animate-in fade-in slide-in-from-top-2 overflow-hidden">
                    <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                        <h4 className="font-bold text-white flex items-center gap-2"><GitBranch size={14} className="text-blue-400"/> 谱系图操作指南</h4>
                        <button onClick={() => setIsGuideOpen(false)} className="text-slate-500 hover:text-white"><X size={14}/></button>
                    </div>
                    <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                        
                        <div className="space-y-2">
                            <h5 className="font-bold text-indigo-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider"><MousePointer2 size={12}/> 基础交互</h5>
                            <div className="bg-slate-800/50 rounded-lg p-2.5 space-y-2 border border-slate-700/50">
                                <p className="text-slate-300 leading-relaxed">• <span className="text-white font-bold">缩放/平移</span>：使用鼠标滚轮缩放，按住左键拖拽画布平移。</p>
                                <p className="text-slate-300 leading-relaxed">• <span className="text-white font-bold">添加独立节点</span>：从左侧列表拖拽人物至 <span className="text-slate-400 italic">空白背景</span>。</p>
                                <p className="text-slate-300 leading-relaxed">• <span className="text-white font-bold">移除节点</span>：悬停在人物卡片上，点击右上角的 <span className="text-red-400">X</span> 按钮。</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h5 className="font-bold text-pink-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider"><Heart size={12}/> 建立关系 (拖拽人物至卡片)</h5>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                                    <div className="text-pink-300 font-bold mb-1 flex items-center gap-1"><ArrowUp size={10}/> 父母</div>
                                    <div className="text-slate-400 scale-90 origin-top-left">拖至卡片<br/>顶部边缘</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                                    <div className="text-green-300 font-bold mb-1 flex items-center gap-1"><ArrowDown size={10}/> 子女</div>
                                    <div className="text-slate-400 scale-90 origin-top-left">拖至卡片<br/>底部边缘</div>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50 col-span-2">
                                    <div className="text-indigo-300 font-bold mb-1 flex items-center gap-1"><Heart size={10}/> 配偶 (左右位)</div>
                                    <div className="text-slate-400 scale-90 origin-top-left">拖至卡片<span className="text-white">左侧边缘</span>(置于左) 或 <span className="text-white">右侧边缘</span>(置于右)。</div>
                                </div>
                            </div>
                        </div>

                         <div className="space-y-2">
                            <h5 className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider"><ArrowUpDown size={12}/> 高级操作</h5>
                            <ul className="space-y-2 text-slate-300 pl-1">
                                <li className="flex gap-2 text-[11px] leading-relaxed">
                                    <span className="shrink-0 text-amber-500">•</span>
                                    <span>
                                        <strong className="text-white">同辈排序</strong>：将人物拖拽至同父母兄弟姐妹的<span className="text-amber-300">卡片中心</span>，可插入或交换位置。
                                    </span>
                                </li>
                                <li className="flex gap-2 text-[11px] leading-relaxed">
                                    <span className="shrink-0 text-amber-500">•</span>
                                    <span>
                                        <strong className="text-white">共同子女</strong>：将人物拖拽至两名配偶中间的<span className="text-pink-400">粉色连接点</span>上。
                                    </span>
                                </li>
                                <li className="flex gap-2 text-[11px] leading-relaxed">
                                    <span className="shrink-0 text-amber-500">•</span>
                                    <span>
                                        <strong className="text-white">虚拟节点</strong>：点击右上角“添加虚拟节点”可创建非剧情人物占位（如：未提及姓名的先祖）。
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

             <svg 
                ref={svgRefCallback}
                width="100%" 
                height="100%" 
                className="cursor-move touch-none"
             >
                <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                    {renderLinks()}
                    {Object.entries(layoutData.nodePositions as Record<string, NodePos>).map(([id, pos]) => {
                         const char = characters.find(c => c.id === id);
                         if (!char) return null;
                         if (searchTerm && !char.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                             return <g key={id} style={{opacity: 0.2}}>{renderNode(char, pos)}</g>;
                         }
                         return renderNode(char, pos);
                    })}
                </g>
             </svg>
        </div>
    );

    if (isPoppedOut) {
        return (
            <PortalWindow onClose={() => setIsPoppedOut(false)}>
                <div className="w-full h-full flex flex-col">
                    <div className="h-full relative">
                       {renderContent()}
                    </div>
                </div>
            </PortalWindow>
        );
    }

    return (
        <div className="h-[650px] bg-slate-900 border border-slate-700 rounded-xl overflow-hidden relative shadow-inner">
            {renderContent()}
        </div>
    );
};

export default FamilyTree;
