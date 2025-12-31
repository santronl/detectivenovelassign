
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Character, Relationship, RelationshipDef, CharacterGroup, Clue } from '../types';
import { Move, Trash2, Users, Maximize, Minimize, Package, Link2, Plus, X } from 'lucide-react';

interface Props {
  viewMode: 'people' | 'items';
  characters: Character[];
  clues: Clue[]; 
  relationships: Relationship[];
  relationshipDefs: RelationshipDef[];
  characterGroups: CharacterGroup[];
  layout: Record<string, { x: number; y: number }>;
  onAddRelationship: (source: string, target: string, relation: string) => void;
  onRemoveRelationship: (source: string, target: string, relation: string) => void;
  onUpdateDefs: (defs: RelationshipDef[]) => void;
  onNodeDrop: (id: string, type: 'character' | 'clue', x: number, y: number) => void;
  onUpdateLayout: (layout: Record<string, { x: number; y: number }>) => void;
  onRemoveNode: (id: string, type: 'character' | 'clue') => void; 
  onAddGroup: (group: CharacterGroup) => void;
  onUpdateGroup: (group: CharacterGroup) => void;
  onRemoveGroup: (groupId: string) => void;
}

const RelationshipGraph: React.FC<Props> = ({ 
    viewMode, characters, clues, relationships, relationshipDefs, layout = {}, 
    characterGroups, onAddRelationship, onNodeDrop, onUpdateLayout, onRemoveNode,
    onRemoveRelationship
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'move' | 'link' | 'delete'>('move');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRelId, setSelectedRelId] = useState<string>(relationshipDefs[0]?.id || '1');
  const [dragLink, setDragLink] = useState<{ sourceId: string, targetX: number, targetY: number } | null>(null);

  const getDefByLabel = (label: string) => relationshipDefs.find(d => d.label === label);
  const currentDef = relationshipDefs.find(d => d.id === selectedRelId) || relationshipDefs[0];

  // Merge characters and clues for node mapping
  const displayNodes = useMemo(() => {
    if (!containerRef.current) return [];
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    const base = characters.map(c => ({
      ...c,
      isClue: false,
      x: layout[c.id]?.x ?? width / 2,
      y: layout[c.id]?.y ?? height / 2
    }));

    if (viewMode === 'items') {
      const clueNodes = clues.map(c => ({
        ...c,
        isClue: true,
        x: layout[c.id]?.x ?? width / 2,
        y: layout[c.id]?.y ?? height / 2
      }));
      return [...base, ...clueNodes];
    }
    return base;
  }, [characters, clues, layout, viewMode]);

  // SVG Initialization
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    if (svg.select(".content").empty()) {
      const g = svg.append("g").attr("class", "content");
      g.append("g").attr("class", "groups-layer");
      g.append("g").attr("class", "links-layer");
      g.append("g").attr("class", "temp-link-layer");
      g.append("g").attr("class", "nodes-layer");
      
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 8])
        .on("zoom", (e) => g.attr("transform", e.transform))
        .filter((event) => {
            // Disable zoom while linking or if specifically dragging a node
            if (mode === 'link') return false;
            return !event.ctrlKey && !event.button;
        });
      svg.call(zoom);
    }
  }, [mode]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!containerRef.current || !svgRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const transform = d3.zoomTransform(svgRef.current);
    const dropX = (e.clientX - rect.left - transform.x) / transform.k;
    const dropY = (e.clientY - rect.top - transform.y) / transform.k;
    
    const charId = e.dataTransfer.getData("application/react-dnd-char-id");
    const clueId = e.dataTransfer.getData("application/react-dnd-clue-id");

    if (charId) onNodeDrop(charId, 'character', dropX, dropY);
    else if (clueId) onNodeDrop(clueId, 'clue', dropX, dropY);
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>(".content");
    
    const activeIds = new Set(displayNodes.map(n => n.id));
    const links = relationships.filter(r => activeIds.has(r.source) && activeIds.has(r.target));
    const getNode = (id: string) => displayNodes.find(n => n.id === id);

    // --- Groups Layer ---
    const layerGroups = g.select(".groups-layer");
    const groupPolygons = characterGroups.map(group => {
        const members = displayNodes.filter(n => group.characterIds.includes(n.id));
        if (members.length < 1) return null;
        
        // Calculate Hull or Padding Rect
        const padding = 60;
        const minX = Math.min(...members.map(m => m.x)) - padding;
        const maxX = Math.max(...members.map(m => m.x)) + padding;
        const minY = Math.min(...members.map(m => m.y)) - padding;
        const maxY = Math.max(...members.map(m => m.y)) + padding;

        return {
            id: group.id,
            color: group.color,
            label: group.label,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }).filter(Boolean);

    layerGroups.selectAll("rect.group-hull")
        .data(groupPolygons as any[], (d: any) => d.id)
        .join(
            enter => {
                const rectG = enter.append("g").attr("class", "group-hull-container");
                rectG.append("rect").attr("class", "group-hull").attr("rx", 30).attr("ry", 30).attr("fill-opacity", 0.05).attr("stroke-dasharray", "4,4");
                rectG.append("text").attr("class", "group-label").attr("font-size", "10px").attr("font-weight", "bold").attr("fill-opacity", 0.4).attr("text-transform", "uppercase");
                return rectG;
            }
        )
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .call(sel => {
            sel.select("rect")
                .attr("width", d => d.width)
                .attr("height", d => d.height)
                .attr("fill", d => d.color)
                .attr("stroke", d => d.color)
                .attr("stroke-opacity", 0.2);
            sel.select("text")
                .attr("x", 15)
                .attr("y", -10)
                .attr("fill", d => d.color)
                .text(d => d.label);
        });

    // --- Links Layer ---
    const layerLinks = g.select(".links-layer");
    const linkItems = layerLinks.selectAll("g.link-item")
        .data(links, (d: any) => `${d.source}-${d.target}-${d.relation}`)
        .join(
            enter => {
                const linkG = enter.append("g").attr("class", "link-item");
                linkG.append("path").attr("fill", "none").attr("stroke-width", 3).attr("stroke-linecap", "round");
                linkG.append("circle").attr("r", 10).attr("fill", "#0f172a").attr("stroke-width", 1).attr("cursor", "pointer").attr("class", "link-deleter");
                linkG.append("text").attr("text-anchor", "middle").attr("dy", 3).attr("font-size", "8px").attr("fill", "white").attr("pointer-events", "none");
                return linkG;
            }
        );

    linkItems.select("path")
        .attr("stroke", d => getDefByLabel(d.relation)?.color || '#6366f1')
        .attr("d", d => {
            const s = getNode(d.source), t = getNode(d.target);
            if (!s || !t) return "";
            return `M ${s.x},${s.y} L ${t.x},${t.y}`;
        });

    linkItems.select("circle")
        .attr("cx", d => { const s = getNode(d.source), t = getNode(d.target); return s && t ? (s.x + t.x) / 2 : 0; })
        .attr("cy", d => { const s = getNode(d.source), t = getNode(d.target); return s && t ? (s.y + t.y) / 2 : 0; })
        .attr("stroke", d => getDefByLabel(d.relation)?.color || '#6366f1')
        .on("click", (e, d) => {
            if (mode === 'delete') onRemoveRelationship(d.source, d.target, d.relation);
        });

    linkItems.select("text")
        .attr("x", d => { const s = getNode(d.source), t = getNode(d.target); return s && t ? (s.x + t.x) / 2 : 0; })
        .attr("y", d => { const s = getNode(d.source), t = getNode(d.target); return s && t ? (s.y + t.y) / 2 : 0; })
        .text(d => d.relation.charAt(0));

    // --- Temp Link Layer (Dragging new link) ---
    const layerTemp = g.select(".temp-link-layer");
    layerTemp.selectAll("line").data(dragLink ? [dragLink] : []).join("line")
        .attr("x1", d => getNode(d.sourceId)?.x || 0)
        .attr("y1", d => getNode(d.sourceId)?.y || 0)
        .attr("x2", d => d.targetX)
        .attr("y2", d => d.targetY)
        .attr("stroke", currentDef.color)
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "5,5");

    // --- Nodes Layer ---
    const layerNodes = g.select(".nodes-layer");
    const node = layerNodes.selectAll<SVGGElement, any>("g.node-item")
        .data(displayNodes, (d: any) => d.id)
        .join(
            enter => {
                const nodeG = enter.append("g").attr("class", "node-item cursor-grab");
                nodeG.append("rect").attr("x", -45).attr("y", -22).attr("width", 90).attr("height", 44).attr("rx", 12).attr("stroke-width", 2.5);
                nodeG.append("text").attr("y", 4).attr("text-anchor", "middle").attr("fill", "white").attr("font-size", "12px").attr("font-weight", "black");
                return nodeG;
            }
        )
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .on("mousedown", (e, d) => {
            if (mode === 'link') {
                e.stopPropagation();
                const transform = d3.zoomTransform(svgRef.current!);
                const mouseX = (e.clientX - containerRef.current!.getBoundingClientRect().left - transform.x) / transform.k;
                const mouseY = (e.clientY - containerRef.current!.getBoundingClientRect().top - transform.y) / transform.k;
                setDragLink({ sourceId: d.id, targetX: mouseX, targetY: mouseY });
            }
        })
        .on("click", (e, d: any) => {
            if (mode === 'delete') onRemoveNode(d.id, d.isClue ? 'clue' : 'character');
        });

    node.select("rect")
        .attr("stroke", d => d.isClue ? '#f59e0b' : '#3b82f6')
        .attr("fill", d => {
            const group = characterGroups.find(g => g.characterIds.includes(d.id));
            if (group) return group.color + '33'; // 20% opacity of group color
            return d.isClue ? '#451a03' : '#1e293b';
        });
        
    node.select("text").text(d => d.name);

    // Draggable Logic
    node.call(d3.drag<SVGGElement, any>().on("drag", (e, d) => {
      if (mode !== 'move') return;
      d.x += e.dx; d.y += e.dy;
      d3.select(e.sourceEvent.target.parentNode).attr("transform", `translate(${d.x},${d.y})`);
      onUpdateLayout({ [d.id]: { x: d.x, y: d.y } });
    }));

    // SVG global listeners for link dragging
    if (mode === 'link') {
        svg.on("mousemove", (e) => {
            if (dragLink) {
                const transform = d3.zoomTransform(svgRef.current!);
                const mouseX = (e.clientX - containerRef.current!.getBoundingClientRect().left - transform.x) / transform.k;
                const mouseY = (e.clientY - containerRef.current!.getBoundingClientRect().top - transform.y) / transform.k;
                setDragLink(prev => prev ? { ...prev, targetX: mouseX, targetY: mouseY } : null);
            }
        });
        svg.on("mouseup", (e) => {
            if (dragLink) {
                const targetNode = d3.select(e.target).datum() as any;
                if (targetNode && targetNode.id && targetNode.id !== dragLink.sourceId) {
                    onAddRelationship(dragLink.sourceId, targetNode.id, currentDef.label);
                }
                setDragLink(null);
            }
        });
    } else {
        svg.on("mousemove", null).on("mouseup", null);
    }

  }, [displayNodes, relationships, relationshipDefs, characterGroups, viewMode, layout, mode, dragLink, selectedRelId]);

  return (
    <div className={`flex gap-4 flex-col lg:flex-row transition-all duration-300 ${isExpanded ? 'fixed inset-0 z-[400] bg-slate-950 p-6' : 'h-full min-h-[650px] relative'}`}>
      <div 
        ref={containerRef} 
        onDragOver={e => e.preventDefault()} 
        onDrop={handleDrop}
        className={`flex-1 bg-slate-900/40 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-inner relative flex flex-col ${mode === 'link' ? 'cursor-crosshair' : ''}`}
      >
        <svg ref={svgRef} className="w-full h-full block" />
        
        {/* Overlays */}
        <div className="absolute top-6 left-6 flex flex-col gap-2 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${viewMode === 'items' ? 'bg-amber-600' : 'bg-blue-600'}`}>
              {viewMode === 'items' ? <Package size={16} className="text-white" /> : <Users size={16} className="text-white" />}
            </div>
            <span className="text-xs font-black text-slate-200 uppercase tracking-widest">
              {viewMode === 'items' ? '物证逻辑关系链' : '人物核心关系网'}
            </span>
          </div>
          {mode === 'link' && (
              <div className="bg-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white uppercase animate-pulse border border-indigo-400">
                  当前：连线模式 (从节点拖拽至目标节点)
              </div>
          )}
        </div>

        <button onClick={() => setIsExpanded(!isExpanded)} className="absolute top-6 right-6 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-lg pointer-events-auto">
            {isExpanded ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>

      {/* Sidebar Controls */}
      <div className="w-full lg:w-72 flex flex-col gap-4">
        <div className="bg-slate-800 p-1.5 rounded-2xl flex border border-slate-700 shadow-lg shrink-0">
          <button onClick={() => setMode('move')} title="选择/移动" className={`flex-1 py-3 rounded-xl transition-all ${mode === 'move' ? 'bg-blue-600 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}><Move size={18} className="mx-auto" /></button>
          <button onClick={() => setMode('link')} title="建立连线" className={`flex-1 py-3 rounded-xl transition-all ${mode === 'link' ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}><Link2 size={18} className="mx-auto" /></button>
          <button onClick={() => setMode('delete')} title="删除节点或连线" className={`flex-1 py-3 rounded-xl transition-all ${mode === 'delete' ? 'bg-red-600 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}><Trash2 size={18} className="mx-auto" /></button>
        </div>

        {mode === 'link' && (
            <div className="bg-slate-800 rounded-3xl border border-slate-700 p-4 shadow-xl animate-in slide-in-from-top-2">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">选择连线类型</h3>
                <div className="grid grid-cols-2 gap-2">
                    {relationshipDefs.map(def => (
                        <button 
                            key={def.id} 
                            onClick={() => setSelectedRelId(def.id)}
                            className={`px-3 py-2 rounded-xl border text-[10px] font-bold transition-all flex items-center gap-2 ${selectedRelId === def.id ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                        >
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: def.color }} />
                            {def.label}
                        </button>
                    ))}
                </div>
            </div>
        )}

        <div className="bg-slate-800 rounded-3xl border border-slate-700 flex-1 overflow-hidden flex flex-col shadow-xl">
          <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">关系图例与分组</h3>
          </div>
          <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">逻辑关系定义</p>
                {relationshipDefs.map(def => (
                  <div key={def.id} className="flex items-center gap-4 p-2.5 bg-slate-900/30 rounded-xl border border-slate-700/50">
                    <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: def.color }} />
                    <span className="text-[11px] font-bold text-slate-300">{def.label}</span>
                  </div>
                ))}
            </div>

            <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">当前生效分组</p>
                {characterGroups.map(group => (
                  <div key={group.id} className="flex items-center gap-4 p-2.5 bg-slate-900/30 rounded-xl border border-slate-700/50">
                    <div className="w-3 h-3 rounded border border-white/10" style={{ backgroundColor: group.color }} />
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-300">{group.label}</span>
                        <span className="text-[9px] text-slate-500 font-mono">{group.characterIds.length} 位成员</span>
                    </div>
                  </div>
                ))}
                {characterGroups.length === 0 && <p className="text-[10px] text-slate-600 italic">暂无自定义分组</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelationshipGraph;
