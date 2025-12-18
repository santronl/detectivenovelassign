import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Character, Relationship, RelationshipDef, CharacterGroup } from '../types';
import { Move, Link as LinkIcon, Plus, Trash2, ZoomIn, ZoomOut, UserPlus, Layers, Check, Edit2, UserMinus, X } from 'lucide-react';

interface Props {
  characters: Character[];
  relationships: Relationship[];
  relationshipDefs: RelationshipDef[];
  characterGroups: CharacterGroup[];
  layout: Record<string, { x: number; y: number }>;
  onAddRelationship: (source: string, target: string, relation: string) => void;
  onUpdateDefs: (defs: RelationshipDef[]) => void;
  onNodeDrop: (charId: string) => void;
  onUpdateLayout: (layout: Record<string, { x: number; y: number }>) => void;
  onRemoveNode: (charId: string) => void;
  onAddGroup: (group: CharacterGroup) => void;
  onUpdateGroup: (group: CharacterGroup) => void;
  onRemoveGroup: (groupId: string) => void;
}

const RelationshipGraph: React.FC<Props> = ({ 
    characters, 
    relationships, 
    relationshipDefs,
    characterGroups = [],
    layout = {}, 
    onAddRelationship,
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
  
  // Group creation state
  const [selectedForGroup, setSelectedForGroup] = useState<Set<string>>(new Set());
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");

  // Group editing state
  const [editingGroup, setEditingGroup] = useState<CharacterGroup | null>(null);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  // Keep track of current nodes data for D3 to manipulate
  const nodesRef = useRef<any[]>([]);

  const getDefByLabel = (label: string) => relationshipDefs.find(d => d.label === label);
  const getActiveDef = () => relationshipDefs.find(d => d.id === activeDefId);

  // Helper for random Hex color
  const generateRandomHex = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

  // Helper to add new def
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
      setEditingGroup(updated); // Update local modal state
      onUpdateGroup(updated); // Update app state
  };

  // Handle Zoom Slider Change
  const handleZoomSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(e.target.value);
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).call(zoomBehaviorRef.current.scaleTo, newScale);
    }
  };

  // Drag & Drop Handlers
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
    if (charId) {
        onNodeDrop(charId);
    }
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = 600; // Fixed inner height
    
    // Select SVG
    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    // Clear previous content
    svg.selectAll("*").remove();

    // 1. Defs (Arrows)
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

    // 2. Container Group for Zooming
    const g = svg.append("g").attr("class", "content");

    // 3. Zoom Behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            setZoomLevel(event.transform.k); 
        });
    
    zoomBehaviorRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.scaleTo, zoomLevel);

    // --- Data Preparation ---
    const missingLayouts: Record<string, {x: number, y: number}> = {};
    const safeLayout = layout || {};

    const newNodes = characters.map(c => {
        const storedPos = safeLayout[c.id];
        if (storedPos) {
            return { ...c, x: storedPos.x, y: storedPos.y };
        }
        const randomPos = { 
            x: width/2 + (Math.random() - 0.5) * 200, 
            y: height/2 + (Math.random() - 0.5) * 200 
        };
        missingLayouts[c.id] = randomPos;
        return { ...c, ...randomPos };
    });
    
    if (Object.keys(missingLayouts).length > 0) {
        setTimeout(() => {
            onUpdateLayout(missingLayouts);
        }, 0);
    }

    nodesRef.current = newNodes;

    const activeIds = new Set(characters.map(c => c.id));
    const links = relationships.filter(r => activeIds.has(r.source) && activeIds.has(r.target));

    // Groups Layers
    const groupLayer = g.append("g").attr("class", "groups");
    const linkGroup = g.append("g").attr("class", "links");
    const nodeGroup = g.append("g").attr("class", "nodes");

    const getNode = (id: string) => newNodes.find(n => n.id === id);

    // --- RENDER ---
    const render = () => {
        
        // 1. Draw Groups (Background Circles/Hulls)
        // Group Logic: Convex Hull or Circle
        const groupsData = characterGroups.map(group => {
            const memberNodes = group.characterIds.map(id => getNode(id)).filter(n => n !== undefined) as any[];
            if (memberNodes.length === 0) return null;
            
            const points = memberNodes.map(n => [n.x, n.y] as [number, number]);
            let pathData = "";
            let centroid = { x: 0, y: 0 };
            
            if (points.length === 1) {
                const [x, y] = points[0];
                centroid = { x, y };
                // Draw circle around single node
                pathData = `M ${x}, ${y} m -35, 0 a 35,35 0 1,0 70,0 a 35,35 0 1,0 -70,0`; 
            } else if (points.length === 2) {
                // Draw pill or just a wide line
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
        
        // Hull Shape
        groupEnter.append("path")
            .merge(groupSelection.select("path"))
            .attr("d", (d: any) => d.pathData)
            .attr("fill", (d: any) => d.color)
            .attr("fill-opacity", 0.2)
            .attr("stroke", (d: any) => d.color)
            .attr("stroke-width", 40) // Thick stroke makes the hull look "padded"
            .attr("stroke-opacity", 0.2)
            .attr("stroke-linejoin", "round")
            .attr("cursor", mode === 'delete' ? 'pointer' : 'default')
            .on("click", (e, d: any) => {
                if (mode === 'delete') {
                    e.stopPropagation();
                    if(confirm(`删除分组 "${d.label}"?`)) {
                        onRemoveGroup(d.id);
                    }
                }
            });

        // Group Label
        groupEnter.append("text")
            .merge(groupSelection.select("text"))
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
                     if(confirm(`删除分组 "${d.label}"?`)) {
                        onRemoveGroup(d.id);
                    }
                } else {
                    setEditingGroup(d);
                }
            });
            
        groupSelection.exit().remove();

        // 2. Draw Links
        linkGroup.selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke-width", 2)
            .attr("stroke", (d: any) => {
                const def = getDefByLabel(d.relation);
                return def ? def.color : '#94a3b8';
            })
            .attr("marker-end", (d: any) => {
                const def = getDefByLabel(d.relation);
                return `url(#arrow-${def ? def.id : 'default'})`;
            })
            .attr("x1", (d: any) => getNode(d.source)?.x || 0)
            .attr("y1", (d: any) => getNode(d.source)?.y || 0)
            .attr("x2", (d: any) => getNode(d.target)?.x || 0)
            .attr("y2", (d: any) => getNode(d.target)?.y || 0);

        // Link Text
        linkGroup.selectAll("text")
            .data(links)
            .join("text")
            .text((d: any) => d.relation)
            .attr("font-size", "10px")
            .attr("fill", (d: any) => {
                const def = getDefByLabel(d.relation);
                return def ? def.color : '#94a3b8';
            })
            .attr("text-anchor", "middle")
            .attr("dy", -5)
            .style("text-shadow", "0px 0px 4px #0f172a")
            .attr("x", (d: any) => {
                const s = getNode(d.source);
                const t = getNode(d.target);
                return s && t ? (s.x + t.x) / 2 : 0;
            })
            .attr("y", (d: any) => {
                const s = getNode(d.source);
                const t = getNode(d.target);
                return s && t ? (s.y + t.y) / 2 : 0;
            });

        // 3. Draw Nodes
        const node = nodeGroup
            .selectAll("g")
            .data(newNodes)
            .join("g")
            .attr("transform", (d: any) => `translate(${d.x},${d.y})`)
            .attr("cursor", mode === 'move' ? 'grab' : 'pointer')
            .on("click", (event, d: any) => {
                if (mode === 'delete') {
                    event.stopPropagation();
                    onRemoveNode(d.id);
                } else if (mode === 'connect') {
                    event.stopPropagation();
                    containerRef.current?.dispatchEvent(new CustomEvent('node-click', { detail: { id: d.id } }));
                } else if (mode === 'group') {
                    event.stopPropagation();
                    setSelectedForGroup(prev => {
                        const next = new Set(prev);
                        if (next.has(d.id)) next.delete(d.id);
                        else next.add(d.id);
                        return next;
                    });
                }
            });

        // Node Circle
        node.selectAll("circle").remove(); 
        node.append("circle")
            .attr("r", 20)
            .attr("fill", "#1e293b") 
            .attr("stroke", (d: any) => {
                if (mode === 'group' && selectedForGroup.has(d.id)) return '#facc15'; 
                if (d.id === selectedSource) return '#ef4444';
                return '#3b82f6';
            })
            .attr("stroke-width", (d: any) => (mode === 'group' && selectedForGroup.has(d.id)) ? 4 : (d.id === selectedSource ? 4 : 2))
            .attr("stroke-dasharray", (d: any) => (mode === 'group' && selectedForGroup.has(d.id)) ? "4 2" : "none");

        // Node Text
        node.selectAll("text").remove();
        node.append("text")
            .text((d: any) => d.name)
            .attr("x", 0)
            .attr("y", 32)
            .attr("text-anchor", "middle")
            .attr("fill", "#f1f5f9")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .style("pointer-events", "none");

        // Drag Behavior
        const drag = d3.drag<any, any>()
            .filter(() => mode === 'move') 
            .on("start", () => {
                 d3.select("body").style("cursor", "grabbing");
            })
            .on("drag", (event, d) => {
                d.x = event.x;
                d.y = event.y;
                render();
            })
            .on("end", (event, d) => {
                d3.select("body").style("cursor", "default");
                onUpdateLayout({ [d.id]: { x: d.x, y: d.y } });
            });

        node.call(drag);
    };

    render();

  }, [characters, relationships, relationshipDefs, characterGroups, mode, selectedSource, layout, selectedForGroup]); 

  // Listener for 'connect' mode
  useEffect(() => {
    const handleNodeClick = (e: CustomEvent) => {
        const id = e.detail.id;
        if (selectedSource === null) {
            setSelectedSource(id);
        } else {
            if (selectedSource !== id) {
                const activeDef = getActiveDef();
                if (activeDef) {
                    onAddRelationship(selectedSource, id, activeDef.label);
                }
            }
            setSelectedSource(null);
        }
    };

    const el = containerRef.current;
    if (el) {
        el.addEventListener('node-click', handleNodeClick as EventListener);
        return () => el.removeEventListener('node-click', handleNodeClick as EventListener);
    }
  }, [selectedSource, activeDefId, relationshipDefs, onAddRelationship]);

  return (
    <div className="flex gap-4 flex-col lg:flex-row h-[600px] relative">
        {/* Main Graph */}
        <div 
            ref={containerRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 bg-slate-800 rounded-lg overflow-hidden border shadow-inner relative flex flex-col transition-all
                ${isDragOver ? 'border-blue-500 bg-slate-800/80' : 'border-slate-700'}
                ${mode === 'delete' ? 'ring-2 ring-red-500/30' : ''}
                ${mode === 'group' ? 'ring-2 ring-yellow-500/30 cursor-crosshair' : ''}
            `}
        >
            <svg ref={svgRef} className="w-full h-full block touch-none" />
            
            {/* Controls Overlay */}
            <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur p-2 rounded-lg border border-slate-700 flex flex-col gap-2 items-center shadow-xl z-10">
                 <div className="flex items-center justify-center text-slate-400">
                    <ZoomIn size={16} />
                 </div>
                 <input 
                    type="range" min="0.1" max="4" step="0.1" 
                    value={zoomLevel} onChange={handleZoomSlider}
                    className="h-24 w-2 bg-slate-700 rounded-full outline-none cursor-pointer"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', appearance: 'auto' }}
                 />
                 <div className="flex items-center justify-center text-slate-400">
                    <ZoomOut size={16} />
                 </div>
            </div>

            {/* Mode Instructions */}
            {mode === 'connect' && (
                <div className="absolute top-4 left-4 bg-blue-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-blue-500/50 text-blue-200 text-xs font-bold pointer-events-none animate-pulse">
                    {selectedSource ? "点击另一个角色以连线" : "点击起始角色"}
                </div>
            )}
            {mode === 'delete' && (
                <div className="absolute top-4 left-4 bg-red-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-red-500/50 text-red-200 text-xs font-bold pointer-events-none animate-pulse flex items-center gap-2">
                    <Trash2 size={12} /> 点击人物或分组标签移除
                </div>
            )}
            {mode === 'group' && (
                <div className="absolute top-4 left-4 flex items-center gap-2">
                    <div className="bg-yellow-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-yellow-500/50 text-yellow-200 text-xs font-bold pointer-events-none flex items-center gap-2">
                        <Layers size={12} /> 选择人物以分组 (已选: {selectedForGroup.size})
                    </div>
                    {selectedForGroup.size > 0 && (
                        <button 
                            onClick={() => setIsGroupModalOpen(true)}
                            className="bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow animate-in fade-in"
                        >
                            创建分组
                        </button>
                    )}
                </div>
            )}
            {mode === 'move' && characterGroups.length > 0 && (
                 <div className="absolute top-4 left-4 bg-slate-900/50 backdrop-blur px-3 py-1.5 rounded-full border border-slate-700 text-slate-400 text-xs pointer-events-none">
                    提示: 点击分组标签可管理成员
                 </div>
            )}
        </div>

        {/* Control Panel */}
        <div className="w-full lg:w-64 flex flex-col gap-4">
            {/* Mode Switch */}
            <div className="bg-slate-800 p-1 rounded-lg flex border border-slate-700">
                <button 
                    onClick={() => { setMode('move'); setSelectedSource(null); setSelectedForGroup(new Set()); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all ${mode === 'move' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    title="移动模式"
                >
                    <Move size={16} />
                </button>
                <button 
                    onClick={() => setMode('connect')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all ${mode === 'connect' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    title="连线模式"
                >
                    <LinkIcon size={16} />
                </button>
                <button 
                    onClick={() => setMode('group')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all ${mode === 'group' ? 'bg-yellow-600 text-white shadow' : 'text-slate-400 hover:text-yellow-400'}`}
                    title="画圈分组"
                >
                    <Layers size={16} />
                </button>
                <button 
                    onClick={() => { setMode('delete'); setSelectedSource(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all ${mode === 'delete' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-red-400'}`}
                    title="删除模式"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Relationship Palette */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 flex flex-col overflow-hidden flex-1">
                <div className="p-3 bg-slate-900/50 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-slate-400 uppercase">关系类型 (画笔)</h3>
                    <button onClick={handleAddDef} className="text-slate-400 hover:text-white">
                        <Plus size={16} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {relationshipDefs.map(def => (
                        <div 
                            key={def.id}
                            onClick={() => setActiveDefId(def.id)}
                            className={`p-2 rounded border transition-all cursor-pointer flex items-center gap-2 ${
                                activeDefId === def.id 
                                    ? 'bg-slate-700 border-blue-500 ring-1 ring-blue-500/50' 
                                    : 'bg-slate-800 border-slate-600 hover:border-slate-500'
                            }`}
                        >
                            <input 
                                type="color" 
                                value={def.color}
                                onChange={(e) => handleUpdateDef(def.id, 'color', e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                            />
                            <input 
                                type="text"
                                value={def.label}
                                onChange={(e) => handleUpdateDef(def.id, 'label', e.target.value)}
                                className="bg-transparent text-sm text-slate-200 w-full focus:outline-none focus:border-b border-slate-500"
                            />
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteDef(def.id); }}
                                className="text-slate-500 hover:text-red-400"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Create Group Modal */}
        {isGroupModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
                <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 w-64 shadow-2xl animate-in zoom-in-95">
                    <h3 className="text-sm font-bold text-white mb-3">创建新分组</h3>
                    <input 
                        autoFocus
                        value={newGroupLabel}
                        onChange={(e) => setNewGroupLabel(e.target.value)}
                        placeholder="例如: 嫌疑人, 受害一家..."
                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white mb-3 focus:ring-2 focus:ring-yellow-500 outline-none"
                    />
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => setIsGroupModalOpen(false)}
                            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleCreateGroup}
                            className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs font-bold"
                        >
                            确定
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Edit Group Modal (Manage Members) */}
        {editingGroup && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
                    <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-xl">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Layers size={18} className="text-yellow-400" />
                            管理分组
                        </h3>
                        <button onClick={() => setEditingGroup(null)} className="text-slate-400 hover:text-white"><X size={20}/></button>
                    </div>
                    
                    <div className="p-4 space-y-4 overflow-y-auto">
                        {/* Basic Info */}
                        <div className="flex gap-2">
                            <input 
                                value={editingGroup.label}
                                onChange={(e) => {
                                    const updated = { ...editingGroup, label: e.target.value };
                                    setEditingGroup(updated);
                                    onUpdateGroup(updated);
                                }}
                                className="flex-1 bg-slate-900 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                            />
                            <input 
                                type="color"
                                value={editingGroup.color}
                                onChange={(e) => {
                                    const updated = { ...editingGroup, color: e.target.value };
                                    setEditingGroup(updated);
                                    onUpdateGroup(updated);
                                }}
                                className="w-10 h-10 rounded cursor-pointer bg-slate-900 border border-slate-600 p-0.5"
                            />
                        </div>

                        {/* Current Members */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 mb-2 block uppercase">组成员</label>
                            <div className="flex flex-wrap gap-2">
                                {editingGroup.characterIds.map(id => {
                                    const char = characters.find(c => c.id === id);
                                    return (
                                        <div key={id} className="flex items-center gap-1 bg-slate-700/50 border border-slate-600 px-2 py-1 rounded-full text-sm">
                                            <span className="text-slate-200">{char?.name || '未知'}</span>
                                            <button 
                                                onClick={() => handleUpdateGroupMember(false, id)}
                                                className="text-slate-500 hover:text-red-400"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                                {editingGroup.characterIds.length === 0 && <span className="text-xs text-slate-500 italic">暂无成员</span>}
                            </div>
                        </div>

                        {/* Add Members */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 mb-2 block uppercase">添加成员</label>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar border border-slate-700/50 rounded p-2 bg-slate-900/30">
                                {characters.filter(c => !editingGroup.characterIds.includes(c.id)).map(char => (
                                    <button 
                                        key={char.id}
                                        onClick={() => handleUpdateGroupMember(true, char.id)}
                                        className="flex items-center justify-between px-2 py-1.5 bg-slate-800 hover:bg-slate-700 border border-transparent hover:border-slate-600 rounded text-xs text-left transition-colors group"
                                    >
                                        <span className="truncate">{char.name}</span>
                                        <Plus size={14} className="text-slate-500 group-hover:text-green-400" />
                                    </button>
                                ))}
                                {characters.filter(c => !editingGroup.characterIds.includes(c.id)).length === 0 && (
                                    <div className="col-span-2 text-center text-slate-500 text-xs py-2">所有角色已在组内</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl flex justify-end">
                         <button 
                             onClick={() => setEditingGroup(null)}
                             className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold"
                         >
                             完成
                         </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default RelationshipGraph;