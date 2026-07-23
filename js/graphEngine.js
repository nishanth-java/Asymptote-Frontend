// Interactive SVG Canvas Engine with Standard Canvas Panning, Group Side-Panel Inspection & Single Ungroup Button

import { getPresetForType } from './presets.js';

const EDGE_PALETTE = [
  { name: 'cyan', color: '#0284c7' },
  { name: 'purple', color: '#8944ab' },
  { name: 'emerald', color: '#10b981' },
  { name: 'amber', color: '#d97706' },
  { name: 'rose', color: '#e11d48' },
  { name: 'blue', color: '#007aff' },
  { name: 'orange', color: '#ea580c' },
  { name: 'lime', color: '#65a30d' }
];

export class GraphEngine {
  constructor(canvasContainer, options = {}) {
    this.container = canvasContainer;
    this.vertices = [];
    this.positions = {};
    this.groups = [];
    this.selectedVertexIds = new Set();

    // Viewport transform
    this.zoom = 1;
    this.panX = 60;
    this.panY = 60;

    // Dragging node state
    this.isDraggingNode = false;
    this.draggedNodeId = null;
    this.dragStartPositions = {};
    this.dragMouseStartX = 0;
    this.dragMouseStartY = 0;

    // Wire connection state
    this.isConnecting = false;
    this.connectSourceId = null;
    this.reconnectingOldTargetId = null;
    this.connectMouseX = 0;
    this.connectMouseY = 0;

    // Canvas panning state
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    // Marquee Selection Box state
    this.isMarqueeSelecting = false;
    this.marqueeStartX = 0;
    this.marqueeStartY = 0;

    // Callbacks
    this.onSelectVertex = options.onSelectVertex || (() => {});
    this.onUpdateGraph = options.onUpdateGraph || (() => {});
    this.onSelectionChange = options.onSelectionChange || (() => {});

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    const arrowheadDefs = EDGE_PALETTE.map(p => `
      <marker id="arrowhead-${p.name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${p.color}" />
      </marker>
    `).join('');

    this.container.innerHTML = `
      <div class="graph-canvas-viewport">
        <div class="graph-canvas-world">
          <svg class="graph-svg-layer">
            <defs>
              ${arrowheadDefs}
            </defs>
            <g class="svg-edges-group"></g>
            <path class="svg-rubber-wire" d="" style="display:none;"></path>
          </svg>
          <div class="graph-nodes-layer"></div>
          <div class="marquee-selection-box" style="display:none;"></div>
        </div>

        <div class="canvas-controls">
          <button class="btn-icon-glass" id="btn-zoom-in" title="Zoom In">+</button>
          <button class="btn-icon-glass" id="btn-zoom-out" title="Zoom Out">-</button>
          <button class="btn-icon-glass" id="btn-zoom-reset" title="Reset Pan/Zoom">1:1</button>
          <button class="btn-icon-glass" id="btn-fit-view" title="Fit All Vertices">⛶</button>
        </div>
      </div>
    `;

    this.viewportEl = this.container.querySelector('.graph-canvas-viewport');
    this.worldEl = this.container.querySelector('.graph-canvas-world');
    this.svgEl = this.container.querySelector('.graph-svg-layer');
    this.edgesGroup = this.container.querySelector('.svg-edges-group');
    this.rubberWireEl = this.container.querySelector('.svg-rubber-wire');
    this.nodesLayer = this.container.querySelector('.graph-nodes-layer');
    this.marqueeBoxEl = this.container.querySelector('.marquee-selection-box');

    // Controls
    this.container.querySelector('#btn-zoom-in').addEventListener('click', () => this.zoomAtCenter(1.2));
    this.container.querySelector('#btn-zoom-out').addEventListener('click', () => this.zoomAtCenter(1 / 1.2));
    this.container.querySelector('#btn-zoom-reset').addEventListener('click', () => {
      this.zoom = 1;
      this.panX = 60;
      this.panY = 60;
      this.applyTransform();
    });
    this.container.querySelector('#btn-fit-view').addEventListener('click', () => this.fitView());
  }

