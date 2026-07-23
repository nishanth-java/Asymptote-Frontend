// Inspector Panel module with custom type creation, key::value param builder & single/group inspection

import { VERTEX_PRESETS, getPresetForType } from './presets.js';

export function renderInspector(
  container, 
  selectedVertex, 
  selectedGroup,
  selectedIds = [], 
  allVertices = [], 
  allGroups = [], 
  onUpdateVertex, 
  onDeleteVertex, 
  onCloseInspector, 
  onGroupSelected, 
  onUngroupSelected,
  onUpdateGroup
) {
  // Case 1: Group Selected (Single Collapsed Group)
  if (selectedGroup) {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="inspector-header">
          <div>
            <span class="badge badge-amber">📦 Collapsed Group</span>
            <h3 class="inspector-title">${selectedGroup.label}</h3>
          </div>
          <div class="flex-row gap-2">
            <button class="btn btn-danger-icon" id="insp-ungroup-this-btn" title="Ungroup Group">🔓 Ungroup</button>
            <button class="btn-close" id="insp-close-panel-btn" title="Collapse Inspector">&times;</button>
          </div>
        </div>

        <div class="inspector-section">
          <h4 class="section-title">🏷️ Group Identity</h4>
          
          <div class="form-group">
            <label>Group Label Name</label>
            <input type="text" id="insp-group-label-input" class="form-control code-font" value="${selectedGroup.label}">
          </div>

          <div class="form-group">
            <label>System Group ID</label>
            <input type="text" class="form-control code-font" value="${selectedGroup.id}" disabled readonly style="opacity: 0.7;">
          </div>
        </div>

        <div class="inspector-section mt-3">
          <h4 class="section-title">🧩 Group Member Vertices (${selectedGroup.memberIds.length})</h4>
          <div class="edges-tag-container">
            ${selectedGroup.memberIds.map(mId => `
              <span class="edge-tag badge-cyan">
                ${mId}
              </span>
            `).join('')}
          </div>
        </div>

        <div class="inspector-section mt-4">
          <button class="btn btn-primary style-w-full" id="insp-ungroup-this-btn-bottom" style="width: 100%; justify-content: center; padding: 10px;">
            🔓 Dissolve Group & Unpack Vertices
          </button>
        </div>
      </div>
    `;

    const closeBtn = container.querySelector('#insp-close-panel-btn');
    if (closeBtn && onCloseInspector) closeBtn.addEventListener('click', onCloseInspector);

    const labelInput = container.querySelector('#insp-group-label-input');
    if (labelInput) {
      labelInput.addEventListener('change', () => {
        const newLabel = labelInput.value.trim();
        if (newLabel) {
          selectedGroup.label = newLabel;
          if (onUpdateGroup) onUpdateGroup(selectedGroup);
        }
      });
    }

    const triggerUngroup = () => {
      if (onUngroupSelected) {
        onUngroupSelected();
      }
    };

    const topUngroupBtn = container.querySelector('#insp-ungroup-this-btn');
    if (topUngroupBtn) topUngroupBtn.addEventListener('click', triggerUngroup);

    const btmUngroupBtn = container.querySelector('#insp-ungroup-this-btn-bottom');
    if (btmUngroupBtn) btmUngroupBtn.addEventListener('click', triggerUngroup);

    return;
  }

  // Case 2: Multi-Selection Active (2 or more items selected)
  if (selectedIds && selectedIds.length >= 2) {
    const groupItems = selectedIds.filter(id => id.startsWith('group-'));

    container.innerHTML = `
      <div class="inspector-card">
        <div class="inspector-header">
          <div>
            <span class="badge badge-amber">${selectedIds.length} Items Selected</span>
            <h3 class="inspector-title">Multi-Selection</h3>
          </div>
          <button class="btn-close" id="insp-close-panel-btn" title="Collapse Inspector">&times;</button>
        </div>

        <div class="info-callout">
          <div class="info-callout-icon">📦</div>
          <div class="text-sm">
            <strong>Group Operations</strong><br>
            Combine multiple vertices into a single collapsed unit or dissolve existing groups.
          </div>
        </div>

        <div class="form-group mt-3">
          <button class="btn btn-primary style-w-full" id="insp-group-btn" style="width: 100%; justify-content: center; padding: 12px; font-size: 0.95rem;">
            📦 Group ${selectedIds.length} Vertices into 1 Unit
          </button>
        </div>

        ${groupItems.length > 0 ? `
          <div class="form-group mt-2">
            <button class="btn btn-outline style-w-full" id="insp-ungroup-btn" style="width: 100%; justify-content: center; padding: 10px; color: var(--accent-rose); border-color: var(--accent-rose);">
              🔓 Ungroup Selected Groups (${groupItems.length})
            </button>
          </div>
        ` : ''}

        <div class="inspector-section mt-4">
          <h4 class="section-title">📋 Selected Items List</h4>
          <div class="edges-tag-container">
            ${selectedIds.map(id => `
              <span class="edge-tag ${id.startsWith('group-') ? 'badge-amber' : ''}">
                ${id.startsWith('group-') ? '📦 ' + id : id}
              </span>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    const closeBtn = container.querySelector('#insp-close-panel-btn');
    if (closeBtn && onCloseInspector) closeBtn.addEventListener('click', onCloseInspector);

    const groupBtn = container.querySelector('#insp-group-btn');
    if (groupBtn && onGroupSelected) groupBtn.addEventListener('click', onGroupSelected);

    const ungroupBtn = container.querySelector('#insp-ungroup-btn');
    if (ungroupBtn && onUngroupSelected) ungroupBtn.addEventListener('click', onUngroupSelected);

    return;
  }

  // Case 3: No Selection
  if (!selectedVertex) {
    container.innerHTML = `
      <div class="inspector-card">
        <div class="inspector-header">
          <div>
            <span class="badge badge-gray">No Selection</span>
            <h3 class="inspector-title">Inspector</h3>
          </div>
          <button class="btn-close" id="insp-close-panel-btn" title="Collapse Inspector">&times;</button>
        </div>
        <div class="empty-inspector">
          <div class="empty-icon">🪐</div>
          <h4>No Vertex Selected</h4>
          <p class="text-sm text-muted">Click any vertex or grouped unit on the canvas to inspect its parameters, or Shift+Drag to box-select multiple vertices for grouping.</p>
        </div>
      </div>
    `;

    const closeBtn = container.querySelector('#insp-close-panel-btn');
    if (closeBtn && onCloseInspector) {
      closeBtn.addEventListener('click', onCloseInspector);
    }
    return;
  }

  // Case 4: Single Vertex Selected
  const preset = getPresetForType(selectedVertex.type);
  const isCustomType = !VERTEX_PRESETS.some(p => p.type === selectedVertex.type);
  const parentGroup = allGroups ? allGroups.find(g => g.memberIds.includes(selectedVertex.id)) : null;

  container.innerHTML = `
    <div class="inspector-card">
      <div class="inspector-header">
        <div>
          <span class="badge ${preset.badgeClass}">${selectedVertex.type}</span>
          <h3 class="inspector-title">${selectedVertex.id}</h3>
        </div>
        <div class="flex-row gap-2">
          <button class="btn btn-danger-icon" id="insp-delete-btn" title="Delete Vertex">💥 Delete</button>
          <button class="btn-close" id="insp-close-panel-btn" title="Collapse Inspector">&times;</button>
        </div>
      </div>

      ${parentGroup ? `
        <div class="info-callout" style="border-color: var(--accent-amber); background: rgba(245, 158, 11, 0.08);">
          <div class="info-callout-icon">📦</div>
          <div class="text-sm">
            Part of <strong>${parentGroup.label}</strong> group.
            <button class="btn btn-xs btn-outline mt-1" id="insp-ungroup-single-btn">🔓 Ungroup ${parentGroup.label}</button>
          </div>
        </div>
      ` : ''}

      <div class="inspector-section">
        <h4 class="section-title">🏷️ Identity & Network</h4>
        
        <div class="form-group">
          <label>Vertex ID (Unique Name)</label>
          <input type="text" id="insp-id" class="form-control code-font" value="${selectedVertex.id}">
        </div>

        <div class="form-group">
          <label>Vertex Type</label>
          <select id="insp-type-preset" class="form-control">
            <option value="__NEW_TYPE__">➕ + Add New Type...</option>
            ${isCustomType ? `<option value="${selectedVertex.type}" selected>⭐ ${selectedVertex.type} (Custom)</option>` : ''}
            ${VERTEX_PRESETS.map(p => `
              <option value="${p.type}" ${!isCustomType && p.type === selectedVertex.type ? 'selected' : ''}>${p.type} (${p.category})</option>
            `).join('')}
          </select>
        </div>

        <div class="form-group" id="insp-new-type-group" style="display: none;">
          <label>Enter Custom Type Name</label>
          <input type="text" id="insp-new-type-input" class="form-control code-font" value="${selectedVertex.type}" placeholder="e.g. ROPE, SWIGLU">
        </div>

        <div class="form-group">
          <label>🌐 Host IP Address</label>
          <input type="text" id="insp-host" class="form-control code-font" value="${selectedVertex.host || ''}">
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label>🔌 External Port</label>
            <input type="number" id="insp-port" class="form-control code-font" value="${selectedVertex.port || ''}">
          </div>

          <div class="form-group">
            <label>⚡ Internal Port</label>
            <input type="number" id="insp-internal-port" class="form-control code-font" value="${selectedVertex.internalPort || ''}">
          </div>
        </div>
      </div>

      <div class="inspector-section mt-3">
        <div class="flex-between">
          <h4 class="section-title">🧪 Parameters (<code>params</code>)</h4>
        </div>

        <div class="flex-row gap-2 mt-1">
          <input type="text" id="insp-kv-input" class="form-control flex-1 code-font" placeholder="key::value (e.g. noOfLayers::24)">
          <button class="btn btn-xs btn-outline" id="insp-add-param-btn">➕ Add</button>
        </div>

        <div id="insp-params-list" class="params-table mt-2">
          ${renderParamsTable(selectedVertex.params || {})}
        </div>
      </div>

      <div class="inspector-section mt-3">
        <h4 class="section-title">🎯 Outgoing Target Edges (<code>edges</code>)</h4>
        <div class="edges-tag-container" id="insp-edges-list">
          ${(selectedVertex.edges || []).map(targetId => `
            <span class="edge-tag">
              ${targetId}
              <button class="edge-tag-del" data-target="${targetId}">&times;</button>
            </span>
          `).join('')}
        </div>

        <div class="flex-row gap-2 mt-2">
          <select id="insp-add-edge-select" class="form-control flex-1">
            <option value="" disabled selected>-- Select Target Vertex --</option>
            ${allVertices
              .filter(v => v.id !== selectedVertex.id && !(selectedVertex.edges || []).includes(v.id))
              .map(v => `<option value="${v.id}">${v.id}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-primary" id="insp-add-edge-btn">🔌 Connect</button>
        </div>
      </div>
    </div>
  `;

  // Close / Collapse Panel
  const closeBtn = container.querySelector('#insp-close-panel-btn');
  if (closeBtn && onCloseInspector) {
    closeBtn.addEventListener('click', onCloseInspector);
  }

  const ungroupSingleBtn = container.querySelector('#insp-ungroup-single-btn');
  if (ungroupSingleBtn && onUngroupSelected) {
    ungroupSingleBtn.addEventListener('click', onUngroupSelected);
  }

  // ID Change
  const idInput = container.querySelector('#insp-id');
  idInput.addEventListener('change', () => {
    const newId = idInput.value.trim();
    if (!newId || newId === selectedVertex.id) return;
    
    if (allVertices.some(v => v.id === newId)) {
      alert(`A vertex with ID "${newId}" already exists!`);
      idInput.value = selectedVertex.id;
      return;
    }

    const oldId = selectedVertex.id;
    selectedVertex.id = newId;

    allVertices.forEach(v => {
      if (v.edges) {
        v.edges = v.edges.map(e => e === oldId ? newId : e);
      }
    });

    onUpdateVertex(selectedVertex, oldId);
  });

  // Type Change
  const typeSelect = container.querySelector('#insp-type-preset');
  const newTypeGroup = container.querySelector('#insp-new-type-group');
  const newTypeInput = container.querySelector('#insp-new-type-input');

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === '__NEW_TYPE__') {
      newTypeGroup.style.display = 'block';
    } else {
      newTypeGroup.style.display = 'none';
      selectedVertex.type = typeSelect.value;
      onUpdateVertex(selectedVertex);
    }
  });

  newTypeInput.addEventListener('change', () => {
    const newTypeName = newTypeInput.value.trim();
    if (newTypeName) {
      selectedVertex.type = newTypeName;
      onUpdateVertex(selectedVertex);
    }
  });

  // Host Change
  container.querySelector('#insp-host').addEventListener('change', (e) => {
    selectedVertex.host = e.target.value.trim();
    onUpdateVertex(selectedVertex);
  });

  // Port Change
  container.querySelector('#insp-port').addEventListener('change', (e) => {
    selectedVertex.port = parseInt(e.target.value, 10) || 0;
    onUpdateVertex(selectedVertex);
  });

  // Internal Port Change
  container.querySelector('#insp-internal-port').addEventListener('change', (e) => {
    selectedVertex.internalPort = parseInt(e.target.value, 10) || 0;
    onUpdateVertex(selectedVertex);
  });

  // Delete Vertex
  container.querySelector('#insp-delete-btn').addEventListener('click', () => {
    if (confirm(`Are you sure you want to delete vertex "${selectedVertex.id}"?`)) {
      onDeleteVertex(selectedVertex.id);
    }
  });

  // Add Param Button (supports key::value syntax)
  const kvInput = container.querySelector('#insp-kv-input');
  container.querySelector('#insp-add-param-btn').addEventListener('click', () => {
    const raw = kvInput.value.trim();
    if (!raw) return;

    let key = '';
    let valStr = '';

    if (raw.includes('::')) {
      const parts = raw.split('::');
      key = parts[0].trim();
      valStr = parts[1] ? parts[1].trim() : '';
    } else {
      key = raw;
      valStr = prompt(`Enter value for "${key}":`, "0") || "0";
    }

    if (!key) return;

    let val = valStr;
    if (!isNaN(valStr) && valStr !== '') {
      val = valStr.includes('.') ? parseFloat(valStr) : parseInt(valStr, 10);
    }

    if (!selectedVertex.params) selectedVertex.params = {};
    selectedVertex.params[key] = val;
    kvInput.value = '';

    onUpdateVertex(selectedVertex);
  });

  // Param row input listeners
  container.querySelectorAll('.param-val-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const key = e.target.dataset.key;
      const rawVal = e.target.value.trim();
      let parsedVal = rawVal;
      if (!isNaN(rawVal) && rawVal !== '') {
        parsedVal = rawVal.includes('.') ? parseFloat(rawVal) : parseInt(rawVal, 10);
      }
      selectedVertex.params[key] = parsedVal;
      onUpdateVertex(selectedVertex);
    });
  });

  // Param row delete listeners
  container.querySelectorAll('.param-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = e.target.dataset.key;
      delete selectedVertex.params[key];
      onUpdateVertex(selectedVertex);
    });
  });

  // Edge Tag Delete listeners
  container.querySelectorAll('.edge-tag-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = e.target.dataset.target;
      selectedVertex.edges = (selectedVertex.edges || []).filter(id => id !== targetId);
      onUpdateVertex(selectedVertex);
    });
  });

  // Add Edge Listener
  const addEdgeSelect = container.querySelector('#insp-add-edge-select');
  container.querySelector('#insp-add-edge-btn').addEventListener('click', () => {
    const targetId = addEdgeSelect.value;
    if (!targetId) return;
    if (!selectedVertex.edges) selectedVertex.edges = [];
    if (!selectedVertex.edges.includes(targetId)) {
      selectedVertex.edges.push(targetId);
      onUpdateVertex(selectedVertex);
    }
  });
}

function renderParamsTable(params) {
  const keys = Object.keys(params);
  if (keys.length === 0) {
    return `<div class="text-xs text-muted py-2">No parameters defined. Enter <code>key::value</code> above and click ➕ Add.</div>`;
  }

  return keys.map(k => `
    <div class="param-row">
      <span class="param-key" title="${k}">${k}</span>
      <input type="text" class="form-control param-val-input code-font" data-key="${k}" value="${params[k]}">
      <button class="btn-icon param-del-btn" data-key="${k}" title="Delete param">&times;</button>
    </div>
  `).join('');
}
