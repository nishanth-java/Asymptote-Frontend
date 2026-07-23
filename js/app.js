// Main Application Entry Point & State Coordinator (Modular Full-Stack API Integration)

import { GraphEngine } from './graphEngine.js';
import { renderInspector } from './inspector.js';
import { generateTopologyJSON, downloadJSON } from './jsonManager.js';
import { openBatchModal } from './batchCreator.js';
import { openCustomVertexModal } from './customVertexModal.js';
import {
  getPresetsAPI,
  getTopologyAPI,
  saveTopologyAPI,
  computeAutoLayoutAPI,
  generateBatchAPI,
  importJSONAPI
} from './apiClient.js';

class App {
  constructor() {
    this.vertices = [];
    this.positions = {};
    this.groups = []; // Array of active group definitions: { id, label, memberIds, collapsed }
    this.selectedVertexId = null;
    this.selectedIds = [];
    this.isInspectorOpen = false;

    this.initTheme();
    this.initGraphEngine();
    this.initPalette();
    this.bindGlobalEvents();
    
    // Initial load topology graph from API / fallback
    this.loadInitialTopology();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('topology_theme') || 'light';
    this.setTheme(savedTheme);
  }

  setTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('topology_theme', theme);

    const iconEl = document.getElementById('theme-toggle-icon');
    const textEl = document.getElementById('theme-toggle-text');
    if (iconEl && textEl) {
      if (theme === 'light') {
        iconEl.textContent = '☀️';
        textEl.textContent = 'Light Mode';
      } else {
        iconEl.textContent = '🌙';
        textEl.textContent = 'Dark Mode';
      }
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(nextTheme);
  }

  initGraphEngine() {
    const container = document.getElementById('graph-container');
    this.engine = new GraphEngine(container, {
      onSelectVertex: (selectedItem) => {
        this.selectedVertexId = selectedItem ? selectedItem.id : null;
        if (selectedItem) {
          this.setInspectorOpen(true);
        } else if (this.selectedIds.length === 0) {
          this.setInspectorOpen(false);
        }
        this.updateInspector();
      },
      onSelectionChange: (selectedIds) => {
        this.selectedIds = selectedIds;
        this.updateMultiSelectBar();
        if (this.selectedIds.length >= 2) {
          this.setInspectorOpen(true);
        }
        this.updateInspector();
      },
      onUpdateGraph: () => {
        // Sync active groups from graphEngine directly
        this.groups = this.engine.groups;
        this.syncStateToAPI();
        this.updateLiveJSON();
        this.updateInspector();
      }
    });
  }

  async syncStateToAPI() {
    await saveTopologyAPI(this.vertices, this.groups, this.positions);
  }

  updateMultiSelectBar() {
    const bar = document.getElementById('multi-select-bar');
    const countEl = document.getElementById('multi-select-count');

    if (this.selectedIds.length >= 2) {
      if (countEl) countEl.textContent = `${this.selectedIds.length} items selected`;
      if (bar) bar.style.display = 'flex';
    } else {
      if (bar) bar.style.display = 'none';
    }
  }

