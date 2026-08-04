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

import {
  getVerticesCatalogAPI,
  getTopologyAPI,
  saveTopologyAPI,
  deployClusterAPI,
  computeAutoLayoutAPI,
  importJSONAPI,
  executeDeploymentAPI,
  getWeightsAPI,
  copyWeightsAPI,
  getVertexJarsAPI,
  checkAPIHealth,
  copyStage1API
} from './apiClient.js';

/** Exported Helper Wrappers for Custom In-App UI Modals & Toasts */
export function showCustomConfirm(title, message) {
  if (window.app) return window.app.showCustomConfirm(title, message);
  return Promise.resolve(confirm(message));
}

export function showCustomPrompt(title, message, defaultValue = '') {
  if (window.app) return window.app.showCustomPrompt(title, message, defaultValue);
  return Promise.resolve(prompt(message, defaultValue));
}

export function showCustomToast(message, type = 'info') {
  if (window.app) return window.app.showCustomToast(message, type);
  console.log(`[${type}] ${message}`);
}

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

    // Cluster Overview Dashboard Module
    const clusterViewEl = document.getElementById('view-cluster-overview');
    if (clusterViewEl) {
      this.clusterDashboard = new ClusterDashboard(clusterViewEl);
      this.clusterDashboard.init();
    }

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

        const terminalBackdrop = document.getElementById('terminal-modal-backdrop');

        if (deployBackdrop && deployBackdrop.style.display !== 'none') {
          deployBackdrop.style.display = 'none';
          return;
        }
        if (terminalBackdrop && terminalBackdrop.style.display !== 'none') {
          terminalBackdrop.style.display = 'none';
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
    // Default to dark mode — IDE aesthetic
    const savedTheme = localStorage.getItem('topology_theme') || 'dark';
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
        textEl.textContent = 'Light';
      } else {
        iconEl.textContent = '🌙';
        textEl.textContent = 'Dark';
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
  /**
   * Initializes the IDE-style Left Sidebar Vertex Catalog.
   * Renders nodes as full-row items with icon, name, and description text.
   * Supports category filter tabs and live search.
   */
  initPalette() {
    const paletteEl = document.getElementById('preset-palette');
    const searchInput = document.getElementById('palette-search-input');
    const catTabsEl = document.getElementById('sidebar-cat-tabs');

    let activeCat = 'all';   // active category filter
    let fullCatalog = [];    // all fetched catalog items

    /**
     * Returns a short 2-3 char abbreviation for the node type icon
     * and a background/color class for its chip.
     */
    const getIconStyle = (item) => {
      const catMap = {
        'Norm': { bg: 'rgba(124,58,237,0.18)', color: '#a78bfa' },
        'Attention': { bg: 'rgba(74,158,255,0.18)', color: '#4a9eff' },
        'MLP': { bg: 'rgba(52,211,153,0.18)', color: '#34d399' },
        'Embed': { bg: 'rgba(251,191,36,0.18)', color: '#fbbf24' },
        'Output': { bg: 'rgba(251,113,133,0.18)', color: '#fb7185' },
      };
      const match = Object.keys(catMap).find(k => item.category && item.category.includes(k));
      return match ? catMap[match] : { bg: 'rgba(74,158,255,0.14)', color: '#4a9eff' };
    };

    /**
     * Renders the filtered node list into the palette element.
     * Groups nodes by category with section headers.
     */
    const renderFiltered = (catalog, query = '') => {
      if (!catalog || catalog.length === 0) {
        paletteEl.innerHTML = `
          <div class="sidebar-empty-state">
            <div class="text-xs text-muted py-2 px-1 text-center">
              ${query ? `No nodes matching "<strong>${query}</strong>".` : 'No nodes available.'}
            </div>
          </div>`;
        return;
      }

      // Group by category
      const groups = {};
      catalog.forEach(item => {
        const cat = item.category || 'Other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
      });

      let html = '';
      Object.entries(groups).forEach(([cat, items]) => {
        html += `<div class="palette-divider">${cat} <span class="palette-divider-count">${items.length}</span></div>`;
        items.forEach(item => {
          const style = getIconStyle(item);
          const abbr = item.type.length <= 4 ? item.type : item.type.slice(0, 4);
          html += `
            <div class="preset-item" data-type="${item.type}" title="${item.label}">
              <div class="preset-item-icon" style="background:${style.bg};color:${style.color}">${abbr}</div>
              <div class="preset-item-body">
                <div class="preset-item-name">${item.label}</div>
                <div class="preset-item-desc">${item.description || item.category}</div>
              </div>
              <div class="preset-item-more">›</div>
            </div>`;
        });
      });

      paletteEl.innerHTML = html;

      // Bind click events
      paletteEl.querySelectorAll('.preset-item').forEach(el => {
        el.addEventListener('click', () => {
          const type = el.dataset.type;
          const found = fullCatalog.find(p => p.type === type);
          this.addNewVertexFromPreset(type, found);
        });
      });
    };

    /**
     * Fetches nodes from API and filters by active category & search query.
     */
    const renderPalette = async (query = '') => {
      const q = query.trim();
      // Only re-fetch if catalog is empty or new search
      if (fullCatalog.length === 0 || q) {
        fullCatalog = await getVerticesCatalogAPI(q);
      }

      let filtered = fullCatalog;

      // Apply category filter
      if (activeCat !== 'all') {
        filtered = filtered.filter(item =>
          item.category && item.category.toLowerCase().includes(activeCat.toLowerCase())
        );
      }

      // Apply search filter locally too
      if (q) {
        filtered = filtered.filter(item =>
          item.label.toLowerCase().includes(q.toLowerCase()) ||
          item.type.toLowerCase().includes(q.toLowerCase()) ||
          (item.category && item.category.toLowerCase().includes(q.toLowerCase()))
        );
      }

      renderFiltered(filtered, q);
    };

    // Category tab click handlers
    if (catTabsEl) {
      catTabsEl.querySelectorAll('.cat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          catTabsEl.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeCat = tab.dataset.cat;
          const q = searchInput ? searchInput.value : '';
          renderPalette(q);
        });
      });
    }

    // Search input handler
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderPalette(e.target.value);
      });
    }

    // Initial render with all nodes
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

  async openDeployModal() {
    this.vertices = this.engine.vertices && this.engine.vertices.length > 0 
      ? this.engine.vertices 
      : this.vertices;

    if (!this.vertices || this.vertices.length === 0) {
      try {
        const topo = await getTopologyAPI();
        if (topo && topo.vertices && topo.vertices.length > 0) {
          this.vertices = topo.vertices;
        }
      } catch (e) {}
    }

    if (!this.vertices || this.vertices.length === 0) {
      this.showCustomToast("Canvas is empty! Please add vertices from the sidebar and assign server IPs before deploying.", "info");
      return;
    }

    const backdrop = document.getElementById('deploy-modal-backdrop');
    const modalBody = document.getElementById('deploy-modal-body');
    const confirmBtn = document.getElementById('btn-confirm-deploy');

    const serverMap = new Map();
    this.vertices.forEach(v => {
      const ip = (v.host || '192.168.0.60').trim();
      if (!serverMap.has(ip)) serverMap.set(ip, []);
      serverMap.get(ip).push(v);
    });

    const uniqueIps = Array.from(serverMap.keys());
    const primaryIp = uniqueIps[0] || '192.168.0.60';

    let serverListHtml = uniqueIps.map((ip, idx) => {
      const nodes = serverMap.get(ip);
      const types = Array.from(new Set(nodes.map(n => n.type))).join(', ');
      const defaultUser = idx === 0 ? 'kai' : 'ubuntu';
      const defaultPath = idx === 0 ? '/home/kai/qwenf5/' : '/opt/topology/';
      return `
        <div class="deploy-server-card mb-2" data-ip="${ip}">
          <div class="flex-between mb-1">
            <span class="font-bold text-sm">Linux Target Server IP: <code>${ip}</code></span>
            <span class="badge badge-blue">${nodes.length} Vertices Assigned (${nodes.map(n => n.id).join(', ')})</span>
          </div>
          
          <div class="form-grid-2 gap-2 mt-2">
            <div>
              <label class="text-xs text-muted font-semibold">SSH Remote Username:</label>
              <input type="text" class="form-control code-font text-xs srv-ssh-user" value="${defaultUser}" placeholder="e.g. kai, ubuntu, root">
            </div>
            <div>
              <label class="text-xs text-muted font-semibold">Destination Directory Path on Linux Server:</label>
              <input type="text" class="form-control code-font text-xs srv-dest-path" value="${defaultPath}" placeholder="e.g. /home/kai/qwenf5/ or /opt/topology/">
            </div>
          </div>
        </div>
      `;
    }).join('');

    modalBody.innerHTML = `
      <div class="deploy-summary-box mb-3">
        <div class="flex-between">
          <span class="text-sm font-semibold">Linux SSH/SCP Deployment &amp; Manual Package Pipeline:</span>
          <div class="flex-row gap-2">
            <button type="button" class="btn btn-xs btn-outline" id="btn-download-deploy-pkg">📦 Download Topology &amp; Files (Windows Manual Setup)</button>
            <span class="badge badge-emerald">${this.vertices.length} Vertices • ${uniqueIps.length} Linux Target Servers</span>
          </div>
        </div>
        <p class="text-xs text-muted mt-1">
          Uploads <code>lambdaTest-1.0-SNAPSHOT.jar</code>, <code>qwenHalfBTopo.json</code>, and selected weight CSV files from MongoDB to Linux target servers over SSH/SCP.
          Click <strong>Download Topology &amp; Files</strong> if setting up manually on Windows!
        </p>
      </div>

      <!-- Real-Time Progress Bar -->
      <div class="mb-3">
        <div class="flex-between text-xs font-semibold text-muted mb-1">
          <span id="deploy-progress-label">Deployment Status: Ready</span>
          <span id="deploy-progress-pct">0%</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill bg-purple" id="deploy-progress-fill" style="width: 0%;"></div>
        </div>
      </div>

      <!-- Target Server Credentials & Destination Settings -->
      <div class="preview-box mb-3">
        <div class="preview-box-header color-accent flex-between">
          <span>Target Servers, Credentials &amp; Remote Destinations</span>
          <span class="badge badge-purple">Multi-Platform Linux &amp; Windows</span>
        </div>
        <div class="deploy-servers-container">
          ${serverListHtml}
        </div>
      </div>

      <!-- Vertex Node & Associated JAR Registry -->
      <div class="preview-box mb-3">
        <div class="preview-box-header color-accent flex-between">
          <span>Vertex Node &amp; Execution JAR Association Registry</span>
          <span class="badge badge-cyan">lambdaTest-1.0-SNAPSHOT.jar</span>
        </div>
        <div style="max-height: 140px; overflow-y: auto; background: #0b0f17; border-radius: 6px; padding: 8px;">
          <table class="table-compact text-xs code-font" style="width:100%;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">
                <th style="text-align:left; padding:4px;">Vertex ID</th>
                <th style="text-align:left; padding:4px;">Type</th>
                <th style="text-align:left; padding:4px;">Associated Execution JAR</th>
                <th style="text-align:left; padding:4px;">Target Server IP</th>
              </tr>
            </thead>
            <tbody>
              ${this.vertices.map(v => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding:4px; font-weight:bold; color:var(--accent-amber);">${v.id}</td>
                  <td style="padding:4px; color:var(--text-secondary);">${v.type}</td>
                  <td style="padding:4px; color:var(--accent-cyan);">lambdaTest-1.0-SNAPSHOT.jar (18.5 MB)</td>
                  <td style="padding:4px; color:var(--accent-blue);">${v.host || '192.168.0.60'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Interactive 292 Weights Checkbox Manager -->
      <div class="preview-box mb-3">
        <div class="preview-box-header color-accent flex-between">
          <span>Model Weights Selector (stored in MongoDB 'model_weights' collection)</span>
          <span id="weights-counter-badge" class="badge badge-purple">Loading weights...</span>
        </div>

        <div class="flex-between mb-2">
          <div class="flex-row gap-2">
            <button type="button" class="btn btn-xs btn-outline" id="btn-weights-select-all">☑️ Select All</button>
            <button type="button" class="btn btn-xs btn-outline" id="btn-weights-clear-all">⬜ Clear All</button>
          </div>
          <input type="text" id="weights-filter-input" class="form-control text-xs code-font" placeholder="Search 292 CSV weights..." style="width: 220px;">
        </div>

        <div id="weights-checklist-container" style="max-height: 180px; overflow-y: auto; background: var(--bg-tertiary, #0d131f); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px;" class="form-grid-3">
          <div class="text-xs text-muted">Scanning MongoDB model_weights collection...</div>
        </div>
        <div class="text-xs text-muted mt-1">
          Selected weight CSV files will be transferred to target server folder: <code>weights_csv/</code>
        </div>
      </div>

      <!-- Execution Parameters Form -->
      <div class="preview-box mb-3">
        <div class="preview-box-header color-accent flex-between">
          <span>Java Execution Parameters &amp; Remote Run CLI</span>
          <span class="badge badge-amber">Java 17+ Runtime</span>
        </div>

        <div class="form-grid-2 mb-2">
          <div class="form-group mb-0">
            <label class="text-xs">Min Memory (-Xms):</label>
            <input type="text" id="exec-xms-input" class="form-control code-font text-xs" value="8g">
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Max Memory (-Xmx):</label>
            <input type="text" id="exec-xmx-input" class="form-control code-font text-xs" value="24g">
          </div>
        </div>

        <div class="form-grid-2 mb-2">
          <div class="form-group mb-0">
            <label class="text-xs">Execution JAR Name:</label>
            <input type="text" id="exec-jar-input" class="form-control code-font text-xs" value="lambdaTest-1.0-SNAPSHOT.jar">
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Primary Server IP:</label>
            <input type="text" id="exec-ip-input" class="form-control code-font text-xs" value="${primaryIp}">
          </div>
        </div>

        <div class="form-grid-2 mb-2">
          <div class="form-group mb-0">
            <label class="text-xs">Topology File Name:</label>
            <input type="text" id="exec-topo-input" class="form-control code-font text-xs" value="qwenHalfBTopo.json">
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Model Size Parameter:</label>
            <input type="text" id="exec-size-input" class="form-control code-font text-xs" value="0.5B">
          </div>
        </div>

        <div class="form-group mb-0 mt-2">
          <label class="text-xs font-semibold color-accent">Live Exec Command Preview:</label>
          <div class="deploy-log-box mt-1 code-font text-xs color-cyan" id="exec-cmd-preview" style="background:#090d13; padding:8px; border-radius:6px;">
            java -Xms8g -Xmx24g -jar lambdaTest-1.0-SNAPSHOT.jar ${primaryIp} qwenHalfBTopo.json 0.5B
          </div>
        </div>
      </div>

      <div id="deploy-live-log" class="deploy-log-box" style="display: none;">
        <!-- Live transfer output -->
      </div>
    `;

    backdrop.style.display = 'flex';

    // Download Deployment Package for Windows Manual Setup
    const btnDownloadPkg = document.getElementById('btn-download-deploy-pkg');
    if (btnDownloadPkg) {
      btnDownloadPkg.addEventListener('click', () => {
        const topoJsonStr = generateTopologyJSON(this.vertices);
        downloadJSON(topoJsonStr, 'qwenHalfBTopo.json');
        this.showCustomToast("Downloaded qwenHalfBTopo.json! Copy lambdaTest-1.0-SNAPSHOT.jar & weights_csv/ to target folder.", "success");
      });
    }

    // Live update Exec Command Preview
    const updateExecPreview = () => {
      const jar = (document.getElementById('exec-jar-input')?.value || 'lambdaTest-1.0-SNAPSHOT.jar').trim();
      const topo = (document.getElementById('exec-topo-input')?.value || 'qwenHalfBTopo.json').trim();
      const xms = (document.getElementById('exec-xms-input')?.value || '8g').trim();
      const xmx = (document.getElementById('exec-xmx-input')?.value || '24g').trim();
      const size = (document.getElementById('exec-size-input')?.value || '0.5B').trim();
      const primaryIp = (document.getElementById('exec-ip-input')?.value || uniqueIps[0] || '192.168.0.60').trim();

      const execPreview = document.getElementById('exec-cmd-preview');
      if (execPreview) {
        execPreview.textContent = `java -Xms${xms} -Xmx${xmx} -jar ${jar} ${primaryIp} ${topo} ${size ? size : ''}`;
      }
    };

    ['exec-xms-input', 'exec-xmx-input', 'exec-jar-input', 'exec-ip-input', 'exec-topo-input', 'exec-size-input'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateExecPreview);
    });

    // Populate & Bind 292 Weights Checklist from MongoDB
    const loadWeightsChecklist = async () => {
      const checklistContainer = document.getElementById('weights-checklist-container');
      const badge = document.getElementById('weights-counter-badge');
      const filterInput = document.getElementById('weights-filter-input');
      const btnSelectAll = document.getElementById('btn-weights-select-all');
      const btnClearAll = document.getElementById('btn-weights-clear-all');

      try {
        const weightsData = await getWeightsAPI();
        const weightsList = Array.isArray(weightsData) ? weightsData : (weightsData.weights || []);

        if (badge) badge.textContent = `${weightsList.length} Weights Selected`;

        if (checklistContainer) {
          checklistContainer.innerHTML = weightsList.map(w => `
            <label class="weight-check-item text-xs flex-row gap-1" data-name="${w.weightName.toLowerCase()}" style="display:flex; align-items:center; color: #38bdf8;">
              <input type="checkbox" class="weight-checkbox" value="${w.weightName}" checked style="accent-color: var(--accent-blue);">
              <span class="code-font text-ellipsis font-semibold" style="color: #e2e8f0;" title="${w.s3Url || w.weightName}">${w.weightName}</span>
              <a href="${w.s3Url || '#'}" target="_blank" class="text-xs" style="font-size:0.65rem; color:var(--accent-cyan); text-decoration:underline;" title="View AWS S3 Bucket URL">☁️ S3 Link</a>
            </label>
          `).join('');
        }

        // Live Weights Search Filter
        if (filterInput && checklistContainer) {
          filterInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = checklistContainer.querySelectorAll('.weight-check-item');
            let visibleCount = 0;
            items.forEach(item => {
              const name = item.dataset.name || '';
              if (!query || name.includes(query)) {
                item.style.display = 'flex';
                visibleCount++;
              } else {
                item.style.display = 'none';
              }
            });
            if (badge) badge.textContent = `${visibleCount} / ${weightsList.length} Filtered`;
          });
        }

        // Select All / Clear All
        if (btnSelectAll && checklistContainer) {
          btnSelectAll.addEventListener('click', () => {
            const checkboxes = checklistContainer.querySelectorAll('.weight-checkbox');
            checkboxes.forEach(cb => cb.checked = true);
            if (badge) badge.textContent = `${checkboxes.length} Weights Selected`;
          });
        }
        if (btnClearAll && checklistContainer) {
          btnClearAll.addEventListener('click', () => {
            const checkboxes = checklistContainer.querySelectorAll('.weight-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
            if (badge) badge.textContent = `0 Weights Selected`;
          });
        }
      } catch (err) {
        if (checklistContainer) {
          checklistContainer.innerHTML = `<div class="text-xs color-rose">Failed to load weights: ${err.message}</div>`;
        }
      }
    };

    loadWeightsChecklist();

    // Reset button to Stage 1
    confirmBtn.disabled = false;
    confirmBtn.className = "btn btn-primary";
    confirmBtn.textContent = "📤 Step 1: Upload JARs & Topo to Servers";

    let stage1Completed = false;

    confirmBtn.onclick = async () => {
      const xms = (document.getElementById('exec-xms-input')?.value || '8g').trim();
      const xmx = (document.getElementById('exec-xmx-input')?.value || '24g').trim();
      const jarName = (document.getElementById('exec-jar-input')?.value || 'lambdaTest-1.0-SNAPSHOT.jar').trim();
      const serverIp = (document.getElementById('exec-ip-input')?.value || primaryIp).trim();
      const topoJson = (document.getElementById('exec-topo-input')?.value || 'qwenHalfBTopo.json').trim();
      const modelSize = (document.getElementById('exec-size-input')?.value || '0.5B').trim();

      const progressLabel = document.getElementById('deploy-progress-label');
      const progressPct = document.getElementById('deploy-progress-pct');
      const progressFill = document.getElementById('deploy-progress-fill');
      const logBox = document.getElementById('deploy-live-log');

      // STAGE 1: UPLOAD JARS, TOPO & WEIGHTS TO SERVERS
      if (!stage1Completed) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Writing & Copying Files to Disk...";

        logBox.style.display = 'block';
        logBox.innerHTML = `<div class="text-xs color-amber">[1/4] Preparing Disk Copy Pipeline Across Server Nodes...</div>`;
        if (progressFill) progressFill.style.width = '25%';
        if (progressPct) progressPct.textContent = '25%';

        try {
          // Collect checked weights
          const checklistContainer = document.getElementById('weights-checklist-container');
          const selectedWeights = [];
          if (checklistContainer) {
            checklistContainer.querySelectorAll('.weight-checkbox:checked').forEach(cb => {
              selectedWeights.push(cb.value);
            });
          }

          // Get target server IP, SSH user, and destination folder from first target server card
          const firstCard = modalBody.querySelector('.deploy-server-card');
          const targetServerIp = firstCard ? (firstCard.dataset.ip || serverIp) : serverIp;
          const sshUser = firstCard ? (firstCard.querySelector('.srv-ssh-user')?.value || '').trim() : '';
          const firstCardDest = firstCard ? (firstCard.querySelector('.srv-dest-path')?.value || 'C:/JAVAJAR/').trim() : 'C:/JAVAJAR/';

          logBox.innerHTML += `<div class="text-xs color-cyan code-font mt-1">[2/4] Target Server IP: <code>${targetServerIp}</code> ➔ Copying ${topoJson} &amp; ${jarName} to: <code>${firstCardDest}</code></div>`;
          if (progressLabel) progressLabel.textContent = "Status: Transferring JAR & Selected CSV Weights to Target Server";
          if (progressFill) progressFill.style.width = '65%';
          if (progressPct) progressPct.textContent = '65%';

          // Perform real Stage 1 disk copy API call
          const copyRes = await copyStage1API({
            destDirectory: firstCardDest,
            targetServerIp,
            sshUser,
            selectedWeights,
            topoJsonName: topoJson,
            jarName: jarName
          });

          if (progressLabel) progressLabel.textContent = "Status: Verification Complete";
          if (progressFill) progressFill.style.width = '100%';
          if (progressPct) progressPct.textContent = '100%';

          if (copyRes.networkError) {
            logBox.innerHTML += `<div class="text-xs color-amber font-bold mt-1">⚠️ Remote Direct Path Notice: ${copyRes.networkError}</div>`;
            logBox.innerHTML += `<div class="text-xs color-cyan code-font mt-1">📋 Generated Live SCP Transfer Command:</div>`;
            logBox.innerHTML += `<div class="code-font text-xs p-2 mt-1 mb-1" style="background:#0a0e17; border: 1px solid var(--accent-amber); border-radius:4px; color:#38bdf8;">${copyRes.scpPreview}</div>`;
          } else {
            logBox.innerHTML += `<div class="text-xs color-emerald font-bold mt-1">[3/4] ✅ Real Disk Copy Complete!</div>`;
          }

          if (copyRes.s3TransferCommand) {
            logBox.innerHTML += `<div class="text-xs color-purple code-font mt-1">☁️ AWS S3 Bucket URI: <code>${copyRes.s3BucketUri || 's3://asymptotic-model-weights/weights_csv/'}</code></div>`;
            logBox.innerHTML += `<div class="text-xs color-purple code-font">☁️ AWS S3 High-Speed Direct Sync Command:</div>`;
            logBox.innerHTML += `<div class="code-font text-xs p-2 mt-1 mb-1" style="background:#0c0a1a; border: 1px solid var(--accent-purple); border-radius:4px; color:#c084fc;">${copyRes.s3TransferCommand}</div>`;
          }

          logBox.innerHTML += `<div class="text-xs code-font text-muted">  • Destination Directory: <code>${copyRes.targetDirectory}</code></div>`;
          logBox.innerHTML += `<div class="text-xs code-font text-muted">  • Files Written: <code>${copyRes.copiedFiles.join(', ')}</code></div>`;
          logBox.innerHTML += `<div class="text-xs code-font text-muted">  • Weight CSV Files Copied: <strong>${copyRes.weightsCopiedCount} CSV files</strong> inside <code>weights_csv/</code></div>`;

          stage1Completed = true;
          confirmBtn.disabled = false;
          confirmBtn.className = "btn btn-emerald font-bold";
          confirmBtn.textContent = "🚀 Step 2: Execute Java Runtime Across All Servers";
          this.showCustomToast(copyRes.networkError ? "Stage 1 Topology Prepared! Check Log for SCP Command." : `Stage 1 Copy Complete! ${copyRes.weightsCopiedCount} weights written`, "info");
        } catch (err) {
          logBox.innerHTML += `<div class="text-xs color-rose font-bold mt-1">Upload Error: ${err.message}</div>`;
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Retry Stage 1 Upload";
        }
        return;
      }

      // STAGE 2: EXECUTE JAVA RUNTIME ACROSS ALL SERVERS
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Launching Remote Execution...";

      try {
        const firstCardDest = modalBody.querySelector('.srv-dest-path')?.value || 'C:/JAVAJAR/';
        const execRes = await executeDeploymentAPI({
          xms,
          xmx,
          jarName,
          serverIp,
          topoJson,
          modelSize,
          destDirectory: firstCardDest
        });

        logBox.innerHTML += `
          <div class="text-xs color-emerald font-bold mt-2">[4/4] Process Execution Invoked!</div>
          <div class="text-xs color-cyan code-font mt-1">Command: ${execRes.executionCommand}</div>
          <div class="text-xs code-font text-muted mt-1">Working Dir: <code>${execRes.workingDirectory}</code></div>
        `;

        confirmBtn.textContent = "Execution Finished!";
        this.showCustomToast("Java CLI Process Execution Completed!", "success");

        // Automatically open live terminal log monitor with real execution logs
        setTimeout(() => {
          backdrop.style.display = 'none';
          this.openTerminalModal(execRes.logs || []);
        }, 800);
      } catch (err) {
        logBox.innerHTML += `<div class="text-xs color-rose font-bold mt-1">Execution Error: ${err.message}</div>`;
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Retry Execution";
        this.showCustomToast("Error: " + err.message, "error");
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

    // View Switcher Segmented Control
    const tabGraphBtn = document.getElementById('tab-btn-graph');
    const tabServersBtn = document.getElementById('tab-btn-servers');
    const viewGraphEl = document.getElementById('view-graph-studio');
    const viewClusterEl = document.getElementById('view-cluster-overview');

    if (tabGraphBtn && tabServersBtn) {
      tabGraphBtn.addEventListener('click', () => {
        tabGraphBtn.classList.add('active');
        tabServersBtn.classList.remove('active');
        if (viewGraphEl) viewGraphEl.style.display = 'flex';
        if (viewClusterEl) viewClusterEl.style.display = 'none';
        if (this.clusterDashboard) this.clusterDashboard.stopPolling();
      });

      tabServersBtn.addEventListener('click', () => {
        tabServersBtn.classList.add('active');
        tabGraphBtn.classList.remove('active');
        if (viewGraphEl) viewGraphEl.style.display = 'none';
        if (viewClusterEl) viewClusterEl.style.display = 'block';
        if (this.clusterDashboard) this.clusterDashboard.startPolling();
      });
    }

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

    // Expandable & Resizable Live JSON & Terminal Drawer
    const jsonDrawer = document.getElementById('json-drawer');
    const toggleBtn = document.getElementById('btn-toggle-json');
    const closeBtn = document.getElementById('btn-close-json-drawer');
    const expandBtn = document.getElementById('btn-expand-json');
    const drawerHeader = document.getElementById('json-drawer-header');

    const tabJsonBtn = document.getElementById('tab-drawer-json');
    const tabTerminalBtn = document.getElementById('tab-drawer-terminal');
    const bodyJson = document.getElementById('drawer-body-json');
    const bodyTerminal = document.getElementById('drawer-body-terminal');

    const switchDrawerTab = (tab) => {
      if (tab === 'json') {
        if (tabJsonBtn) tabJsonBtn.classList.add('active');
        if (tabTerminalBtn) tabTerminalBtn.classList.remove('active');
        if (bodyJson) bodyJson.style.display = 'block';
        if (bodyTerminal) bodyTerminal.style.display = 'none';
      } else {
        if (tabTerminalBtn) tabTerminalBtn.classList.add('active');
        if (tabJsonBtn) tabJsonBtn.classList.remove('active');
        if (bodyTerminal) bodyTerminal.style.display = 'block';
        if (bodyJson) bodyJson.style.display = 'none';
      }
    };

    if (tabJsonBtn) tabJsonBtn.addEventListener('click', () => switchDrawerTab('json'));
    if (tabTerminalBtn) tabTerminalBtn.addEventListener('click', () => switchDrawerTab('terminal'));

    const toggleDrawer = () => jsonDrawer.classList.toggle('open');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleDrawer);
    if (closeBtn) closeBtn.addEventListener('click', () => jsonDrawer.classList.remove('open'));

    let drawerMode = 0;
    if (expandBtn) {
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
    }

    let isResizingDrawer = false;
    let resizeStartY = 0;
    let initialHeight = 260;

    if (drawerHeader) {
      drawerHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        isResizingDrawer = true;
        resizeStartY = e.clientY;
        initialHeight = jsonDrawer.getBoundingClientRect().height;
      });
    }

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

    const copyJsonBtn = document.getElementById('btn-copy-json');
    if (copyJsonBtn) {
      copyJsonBtn.addEventListener('click', () => {
        const jsonStr = generateTopologyJSON(this.vertices);
        navigator.clipboard.writeText(jsonStr).then(() => {
          this.showCustomToast("JSON copied to clipboard!", "success");
        });
      });
    }

    const openTermBtn = document.getElementById('btn-open-terminal');
    if (openTermBtn) {
      openTermBtn.addEventListener('click', () => this.openTerminalModal());
    }
  }

  /**
   * Opens the Multi-Server Live Terminal & Execution Log Monitor inside the Bottom Drawer.
   * @param {Array<string>} initialLogs Real process execution stdout/stderr lines.
   */
  async openTerminalModal(initialLogs = null) {
    const jsonDrawer = document.getElementById('json-drawer');
    const tabTerminalBtn = document.getElementById('tab-drawer-terminal');
    const tabJsonBtn = document.getElementById('tab-drawer-json');
    const bodyJson = document.getElementById('drawer-body-json');
    const bodyTerminal = document.getElementById('drawer-body-terminal');
    const termOutput = document.getElementById('terminal-output-view');
    const clearBtn = document.getElementById('btn-terminal-clear');
    const autoscrollBtn = document.getElementById('btn-terminal-autoscroll');

    if (!jsonDrawer || !termOutput) return;

    // Open Drawer and activate Terminal tab
    jsonDrawer.classList.add('open');
    if (tabTerminalBtn) tabTerminalBtn.classList.add('active');
    if (tabJsonBtn) tabJsonBtn.classList.remove('active');
    if (bodyTerminal) bodyTerminal.style.display = 'block';
    if (bodyJson) bodyJson.style.display = 'none';

    let autoScroll = true;

    const appendLogLine = (ip, vertexId, level, msg) => {
      const time = new Date().toLocaleTimeString();
      let color = '#a9b7c6';
      if (level === 'EXEC' || level === 'STDOUT') color = '#2088ff';
      if (level === 'WARN') color = '#cca700';
      if (level === 'ERROR' || level === 'STDERR') color = '#f85149';

      const lineHtml = `<div class="term-line mb-1" data-ip="${ip}"><span style="color:#6e7681;">[${time}]</span> <span style="color:#2088ff; font-weight:bold;">[${ip}]</span> <span style="color:var(--accent-amber);">[${vertexId}]</span> <span style="color:${color};">${msg}</span></div>`;
      termOutput.insertAdjacentHTML('beforeend', lineHtml);

      if (autoScroll) {
        termOutput.scrollTop = termOutput.scrollHeight;
      }
    };

    termOutput.innerHTML = ''; // Clear terminal output

    if (Array.isArray(initialLogs) && initialLogs.length > 0) {
      initialLogs.forEach(rawLine => {
        appendLogLine('192.168.0.60', 'SYSTEM', rawLine.includes('ERROR') ? 'ERROR' : 'EXEC', rawLine);
      });
    } else {
      try {
        const res = await fetch('/api/SYSTEM/logs');
        if (res.ok) {
          const data = await res.json();
          if (data.logs && data.logs.length > 0) {
            data.logs.forEach(msg => appendLogLine('192.168.0.60', 'SYSTEM', 'INFO', msg));
          } else {
            appendLogLine('192.168.0.60', 'SYSTEM', 'INFO', 'No execution logs recorded yet in database.');
          }
        }
      } catch (e) {
        appendLogLine('192.168.0.60', 'SYSTEM', 'INFO', 'Awaiting process execution logs...');
      }
    }

    if (closeBtn) closeBtn.onclick = () => backdrop.style.display = 'none';
    if (cancelBtn) cancelBtn.onclick = () => backdrop.style.display = 'none';

    if (clearBtn) {
      clearBtn.onclick = () => {
        termOutput.innerHTML = `<div style="color: #629755;">// Terminal cleared. Streaming live logs...</div>`;
      };
    }

    if (autoscrollBtn) {
      autoscrollBtn.onclick = () => {
        autoScroll = !autoScroll;
        autoscrollBtn.textContent = autoScroll ? '📜 Auto-Scroll: ON' : '📜 Auto-Scroll: OFF';
      };
    }

    if (serverSelect) {
      serverSelect.onchange = () => {
        const selIp = serverSelect.value;
        const lines = termOutput.querySelectorAll('.term-line');
        lines.forEach(line => {
          if (selIp === 'ALL' || line.dataset.ip === selIp) {
            line.style.display = 'block';
          } else {
            line.style.display = 'none';
          }
        });
      };
    }

    if (searchInput) {
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();
        const lines = termOutput.querySelectorAll('.term-line');
        lines.forEach(line => {
          if (!q || line.textContent.toLowerCase().includes(q)) {
            line.style.display = 'block';
          } else {
            line.style.display = 'none';
          }
        });
      };
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
