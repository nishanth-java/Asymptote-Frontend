/**
 * =========================================================================================
 * TOPOLOGY STUDIO - MAIN APPLICATION CONTROLLER
 * =========================================================================================
 * File: js/app.js
 * State coordinator & event pipeline for visual graph canvas, vertex selection,
 * server IP assignment, REST API communication, and Cluster Deployment Pipeline.
 * 
 * Includes Custom UI Dialogs & Toast Notifications (zero browser native popups).
 * Comprehensive keyboard shortcuts (Delete/Backspace, Esc, Ctrl+A, Ctrl+G, Ctrl+L, Ctrl+D, Ctrl+F, [, ], +, -, 0).
 * Sidebar renders compact icon chips for a clean layout.
 * =========================================================================================
 */

import { GraphEngine } from './graphEngine.js';
import { renderInspector } from './inspector.js';
import { generateTopologyJSON, downloadJSON } from './jsonManager.js';
import { openBatchModal } from './batchCreator.js';

/* 
 * Custom Vertex Creator Modal commented down as requested for future use:
 * import { openCustomVertexModal } from './customVertexModal.js';
 */

import {
  getVerticesCatalogAPI,
  getTopologyAPI,
  saveTopologyAPI,
  deployClusterAPI,
  computeAutoLayoutAPI,
  importJSONAPI
} from './apiClient.js';

class App {
  constructor() {
    // Core Graph State
    this.vertices = [];     // Array of vertex objects: { id, type, host, port, internalPort, params, edges }
    this.positions = {};    // Position map: { vertexId: { x, y } }
    this.groups = [];       // Array of active group definitions: { id, label, memberIds, collapsed }
    
    // UI State
    this.selectedVertexId = null;
    this.selectedIds = [];
    this.isInspectorOpen = false;

    // Initialization Sequence
    this.initTheme();
    this.initGraphEngine();
    this.initPalette();
    this.bindGlobalEvents();
    this.bindKeyboardShortcuts();
    
    // Canvas starts clean & empty by default as requested
    this.loadInitialTopology();
  }

  // =========================================================================================
  // IN-APP UI DIALOG & TOAST NOTIFICATION HELPERS (NO BROWSER NATIVE POPUPS)
  // =========================================================================================

  /**
   * Displays an in-app UI confirmation modal.
   * Replaces browser native confirm().
   * @param {string} title Modal title.
   * @param {string} message Confirmation question/message.
   * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled.
   */
  showCustomConfirm(title, message) {
    return new Promise((resolve) => {
      const backdrop = document.getElementById('ui-modal-backdrop');
      const titleEl = document.getElementById('ui-modal-title');
      const msgEl = document.getElementById('ui-modal-message');
      const inputContainer = document.getElementById('ui-modal-input-container');
      const confirmBtn = document.getElementById('ui-modal-confirm-btn');
      const cancelBtn = document.getElementById('ui-modal-cancel-btn');
      const closeBtn = document.getElementById('ui-modal-close-btn');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputContainer.style.display = 'none';
      backdrop.style.display = 'flex';

      const cleanup = (result) => {
        backdrop.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
        resolve(result);
      };

      confirmBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      closeBtn.onclick = () => cleanup(false);
    });
  }

