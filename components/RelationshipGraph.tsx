
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Character, Relationship, RelationshipDef, CharacterGroup, Clue } from '../types';
import { Move, Link as LinkIcon, Plus, Trash2, ZoomIn, ZoomOut, Layers, Check, Edit2, X, AlertTriangle, Package, Users, Maximize, Minimize } from 'lucide-react';

interface Props {
  viewMode: 'people' | 'items'; // 画布模式
  characters: Character[];
  clues: Clue[]; 
  relationships: Relationship[];
  relationshipDefs: RelationshipDef[];
  characterGroups: CharacterGroup[];
  layout: Record<string, { x: number; y: number }>;
  onAddRelationship: (source: string, target: string, relation: string) => void;
  onRemoveRelationship: (source: string, target: string, relation: string) => void;
  onUpdateDefs: (defs: RelationshipDef[]) => void;
  onNodeDrop: (id: string, type: 'character' | 'clue') => void;
  onUpdateLayout: (layout: Record<string, { x: number; y: number }>) => void;
  onRemoveNode: (id: string, type: 'character' | 'clue') => void; 
  onAddGroup: (group: CharacterGroup) => void;
  onUpdateGroup: (group: CharacterGroup) => void;
  onRemoveGroup: (groupId: string) => void;
}

type PendingAction = 
  | { type: 'delete_group'; id: string; label: string }
  | { type: 'delete_relationship'; source: string; target: string; relation: string }
  | { type: 'delete_node'; id: string; name: string; nodeType: 'character' | 'clue' }
  | null;

