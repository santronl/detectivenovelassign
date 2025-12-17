import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Character, Relationship, RelationshipDef } from '../types';
import { Move, Link as LinkIcon, Plus, Trash2, ZoomIn, ZoomOut, UserPlus } from 'lucide-react';

interface Props {
  characters: Character[];
  relationships: Relationship[];
  relationshipDefs: RelationshipDef[];
  layout: Record<string, { x: number; y: number }>;
  onAddRelationship: (source: string, target: string, relation: string) => void;
  onUpdateDefs: (defs: RelationshipDef[]) => void;
  onNodeDrop: (charId: string) => void;
  onUpdateLayout: (layout: Record<string, { x: number; y: number }>) => void;
}

const RelationshipGraph: React.FC<Props> = ({ 
    characters, 
    relationships, 
    relationshipDefs,
    layout = {}, // Default empty object to prevent crash if undefined
    onAddRelationship,
    onUpdateDefs,
    onNodeDrop,
    onUpdateLayout
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  const [mode, setMode] = useState<'move' | 'connect'>('move');
  const [activeDefId, setActiveDefId] = useState<string>(relationshipDefs[0]?.id);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  // Keep track of current nodes data for D3 to manipulate
  const nodesRef = useRef<any[]>([]);

  const getDefByLabel = (label: string) => relationshipDefs.find(d => d.label === label);
  const getActiveDef = () => relationshipDefs.find(d => d.id === activeDefId);

  // Helper to add new def
  const handleAddDef = () => {
    const newDef: RelationshipDef = {
        id: crypto.randomUUID(),
        label: '新关系',
        color: `#${Math.floor(Math.random()*16777215).toString(16)}`
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
    const height = 600; // Fixed inner height for calculation
    
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
    
    // Restore previous zoom level (keep transform if possible or just scale)
    svg.call(zoom.scaleTo, zoomLevel);

    // --- Data Preparation (Using Layout Prop for Persistence) ---
    // Use props.layout as source of truth. If missing, generate random position.
    
    // Check if we need to auto-save any generated positions for new nodes
    const missingLayouts: Record<string, {x: number, y: number}> = {};
    const safeLayout = layout || {}; // Ensure safeLayout is defined

    const newNodes = characters.map(c => {
        const storedPos = safeLayout[c.id];
        if (storedPos) {
            return { ...c, x: storedPos.x, y: storedPos.y };
        }
        
        // Generate random position for new node
        const randomPos = { 
            x: width/2 + (Math.random() - 0.5) * 200, 
            y: height/2 + (Math.random() - 0.5) * 200 
        };
        
        missingLayouts[c.id] = randomPos;
        return { ...c, ...randomPos };
    });
    
    // If we generated new positions, trigger an update so they are persisted
    // Use setTimeout to avoid updating state during render
    if (Object.keys(missingLayouts).length > 0) {
        setTimeout(() => {
            onUpdateLayout(missingLayouts);
        }, 0);
    }

    nodesRef.current = newNodes;

    // Active IDs set for quick lookup
    const activeIds = new Set(characters.map(c => c.id));
    const links = relationships.filter(r => activeIds.has(r.source) && activeIds.has(r.target));

    // Groups
    const linkGroup = g.append("g").attr("class", "links");
    const nodeGroup = g.append("g").attr("class", "nodes");

    // Helper to find node by ID for link drawing
    const getNode = (id: string) => newNodes.find(n => n.id === id);

    // --- Render Function ---
    const render = () => {
        // Links
        const link = linkGroup
            .selectAll("line")
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
            // Manually calculate coordinates
            .attr("x1", (d: any) => getNode(d.source)?.x || 0)
            .attr("y1", (d: any) => getNode(d.source)?.y || 0)
            .attr("x2", (d: any) => getNode(d.target)?.x || 0)
            .attr("y2", (d: any) => getNode(d.target)?.y || 0);

        // Link Text
        linkGroup
            .selectAll("text")
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

        // Nodes
        const node = nodeGroup
            .selectAll("g")
            .data(newNodes)
            .join("g")
            .attr("transform", (d: any) => `translate(${d.x},${d.y})`)
            .attr("cursor", "grab")
            .on("click", (event, d: any) => {
                if (mode === 'connect') {
                    event.stopPropagation();
                    containerRef.current?.dispatchEvent(new CustomEvent('node-click', { detail: { id: d.id } }));
                }
            });

        // Draw Node Circle
        node.selectAll("circle").remove(); 
        node.append("circle")
            .attr("r", 20)
            .attr("fill", "#1e293b") 
            .attr("stroke", (d: any) => d.id === selectedSource ? '#ef4444' : '#3b82f6')
            .attr("stroke-width", (d: any) => d.id === selectedSource ? 4 : 2);

        // Draw Node Text
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
                // Directly update coordinates
                d.x = event.x;
                d.y = event.y;
                // Re-render immediately
                render();
            })
            .on("end", (event, d) => {
                d3.select("body").style("cursor", "default");
                // Persist new position
                onUpdateLayout({ [d.id]: { x: d.x, y: d.y } });
            });

        node.call(drag);
    };

    // Initial Render
    render();

  }, [characters, relationships, relationshipDefs, mode, selectedSource, layout]); // Add layout dependency

  // Listen for custom node events (Connect mode)
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
    <div className="flex gap-4 flex-col lg:flex-row h-[600px]">
        {/* Main Graph */}
        <div 
            ref={containerRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 bg-slate-800 rounded-lg overflow-hidden border shadow-inner relative flex flex-col transition-all
                ${isDragOver ? 'border-blue-500 bg-slate-800/80' : 'border-slate-700'}
            `}
        >
            {characters.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
                    <UserPlus size={48} className="mb-4 opacity-20" />
                    <p>拖拽左侧人物到此处</p>
                </div>
            )}
            
            <svg ref={svgRef} className="w-full h-full block touch-none" />
            
            {/* Zoom Controls Overlay */}
            <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur p-2 rounded-lg border border-slate-700 flex flex-col gap-2 items-center shadow-xl">
                 <div className="flex items-center justify-center text-slate-400">
                    <ZoomIn size={16} />
                 </div>
                 {/* Replaced appearance-none + -webkit-slider-vertical with standard CSS approach + transform to avoid console warning */}
                 <input 
                    type="range" 
                    min="0.1" 
                    max="4" 
                    step="0.1" 
                    value={zoomLevel} 
                    onChange={handleZoomSlider}
                    className="h-24 w-2 bg-slate-700 rounded-full outline-none cursor-pointer"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', appearance: 'auto' }}
                 />
                 <div className="flex items-center justify-center text-slate-400">
                    <ZoomOut size={16} />
                 </div>
                 <div className="text-[10px] text-slate-500 font-mono mt-1">
                     {Math.round(zoomLevel * 100)}%
                 </div>
            </div>

            {/* Mode Warning Overlay */}
            {mode === 'connect' && (
                <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-blue-500/50 text-blue-300 text-xs font-bold pointer-events-none animate-pulse">
                    {selectedSource ? "点击另一个角色以连线" : "点击起始角色"}
                </div>
            )}
        </div>

        {/* Control Panel */}
        <div className="w-full lg:w-64 flex flex-col gap-4">
            
            {/* Mode Switch */}
            <div className="bg-slate-800 p-1 rounded-lg flex border border-slate-700">
                <button 
                    onClick={() => { setMode('move'); setSelectedSource(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all ${mode === 'move' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Move size={16} />
                    移动
                </button>
                <button 
                    onClick={() => setMode('connect')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all ${mode === 'connect' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <LinkIcon size={16} />
                    连线
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
                            {/* Color Picker Input */}
                            <input 
                                type="color" 
                                value={def.color}
                                onChange={(e) => handleUpdateDef(def.id, 'color', e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                            />
                            
                            {/* Label Input */}
                            <input 
                                type="text"
                                value={def.label}
                                onChange={(e) => handleUpdateDef(def.id, 'label', e.target.value)}
                                className="bg-transparent text-sm text-slate-200 w-full focus:outline-none focus:border-b border-slate-500"
                            />

                            {/* Delete Button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteDef(def.id); }}
                                className="text-slate-500 hover:text-red-400"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
                
                {mode === 'connect' && (
                    <div className="p-3 bg-blue-900/20 border-t border-blue-900/30 text-xs text-blue-200 text-center">
                        当前画笔: <span className="font-bold" style={{color: getActiveDef()?.color}}>{getActiveDef()?.label}</span>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default RelationshipGraph;