  /**
   * Displays an in-app UI prompt modal with text input.
   * Replaces browser native prompt().
   * @param {string} title Modal title.
   * @param {string} message Question / instruction message.
   * @param {string} defaultValue Pre-filled default text value.
   * @returns {Promise<string|null>} Resolves string input value or null if cancelled.
   */
  showCustomPrompt(title, message, defaultValue = '') {
    return new Promise((resolve) => {
      const backdrop = document.getElementById('ui-modal-backdrop');
      const titleEl = document.getElementById('ui-modal-title');
      const msgEl = document.getElementById('ui-modal-message');
      const inputContainer = document.getElementById('ui-modal-input-container');
      const inputEl = document.getElementById('ui-modal-input');
      const confirmBtn = document.getElementById('ui-modal-confirm-btn');
      const cancelBtn = document.getElementById('ui-modal-cancel-btn');
      const closeBtn = document.getElementById('ui-modal-close-btn');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.value = defaultValue;
      inputContainer.style.display = 'block';
      backdrop.style.display = 'flex';
      setTimeout(() => inputEl.focus(), 100);

      const cleanup = (val) => {
        backdrop.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
        resolve(val);
      };

      confirmBtn.onclick = () => cleanup(inputEl.value.trim() || defaultValue);
      cancelBtn.onclick = () => cleanup(null);
      closeBtn.onclick = () => cleanup(null);

      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') cleanup(inputEl.value.trim() || defaultValue);
        if (e.key === 'Escape') cleanup(null);
      };
    });
  }

  /**
   * Displays a sleek floating in-app toast notification.
   * Replaces browser native alert().
   * @param {string} message Toast message.
   * @param {'info'|'success'|'error'} type Toast theme.
   */
  showCustomToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // =========================================================================================
  // KEYBOARD SHORTCUTS & KEYBINDINGS
  // =========================================================================================

  /**
   * Binds global keyboard shortcuts & keybindings across the application:
   * - Delete / Backspace: Deletes selected vertex/vertices or groups.
   * - Escape: Deselects items, closes inspector sidebar, modals & JSON drawer.
   * - Ctrl+A / Cmd+A: Selects all vertices on canvas.
   * - Ctrl+G / Cmd+G: Groups selected vertices.
   * - Ctrl+Shift+G / Cmd+Shift+G: Ungroups selected items.
   * - Ctrl+L / Cmd+L: Triggers dynamic Auto Layout.
   * - Ctrl+D / Cmd+D: Triggers Deploy Cluster modal.
   * - Ctrl+F / Cmd+F: Focuses Left Sidebar search input.
   * - [ and ]: Toggles Left Sidebar ([) and Right Inspector Sidebar (]).
   * - + / - / 0: Canvas Zoom In (+), Zoom Out (-), and Fit View (0).
   */
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', async (e) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );

      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      // 1. Delete / Backspace (when not editing an input)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputActive) {
        e.preventDefault();
        if (this.selectedIds && this.selectedIds.length > 0) {
          const confirmed = await this.showCustomConfirm(
            "Delete Selected Items",
            `Are you sure you want to delete ${this.selectedIds.length} selected item(s)?`
          );
          if (confirmed) {
            const idsToDelete = [...this.selectedIds];
            idsToDelete.forEach(id => {
              if (id.startsWith('group-')) {
                this.groups = this.groups.filter(g => g.id !== id);
                delete this.positions[id];
              } else {
                this.vertices = this.vertices.filter(v => v.id !== id);
                delete this.positions[id];
                this.vertices.forEach(v => {
                  if (v.edges) v.edges = v.edges.filter(t => t !== id);
                });
              }
            });
            this.selectedVertexId = null;
            this.selectedIds = [];
            this.engine.setGraphData(this.vertices, this.positions, this.groups);
            this.setInspectorOpen(false);
            this.updateInspector();
            await this.syncStateToAPI();
            this.updateLiveJSON();
            this.showCustomToast("Deleted selected item(s)", "info");
          }
        } else if (this.selectedVertexId) {
          const confirmed = await this.showCustomConfirm(
            "Delete Vertex",
            `Are you sure you want to delete vertex "${this.selectedVertexId}"?`
          );
          if (confirmed) {
            const delId = this.selectedVertexId;
            this.vertices = this.vertices.filter(v => v.id !== delId);
            delete this.positions[delId];
            this.vertices.forEach(v => {
              if (v.edges) v.edges = v.edges.filter(t => t !== delId);
            });
            this.selectedVertexId = null;
            this.setInspectorOpen(false);
            this.engine.setGraphData(this.vertices, this.positions, this.groups);
            this.updateInspector();
            await this.syncStateToAPI();
            this.updateLiveJSON();
            this.showCustomToast(`Deleted vertex "${delId}"`, "info");
          }
        }
        return;
      }

      // 2. Escape: Deselect / Close Modals & Panels
      if (e.key === 'Escape') {
        const deployBackdrop = document.getElementById('deploy-modal-backdrop');
        const uiBackdrop = document.getElementById('ui-modal-backdrop');
        const jsonDrawer = document.getElementById('json-drawer');

        if (deployBackdrop && deployBackdrop.style.display !== 'none') {
          deployBackdrop.style.display = 'none';
          return;
        }
        if (uiBackdrop && uiBackdrop.style.display !== 'none') {
          uiBackdrop.style.display = 'none';
          return;
        }
        if (jsonDrawer && jsonDrawer.classList.contains('open')) {
          jsonDrawer.classList.remove('open');
          return;
        }

        // Otherwise deselect canvas items
        this.engine.selectVertex(null);
        this.setInspectorOpen(false);
        return;
      }

      // 3. Ctrl + A (Cmd + A): Select All Vertices
      if (isCmdOrCtrl && (e.key === 'a' || e.key === 'A') && !isInputActive) {
        e.preventDefault();
        const allIds = [
          ...this.vertices.map(v => v.id),
          ...this.groups.filter(g => g.collapsed).map(g => g.id)
        ];
        this.engine.selectAll(allIds);
        this.showCustomToast(`Selected all ${allIds.length} items`, "info");
        return;
      }

      // 4. Ctrl + G (Cmd + G) / Ctrl + Shift + G: Group / Ungroup
      if (isCmdOrCtrl && (e.key === 'g' || e.key === 'G') && !isInputActive) {
        e.preventDefault();
        if (e.shiftKey) {
          this.ungroupSelectedVertices();
        } else {
          this.groupSelectedVertices();
        }
        return;
      }

      // 5. Ctrl + L (Cmd + L): Run Auto Layout
      if (isCmdOrCtrl && (e.key === 'l' || e.key === 'L') && !isInputActive) {
        e.preventDefault();
        this.runAutoLayout();
        return;
      }

      // 6. Ctrl + D (Cmd + D): Deploy Cluster Modal
      if (isCmdOrCtrl && (e.key === 'd' || e.key === 'D') && !isInputActive) {
        e.preventDefault();
        this.openDeployModal();
        return;
      }

      // 7. Ctrl + F (Cmd + F): Focus Search Bar
      if (isCmdOrCtrl && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const searchInput = document.getElementById('palette-search-input');
        const sidebar = document.getElementById('palette-sidebar');
        if (sidebar && sidebar.classList.contains('collapsed')) {
          sidebar.classList.remove('collapsed');
        }
        if (searchInput) searchInput.focus();
        return;
      }

      // 8. '[' and ']': Toggle Left Sidebar ([) and Right Inspector Sidebar (])
      if (e.key === '[' && !isInputActive) {
        e.preventDefault();
        const sidebar = document.getElementById('palette-sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
        return;
      }
      if (e.key === ']' && !isInputActive) {
        e.preventDefault();
        this.toggleInspector();
        return;
      }

      // 9. Zoom Shortcuts (+ / - / 0)
      if ((e.key === '=' || e.key === '+') && !isInputActive) {
        e.preventDefault();
        this.engine.zoomAtCenter(1.15);
        return;
      }
      if (e.key === '-' && !isInputActive) {
        e.preventDefault();
        this.engine.zoomAtCenter(0.85);
        return;
      }
      if (e.key === '0' && !isInputActive) {
        e.preventDefault();
        this.engine.fitView();
        this.showCustomToast("View reset to fit graph", "info");
        return;
      }
    });
  }

  // =========================================================================================
  // THEME & GRAPH ENGINE INITIALIZATION
  // =========================================================================================

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

  /** Groups selected canvas vertices using in-app UI prompt. */
  async groupSelectedVertices() {
    if (this.selectedIds.length < 2) {
      this.showCustomToast("Please select at least 2 vertices (Shift+Click or Shift+Drag box) to group them.", "info");
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

    const groupLabel = await this.showCustomPrompt("Group Selection", "Enter Group Label name:", defaultLabel);
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
    this.showCustomToast(`Group "${groupLabel}" created`, "success");
  }

  /** Dissolves selected group card. */
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
      this.showCustomToast("No groups found in your selection to ungroup.", "info");
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
    this.showCustomToast("Group dissolved", "info");
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

  /**
   * Initializes Searchable Left Sidebar Vertex Catalog.
   * Keeps sidebar clean by displaying compact 2-column icon chip grid for Components.
   */
  initPalette() {
    const paletteEl = document.getElementById('preset-palette');
    const searchInput = document.getElementById('palette-search-input');

    const renderPalette = async (query = '') => {
      const q = query.trim();
      const catalog = await getVerticesCatalogAPI(q);

      let listHtml = '';
      if (q === '' && catalog.length > 0) {
        // Compact Icon Chip Grid Layout for Components
        const topCatalog = catalog.slice(0, 6);

        const chipsHtml = topCatalog.map(item => `
          <div class="preset-chip" data-type="${item.type}" title="${item.label} (${item.category})">
            <div class="chip-label">
              <span class="chip-type">${item.type}</span>
              <span class="chip-category">${item.category}</span>
            </div>
            <span class="badge ${item.badgeClass || 'badge-blue'}">+</span>
          </div>
        `).join('');

        listHtml = `
          <div class="palette-divider">Components</div>
          <div class="preset-chip-grid">
            ${chipsHtml}
          </div>
        `;
      } else if (catalog.length === 0) {
        listHtml = `
          <div class="sidebar-empty-state">
            <div class="text-xs text-muted py-2 px-1 text-center">
              No vertices found matching "<strong>${query}</strong>".
            </div>
          </div>
        `;
      } else {
        const catalogHtml = catalog.map(item => `
          <div class="preset-item" data-type="${item.type}">
            <div class="preset-info">
              <div class="preset-label">${item.label}</div>
              <div class="preset-type">Type: <code>${item.type}</code> • ${item.category}</div>
              ${item.jarInfo ? `<div class="text-xs text-muted">JAR: ${item.jarInfo.jarName}</div>` : ''}
            </div>
            <span class="badge ${item.badgeClass || 'badge-blue'}">+ Add</span>
          </div>
        `).join('');

        listHtml = `<div class="palette-divider">Matching Results (${catalog.length})</div> ${catalogHtml}`;
      }

      paletteEl.innerHTML = listHtml;

      paletteEl.querySelectorAll('.preset-item, .preset-chip').forEach(item => {
        item.addEventListener('click', () => {
          const type = item.dataset.type;
          const foundEntry = catalog.find(p => p.type === type);
          this.addNewVertexFromPreset(type, foundEntry);
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

  /** Clears canvas using custom in-app UI confirm modal. */
  async createNewTopology() {
    if (this.vertices.length > 0) {
      const confirmed = await this.showCustomConfirm(
        "Clear Canvas",
        "Are you sure you want to clear the canvas? Unsaved changes will be cleared."
      );
      if (!confirmed) return;
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
    this.showCustomToast("Canvas cleared", "info");
  }

  async loadInitialTopology() {
    try {
      const state = await getTopologyAPI();
      this.vertices = state.vertices || [];
      this.groups = state.groups || [];
      
      this.positions = await computeAutoLayoutAPI(this.vertices, this.groups);
      this.engine.setGraphData(this.vertices, this.positions, this.groups);
      if (this.vertices.length > 0) {
        this.engine.fitView();
      }
      this.selectedVertexId = null;
      this.selectedIds = [];
      this.setInspectorOpen(false);
      this.updateInspector();
      this.updateLiveJSON();
    } catch (err) {
      console.warn("Starting with clean canvas:", err);
    }
  }

  async importJSONText(jsonText) {
    try {
      const importedVertices = await importJSONAPI(jsonText);
      if (!importedVertices || importedVertices.length === 0) {
        throw new Error("No valid vertices parsed from JSON");
      }

      this.vertices = importedVertices;
      this.groups = [];
      this.positions = await computeAutoLayoutAPI(this.vertices, this.groups);
      
      this.engine.setGraphData(this.vertices, this.positions, this.groups);
      this.engine.fitView();
      this.selectedVertexId = null;
      this.selectedIds = [];
      this.setInspectorOpen(false);
      this.updateInspector();
      await this.syncStateToAPI();
      this.updateLiveJSON();
      this.showCustomToast("Topology JSON imported successfully", "success");
    } catch (err) {
      this.showCustomToast("Import Failed: " + err.message, "error");
    }
  }

  async runAutoLayout() {
    this.groups = this.engine.groups;
    this.positions = await computeAutoLayoutAPI(this.vertices, this.groups);
    this.engine.setGraphData(this.vertices, this.positions, this.groups);
    this.engine.fitView();
    await this.syncStateToAPI();
    this.showCustomToast("Layout tidied up", "info");
  }

  openDeployModal() {
    if (this.vertices.length === 0) {
      this.showCustomToast("Canvas is empty! Please add vertices from the sidebar and assign server IPs before deploying.", "info");
      return;
    }

    const backdrop = document.getElementById('deploy-modal-backdrop');
    const modalBody = document.getElementById('deploy-modal-body');
    const confirmBtn = document.getElementById('btn-confirm-deploy');

    const serverMap = new Map();
    this.vertices.forEach(v => {
      const ip = (v.host || '192.168.0.100').trim();
      if (!serverMap.has(ip)) serverMap.set(ip, []);
      serverMap.get(ip).push(v);
    });

    const uniqueIps = Array.from(serverMap.keys());

    let serverListHtml = uniqueIps.map(ip => {
      const nodes = serverMap.get(ip);
      const types = Array.from(new Set(nodes.map(n => n.type))).join(', ');
      return `
        <div class="deploy-server-card">
          <div class="flex-between mb-1">
            <span class="font-bold text-sm">Server IP: <code>${ip}</code></span>
            <span class="badge badge-blue">${nodes.length} Vertices Assigned</span>
          </div>
          <div class="text-xs text-muted mb-2">Vertices: <strong>${nodes.map(n => n.id).join(', ')}</strong> (${types})</div>
          <div class="deploy-jar-checklist">
            <div class="text-xs font-semibold color-accent">Required JAR Binaries from Central DB:</div>
            ${nodes.map(n => `<div class="text-xs code-font text-muted">  • ${n.type.toLowerCase()}-service-v1.jar ➔ transfer to ${ip}</div>`).join('')}
          </div>
        </div>
      `;
    }).join('');

    modalBody.innerHTML = `
      <div class="deploy-summary-box mb-3">
        <div class="flex-between">
          <span class="text-sm font-semibold">Deployment Summary:</span>
          <span class="badge badge-emerald">${this.vertices.length} Total Vertices • ${uniqueIps.length} Target Servers</span>
        </div>
        <p class="text-xs text-muted mt-1">
          When executed, required execution JAR binaries for each vertex will be transferred from Central DB to their assigned target server IPs.
          The complete global topology JSON (<code>topology.json</code>) will be uploaded to ALL target servers so intertwined data flow is maintained.
        </p>
      </div>

      <div class="deploy-servers-container">
        ${serverListHtml}
      </div>

      <div id="deploy-live-log" class="deploy-log-box" style="display: none;">
        <!-- Live transfer output -->
      </div>
    `;

    backdrop.style.display = 'flex';

    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deploying JARs & Syncing Topo...";

      const logBox = document.getElementById('deploy-live-log');
      logBox.style.display = 'block';
      logBox.innerHTML = `<div class="text-xs color-amber">Initiating cluster deployment pipeline...</div>`;

      try {
        const manifest = await deployClusterAPI(this.vertices, this.groups, "Live_Cluster_Run");

        logBox.innerHTML = `
          <div class="text-xs color-emerald font-bold">Cluster Deployment Executed Successfully!</div>
          <div class="text-xs text-muted mt-1">
            Transferred ${manifest.manifest.summary.totalJarsTransferred} JAR binaries across ${manifest.manifest.summary.totalUniqueServers} server IPs.<br>
            Broadcasted intertwined topology.json (${manifest.manifest.globalTopologyBroadcast.uploadedTopologySizeKb} KB) to all nodes.<br>
            Deployment ID: <code>${manifest.manifest.deploymentId}</code>
          </div>
        `;

        confirmBtn.textContent = "Deployed!";
        this.showCustomToast("Cluster Deployment Completed!", "success");

        setTimeout(() => {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Execute Deployment";
        }, 3000);
      } catch (err) {
        logBox.innerHTML = `<div class="text-xs color-rose font-bold">Deployment Error: ${err.message}</div>`;
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Retry Deployment";
        this.showCustomToast("Deployment Error: " + err.message, "error");
      }
    };
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
        // In-App Confirm for Vertex Deletion
        const confirmed = await this.showCustomConfirm(
          "Delete Vertex",
          `Are you sure you want to delete vertex "${deletedId}"?`
        );
        if (!confirmed) return;

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
        this.showCustomToast(`Vertex "${deletedId}" deleted`, "info");
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

    const deployBtn = document.getElementById('btn-deploy-cluster');
    if (deployBtn) {
      deployBtn.addEventListener('click', () => this.openDeployModal());
    }

    const closeDeployBtn = document.getElementById('btn-close-deploy-modal');
    const cancelDeployBtn = document.getElementById('btn-cancel-deploy');
    const deployBackdrop = document.getElementById('deploy-modal-backdrop');

    if (closeDeployBtn) closeDeployBtn.addEventListener('click', () => deployBackdrop.style.display = 'none');
    if (cancelDeployBtn) cancelDeployBtn.addEventListener('click', () => deployBackdrop.style.display = 'none');

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
        this.showCustomToast("Batch slices generated", "success");
      });
    });

    document.getElementById('btn-export-json').addEventListener('click', () => {
      const jsonStr = generateTopologyJSON(this.vertices);
      downloadJSON(jsonStr, "topology.json");
      this.showCustomToast("Exported topology.json", "success");
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
        expandBtn.textContent = "Restore";
      } else if (drawerMode === 2) {
        jsonDrawer.classList.add('full-screen');
        expandBtn.textContent = "Normal";
      } else {
        expandBtn.textContent = "Expand";
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
        this.showCustomToast("JSON copied to clipboard!", "success");
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