  groupSelectedVertices() {
    if (this.selectedIds.length < 2) {
      alert("Please select at least 2 vertices (Shift+Click or Shift+Drag box) to group them.");
      return;
    }

    const memberIds = [];
    this.selectedIds.forEach(id => {
      if (id.startsWith('group-')) {
        const existingGroup = this.groups.find(g => g.id === id);
        if (existingGroup) {
          memberIds.push(...existingGroup.memberIds);
        }
      } else {
        memberIds.push(id);
      }
    });

    const uniqueMembers = Array.from(new Set(memberIds));

    let defaultLabel = `Group_${this.groups.length + 1}`;
    if (uniqueMembers.every(m => m.startsWith('Q_'))) {
      const nums = uniqueMembers.map(m => parseInt(m.replace('Q_', ''), 10)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
      if (nums.length > 0) {
        defaultLabel = `Q${nums[0]}:Q${nums[nums.length - 1]}`;
      }
    }

    const groupLabel = prompt("Enter Group Label name:", defaultLabel);
    if (!groupLabel) return;

    const groupId = `group-${groupLabel.replace(/\s+/g, '_')}`;

    let sumX = 0, sumY = 0, count = 0;
    uniqueMembers.forEach(mId => {
      const p = this.positions[mId] || { x: 100, y: 100 };
      sumX += p.x;
      sumY += p.y;
      count++;
    });
    const avgX = Math.round(sumX / count);
    const avgY = Math.round(sumY / count);

    this.groups = this.groups.filter(g => !g.memberIds.some(m => uniqueMembers.includes(m)));

    this.groups.push({
      id: groupId,
      label: groupLabel,
      memberIds: uniqueMembers,
      collapsed: true
    });

    this.positions[groupId] = { x: avgX, y: avgY };
    uniqueMembers.forEach(mId => {
      this.positions[mId] = { x: avgX, y: avgY };
    });

    this.engine.setGraphData(this.vertices, this.positions, this.groups);
    this.engine.selectVertex(null);
    this.syncStateToAPI();
    this.updateLiveJSON();
  }

  ungroupSelectedVertices() {
    if (this.selectedIds.length === 0) return;

    const groupsToRemove = new Set();
    this.selectedIds.forEach(id => {
      if (id.startsWith('group-')) {
        groupsToRemove.add(id);
      } else {
        const parentGroup = this.groups.find(g => g.memberIds.includes(id));
        if (parentGroup) {
          groupsToRemove.add(parentGroup.id);
        }
      }
    });

    if (groupsToRemove.size === 0) {
      alert("No groups found in your selection to ungroup.");
      return;
    }

    groupsToRemove.forEach(gId => {
      this.engine.ungroupGroup(gId);
    });

    this.groups = this.engine.groups;
    this.selectedIds = [];
    this.updateMultiSelectBar();
    this.syncStateToAPI();
    this.updateLiveJSON();
  }

  setInspectorOpen(open) {
    this.isInspectorOpen = open;
    const container = document.getElementById('inspector-container');
    const badge = document.getElementById('inspector-badge');
    const hintPill = document.getElementById('inspector-hint-pill');

    if (container) {
      if (open) {
        container.classList.add('open');
      } else {
        container.classList.remove('open');
      }
    }

    if (badge) {
      if (this.selectedIds.length >= 2) {
        badge.textContent = `${this.selectedIds.length} Selected`;
        badge.className = "badge badge-amber";
      } else if (this.selectedVertexId) {
        badge.textContent = this.selectedVertexId;
        badge.className = "badge badge-cyan";
      } else if (open) {
        badge.textContent = "Open";
        badge.className = "badge badge-blue";
      } else {
        badge.textContent = "Off";
        badge.className = "badge badge-gray";
      }
    }

    if (hintPill) {
      if (open || this.selectedVertexId || this.selectedIds.length > 0) {
        hintPill.style.display = 'none';
      } else {
        hintPill.style.display = 'inline-block';
      }
    }
  }

  toggleInspector() {
    this.setInspectorOpen(!this.isInspectorOpen);
  }

  initPalette() {
    const paletteEl = document.getElementById('preset-palette');
    const searchInput = document.getElementById('palette-search-input');

    const renderPalette = async (query = '') => {
      const q = query.trim();
      const presets = await getPresetsAPI(q);

      const customHtml = `
        <div class="preset-item featured-custom-item" data-type="CUSTOM">
          <div class="preset-info">
            <div class="preset-label">➕ Create Custom Vertex</div>
            <div class="preset-type">Build custom type & parameters (key::val)</div>
          </div>
          <span class="badge badge-gray">+ Add</span>
        </div>
      `;

      let listHtml = '';
      if (q === '') {
        listHtml = `
          ${customHtml}
          <div class="sidebar-empty-state">
            <div class="text-xs text-muted py-2 px-1 text-center">
              🔍 Type in search box above to fetch components.
            </div>
            <div class="palette-divider">Popular Categories</div>
            <div class="quick-category-tags">
              <span class="badge badge-cyan quick-tag" data-search="EMBED">Embedding</span>
              <span class="badge badge-purple quick-tag" data-search="RMS">Norm</span>
              <span class="badge badge-amber quick-tag" data-search="ATTN">Attention</span>
              <span class="badge badge-emerald quick-tag" data-search="RES">Residual</span>
              <span class="badge badge-indigo quick-tag" data-search="MLP">MLP</span>
            </div>
          </div>
        `;
      } else if (presets.length === 0) {
        listHtml = `
          ${customHtml}
          <div class="sidebar-empty-state">
            <div class="text-xs text-muted py-2 px-1 text-center">
              ❌ No vertex components found matching "<strong>${query}</strong>".
            </div>
          </div>
        `;
      } else {
        const presetsHtml = presets.map(preset => `
          <div class="preset-item" data-type="${preset.type}">
            <div class="preset-info">
              <div class="preset-label">${preset.label}</div>
              <div class="preset-type">Type: <code>${preset.type}</code> • ${preset.category}</div>
            </div>
            <span class="badge ${preset.badgeClass || 'badge-blue'}">+ Add</span>
          </div>
        `).join('');

        listHtml = `${customHtml} <div class="palette-divider">Matching Results (${presets.length})</div> ${presetsHtml}`;
      }

      paletteEl.innerHTML = listHtml;

      paletteEl.querySelectorAll('.preset-item').forEach(item => {
        item.addEventListener('click', () => {
          const type = item.dataset.type;
          if (type === "CUSTOM") {
            this.openCustomModal();
          } else {
            const foundPreset = presets.find(p => p.type === type);
            this.addNewVertexFromPreset(type, foundPreset);
          }
        });
      });

      paletteEl.querySelectorAll('.quick-tag').forEach(tag => {
        tag.addEventListener('click', () => {
          const searchWord = tag.dataset.search;
          if (searchInput) {
            searchInput.value = searchWord;
            renderPalette(searchWord);
          }
        });
      });
    };

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderPalette(e.target.value);
      });
    }

    renderPalette('');
  }

  openCustomModal() {
    const customCount = this.vertices.filter(v => v.id.startsWith('Custom')).length;
    openCustomVertexModal(async (newVertex) => {
      const viewportRect = document.getElementById('graph-container').getBoundingClientRect();
      const centerWorld = this.engine.screenToWorld(viewportRect.width / 2, viewportRect.height / 2);
      
      this.vertices.push(newVertex);
      this.positions[newVertex.id] = {
        x: Math.round(centerWorld.x - 100 + (Math.random() * 40 - 20)),
        y: Math.round(centerWorld.y - 36 + (Math.random() * 40 - 20))
      };

      this.engine.setGraphData(this.vertices, this.positions, this.groups);
      this.engine.selectVertex(newVertex.id);
      this.setInspectorOpen(true);
      await this.syncStateToAPI();
      this.updateLiveJSON();
    }, customCount);
  }

  async addNewVertexFromPreset(type, preset = null) {
    let count = 0;
    let basePrefix = type;
    let newId = `${basePrefix}${count}`;
    while (this.vertices.some(v => v.id === newId)) {
      count++;
      newId = `${basePrefix}${count}`;
    }

    const defaultHost = preset ? preset.defaultHost : '192.168.0.196';
    const defaultPort = preset ? preset.defaultPort : 9000;
    const defaultInternalPort = preset ? preset.defaultInternalPort : 10000;
    const defaultParams = preset ? { ...preset.params } : {};

    const newVertex = {
      id: newId,
      type: type,
      host: defaultHost,
      port: defaultPort,
      internalPort: defaultInternalPort,
      params: defaultParams,
      edges: []
    };

    const viewportRect = document.getElementById('graph-container').getBoundingClientRect();
    const centerWorld = this.engine.screenToWorld(viewportRect.width / 2, viewportRect.height / 2);
    
    this.vertices.push(newVertex);
    this.positions[newId] = {
      x: Math.round(centerWorld.x - 100 + (Math.random() * 40 - 20)),
      y: Math.round(centerWorld.y - 36 + (Math.random() * 40 - 20))
    };

    this.engine.setGraphData(this.vertices, this.positions, this.groups);
    this.engine.selectVertex(newId);
    this.setInspectorOpen(true);
    await this.syncStateToAPI();
    this.updateLiveJSON();
  }

  async createNewTopology() {
    if (this.vertices.length > 0) {
      if (!confirm("Are you sure you want to create a new empty topology? Unsaved changes will be cleared.")) {
        return;
      }
    }

    this.vertices = [];
    this.positions = {};
    this.groups = [];
    this.selectedVertexId = null;
    this.selectedIds = [];

    this.engine.setGraphData(this.vertices, this.positions, this.groups);
    this.setInspectorOpen(false);
    this.updateInspector();
    await this.syncStateToAPI();
    this.updateLiveJSON();
  }

  async loadInitialTopology() {
    try {
      const state = await getTopologyAPI();
      this.vertices = state.vertices || [];
      this.groups = state.groups || [];
      
      this.positions = await computeAutoLayoutAPI(this.vertices, this.groups);
      this.engine.setGraphData(this.vertices, this.positions, this.groups);
      this.engine.fitView();
      this.selectedVertexId = null;
      this.selectedIds = [];
      this.setInspectorOpen(false);
      this.updateInspector();
      this.updateLiveJSON();
    } catch (err) {
      console.warn("Failed loading initial topology graph:", err);
    }
  }

  async importJSONText(jsonText) {
    try {
      const importedVertices = await importJSONAPI(jsonText);
      if (!importedVertices || importedVertices.length === 0) {
        throw new Error("No valid vertices parsed from JSON");
      }

      this.vertices = importedVertices;
      this.groups = []; // Reset groups for newly imported JSON
      this.positions = await computeAutoLayoutAPI(this.vertices, this.groups);
      
      this.engine.setGraphData(this.vertices, this.positions, this.groups);
      this.engine.fitView();
      this.selectedVertexId = null;
      this.selectedIds = [];
      this.setInspectorOpen(false);
      this.updateInspector();
      await this.syncStateToAPI();
      this.updateLiveJSON();
    } catch (err) {
      alert("Import Failed: " + err.message);
    }
  }

  async runAutoLayout() {
    this.groups = this.engine.groups;
    this.positions = await computeAutoLayoutAPI(this.vertices, this.groups);
    this.engine.setGraphData(this.vertices, this.positions, this.groups);
    this.engine.fitView();
    await this.syncStateToAPI();
  }

  updateInspector() {
    const inspectorContainer = document.getElementById('inspector-container');
    const selectedVertex = this.vertices.find(v => v.id === this.selectedVertexId) || null;
    const selectedGroup = this.groups.find(g => g.id === this.selectedVertexId) || null;

    renderInspector(
      inspectorContainer,
      selectedVertex,
      selectedGroup,
      this.selectedIds,
      this.vertices,
      this.groups,
      async (updatedVertex, oldId) => {
        if (oldId && oldId !== updatedVertex.id) {
          this.positions[updatedVertex.id] = this.positions[oldId];
          delete this.positions[oldId];
          this.selectedVertexId = updatedVertex.id;
        }
        this.engine.setGraphData(this.vertices, this.positions, this.groups);
        this.engine.selectVertex(this.selectedVertexId);
        await this.syncStateToAPI();
        this.updateLiveJSON();
      },
      async (deletedId) => {
        this.vertices = this.vertices.filter(v => v.id !== deletedId);
        delete this.positions[deletedId];
        
        this.vertices.forEach(v => {
          if (v.edges) {
            v.edges = v.edges.filter(id => id !== deletedId);
          }
        });

        this.selectedVertexId = null;
        this.setInspectorOpen(false);
        this.engine.setGraphData(this.vertices, this.positions, this.groups);
        this.updateInspector();
        await this.syncStateToAPI();
        this.updateLiveJSON();
      },
      () => {
        this.engine.selectVertex(null);
        this.setInspectorOpen(false);
      },
      () => this.groupSelectedVertices(),
      () => this.ungroupSelectedVertices(),
      async (updatedGroup) => {
        this.engine.setGraphData(this.vertices, this.positions, this.groups);
        await this.syncStateToAPI();
        this.updateLiveJSON();
      }
    );
  }

  updateLiveJSON() {
    const jsonStr = generateTopologyJSON(this.vertices);
    const codeEl = document.getElementById('json-code-output');
    if (codeEl) {
      codeEl.textContent = jsonStr;
    }
  }

  initPaletteToggle() {
    const sidebar = document.getElementById('palette-sidebar');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const logoClick = document.getElementById('sidebar-logo-click');
    const railExpandBtn = document.getElementById('rail-btn-expand');
    const railSearchBtn = document.getElementById('rail-btn-search');
    const railAddBtn = document.getElementById('rail-btn-add');
    const searchInput = document.getElementById('palette-search-input');

    const toggleSidebar = (collapse) => {
      const isCollapsed = collapse !== undefined ? collapse : !sidebar.classList.contains('collapsed');
      if (isCollapsed) {
        sidebar.classList.add('collapsed');
      } else {
        sidebar.classList.remove('collapsed');
      }
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar(true);
      });
    }

    if (logoClick) {
      logoClick.addEventListener('click', () => {
        if (sidebar.classList.contains('collapsed')) {
          toggleSidebar(false);
        }
      });
    }

    if (railExpandBtn) {
      railExpandBtn.addEventListener('click', () => toggleSidebar(false));
    }

    if (railSearchBtn) {
      railSearchBtn.addEventListener('click', () => {
        toggleSidebar(false);
        if (searchInput) searchInput.focus();
      });
    }

    if (railAddBtn) {
      railAddBtn.addEventListener('click', () => {
        toggleSidebar(false);
        this.openCustomModal();
      });
    }
  }

  bindGlobalEvents() {
    this.initPaletteToggle();

    // Multi-Select Action Bar Buttons
    const groupSelBtn = document.getElementById('btn-group-selected');
    if (groupSelBtn) {
      groupSelBtn.addEventListener('click', () => this.groupSelectedVertices());
    }

    const ungroupSelBtn = document.getElementById('btn-ungroup-selected');
    if (ungroupSelBtn) {
      ungroupSelBtn.addEventListener('click', () => this.ungroupSelectedVertices());
    }

    const clearSelBtn = document.getElementById('btn-clear-select');
    if (clearSelBtn) {
      clearSelBtn.addEventListener('click', () => {
        this.engine.selectVertex(null);
      });
    }

    const toggleInspectorBtn = document.getElementById('btn-toggle-inspector');
    if (toggleInspectorBtn) {
      toggleInspectorBtn.addEventListener('click', () => this.toggleInspector());
    }

    const newTopoBtn = document.getElementById('btn-new-topo');
    if (newTopoBtn) {
      newTopoBtn.addEventListener('click', () => this.createNewTopology());
    }

    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    const importInput = document.getElementById('file-import-input');
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        this.importJSONText(event.target.result);
        importInput.value = '';
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-auto-layout').addEventListener('click', () => this.runAutoLayout());

    document.getElementById('btn-batch-modal').addEventListener('click', () => {
      openBatchModal(async (generatedVertices) => {
        this.vertices = [...this.vertices, ...generatedVertices];
        this.positions = await computeAutoLayoutAPI(this.vertices, this.groups);
        this.engine.setGraphData(this.vertices, this.positions, this.groups);
        this.engine.fitView();
        await this.syncStateToAPI();
        this.updateLiveJSON();
      });
    });

    document.getElementById('btn-export-json').addEventListener('click', () => {
      const jsonStr = generateTopologyJSON(this.vertices);
      downloadJSON(jsonStr, "topology.json");
    });

    // Expandable & Resizable Live JSON Drawer
    const jsonDrawer = document.getElementById('json-drawer');
    const toggleBtn = document.getElementById('btn-toggle-json');
    const closeBtn = document.getElementById('btn-close-json-drawer');
    const expandBtn = document.getElementById('btn-expand-json');
    const drawerHeader = document.getElementById('json-drawer-header');

    const toggleDrawer = () => jsonDrawer.classList.toggle('open');
    toggleBtn.addEventListener('click', toggleDrawer);
    closeBtn.addEventListener('click', () => jsonDrawer.classList.remove('open'));

    let drawerMode = 0;
    expandBtn.addEventListener('click', () => {
      drawerMode = (drawerMode + 1) % 3;
      jsonDrawer.classList.remove('half-screen', 'full-screen');
      if (drawerMode === 1) {
        jsonDrawer.classList.add('half-screen');
        expandBtn.textContent = "🗖 Restore";
      } else if (drawerMode === 2) {
        jsonDrawer.classList.add('full-screen');
        expandBtn.textContent = "🗕 Normal";
      } else {
        expandBtn.textContent = "⛶ Expand";
      }
    });

    let isResizingDrawer = false;
    let resizeStartY = 0;
    let initialHeight = 260;

    drawerHeader.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isResizingDrawer = true;
      resizeStartY = e.clientY;
      initialHeight = jsonDrawer.getBoundingClientRect().height;
    });

    window.addEventListener('mousemove', (e) => {
      if (isResizingDrawer) {
        const dy = resizeStartY - e.clientY;
        const newH = Math.min(Math.max(160, initialHeight + dy), window.innerHeight * 0.85);
        jsonDrawer.classList.remove('half-screen', 'full-screen');
        jsonDrawer.style.height = `${newH}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isResizingDrawer) {
        isResizingDrawer = false;
      }
    });

    document.getElementById('btn-copy-json').addEventListener('click', () => {
      const jsonStr = generateTopologyJSON(this.vertices);
      navigator.clipboard.writeText(jsonStr).then(() => {
        alert("JSON copied to clipboard!");
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