const RelationshipGraph: React.FC<Props> = ({ 
    viewMode,
    characters, 
    clues,
    relationships, 
    relationshipDefs,
    characterGroups = [],
    layout = {}, 
    onAddRelationship,
    onRemoveRelationship,
    onUpdateDefs,
    onNodeDrop,
    onUpdateLayout,
    onRemoveNode,
    onAddGroup,
    onUpdateGroup,
    onRemoveGroup
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  const [mode, setMode] = useState<'move' | 'connect' | 'delete' | 'group'>('move');
  const [activeDefId, setActiveDefId] = useState<string>(relationshipDefs[0]?.id);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [selectedForGroup, setSelectedForGroup] = useState<Set<string>>(new Set());
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [editingGroup, setEditingGroup] = useState<CharacterGroup | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  const nodesRef = useRef<any[]>([]);

  const getDefByLabel = (label: string) => relationshipDefs.find(d => d.label === label);
  const getActiveDef = () => relationshipDefs.find(d => d.id === activeDefId);

  const generateRandomHex = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

  const handleAddDef = () => {
    const newDef: RelationshipDef = {
        id: crypto.randomUUID(),
        label: '新关系',
        color: generateRandomHex()
    };
    onUpdateDefs([...relationshipDefs, newDef]);
    setActiveDefId(newDef.id);
  };

  const handleUpdateDef = (id: string, key: keyof RelationshipDef, value: string) => {
    onUpdateDefs(relationshipDefs.map(d => d.id === id ? { ...d, [key]: value } : d));
  };

  const handleDeleteDef = (id: string) => {
    if (relationshipDefs.length <= 1) return;
    onUpdateDefs(relationshipDefs.filter(d => d.id !== id));
    if (activeDefId === id) setActiveDefId(relationshipDefs[0].id);
  };

  const handleCreateGroup = () => {
      if (newGroupLabel.trim()) {
          onAddGroup({
              id: crypto.randomUUID(),
              label: newGroupLabel.trim(),
              characterIds: Array.from(selectedForGroup),
              color: generateRandomHex()
          });
          setNewGroupLabel("");
          setSelectedForGroup(new Set());
          setIsGroupModalOpen(false);
          setMode('move');
      }
  };

  const handleUpdateGroupMember = (add: boolean, charId: string) => {
      if (!editingGroup) return;
      let newIds = [...editingGroup.characterIds];
      if (add) {
          if (!newIds.includes(charId)) newIds.push(charId);
      } else {
          newIds = newIds.filter(id => id !== charId);
      }
      
      const updated = { ...editingGroup, characterIds: newIds };
      setEditingGroup(updated); 
      onUpdateGroup(updated); 
  };

  const handleZoomSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(e.target.value);
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).call(zoomBehaviorRef.current.scaleTo, newScale);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const charId = e.dataTransfer.getData("application/react-dnd-char-id");
    const clueId = e.dataTransfer.getData("application/react-dnd-clue-id");
    
    if (charId) {
        onNodeDrop(charId, 'character');
    } else if (clueId && viewMode === 'items') {
        onNodeDrop(clueId, 'clue');
    }
  };

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'delete_group') {
      onRemoveGroup(pendingAction.id);
    } else if (pendingAction.type === 'delete_relationship') {
      onRemoveRelationship(pendingAction.source, pendingAction.target, pendingAction.relation);
    } else if (pendingAction.type === 'delete_node') {
      onRemoveNode(pendingAction.id, pendingAction.nodeType);
    }
    setPendingAction(null);
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = isExpanded ? window.innerHeight - 100 : 600; 
    
    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    [...relationshipDefs, {id: 'default', color: '#94a3b8'} as any].forEach(def => {
        defs.append("marker")
            .attr("id", `arrow-${def.id || 'default'}`)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 25) 
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("fill", def.color)
            .attr("d", "M0,-5L10,0L0,5");
    });

    const g = svg.append("g").attr("class", "content");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            setZoomLevel(event.transform.k); 
        });
    
    zoomBehaviorRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.scaleTo, zoomLevel);

    const missingLayouts: Record<string, {x: number, y: number}> = {};
    const safeLayout = layout || {};

    const characterNodes = characters.map(c => ({ ...c, type: 'character' as const }));
    const clueNodes = clues.map(c => ({ ...c, type: 'clue' as const }));
    const allNodesData = [...characterNodes, ...clueNodes];

    const finalNodes = allNodesData.map(n => {
        const storedPos = safeLayout[n.id];
        if (storedPos) {
            return { ...n, x: storedPos.x, y: storedPos.y };
        }
        const randomPos = { 
            x: width/2 + (Math.random() - 0.5) * (width * 0.4), 
            y: height/2 + (Math.random() - 0.5) * (height * 0.4)
        };
        missingLayouts[n.id] = randomPos;
        return { ...n, ...randomPos };
    });
    
    if (Object.keys(missingLayouts).length > 0) {
        setTimeout(() => {
            onUpdateLayout(missingLayouts);
        }, 0);
    }

    nodesRef.current = finalNodes;

    const activeIds = new Set(finalNodes.map(n => n.id));
    const links = relationships.filter(r => activeIds.has(r.source) && activeIds.has(r.target));

    const groupLayer = g.append("g").attr("class", "groups");
    const linkGroup = g.append("g").attr("class", "links");
    const nodeGroup = g.append("g").attr("class", "nodes");

    const getNode = (id: string) => nodesRef.current.find(n => n.id === id);

    const render = () => {
        // --- GROUPS RENDER ---
        const groupsData = characterGroups.map(group => {
            const memberNodes = group.characterIds.map(id => getNode(id)).filter(n => n !== undefined) as any[];
            if (memberNodes.length === 0) return null;
            
            const points = memberNodes.map(n => [n.x, n.y] as [number, number]);
            let pathData = "";
            let centroid = { x: 0, y: 0 };
            
            if (points.length === 1) {
                const [x, y] = points[0];
                centroid = { x, y };
                pathData = `M ${x}, ${y} m -35, 0 a 35,35 0 1,0 70,0 a 35,35 0 1,0 -70,0`; 
            } else if (points.length === 2) {
                const [p1, p2] = points;
                centroid = { x: (p1[0]+p2[0])/2, y: (p1[1]+p2[1])/2 };
                pathData = `M ${p1[0]},${p1[1]} L ${p2[0]},${p2[1]}`;
            } else {
                const hull = d3.polygonHull(points);
                if (hull) {
                    pathData = "M" + hull.join("L") + "Z";
                    const [cx, cy] = d3.polygonCentroid(hull);
                    centroid = { x: cx, y: cy };
                }
            }
            
            return { ...group, pathData, centroid, pointCount: points.length };
        }).filter(Boolean) as any[];

        const groupSelection = groupLayer.selectAll("g").data(groupsData, (d: any) => d.id);
        const groupEnter = groupSelection.enter().append("g");
        
        groupEnter.append("path")
            .merge(groupSelection.select("path") as any)
            .attr("d", (d: any) => d.pathData)
            .attr("fill", (d: any) => d.color)
            .attr("fill-opacity", 0.2)
            .attr("stroke", (d: any) => d.color)
            .attr("stroke-width", 40) 
            .attr("stroke-opacity", 0.2)
            .attr("stroke-linejoin", "round")
            .attr("cursor", mode === 'delete' ? 'pointer' : 'default')
            .on("click", (e, d: any) => {
                if (mode === 'delete') {
                    e.stopPropagation();
                    setPendingAction({ type: 'delete_group', id: d.id, label: d.label });
                }
            });

        groupEnter.append("text")
            .merge(groupSelection.select("text") as any)
            .text((d: any) => d.label)
            .attr("x", (d: any) => d.centroid.x)
            .attr("y", (d: any) => d.centroid.y)
            .attr("text-anchor", "middle")
            .attr("dy", (d: any) => d.pointCount > 2 ? 0 : -45) 
            .attr("font-size", "14px")
            .attr("font-weight", "bold")
            .attr("fill", (d: any) => d.color)
            .style("text-shadow", "0px 1px 2px black")
            .style("cursor", "pointer")
            .style("pointer-events", "all") 
            .on("click", (e, d: any) => {
                e.stopPropagation();
                if (mode === 'delete') {
                    setPendingAction({ type: 'delete_group', id: d.id, label: d.label });
                } else {
                    setEditingGroup(d);
                }
            });
            
        groupSelection.exit().remove();

        // --- LINKS RENDER ---
        linkGroup.selectAll("line.hit-area")
            .data(links)
            .join("line")
            .attr("class", "hit-area")
            .attr("x1", (d: any) => getNode(d.source)?.x || 0)
            .attr("y1", (d: any) => getNode(d.source)?.y || 0)
            .attr("x2", (d: any) => getNode(d.target)?.x || 0)
            .attr("y2", (d: any) => getNode(d.target)?.y || 0)
            .attr("stroke", "transparent")
            .attr("stroke-width", 20)
            .style("cursor", mode === 'delete' ? 'pointer' : 'default')
            .on("click", (e, d: any) => {
                if (mode === 'delete') {
                    e.stopPropagation();
                    setPendingAction({ 
                      type: 'delete_relationship', 
                      source: d.source, 
                      target: d.target, 
                      relation: d.relation 
                    });
                }
            });

        linkGroup.selectAll("line.visible-line")
            .data(links)
            .join("line")
            .attr("class", "visible-line")
            .attr("stroke-width", 2)
            .attr("stroke", (d: any) => getDefByLabel(d.relation)?.color || '#94a3b8')
            .attr("marker-end", (d: any) => `url(#arrow-${getDefByLabel(d.relation)?.id || 'default'})`)
            .attr("x1", (d: any) => getNode(d.source)?.x || 0)
            .attr("y1", (d: any) => getNode(d.source)?.y || 0)
            .attr("x2", (d: any) => getNode(d.target)?.x || 0)
            .attr("y2", (d: any) => getNode(d.target)?.y || 0)
            .style("pointer-events", "none"); 

        linkGroup.selectAll("text.link-label")
            .data(links)
            .join("text")
            .attr("class", "link-label")
            .text((d: any) => d.relation)
            .attr("font-size", "10px")
            .attr("fill", (d: any) => getDefByLabel(d.relation)?.color || '#94a3b8')
            .attr("text-anchor", "middle")
            .attr("dy", -5)
            .attr("x", (d: any) => (getNode(d.source)?.x + getNode(d.target)?.x) / 2 || 0)
            .attr("y", (d: any) => (getNode(d.source)?.y + getNode(d.target)?.y) / 2 || 0)
            .style("pointer-events", "none");

        // --- NODES RENDER ---
        const node = nodeGroup
            .selectAll("g")
            .data(finalNodes, (d: any) => d.id)
            .join("g")
            .attr("transform", (d: any) => `translate(${d.x},${d.y})`)
            .attr("cursor", mode === 'move' ? 'grab' : 'pointer')
            .on("click", (event, d: any) => {
                if (mode === 'delete') {
                    event.stopPropagation();
                    setPendingAction({ type: 'delete_node', id: d.id, name: d.name, nodeType: d.type });
                } else if (mode === 'connect') {
                    event.stopPropagation();
                    containerRef.current?.dispatchEvent(new CustomEvent('node-click', { detail: { id: d.id } }));
                } else if (mode === 'group' && d.type === 'character') {
                    event.stopPropagation();
                    setSelectedForGroup(prev => {
                        const next = new Set(prev);
                        if (next.has(d.id)) next.delete(d.id);
                        else next.add(d.id);
                        return next;
                    });
                }
            });

        node.selectAll(".node-shape").remove(); 
        node.append("path")
            .attr("class", "node-shape")
            .attr("d", (d: any) => {
                if (d.type === 'character') return d3.arc()({ innerRadius: 0, outerRadius: 20, startAngle: 0, endAngle: 2 * Math.PI });
                return "M-18,-14 h36 a4,4 0 0 1 4,4 v20 a4,4 0 0 1 -4,4 h-36 a4,4 0 0 1 -4,-4 v-20 a4,4 0 0 1 4,-4 Z";
            })
            .attr("fill", "#1e293b") 
            .attr("stroke", (d: any) => {
                if (d.type === 'character' && mode === 'group' && selectedForGroup.has(d.id)) return '#facc15'; 
                if (d.id === selectedSource) return '#ef4444';
                return d.type === 'character' ? '#3b82f6' : '#f59e0b';
            })
            .attr("stroke-width", (d: any) => (mode === 'group' && selectedForGroup.has(d.id)) ? 4 : (d.id === selectedSource ? 4 : 2))
            .attr("stroke-dasharray", (d: any) => (mode === 'group' && selectedForGroup.has(d.id)) ? "4 2" : "none");

        node.selectAll(".node-icon").remove();
        node.filter((d: any) => d.type === 'clue')
            .append("path")
            .attr("class", "node-icon")
            .attr("d", "M12 2l9 4-9 4-9-4 9-4z M21 6v11l-9 4-9-4v-11 M12 10v11")
            .attr("transform", "translate(-6, -6) scale(0.5)")
            .attr("fill", "none")
            .attr("stroke", "#f59e0b")
            .attr("stroke-width", "2");

        node.selectAll("text.node-label").remove();
        node.append("text")
            .attr("class", "node-label")
            .text((d: any) => d.name)
            .attr("x", 0)
            .attr("y", (d: any) => d.type === 'character' ? 32 : 30)
            .attr("text-anchor", "middle")
            .attr("fill", "#f1f5f9")
            .attr("font-size", "11px")
            .attr("font-weight", "bold")
            .style("pointer-events", "none");

        const drag = d3.drag<any, any>()
            .filter(() => mode === 'move') 
            .on("drag", (event, d) => {
                d.x = event.x;
                d.y = event.y;
                render();
            })
            .on("end", (event, d) => {
                onUpdateLayout({ [d.id]: { x: d.x, y: d.y } });
            });

        node.call(drag);
    };

    render();

  }, [characters, clues, relationships, relationshipDefs, characterGroups, mode, selectedSource, layout, selectedForGroup, viewMode, isExpanded]); 

  useEffect(() => {
    const handleNodeClick = (e: any) => {
        const id = e.detail.id;
        if (selectedSource === null) {
            setSelectedSource(id);
        } else {
            if (selectedSource !== id) {
                const activeDef = getActiveDef();
                if (activeDef) onAddRelationship(selectedSource, id, activeDef.label);
            }
            setSelectedSource(null);
        }
    };
    const el = containerRef.current;
    if (el) {
        el.addEventListener('node-click', handleNodeClick);
        return () => el.removeEventListener('node-click', handleNodeClick);
    }
  }, [selectedSource, activeDefId, relationshipDefs, onAddRelationship]);

  return (
    <div className={`flex gap-4 flex-col lg:flex-row transition-all duration-300 ${isExpanded ? 'fixed inset-0 z-[400] bg-slate-950 p-6' : 'h-full min-h-[600px] relative'}`}>
        <div 
            ref={containerRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 bg-slate-900/40 rounded-2xl overflow-hidden border-2 shadow-inner relative flex flex-col transition-all
                ${isDragOver ? 'border-blue-500 bg-slate-800/80' : 'border-slate-800'}
                ${mode === 'delete' ? 'ring-2 ring-red-500/30' : ''}
                ${isExpanded ? 'ring-4 ring-blue-500/20' : ''}
            `}
        >
            <svg ref={svgRef} className="w-full h-full block touch-none" />
            
            <div className="absolute bottom-6 right-6 bg-slate-900/90 backdrop-blur p-2 rounded-xl border border-slate-700 flex flex-col gap-3 items-center shadow-2xl z-10">
                 <ZoomIn size={14} className="text-slate-500" />
                 <input type="range" min="0.1" max="4" step="0.1" value={zoomLevel} onChange={handleZoomSlider} className="h-32 w-1.5 bg-slate-700 rounded-full outline-none cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', appearance: 'auto' }} />
                 <ZoomOut size={14} className="text-slate-500" />
            </div>

            <div className="absolute top-6 left-6 flex flex-col gap-2">
                <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${viewMode === 'people' ? 'bg-blue-600' : 'bg-amber-600'}`}>
                        {viewMode === 'people' ? <Users size={16} className="text-white" /> : <Package size={16} className="text-white" />}
                    </div>
                    <span className="text-xs font-black text-slate-200 uppercase tracking-widest">{viewMode === 'people' ? '人物关系画布' : '物证逻辑画布'}</span>
                </div>
            </div>

            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="absolute top-6 right-6 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 shadow-xl transition-all active:scale-95"
            >
                {isExpanded ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
        </div>

        <div className={`w-full lg:w-72 flex flex-col gap-4 shrink-0 transition-all ${isExpanded ? 'bg-slate-900/40 p-4 rounded-2xl border border-slate-800' : ''}`}>
            <div className="bg-slate-800 p-1 rounded-xl flex border border-slate-700 shadow-lg">
                <button onClick={() => { setMode('move'); setSelectedSource(null); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'move' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}><Move size={18} /></button>
                <button onClick={() => setMode('connect')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'connect' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}><LinkIcon size={18} /></button>
                {viewMode === 'people' && <button onClick={() => setMode('group')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'group' ? 'bg-yellow-600 text-white shadow' : 'text-slate-400 hover:text-yellow-400'}`}><Layers size={18} /></button>}
                <button onClick={() => setMode('delete')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'delete' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-red-400'}`}><Trash2 size={18} /></button>
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col overflow-hidden flex-1 shadow-lg">
                <div className="p-4 bg-slate-900/50 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">关系类型</h3>
                    <button onClick={handleAddDef} className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded-lg"><Plus size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {relationshipDefs.map(def => (
                        <div key={def.id} onClick={() => setActiveDefId(def.id)} className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${activeDefId === def.id ? 'bg-slate-700 border-blue-500 ring-2 ring-blue-500/20 shadow-lg' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}`}>
                            <input type="color" value={def.color} onChange={(e) => handleUpdateDef(def.id, 'color', e.target.value)} className="w-6 h-6 rounded-lg cursor-pointer bg-transparent border-none p-0 shrink-0" />
                            <input type="text" value={def.label} onChange={(e) => handleUpdateDef(def.id, 'label', e.target.value)} className="bg-transparent text-xs font-bold text-slate-200 w-full focus:outline-none" />
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteDef(def.id); }} className="text-slate-600 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {pendingAction && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-slate-800 rounded-3xl border border-red-900/50 shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center animate-in zoom-in-95">
                <div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30 shadow-lg shadow-red-900/20"><AlertTriangle className="text-red-500" size={40} /></div>
                <h3 className="text-xl font-black text-white mb-2 tracking-tight">确认删除?</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-8">此操作将移除选定的数据模型且无法撤销。</p>
                <div className="flex flex-col gap-3">
                  <button onClick={confirmPendingAction} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black shadow-xl transition-all active:scale-95">确认执行</button>
                  <button onClick={() => setPendingAction(null)} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-2xl font-bold transition-all">返回</button>
                </div>
            </div>
          </div>
        )}

        {isGroupModalOpen && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-72 shadow-2xl animate-in zoom-in-95">
                    <h3 className="text-sm font-black text-white mb-4 uppercase tracking-widest">新建阵营分组</h3>
                    <input autoFocus value={newGroupLabel} onChange={(e) => setNewGroupLabel(e.target.value)} placeholder="组名..." className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white mb-4 focus:ring-2 focus:ring-yellow-500 outline-none" />
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setIsGroupModalOpen(false)} className="px-4 py-2 text-xs text-slate-400 font-bold">取消</button>
                        <button onClick={handleCreateGroup} className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl text-xs font-black shadow-lg">创建</button>
                    </div>
                </div>
            </div>
        )}

        {editingGroup && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
                <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-md flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95">
                    <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                        <h3 className="font-bold text-white flex items-center gap-3"><Layers size={20} className="text-yellow-400" />管理分组属性</h3>
                        <button onClick={() => setEditingGroup(null)}><X size={24} className="text-slate-400"/></button>
                    </div>
                    <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                        <div className="flex gap-3">
                            <input value={editingGroup.label} onChange={(e) => { const updated = { ...editingGroup, label: e.target.value }; setEditingGroup(updated); onUpdateGroup(updated); }} className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-yellow-500" />
                            <input type="color" value={editingGroup.color} onChange={(e) => { const updated = { ...editingGroup, color: e.target.value }; setEditingGroup(updated); onUpdateGroup(updated); }} className="w-12 h-12 rounded-xl cursor-pointer bg-slate-900 border border-slate-700 p-1" />
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">当前成员</label>
                            <div className="flex flex-wrap gap-2">
                                {editingGroup.characterIds.map(id => (
                                    <div key={id} className="flex items-center gap-2 bg-slate-700/50 border border-slate-600 px-3 py-1.5 rounded-xl text-sm">
                                        <span className="text-slate-200 font-bold">{characters.find(c => c.id === id)?.name || '未知'}</span>
                                        <button onClick={() => handleUpdateGroupMember(false, id)} className="text-slate-500 hover:text-red-400"><X size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">可加入成员</label>
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar border border-slate-700 rounded-xl p-3 bg-slate-900/30">
                                {characters.filter(c => !editingGroup.characterIds.includes(c.id)).map(char => (
                                    <button key={char.id} onClick={() => handleUpdateGroupMember(true, char.id)} className="flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-transparent hover:border-slate-600 rounded-xl text-xs transition-all group"><span className="truncate text-slate-300 group-hover:text-white">{char.name}</span><Plus size={14} className="text-slate-500 group-hover:text-green-400" /></button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-700 bg-slate-900/30 flex justify-end"><button onClick={() => setEditingGroup(null)} className="px-10 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm shadow-xl">完成配置</button></div>
                </div>
            </div>
        )}
    </div>
  );
};

export default RelationshipGraph;
