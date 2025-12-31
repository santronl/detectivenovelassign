
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Character, Relationship, RelationshipDef, CharacterGroup, Clue } from '../types';
import { Move, Trash2, Users, Maximize, Minimize, Info, Package } from 'lucide-react';

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
    onAddRelationship, onNodeDrop, onUpdateLayout, onRemoveNode
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'move' | 'delete'>('move');
  const [isExpanded, setIsExpanded] = useState(false);
  const nodesRef = useRef<any[]>([]);

  const getDefByLabel = (label: string) => relationshipDefs.find(d => d.label === label);

  // 初始化 SVG
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    if (svg.select(".content").empty()) {
      const g = svg.append("g").attr("class", "content");
      g.append("g").attr("class", "links-layer");
      g.append("g").attr("class", "nodes-layer");
      
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 8])
        .on("zoom", (e) => g.attr("transform", e.transform));
      svg.call(zoom);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!containerRef.current || !svgRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const transform = d3.zoomTransform(svgRef.current);
    const dropX = (e.clientX - rect.left - transform.x) / transform.k;
    const dropY = (e.clientY - rect.top - transform.y) / transform.k;
    
    const charId = e.dataTransfer.getData("application/react-dnd-char-id");
    const clueId = e.dataTransfer.getData("application/react-dnd-clue-id");

    if (charId) {
      onNodeDrop(charId, 'character', dropX, dropY);
    } else if (clueId) {
      onNodeDrop(clueId, 'clue', dropX, dropY);
    }
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>(".content");
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const finalNodes = characters.map(c => {
      const p = layout[c.id];
      return { ...c, x: p ? p.x : width / 2, y: p ? p.y : height / 2 };
    });
    
    // 如果是物品模式，合并线索
    const displayNodes = viewMode === 'items' 
      ? [...finalNodes, ...clues.map(c => ({ ...c, x: layout[c.id]?.x || width/2, y: layout[c.id]?.y || height/2, isClue: true }))]
      : finalNodes;

    nodesRef.current = displayNodes;

    const activeIds = new Set(displayNodes.map(n => n.id));
    const links = relationships.filter(r => activeIds.has(r.source) && activeIds.has(r.target));
    const getNode = (id: string) => displayNodes.find(n => n.id === id);

    // --- 连线层 ---
    const layerLinks = g.select(".links-layer");
    layerLinks.selectAll("path").data(links, (d: any) => `${d.source}-${d.target}-${d.relation}`).join("path")
      .attr("fill", "none")
      .attr("stroke", d => getDefByLabel(d.relation)?.color || '#6366f1')
      .attr("stroke-width", 2.5)
      .attr("stroke-linecap", "round")
      .attr("d", d => {
        const s = getNode(d.source), t = getNode(d.target);
        if (!s || !t) return "";
        return `M ${s.x},${s.y} L ${t.x},${t.y}`;
      });

    // --- 节点层 ---
    const layerNodes = g.select(".nodes-layer");
    const node = layerNodes.selectAll<SVGGElement, any>("g.node-item").data(displayNodes, (d: any) => d.id).join(
      enter => {
        const nodeG = enter.append("g").attr("class", "node-item");
        nodeG.append("rect").attr("x", -40).attr("y", -20).attr("width", 80).attr("height", 40).attr("rx", 8).attr("fill", "#1e293b").attr("stroke-width", 2);
        nodeG.append("text").attr("y", 5).attr("text-anchor", "middle").attr("fill", "white").attr("font-size", "11px").attr("font-weight", "black");
        return nodeG;
      }
    )
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .on("click", (e, d: any) => {
      if (mode === 'delete') onRemoveNode(d.id, (d as any).isClue ? 'clue' : 'character');
    });

    node.select("rect")
        .attr("stroke", d => (d as any).isClue ? '#f59e0b' : '#3b82f6')
        .attr("fill", d => (d as any).isClue ? '#451a03' : '#1e293b');
        
    node.select("text").text(d => d.name);

    node.call(d3.drag<SVGGElement, any>().on("drag", (e, d) => {
      if (mode !== 'move') return;
      d.x += e.dx; d.y += e.dy;
      d3.select(e.sourceEvent.target.parentNode).attr("transform", `translate(${d.x},${d.y})`);
      onUpdateLayout({ [d.id]: { x: d.x, y: d.y } });
    }));

  }, [characters, clues, relationships, relationshipDefs, viewMode, layout, isExpanded, mode]);

  return (
    <div className={`flex gap-4 flex-col lg:flex-row transition-all duration-300 ${isExpanded ? 'fixed inset-0 z-[400] bg-slate-950 p-6' : 'h-full min-h-[600px] relative'}`}>
      <div 
        ref={containerRef} 
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
        className="flex-1 bg-slate-900/40 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-inner relative flex flex-col"
      >
        <svg ref={svgRef} className="w-full h-full block" />
        <div className="absolute top-6 left-6 flex flex-col gap-2 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${viewMode === 'items' ? 'bg-amber-600' : 'bg-blue-600'}`}>
              {viewMode === 'items' ? <Package size={16} className="text-white" /> : <Users size={16} className="text-white" />}
            </div>
            <span className="text-xs font-black text-slate-200 uppercase tracking-widest">
              {viewMode === 'items' ? '物证逻辑关系链' : '人物核心关系网'}
            </span>
          </div>
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)} className="absolute top-6 right-6 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-lg"><Maximize size={20} /></button>
      </div>

      <div className="w-full lg:w-64 flex flex-col gap-4">
        <div className="bg-slate-800 p-1.5 rounded-2xl flex border border-slate-700 shadow-lg">
          <button onClick={() => setMode('move')} className={`flex-1 py-3 rounded-xl transition-all ${mode === 'move' ? 'bg-blue-600 text-white shadow-inner' : 'text-slate-500'}`}><Move size={18} className="mx-auto" /></button>
          <button onClick={() => setMode('delete')} className={`flex-1 py-3 rounded-xl transition-all ${mode === 'delete' ? 'bg-red-600 text-white shadow-inner' : 'text-slate-500'}`}><Trash2 size={18} className="mx-auto" /></button>
        </div>
        <div className="bg-slate-800 rounded-3xl border border-slate-700 flex-1 overflow-hidden flex flex-col shadow-xl">
          <div className="p-4 border-b border-slate-700 bg-slate-900/50"><h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">连线图例</h3></div>
          <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
            {relationshipDefs.map(def => (
              <div key={def.id} className="flex items-center gap-4 p-3 bg-slate-900/30 rounded-2xl border border-slate-700/50">
                <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: def.color }} />
                <span className="text-[11px] font-bold text-slate-300">{def.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelationshipGraph;
