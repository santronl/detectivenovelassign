
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Character, Relationship, RelationshipDef, CharacterGroup, Clue } from '../types';
import { Move, Trash2, Users, Maximize, Package, Link as LinkIcon, X, Check, MousePointer2, Layers, Grid } from 'lucide-react';

interface Props {
  viewMode: 'people' | 'items';
  characters: Character[];
  clues: Clue[]; 
  relationships: Relationship[];
  relationshipDefs: RelationshipDef[];
  characterGroups: CharacterGroup[];
  layout: Record<string, { x: number; y: number }>;
  blobUrls: Record<string, string>;
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
    viewMode, characters, clues, relationships, relationshipDefs, characterGroups, layout = {}, blobUrls,
    onAddRelationship, onRemoveRelationship, onNodeDrop, onUpdateLayout, onRemoveNode, onUpdateDefs, onAddGroup
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'move' | 'delete' | 'connect' | 'select'>('move');
  const [isExpanded, setIsExpanded] = useState(false);
  const nodesRef = useRef<any[]>([]);
  
  // Selection State
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  // Use Ref to access latest selection in D3 handlers without re-binding
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const dragStartPos = useRef<{x: number, y: number} | null>(null);

  // Sync Ref
  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  // Connection State
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [linkModalData, setLinkModalData] = useState<{ sourceId: string, targetId: string } | null>(null);
  const [newRelLabel, setNewRelLabel] = useState("");
  const [newRelColor, setNewRelColor] = useState("#6366f1");

  const getDefByLabel = (label: string) => relationshipDefs.find(d => d.label === label);

  const getGroupColor = (id: string, isClue: boolean) => {
    const group = characterGroups.find(g => g.characterIds.includes(id));
    if (group) return group.color;
    return isClue ? '#f59e0b' : '#3b82f6';
  };

  const handleNodeClick = (e: any, id: string, type: 'character' | 'clue') => {
    e.stopPropagation(); // Prevent canvas click

    if (mode === 'delete') {
        onRemoveNode(id, type);
    } else if (mode === 'connect') {
        if (!connectingSourceId) {
            setConnectingSourceId(id);
        } else {
            if (connectingSourceId === id) {
                setConnectingSourceId(null); 
            } else {
                setLinkModalData({ sourceId: connectingSourceId, targetId: id });
                setConnectingSourceId(null);
                setNewRelLabel("");
                setNewRelColor("#6366f1");
            }
        }
    } else if (mode === 'select') {
        if (e.ctrlKey || e.metaKey) {
            setSelectedNodeIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        } else {
             // If clicking an unselected node without Ctrl, select only it
             if (!selectedNodeIds.has(id)) {
                 setSelectedNodeIds(new Set([id]));
             }
             // If clicking an ALREADY selected node without ctrl, do nothing (wait for drag)
        }
    }
  };

  const confirmConnection = () => {
      if (linkModalData && newRelLabel.trim()) {
          onAddRelationship(linkModalData.sourceId, linkModalData.targetId, newRelLabel.trim());
          
          const exists = relationshipDefs.some(d => d.label === newRelLabel.trim());
          if (!exists) {
              onUpdateDefs([...relationshipDefs, { 
                  id: crypto.randomUUID(), 
                  label: newRelLabel.trim(), 
                  color: newRelColor 
              }]);
          }
          setLinkModalData(null);
      }
  };

  const handleCreateGroup = () => {
      const ids = Array.from(selectedNodeIds).filter(id => characters.some(c => c.id === id) || clues.some(c => c.id === id));
      if (ids.length === 0) return;

      onAddGroup({
          id: crypto.randomUUID(),
          label: "新建分组",
          color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'),
          characterIds: ids
      });
      setSelectedNodeIds(new Set());
  };

  const handleMultiDelete = () => {
      Array.from(selectedNodeIds).forEach(id => {
          const type = clues.some(c => c.id === id) ? 'clue' : 'character';
          onRemoveNode(id, type);
      });
      setSelectedNodeIds(new Set());
  };