  setGraphData(vertices, positions, groups = null) {
    this.vertices = vertices;
    this.positions = positions || {};
    if (groups) {
      this.groups = groups;
    }
    this.render();
  }

  selectVertex(id, isMulti = false) {
    if (!id) {
      if (!isMulti) {
        this.selectedVertexIds.clear();
      }
    } else {
      if (isMulti) {
        if (this.selectedVertexIds.has(id)) {
          this.selectedVertexIds.delete(id);
        } else {
          this.selectedVertexIds.add(id);
        }
      } else {
        this.selectedVertexIds.clear();
        this.selectedVertexIds.add(id);
      }
    }

    this.updateSelectionStyles();

    const selectedList = Array.from(this.selectedVertexIds);
    let primarySelected = null;
    if (selectedList.length === 1) {
      const selectedId = selectedList[0];
      if (selectedId.startsWith('group-')) {
        primarySelected = this.groups.find(g => g.id === selectedId) || null;
      } else {
        primarySelected = this.vertices.find(v => v.id === selectedId) || null;
      }
    }
    
    this.onSelectVertex(primarySelected);
    this.onSelectionChange(selectedList);
  }

  selectAll(ids) {
    this.selectedVertexIds = new Set(ids);
    this.updateSelectionStyles();
    this.onSelectionChange(Array.from(this.selectedVertexIds));
  }

  getCollapsedGroupForVertex(vertexId) {
    return this.groups.find(g => g.collapsed && g.memberIds.includes(vertexId)) || null;
  }

  getVisualPosition(id) {
    if (id.startsWith('group-')) {
      const group = this.groups.find(g => g.id === id);
      if (!group) return { x: 100, y: 100 };

      if (this.positions[group.id]) return this.positions[group.id];

      let sumX = 0, sumY = 0, count = 0;
      group.memberIds.forEach(mId => {
        if (this.positions[mId]) {
          sumX += this.positions[mId].x;
          sumY += this.positions[mId].y;
          count++;
        }
      });
      return count > 0 ? { x: Math.round(sumX / count), y: Math.round(sumY / count) } : { x: 100, y: 100 };
    }
    return this.positions[id] || { x: 100, y: 100 };
  }

  ungroupGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    const gPos = this.positions[groupId] || this.getVisualPosition(groupId);
    let offset = 0;
    group.memberIds.forEach(mId => {
      this.positions[mId] = {
        x: gPos.x,
        y: gPos.y + offset
      };
      offset += 78;
    });

    this.groups = this.groups.filter(g => g.id !== groupId);
    delete this.positions[groupId];