  // Canvas Click (Background)
  const handleCanvasClick = (e: React.MouseEvent) => {
      if (mode === 'connect') {
          setConnectingSourceId(null);
      }
      // Note: Selection clearing for 'select' mode is handled in mousedown.select logic
      // to avoid conflict with drag-selection (which triggers click event at the end).
  };

  // Initialization
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    // Add Defs for ClipPath
    if (svg.select("defs").empty()) {
      const defs = svg.append("defs");
      defs.append("clipPath")
        .attr("id", "node-avatar-clip")
        .append("circle")
        .attr("r", 26)
        .attr("cx", 0)
        .attr("cy", 0);
    }

    if (svg.select(".content").empty()) {
      const g = svg.append("g").attr("class", "content");
      g.append("g").attr("class", "links-layer");
      g.append("g").attr("class", "link-labels-layer");
      g.append("g").attr("class", "nodes-layer");
      g.append("rect").attr("class", "selection-rect")
       .attr("fill", "rgba(59, 130, 246, 0.1)")
       .attr("stroke", "#3b82f6")
       .attr("stroke-width", 1)
       .attr("stroke-dasharray", "4,2")
       .style("pointer-events", "none")
       .style("display", "none");
    }
  }, []);

  // Mode & Zoom Handling
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>(".content");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (e) => g.attr("transform", e.transform));

    if (mode === 'select') {
        // Disable Zoom Panning on left click, allow scrolling/wheel
        svg.on(".zoom", null); // Remove previous listeners
        
        // Re-apply zoom but filter out left-click mousedown to allow drag selection
        zoom.filter((event) => {
             // Allow wheel zooming
             if (event.type === 'wheel') return true;
             // Allow panning with middle mouse button or spacebar + left click? 
             // For simplicity, just disable pan in select mode, or use right click/middle click.
             // Let's rely on standard d3 behavior but prevent start on background mousedown for box select.
             return !event.button && event.type !== 'mousedown'; 
        });
        svg.call(zoom);

        // Selection Box Logic
        svg.on("mousedown.select", (event) => {
            if (event.button !== 0) return; // Only left click
            // If target is a node, don't start box
            if (event.target.closest(".node-item")) return;
            
            const transform = d3.zoomTransform(svg.node()!);
            const [x, y] = d3.pointer(event);
            // Transform screen coords to graph coords
            const gx = (x - transform.x) / transform.k;
            const gy = (y - transform.y) / transform.k;
            
            dragStartPos.current = { x: gx, y: gy };
            setSelectionBox({ x: gx, y: gy, width: 0, height: 0 });
            
            if (!event.ctrlKey && !event.metaKey) {
                setSelectedNodeIds(new Set());
            }
        });

        svg.on("mousemove.select", (event) => {
            if (!dragStartPos.current) return;
            const transform = d3.zoomTransform(svg.node()!);
            const [x, y] = d3.pointer(event);
            const gx = (x - transform.x) / transform.k;
            const gy = (y - transform.y) / transform.k;

            const start = dragStartPos.current;
            const minX = Math.min(start.x, gx);
            const minY = Math.min(start.y, gy);
            const width = Math.abs(gx - start.x);
            const height = Math.abs(gy - start.y);

            setSelectionBox({ x: minX, y: minY, width, height });
        });

        svg.on("mouseup.select", (event) => {
             if (dragStartPos.current) {
                 // Recalculate box to ensure we have latest data
                 const transform = d3.zoomTransform(svg.node()!);
                 const [x, y] = d3.pointer(event);
                 const gx = (x - transform.x) / transform.k;
                 const gy = (y - transform.y) / transform.k;

                 const start = dragStartPos.current;
                 const minX = Math.min(start.x, gx);
                 const maxX = Math.max(start.x, gx);
                 const minY = Math.min(start.y, gy);
                 const maxY = Math.max(start.y, gy);

                 // Use Ref to get current selection (avoids stale closure)
                 const currentSelection = (event.ctrlKey || event.metaKey) 
                    ? new Set(selectedNodeIdsRef.current) 
                    : new Set<string>();

                 const width = maxX - minX;
                 const height = maxY - minY;

                 // Only select if box has some size (avoid selecting on tiny jitters/clicks)
                 if (width > 1 || height > 1) {
                     nodesRef.current.forEach(node => {
                         // Check intersection (simple center check)
                         if (node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
                             currentSelection.add(node.id);
                         }
                     });
                     setSelectedNodeIds(currentSelection);
                 }
             }
             dragStartPos.current = null;
             setSelectionBox(null);
        });

    } else {
        // Enable full zoom/pan for Move/Delete/Connect modes
        svg.on(".select", null);
        zoom.filter((event) => !event.ctrlKey && !event.button);
        svg.call(zoom);
        setSelectionBox(null);
    }

  }, [mode]); // Removed selectedNodeIds to prevent re-binding listeners during interaction

  // Update Selection Box Visual
  useEffect(() => {
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current);
      const rect = svg.select(".selection-rect");
      
      if (selectionBox) {
          rect.style("display", "block")
              .attr("x", selectionBox.x)
              .attr("y", selectionBox.y)
              .attr("width", selectionBox.width)
              .attr("height", selectionBox.height);
      } else {
          rect.style("display", "none");
      }
  }, [selectionBox]);


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
    const multipleIds = e.dataTransfer.getData("application/mysterymind-ids");

    if (multipleIds) {
        try {
           const ids = JSON.parse(multipleIds);
           onNodeDrop(multipleIds, 'character', dropX, dropY);
        } catch(e) {}
    } else if (charId) {
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

    // --- Update Marker Defs ---
    const defs = svg.select("defs");
    defs.selectAll("marker.link-arrow")
        .data(relationshipDefs, (d: any) => d.id)
        .join(
            enter => enter.append("marker")
                .attr("class", "link-arrow")
                .attr("id", d => `arrow-${d.id}`)
                .attr("viewBox", "0 -5 10 10")
                .attr("refX", 7) 
                .attr("refY", 0)
                .attr("markerWidth", 5)
                .attr("markerHeight", 5)
                .attr("orient", "auto")
                .append("path")
                .attr("d", "M0,-5L10,0L0,5")
                .attr("fill", d => d.color),
            update => update.select("path").attr("fill", d => d.color),
            exit => exit.remove()
        );

    const finalNodes = characters.map(c => {
      const p = layout[c.id];
      return { ...c, x: p ? p.x : width / 2, y: p ? p.y : height / 2 };
    });
    
    const displayNodes = viewMode === 'items' 
      ? [...finalNodes, ...clues.map(c => ({ ...c, x: layout[c.id]?.x || width/2, y: layout[c.id]?.y || height/2, isClue: true }))]
      : finalNodes;

    nodesRef.current = displayNodes;

    const activeIds = new Set(displayNodes.map(n => n.id));
    const links = relationships.filter(r => activeIds.has(r.source) && activeIds.has(r.target));
    const getNode = (id: string) => displayNodes.find(n => n.id === id);

    // --- 连线层 ---
    const layerLinks = g.select(".links-layer");
    layerLinks.selectAll("path.link-path").data(links, (d: any) => `${d.source}-${d.target}-${d.relation}`).join("path")
      .attr("class", "link-path")
      .attr("fill", "none")
      .attr("stroke", d => getDefByLabel(d.relation)?.color || '#6366f1')
      .attr("stroke-width", 3)
      .attr("stroke-opacity", 0.8)
      .attr("marker-end", d => {
          const def = getDefByLabel(d.relation);
          return def ? `url(#arrow-${def.id})` : null;
      })
      .attr("d", d => {
        const s = getNode(d.source);
        const t = getNode(d.target);
        if (!s || !t) return "";
        const r = 32;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return "";
        const tx = t.x - (dx / dist) * r;
        const ty = t.y - (dy / dist) * r;
        const sx = s.x + (dx / dist) * r;
        const sy = s.y + (dy / dist) * r;
        return `M ${sx},${sy} L ${tx},${ty}`;
      });

    // --- 连线标签层 ---
    const layerLinkLabels = g.select(".link-labels-layer");
    const labels = layerLinkLabels.selectAll("g.link-label-group")
        .data(links, (d: any) => `${d.source}-${d.target}-${d.relation}`)
        .join(
            enter => {
                const group = enter.append("g").attr("class", "link-label-group").style("cursor", "pointer");
                group.append("rect")
                    .attr("rx", 6)
                    .attr("ry", 6)
                    .attr("fill", "#0f172a")
                    .attr("stroke-width", 1.5);
                group.append("text")
                    .attr("text-anchor", "middle")
                    .attr("dy", ".35em")
                    .attr("font-size", "9px")
                    .attr("font-weight", "bold");
                return group;
            }
        );

    labels.each(function(d) {
        const s = getNode(d.source);
        const t = getNode(d.target);
        const def = getDefByLabel(d.relation);
        const color = def?.color || '#6366f1';
        
        if (!s || !t) return;
        
        const sel = d3.select(this);
        const text = sel.select("text");
        const rect = sel.select("rect");
        
        text.text(d.relation).attr("fill", color);
        
        const bbox = (text.node() as SVGTextElement).getBBox();
        const padX = 8;
        const padY = 4;
        
        rect.attr("width", bbox.width + padX * 2)
            .attr("height", bbox.height + padY * 2)
            .attr("x", -(bbox.width + padX * 2) / 2)
            .attr("y", -(bbox.height + padY * 2) / 2)
            .attr("stroke", color);

        const midX = (s.x + t.x) / 2;
        const midY = (s.y + t.y) / 2;
        sel.attr("transform", `translate(${midX},${midY})`);
        
        sel.on("click", (e) => {
            e.stopPropagation();
            if (mode === 'delete') {
                onRemoveRelationship(d.source, d.target, d.relation);
            }
        });
    });

    // --- 节点层 ---
    const layerNodes = g.select(".nodes-layer");
    const node = layerNodes.selectAll<SVGGElement, any>("g.node-item").data(displayNodes, (d: any) => d.id).join(
      enter => {
        const nodeG = enter.append("g").attr("class", "node-item");
        
        // Active Selection Ring
        nodeG.append("circle")
           .attr("class", "node-select-ring")
           .attr("r", 34)
           .attr("fill", "none")
           .attr("stroke", "#ffffff")
           .attr("stroke-width", 2)
           .attr("stroke-dasharray", "4,2")
           .attr("opacity", 0);

        nodeG.append("circle")
          .attr("r", 26)
          .attr("fill", "#0f172a")
          .attr("class", "node-bg");

        nodeG.append("image")
          .attr("x", -26)
          .attr("y", -26)
          .attr("width", 52)
          .attr("height", 52)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", "url(#node-avatar-clip)")
          .attr("class", "node-img");

        nodeG.append("circle")
          .attr("r", 26)
          .attr("fill", "none")
          .attr("stroke-width", 3)
          .attr("class", "node-border");
        
        nodeG.append("text")
          .attr("class", "node-icon")
          .attr("dy", ".35em")
          .attr("text-anchor", "middle")
          .attr("fill", "rgba(255,255,255,0.8)")
          .attr("font-size", "14px")
          .attr("font-weight", "bold")
          .style("pointer-events", "none");

        nodeG.append("text")
            .attr("class", "node-label")
            .attr("y", 42) 
            .attr("text-anchor", "middle")
            .attr("fill", "#e2e8f0")
            .attr("font-size", "11px")
            .attr("font-weight", "bold")
            .style("text-shadow", "0 2px 4px rgba(0,0,0,0.9)")
            .style("pointer-events", "none");

        return nodeG;
      }
    )
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .style("cursor", (mode === 'move' || mode === 'select') ? "grab" : "pointer")
    .on("click", (e, d: any) => handleNodeClick(e, d.id, d.isClue ? 'clue' : 'character'));

    node.select(".node-border")
        .attr("stroke", d => getGroupColor(d.id, (d as any).isClue));
    
    // Update Selection/Connecting Ring
    node.select(".node-select-ring")
        .attr("opacity", d => (d.id === connectingSourceId || selectedNodeIds.has(d.id)) ? 1 : 0)
        .attr("stroke", d => d.id === connectingSourceId ? "#60a5fa" : (selectedNodeIds.has(d.id) ? "#3b82f6" : "none"))
        .attr("class", d => d.id === connectingSourceId ? "node-select-ring animate-pulse" : "node-select-ring")
        .attr("stroke-width", d => selectedNodeIds.has(d.id) ? 3 : 2)
        .attr("stroke-dasharray", d => d.id === connectingSourceId ? "4,2" : "none");

    node.select(".node-img")
        .attr("href", d => (d as any).imageId ? blobUrls[(d as any).imageId] : "")
        .style("display", d => (d as any).imageId && blobUrls[(d as any).imageId] ? "block" : "none");

    node.select(".node-icon")
        .text(d => (d as any).isClue ? '📦' : d.name.slice(0, 1))
        .style("display", d => (d as any).imageId && blobUrls[(d as any).imageId] ? "none" : "block");

    node.select(".node-label").text(d => d.name);

    // Node Drag Logic (Enhanced for Multi-Move)
    const dragHandler = d3.drag<SVGGElement, any>()
        .on("start", (e, d) => {
             // If dragging an unselected node in select mode, select it first if Ctrl is not held
             // Use Ref for latest selection state
             if (mode === 'select' && !selectedNodeIdsRef.current.has(d.id) && !e.sourceEvent.ctrlKey && !e.sourceEvent.metaKey) {
                 setSelectedNodeIds(new Set([d.id]));
             }
        })
        .on("drag", (e, d) => {
            if (mode !== 'move' && mode !== 'select') return;
            
            const dx = e.dx;
            const dy = e.dy;
            
            // Determine affected nodes using Ref for latest state
            const currentSelected = selectedNodeIdsRef.current;
            const movingIds = currentSelected.has(d.id) && mode === 'select' 
                ? Array.from(currentSelected) 
                : [d.id];
            
            // Temporary update for visual smoothness
            movingIds.forEach(id => {
               const nodeData = displayNodes.find(n => n.id === id);
               if (nodeData) {
                   nodeData.x += dx;
                   nodeData.y += dy;
               }
            });
            
            // Move SVG elements
            svg.selectAll<SVGGElement, any>(".node-item")
               .filter(n => movingIds.includes(n.id))
               .attr("transform", n => `translate(${n.x},${n.y})`);
               
            // Move connected links (Update path d attribute)
            const activeMovingIds = new Set(movingIds);
            g.selectAll<SVGPathElement, Relationship>(".link-path")
             .filter(l => activeMovingIds.has(l.source) || activeMovingIds.has(l.target))
             .attr("d", l => {
                const s = getNode(l.source);
                const t = getNode(l.target);
                if (!s || !t) return "";
                const r = 32;
                const dist = Math.sqrt(Math.pow(t.x-s.x, 2) + Math.pow(t.y-s.y, 2));
                if (dist === 0) return "";
                const tx = t.x - ((t.x-s.x)/dist) * r;
                const ty = t.y - ((t.y-s.y)/dist) * r;
                const sx = s.x + ((t.x-s.x)/dist) * r;
                const sy = s.y + ((t.y-s.y)/dist) * r;
                return `M ${sx},${sy} L ${tx},${ty}`;
             });
             
             // Move link labels
            g.selectAll<SVGGElement, Relationship>(".link-label-group")
             .filter(l => activeMovingIds.has(l.source) || activeMovingIds.has(l.target))
             .attr("transform", l => {
                 const s = getNode(l.source);
                 const t = getNode(l.target);
                 if (!s || !t) return "";
                 return `translate(${(s.x+t.x)/2},${(s.y+t.y)/2})`;
             });

        })
        .on("end", (e, d) => {
             if (mode !== 'move' && mode !== 'select') return;
             
             const currentSelected = selectedNodeIdsRef.current;
             const movingIds = currentSelected.has(d.id) && mode === 'select'
                 ? Array.from(currentSelected) 
                 : [d.id];
                 
             const newLayoutChanges: Record<string, {x:number, y:number}> = {};
             movingIds.forEach(id => {
                 const n = displayNodes.find(dn => dn.id === id);
                 if (n) newLayoutChanges[id] = { x: n.x, y: n.y };
             });
             onUpdateLayout(newLayoutChanges);
        });

    node.call(dragHandler);

  }, [characters, clues, relationships, relationshipDefs, viewMode, layout, isExpanded, mode, characterGroups, blobUrls, connectingSourceId]); 
  // removed selectedNodeIds from dependency to avoid re-render loop on D3 logic

  return (
    <div className={`flex gap-4 flex-col lg:flex-row transition-all duration-300 ${isExpanded ? 'fixed inset-0 z-[400] bg-slate-950 p-6' : 'h-full min-h-[600px] relative'}`}>
      <div 
        ref={containerRef} 
        onDragOver={handleDragOver} 
        onDrop={handleDrop}
        onClick={handleCanvasClick}
        className="flex-1 bg-slate-900/40 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-inner relative flex flex-col"
      >
        <svg ref={svgRef} className="w-full h-full block select-none" />
        
        {/* Top-Left Mode Indicator */}
        <div className="absolute top-6 left-6 flex flex-col gap-2 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${viewMode === 'items' ? 'bg-amber-600' : 'bg-blue-600'}`}>
              {viewMode === 'items' ? <Package size={16} className="text-white" /> : <Users size={16} className="text-white" />}
            </div>
            <span className="text-xs font-black text-slate-200 uppercase tracking-widest">
              {viewMode === 'items' ? '物证逻辑关系链' : '人物关系图谱'}
            </span>
          </div>
          {mode === 'connect' && (
             <div className="bg-blue-600/90 backdrop-blur px-4 py-1.5 rounded-xl border border-blue-400/50 shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                <LinkIcon size={12} className="text-white animate-pulse" />
                <span className="text-[10px] font-bold text-white">
                    {connectingSourceId ? "请点击目标对象建立连接..." : "请选择连线起始对象..."}
                </span>
             </div>
          )}
           {mode === 'select' && selectedNodeIds.size > 0 && (
             <div className="bg-indigo-600/90 backdrop-blur px-4 py-1.5 rounded-xl border border-indigo-400/50 shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-left-2 pointer-events-auto">
                <span className="text-[10px] font-bold text-white mr-2">已选中 {selectedNodeIds.size} 项</span>
                <button onClick={handleCreateGroup} title="创建分组" className="p-1 hover:bg-white/20 rounded"><Layers size={12} className="text-white"/></button>
                <div className="w-[1px] h-3 bg-white/30"></div>
                <button onClick={handleMultiDelete} title="批量删除" className="p-1 hover:bg-white/20 rounded"><Trash2 size={12} className="text-white"/></button>
                <button onClick={() => setSelectedNodeIds(new Set())} title="取消选择" className="p-1 hover:bg-white/20 rounded"><X size={12} className="text-white"/></button>
             </div>
          )}
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)} className="absolute top-6 right-6 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 shadow-lg"><Maximize size={20} /></button>
        
        {/* Link Creation Modal */}
        {linkModalData && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                    <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                        <h3 className="font-bold text-white flex items-center gap-2 text-sm"><LinkIcon size={16} className="text-blue-400"/> 建立连接</h3>
                        <button onClick={() => setLinkModalData(null)} className="text-slate-400 hover:text-white"><X size={18}/></button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">选择已有关系类型</label>
                            <div className="flex flex-wrap gap-2">
                                {relationshipDefs.map(def => (
                                    <button 
                                        key={def.id}
                                        onClick={() => { setNewRelLabel(def.label); setNewRelColor(def.color); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${newRelLabel === def.label ? 'ring-2 ring-white/20 scale-105' : 'opacity-80 hover:opacity-100'}`}
                                        style={{ backgroundColor: `${def.color}20`, borderColor: def.color, color: def.color }}
                                    >
                                        {def.label}
                                        {newRelLabel === def.label && <Check size={12} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3 pt-2 border-t border-slate-700/50">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">或 自定义新关系</label>
                            <div className="flex gap-2">
                                <input 
                                    autoFocus
                                    value={newRelLabel}
                                    onChange={(e) => setNewRelLabel(e.target.value)}
                                    placeholder="输入关系名称 (如: 雇佣)"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <div className="relative w-10 shrink-0">
                                    <input 
                                        type="color" 
                                        value={newRelColor}
                                        onChange={(e) => setNewRelColor(e.target.value)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="w-full h-full rounded-xl border border-slate-700 shadow-sm" style={{ backgroundColor: newRelColor }} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-900/30 border-t border-slate-700 flex gap-3">
                        <button onClick={() => setLinkModalData(null)} className="flex-1 py-2.5 text-xs font-bold text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">取消</button>
                        <button onClick={confirmConnection} disabled={!newRelLabel.trim()} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg transition-all">确认连线</button>
                    </div>
                </div>
            </div>
        )}
      </div>

      <div className="w-full lg:w-64 flex flex-col gap-4">
        <div className="bg-slate-800 p-1.5 rounded-2xl flex flex-wrap gap-1 border border-slate-700 shadow-lg">
          <button onClick={() => setMode('move')} className={`flex-1 min-w-[3rem] py-3 rounded-xl transition-all ${mode === 'move' ? 'bg-blue-600 text-white shadow-inner' : 'text-slate-500 hover:bg-slate-700/50'}`} title="移动模式"><Move size={18} className="mx-auto" /></button>
          <button onClick={() => { setMode('select'); setConnectingSourceId(null); }} className={`flex-1 min-w-[3rem] py-3 rounded-xl transition-all ${mode === 'select' ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-500 hover:bg-slate-700/50'}`} title="框选模式 (按住拖拽)"><MousePointer2 size={18} className="mx-auto" /></button>
          <button onClick={() => { setMode('connect'); setConnectingSourceId(null); setSelectedNodeIds(new Set()); }} className={`flex-1 min-w-[3rem] py-3 rounded-xl transition-all ${mode === 'connect' ? 'bg-emerald-600 text-white shadow-inner' : 'text-slate-500 hover:bg-slate-700/50'}`} title="连线模式"><LinkIcon size={18} className="mx-auto" /></button>
          <button onClick={() => setMode('delete')} className={`flex-1 min-w-[3rem] py-3 rounded-xl transition-all ${mode === 'delete' ? 'bg-red-600 text-white shadow-inner' : 'text-slate-500 hover:bg-slate-700/50'}`} title="删除模式"><Trash2 size={18} className="mx-auto" /></button>
        </div>
        
        {mode === 'select' && (
             <div className="bg-indigo-900/20 p-3 rounded-2xl border border-indigo-500/30 text-xs text-indigo-200/80 leading-relaxed">
                 <div className="flex items-center gap-2 font-bold mb-1 text-indigo-400"><MousePointer2 size={12}/> 操作提示</div>
                 • <strong>拖拽空地</strong>：框选多个目标<br/>
                 • <strong>Ctrl + 点击</strong>：加选/减选目标<br/>
                 • <strong>拖拽目标</strong>：同时移动选中项
             </div>
        )}

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