    this.selectVertex(null);
    this.render();
    this.onUpdateGraph();
  }

  render() {
    this.renderNodes();
    this.renderEdges();
    this.updateSelectionStyles();
    this.applyTransform();
  }

  renderNodes() {
    this.nodesLayer.innerHTML = '';

    const hiddenMemberIds = new Set();

    // 1. Render Collapsed & Expanded Groups
    this.groups.forEach(group => {
      if (group.collapsed) {
        group.memberIds.forEach(id => hiddenMemberIds.add(id));

        const pos = this.positions[group.id] || this.getVisualPosition(group.id);

        const groupEl = document.createElement('div');
        groupEl.className = `group-node-card ${this.selectedVertexIds.has(group.id) ? 'selected' : ''}`;
        groupEl.dataset.id = group.id;
        groupEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

        groupEl.innerHTML = `
          <div class="group-header">
            <span class="group-title">📦 ${group.label}</span>
            <button class="btn-group-toggle btn-ungroup" data-group-id="${group.id}" title="Dissolve group on 1 click">🔓 Ungroup</button>
          </div>
          <div class="group-body">
            <span class="group-submeta">${group.memberIds.length} vertices grouped</span>
          </div>
          <div class="port port-in" data-id="${group.id}" title="Connect to all group members"></div>
          <div class="port port-out" data-id="${group.id}" title="Connect all group members to target"></div>
        `;

        groupEl.querySelector('.btn-ungroup').addEventListener('click', (e) => {
          e.stopPropagation();
          this.ungroupGroup(group.id);
        });

        groupEl.addEventListener('mousedown', (e) => {
          if (e.target.classList.contains('port-out') || e.target.classList.contains('btn-ungroup')) return;
          e.stopPropagation();
          this.selectVertex(group.id, e.shiftKey || e.ctrlKey);
          this.startNodeDrag(e, group.id);
        });

        const portOut = groupEl.querySelector('.port-out');
        portOut.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.startWireDrag(e, group.id);
        });

        this.nodesLayer.appendChild(groupEl);
      } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let memberCount = 0;

        group.memberIds.forEach(mId => {
          const p = this.positions[mId];
          if (p) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x + 200 > maxX) maxX = p.x + 200;
            if (p.y + 72 > maxY) maxY = p.y + 72;
            memberCount++;
          }
        });

        if (memberCount > 0) {
          const boxEl = document.createElement('div');
          boxEl.className = 'group-container-box';
          boxEl.style.left = `${minX - 12}px`;
          boxEl.style.top = `${minY - 30}px`;
          boxEl.style.width = `${maxX - minX + 24}px`;
          boxEl.style.height = `${maxY - minY + 42}px`;

          boxEl.innerHTML = `
            <div class="group-container-header">
              <span>📦 ${group.label}</span>
              <button class="btn-group-toggle btn-ungroup" data-group-id="${group.id}">🔓 Ungroup</button>
            </div>
          `;

          boxEl.querySelector('.btn-ungroup').addEventListener('click', (e) => {
            e.stopPropagation();
            this.ungroupGroup(group.id);
          });

          this.nodesLayer.appendChild(boxEl);
        }
      }
    });

    // 2. Render Individual Vertices (not hidden inside collapsed groups)
    this.vertices.forEach(v => {
      if (hiddenMemberIds.has(v.id)) return;

      const pos = this.positions[v.id] || { x: 100, y: 100 };
      const preset = getPresetForType(v.type);

      const nodeEl = document.createElement('div');
      nodeEl.className = `node-card ${preset.badgeClass} ${this.selectedVertexIds.has(v.id) ? 'selected' : ''}`;
      nodeEl.dataset.id = v.id;
      nodeEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

      nodeEl.innerHTML = `
        <div class="node-header">
          <span class="node-single-id">${v.id}</span>
        </div>
        <div class="node-body">
          <div class="node-meta">${v.host || '192.168.0.x'}:${v.port || 9000}</div>
          <div class="node-submeta">${v.type}</div>
        </div>
        <div class="port port-in" data-id="${v.id}" title="Input Port"></div>
        <div class="port port-out" data-id="${v.id}" title="Drag wire to connect output"></div>
      `;

      nodeEl.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('port-out')) return;
        e.stopPropagation();
        this.selectVertex(v.id, e.shiftKey || e.ctrlKey);
        this.startNodeDrag(e, v.id);
      });

      const portOut = nodeEl.querySelector('.port-out');
      portOut.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.startWireDrag(e, v.id);
      });

      this.nodesLayer.appendChild(nodeEl);
    });
  }

  renderEdges() {
    this.edgesGroup.innerHTML = '';
    let edgeGlobalCount = 0;

    const edgeMap = new Map();

    this.vertices.forEach(source => {
      if (!source.edges) return;

      const sourceGroup = this.getCollapsedGroupForVertex(source.id);
      const visualSourceId = sourceGroup ? sourceGroup.id : source.id;

      source.edges.forEach(targetId => {
        const targetGroup = this.getCollapsedGroupForVertex(targetId);
        const visualTargetId = targetGroup ? targetGroup.id : targetId;

        if (visualSourceId === visualTargetId) return;

        const key = `${visualSourceId}--->${visualTargetId}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, {
            key,
            sourceId: visualSourceId,
            targetId: visualTargetId,
            realSourceId: source.id,
            realTargetId: targetId
          });
        }
      });
    });

    let edgeIdx = 0;
    edgeMap.forEach(edge => {
      const sourcePos = this.getVisualPosition(edge.sourceId);
      const targetPos = this.getVisualPosition(edge.targetId);

      const sourceWidth = edge.sourceId.startsWith('group-') ? 210 : 200;
      const sourcePortX = sourcePos.x + sourceWidth;
      const sourcePortY = sourcePos.y + 36;

      const targetPortX = targetPos.x;
      const targetPortY = targetPos.y + 36;

      const isLoopback = sourcePortX >= targetPortX;
      const pathEndX = targetPortX - 10;
      const pathEndY = targetPortY;

      const pathD = this.computeCurvePath(
        sourcePortX, sourcePortY, 
        pathEndX, pathEndY, 
        isLoopback, 
        edgeIdx
      );

      const colorObj = this.getEdgeColor(edge.sourceId, edge.targetId, edgeGlobalCount);
      edgeGlobalCount++;
      edgeIdx++;

      const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // Wire Bezier Curve Path
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', pathD);
      pathEl.setAttribute('class', isLoopback ? 'edge-path edge-loopback' : 'edge-path');
      pathEl.style.stroke = colorObj.color;
      pathEl.setAttribute('marker-end', `url(#arrowhead-${colorObj.name})`);

      // Target Reconnection Handle Pin near arrowhead
      const handleX = targetPortX - 24;
      const handleY = targetPortY;

      const rewireHandleEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      rewireHandleEl.setAttribute('cx', handleX);
      rewireHandleEl.setAttribute('cy', handleY);
      rewireHandleEl.setAttribute('r', 6);
      rewireHandleEl.setAttribute('class', 'edge-rewire-handle');
      rewireHandleEl.style.fill = colorObj.color;
      rewireHandleEl.setAttribute('title', `Drag pin to reconnect ${edge.sourceId} → ${edge.targetId}`);

      rewireHandleEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        
        if (edge.sourceId.startsWith('group-')) {
          const group = this.groups.find(g => g.id === edge.sourceId);
          if (group) {
            group.memberIds.forEach(mId => {
              const v = this.vertices.find(item => item.id === mId);
              if (v && v.edges) v.edges = v.edges.filter(t => t !== edge.targetId);
            });
          }
        } else {
          const v = this.vertices.find(item => item.id === edge.sourceId);
          if (v && v.edges) {
            v.edges = v.edges.filter(t => t !== edge.targetId);
          }
        }

        this.renderEdges();
        this.onUpdateGraph();
        this.startWireDrag(e, edge.sourceId, edge.targetId);
      });

      edgeGroup.appendChild(pathEl);
      edgeGroup.appendChild(rewireHandleEl);
      this.edgesGroup.appendChild(edgeGroup);
    });
  }

  getEdgeColor(sourceId, targetId, index) {
    let str = sourceId + '->' + targetId;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const colorIdx = Math.abs(hash + index) % EDGE_PALETTE.length;
    return EDGE_PALETTE[colorIdx];
  }

  computeCurvePath(x1, y1, x2, y2, isLoopback, edgeIdx = 0) {
    const dx = x2 - x1;

    if (!isLoopback) {
      if (dx > 380) {
        // Multi-span arc with vertical index offset to prevent line overlaps
        const isUpperHalf = (y1 + y2) / 2 < 340;
        const arcOffset = (edgeIdx % 5) * 28;
        const arcY = isUpperHalf 
          ? Math.min(y1, y2) - Math.min(140, (dx - 260) * 0.35) - arcOffset
          : Math.max(y1, y2) + Math.min(140, (dx - 260) * 0.35) + arcOffset;

        const cx1 = x1 + dx * 0.3;
        const cy1 = arcY;
        const cx2 = x2 - dx * 0.3;
        const cy2 = arcY;

        return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
      } else {
        // Clean adjacent horizontal Bezier curve
        const ctrlDx = Math.max(60, dx * 0.45);
        const cx1 = x1 + ctrlDx;
        const cy1 = y1;
        const cx2 = x2 - ctrlDx;
        const cy2 = y2;

        return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
      }
    } else {
      // Loopback curve below nodes
      const loopHeight = Math.min(160, Math.max(90, Math.abs(dx) * 0.15 + (edgeIdx % 4) * 20));
      const arcY = Math.max(y1, y2) + loopHeight;

      const cx1 = x1 + 80;
      const cy1 = arcY;
      const cx2 = x2 - 80;
      const cy2 = arcY;

      return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }
  }

  startNodeDrag(e, primaryNodeId) {
    this.isDraggingNode = true;
    this.draggedNodeId = primaryNodeId;
    this.dragMouseStartX = e.clientX;
    this.dragMouseStartY = e.clientY;

    if (!this.selectedVertexIds.has(primaryNodeId)) {
      if (!e.shiftKey && !e.ctrlKey) {
        this.selectedVertexIds.clear();
      }
      this.selectedVertexIds.add(primaryNodeId);
      this.updateSelectionStyles();
    }

    this.dragStartPositions = {};
    this.selectedVertexIds.forEach(id => {
      const pos = this.getVisualPosition(id);
      this.dragStartPositions[id] = { ...pos };
    });
  }

  startWireDrag(e, sourceId, oldTargetId = null) {
    this.isConnecting = true;
    this.connectSourceId = sourceId;
    this.reconnectingOldTargetId = oldTargetId;
    
    const worldCoords = this.screenToWorld(e.clientX, e.clientY);
    this.connectMouseX = worldCoords.x;
    this.connectMouseY = worldCoords.y;

    this.rubberWireEl.style.display = 'block';
    this.updateRubberWire();
  }

  updateRubberWire() {
    if (!this.isConnecting || !this.connectSourceId) return;

    const sourcePos = this.getVisualPosition(this.connectSourceId);
    const sourceWidth = this.connectSourceId.startsWith('group-') ? 210 : 200;

    const x1 = sourcePos.x + sourceWidth;
    const y1 = sourcePos.y + 36;
    const x2 = this.connectMouseX;
    const y2 = this.connectMouseY;

    const pathD = this.computeCurvePath(x1, y1, x2, y2, false);
    this.rubberWireEl.setAttribute('d', pathD);
  }

  bindEvents() {
    window.addEventListener('mousemove', (e) => {
      // 1. Batch Node Dragging
      if (this.isDraggingNode && this.draggedNodeId) {
        const dx = (e.clientX - this.dragMouseStartX) / this.zoom;
        const dy = (e.clientY - this.dragMouseStartY) / this.zoom;

        this.selectedVertexIds.forEach(id => {
          const initPos = this.dragStartPositions[id];
          if (!initPos) return;

          const newX = Math.round(initPos.x + dx);
          const newY = Math.round(initPos.y + dy);

          this.positions[id] = { x: newX, y: newY };

          if (id.startsWith('group-')) {
            const group = this.groups.find(g => g.id === id);
            if (group) {
              group.memberIds.forEach(mId => {
                const memberInit = this.positions[mId] || initPos;
                this.positions[mId] = {
                  x: Math.round(memberInit.x + dx),
                  y: Math.round(memberInit.y + dy)
                };
              });
            }
          }

          const nodeEl = this.nodesLayer.querySelector(`[data-id="${id}"]`);
          if (nodeEl) {
            nodeEl.style.transform = `translate(${newX}px, ${newY}px)`;
          }
        });

        this.renderEdges();
      }

      // 2. Rubberband Wire Connecting
      if (this.isConnecting) {
        const worldCoords = this.screenToWorld(e.clientX, e.clientY);
        this.connectMouseX = worldCoords.x;
        this.connectMouseY = worldCoords.y;
        this.updateRubberWire();
      }

      // 3. Canvas Panning
      if (this.isPanning) {
        this.panX += (e.clientX - this.panStartX);
        this.panY += (e.clientY - this.panStartY);
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.applyTransform();
      }

      // 4. Marquee Selection Box Drag
      if (this.isMarqueeSelecting) {
        const currentWorld = this.screenToWorld(e.clientX, e.clientY);
        const x = Math.min(this.marqueeStartX, currentWorld.x);
        const y = Math.min(this.marqueeStartY, currentWorld.y);
        const width = Math.abs(currentWorld.x - this.marqueeStartX);
        const height = Math.abs(currentWorld.y - this.marqueeStartY);

        this.marqueeBoxEl.style.left = `${x}px`;
        this.marqueeBoxEl.style.top = `${y}px`;
        this.marqueeBoxEl.style.width = `${width}px`;
        this.marqueeBoxEl.style.height = `${height}px`;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDraggingNode) {
        this.isDraggingNode = false;
        this.draggedNodeId = null;
        this.onUpdateGraph();
      }

      if (this.isConnecting) {
        this.isConnecting = false;
        this.rubberWireEl.style.display = 'none';

        const targetEl = e.target.closest('.node-card, .group-node-card');
        if (targetEl) {
          const targetId = targetEl.dataset.id;
          if (targetId && targetId !== this.connectSourceId) {
            this.addConnectionEdge(this.connectSourceId, targetId);
          }
        }

        this.renderEdges();
        this.renderNodes();
        this.onUpdateGraph();
        this.connectSourceId = null;
        this.reconnectingOldTargetId = null;
      }

      if (this.isPanning) {
        this.isPanning = false;
        this.viewportEl.classList.remove('panning');
      }

      if (this.isMarqueeSelecting) {
        this.isMarqueeSelecting = false;
        this.marqueeBoxEl.style.display = 'none';

        const currentWorld = this.screenToWorld(e.clientX, e.clientY);
        const mMinX = Math.min(this.marqueeStartX, currentWorld.x);
        const mMinY = Math.min(this.marqueeStartY, currentWorld.y);
        const mMaxX = Math.max(this.marqueeStartX, currentWorld.x);
        const mMaxY = Math.max(this.marqueeStartY, currentWorld.y);

        if (mMaxX - mMinX > 5 && mMaxY - mMinY > 5) {
          const selected = [];
          
          this.groups.forEach(g => {
            if (g.collapsed) {
              const p = this.getVisualPosition(g.id);
              if (p.x + 210 >= mMinX && p.x <= mMaxX && p.y + 80 >= mMinY && p.y <= mMaxY) {
                selected.push(g.id);
              }
            }
          });

          const hiddenMembers = new Set(this.groups.filter(g => g.collapsed).flatMap(g => g.memberIds));
          this.vertices.forEach(v => {
            if (!hiddenMembers.has(v.id)) {
              const p = this.positions[v.id] || { x: 0, y: 0 };
              if (p.x + 200 >= mMinX && p.x <= mMaxX && p.y + 72 >= mMinY && p.y <= mMaxY) {
                selected.push(v.id);
              }
            }
          });

          this.selectAll(selected);
        }
      }
    });

    this.container.addEventListener('mousedown', (e) => {
      const hitNode = e.target.closest('.node-card, .group-node-card');
      const hitPin = e.target.closest('.edge-rewire-handle');
      const hitControls = e.target.closest('.canvas-controls');
      const hitToggle = e.target.closest('.btn-group-toggle');

      if (!hitNode && !hitPin && !hitControls && !hitToggle) {
        if (e.shiftKey) {
          this.isMarqueeSelecting = true;
          const worldCoords = this.screenToWorld(e.clientX, e.clientY);
          this.marqueeStartX = worldCoords.x;
          this.marqueeStartY = worldCoords.y;
          this.marqueeBoxEl.style.left = `${worldCoords.x}px`;
          this.marqueeBoxEl.style.top = `${worldCoords.y}px`;
          this.marqueeBoxEl.style.width = '0px';
          this.marqueeBoxEl.style.height = '0px';
          this.marqueeBoxEl.style.display = 'block';
        } else {
          this.isPanning = true;
          this.viewportEl.classList.add('panning');
          this.panStartX = e.clientX;
          this.panStartY = e.clientY;
          this.selectVertex(null);
        }
      }
    });

    // Standard Canvas Panning & Pinch-Zoom Wheel Handler
    this.viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Trackpad Pinch-to-Zoom or Ctrl + Wheel Zoom centered at cursor
        const rect = this.viewportEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = Math.pow(1.002, -e.deltaY * 5);
        const newZoom = Math.min(Math.max(0.15, this.zoom * zoomFactor), 3.0);

        this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
        this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
        this.zoom = newZoom;
      } else if (e.shiftKey) {
        // Shift + Wheel Horizontal Pan
        this.panX -= e.deltaY;
      } else {
        // Normal Scrolling = Pan Canvas (Vertical & Horizontal)
        this.panX -= e.deltaX;
        this.panY -= e.deltaY;
      }

      this.applyTransform();
    }, { passive: false });
  }

  addConnectionEdge(srcId, tgtId) {
    const sources = srcId.startsWith('group-') ? (this.groups.find(g => g.id === srcId)?.memberIds || []) : [srcId];
    const targets = tgtId.startsWith('group-') ? (this.groups.find(g => g.id === tgtId)?.memberIds || []) : [tgtId];

    sources.forEach(sId => {
      const v = this.vertices.find(item => item.id === sId);
      if (v) {
        if (!v.edges) v.edges = [];
        targets.forEach(tId => {
          if (!v.edges.includes(tId)) {
            v.edges.push(tId);
          }
        });
      }
    });
  }

  screenToWorld(screenX, screenY) {
    const rect = this.viewportEl.getBoundingClientRect();
    const x = (screenX - rect.left - this.panX) / this.zoom;
    const y = (screenY - rect.top - this.panY) / this.zoom;
    return { x, y };
  }

  applyTransform() {
    this.worldEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  zoomAtCenter(factor) {
    const rect = this.viewportEl.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newZoom = Math.min(Math.max(0.15, this.zoom * factor), 3.0);
    this.panX = centerX - (centerX - this.panX) * (newZoom / this.zoom);
    this.panY = centerY - (centerY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.applyTransform();
  }

  fitView() {
    if (this.vertices.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.vertices.forEach(v => {
      const pos = this.positions[v.id] || { x: 0, y: 0 };
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + 200 > maxX) maxX = pos.x + 200;
      if (pos.y + 80 > maxY) maxY = pos.y + 80;
    });

    const rect = this.viewportEl.getBoundingClientRect();
    const contentW = maxX - minX + 120;
    const contentH = maxY - minY + 120;

    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    this.zoom = Math.min(Math.max(0.3, Math.min(scaleX, scaleY)), 1.1);

    this.panX = (rect.width - (maxX + minX) * this.zoom) / 2;
    this.panY = (rect.height - (maxY + minY) * this.zoom) / 2;
    this.applyTransform();
  }

  updateSelectionStyles() {
    const allNodeEls = this.nodesLayer.querySelectorAll('.node-card, .group-node-card');
    allNodeEls.forEach(el => {
      if (this.selectedVertexIds.has(el.dataset.id)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }
}
