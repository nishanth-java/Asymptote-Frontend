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
  createVertexDefinitionAPI,
  checkAPIHealth,
  copyStage1API,
  getHostsAPI,
  registerHostAPI,
  deleteHostAPI,
  getModelTensorsAPI,
  uploadModelTensorAPI,
  deployGraphAPI
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
    this.currentGraphId = null;

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
    
    toast.innerHTML = `<span>${message}</span>`;
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

      // Ctrl + S (Cmd + S): Save Graph Topology to MongoDB
      if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.saveCurrentGraph();
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
    if (iconEl) {
      iconEl.textContent = '';
    }

    const textEl = document.getElementById('theme-toggle-text');
    if (textEl) {
      textEl.textContent = theme === 'light' ? 'Dark' : 'Light';
    }

    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    }
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(nextTheme);
    this.showCustomToast(`Theme switched to ${nextTheme.toUpperCase()} mode`, "info");
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
    this.updateLiveJSON();
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
     * Only displays vertices when searched or filtered.
     */
    const renderPalette = async (query = '') => {
      const q = query.trim();

      if (!q && activeCat === 'all') {
        paletteEl.innerHTML = `
          <div class="sidebar-empty-state" style="padding: 28px 14px; text-align: center;">
            <div class="text-xs text-muted" style="line-height: 1.6;">
              Type in the search box above to search vertex components (e.g. <code>Embedding</code>, <code>RMS</code>, <code>Q</code>, <code>K</code>, <code>V</code>).
            </div>
          </div>`;
        return;
      }

      // Only re-fetch if catalog is empty
      if (fullCatalog.length === 0) {
        fullCatalog = await getVerticesCatalogAPI('');
      }

      let filtered = fullCatalog;

      // Apply category filter
      if (activeCat !== 'all') {
        filtered = filtered.filter(item =>
          item.category && item.category.toLowerCase().includes(activeCat.toLowerCase())
        );
      }

      // Apply search filter locally
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

    // Initial render: show empty prompt until user searches
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
  }

  async resolveModelTensorId() {
    if (this.selectedModelTensorId) return this.selectedModelTensorId;
    try {
      const tensors = await getModelTensorsAPI();
      if (tensors && tensors.length > 0) {
        this.selectedModelTensorId = tensors[0].id;
        return tensors[0].id;
      }
    } catch (e) {
      console.warn("Failed to auto-resolve model tensor ID:", e.message);
    }
    return null;
  }

  async saveCurrentGraph() {
    if (!this.vertices || this.vertices.length === 0) {
      this.showCustomToast("Cannot save empty graph. Add vertices first.", "error");
      return;
    }
    try {
      this.showCustomToast("Saving graph & extracting weights... This may take 30–90s for large models.", "info");
      const modelTensorId = await this.resolveModelTensorId();
      const res = await saveTopologyAPI(this.vertices, this.groups, this.positions, "LLM Cluster Topology", modelTensorId, this.currentGraphId);
      if (res && res.graphId) this.currentGraphId = res.graphId;
      const graphId = res.graphId || "GRP-SAVED";
      const version = res.version || 1;
      this.showCustomToast(`Graph saved! ID: ${graphId} (v${version})`, "success");
    } catch (err) {
      this.showCustomToast("Save graph failed: " + err.message, "error");
    }
  }

  /**
   * Opens the Cluster Deployment Modal (`/api/deployments`)
   */
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
    if (!backdrop || !modalBody || !confirmBtn) return;

    const uniqueIps = Array.from(new Set(this.vertices.map(v => v.host || '192.168.0.83')));

    modalBody.innerHTML = `
      <div class="deploy-summary-box mb-3">
        <div class="flex-between">
          <span class="text-sm font-semibold">Spring Boot Cluster Deployment Pipeline:</span>
          <span class="badge badge-emerald">${this.vertices.length} Vertices • ${uniqueIps.length} Target Servers</span>
        </div>
        <p class="text-xs text-muted mt-1">
          Saves the graph topology to MongoDB (<code>graphs</code> collection) and triggers SSH staging + remote execution across all target nodes.
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

      <!-- Target Servers Overview -->
      <div class="preview-box mb-3">
        <div class="preview-box-header color-accent flex-between">
          <span>Target Cluster Server Nodes</span>
          <span class="badge badge-purple">SSH / SFTP Remote Staging</span>
        </div>
        <div class="deploy-servers-container p-2">
          ${uniqueIps.map(ip => {
            const nodes = this.vertices.filter(v => (v.host || '192.168.0.83') === ip);
            return `
              <div class="deploy-server-card mb-2" data-ip="${ip}">
                <div class="flex-between mb-1">
                  <span class="font-bold text-sm">Linux Host IP: <code>${ip}</code></span>
                  <span class="badge badge-blue">${nodes.length} Vertices Assigned (${nodes.map(n => n.id).join(', ')})</span>
                </div>
                <div class="text-xs text-muted">Destination Path: <code>/opt/vertices/{vertexId}/</code></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Vertex Node & Execution JAR Registry -->
      <div class="preview-box mb-3">
        <div class="preview-box-header color-accent flex-between">
          <span>Vertex Node &amp; GridFS Execution JAR Association</span>
          <span class="badge badge-cyan">lambdaTest-1.0-SNAPSHOT.jar</span>
        </div>
        <div style="max-height: 160px; overflow-y: auto; background: #0b0f17; border-radius: 6px; padding: 8px;">
          <table class="table-compact text-xs code-font" style="width:100%;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">
                <th style="text-align:left; padding:4px;">Vertex ID</th>
                <th style="text-align:left; padding:4px;">VID</th>
                <th style="text-align:left; padding:4px;">Type</th>
                <th style="text-align:left; padding:4px;">Target Server Host</th>
                <th style="text-align:left; padding:4px;">Port</th>
              </tr>
            </thead>
            <tbody>
              ${this.vertices.map(v => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding:4px; font-weight:bold; color:var(--accent-amber);">${v.id}</td>
                  <td style="padding:4px; color:var(--accent-purple);">${v.vid || 'VTX-DEF'}</td>
                  <td style="padding:4px; color:var(--text-secondary);">${v.type}</td>
                  <td style="padding:4px; color:var(--accent-blue);">${v.host || '192.168.0.83'}</td>
                  <td style="padding:4px; color:var(--accent-cyan);">${v.port || 8090}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div id="deploy-live-log" class="deploy-log-box" style="display: none;">
        <!-- Live transfer output -->
      </div>
    `;

    backdrop.style.display = 'flex';

    confirmBtn.disabled = false;
    confirmBtn.className = "btn btn-sm btn-emerald font-bold";
    confirmBtn.textContent = "Launch Cluster Deployment";

    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deploying Cluster...";

      const progressLabel = document.getElementById('deploy-progress-label');
      const progressPct = document.getElementById('deploy-progress-pct');
      const progressFill = document.getElementById('deploy-progress-fill');
      const logBox = document.getElementById('deploy-live-log');

      if (logBox) {
        logBox.style.display = 'block';
        logBox.innerHTML = `
          <div class="p-2 mb-2" style="background: rgba(245,158,11,0.1); border-left: 3px solid var(--accent-amber); border-radius: 4px;">
            <div class="font-bold text-xs color-amber">[Stage 1/3] Saving Topology &amp; Slicing Weight CSVs</div>
            <div class="text-xs text-muted mt-1" id="deploy-weight-timer">⏳ Extracting safetensors weights into CSV files...</div>
          </div>
        `;
      }
      if (progressFill) progressFill.style.width = '15%';
      if (progressPct) progressPct.textContent = '15%';

      let stage1Pct = 15;
      const progressTimer = setInterval(() => {
        if (stage1Pct < 90) {
          stage1Pct += 3;
          if (progressFill) progressFill.style.width = `${stage1Pct}%`;
          if (progressPct) progressPct.textContent = `${stage1Pct}%`;
        }
        const timerEl = document.getElementById('deploy-weight-timer');
        if (timerEl) {
          const dots = '.'.repeat((Math.floor(stage1Pct / 10) % 3) + 1);
          timerEl.textContent = `⏳ Slicing weight float matrices from safetensors model${dots} (${stage1Pct}%)`;
        }
      }, 1000);

      try {
        // Step 1: Save graph via Spring Boot API (POST /api/graphs)
        const modelTensorId = await this.resolveModelTensorId();
        const saveRes = await saveTopologyAPI(this.vertices, this.groups, this.positions, "LLM Cluster Topology", modelTensorId, this.currentGraphId);
        clearInterval(progressTimer);

        if (saveRes && saveRes.graphId) this.currentGraphId = saveRes.graphId;
        const graphId = saveRes.graphId || this.currentGraphId || "GRP-0001";
        const version = saveRes.version || 1;

        if (progressFill) progressFill.style.width = '100%';
        if (progressPct) progressPct.textContent = '100%';

        if (logBox) {
          logBox.innerHTML += `
            <div class="p-2 mb-2" style="background: rgba(16,185,129,0.1); border-left: 3px solid var(--accent-emerald); border-radius: 4px;">
              <div class="font-bold text-xs color-emerald">✓ [Stage 1/3 Complete] Topology Saved (ID: ${graphId}, v${version}) &amp; Weight CSVs Generated</div>
            </div>
            <div class="p-2 mb-2" style="background: rgba(6,182,212,0.1); border-left: 3px solid var(--accent-cyan); border-radius: 4px;">
              <div class="font-bold text-xs color-cyan">[Stage 2/3] SCP Cluster Transfer</div>
              <div class="text-xs text-muted mt-1" id="scp-transfer-timer">⏳ Transferring JAR executable &amp; weight CSV files over SCP to target servers...</div>
            </div>
          `;
        }

        if (progressFill) progressFill.style.width = '20%';
        if (progressPct) progressPct.textContent = '20%';

        let stage2Pct = 20;
        const scpTimer = setInterval(() => {
          if (stage2Pct < 90) {
            stage2Pct += 4;
            if (progressFill) progressFill.style.width = `${stage2Pct}%`;
            if (progressPct) progressPct.textContent = `${stage2Pct}%`;
          }
          const timerEl = document.getElementById('scp-transfer-timer');
          if (timerEl) {
            const dots = '.'.repeat((Math.floor(stage2Pct / 10) % 3) + 1);
            timerEl.textContent = `⏳ SCP Uploading binaries to /home/kai/qwenf5/asymptote/${dots} (${stage2Pct}%)`;
          }
        }, 1000);

        // Step 2: Trigger cluster deployment over SSH (POST /api/deployments)
        const deployRes = await deployGraphAPI(graphId, version);
        clearInterval(scpTimer);

        if (progressFill) progressFill.style.width = '100%';
        if (progressPct) progressPct.textContent = '100%';
        if (progressLabel) progressLabel.textContent = `Status: ${deployRes.status || 'RUNNING'}`;

        const isSuccess = deployRes.status === 'RUNNING';
        const statusBadgeClass = isSuccess ? 'badge-emerald' : 'badge-rose';

        if (logBox) {
          logBox.innerHTML += `
            <div class="p-2 mb-2" style="background: ${isSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)'}; border-left: 3px solid ${isSuccess ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; border-radius: 4px;">
              <div class="font-bold text-xs flex-between">
                <span>[Stage 3/3] Cluster Deployment Summary</span>
                <span class="badge ${statusBadgeClass}">${deployRes.status || 'FINISHED'}</span>
              </div>
            </div>
          `;

          if (Array.isArray(deployRes.vertices)) {
            deployRes.vertices.forEach(v => {
              const vSuccess = v.state === 'RUNNING' || v.state === 'STAGED';
              const stateBadge = vSuccess ? 'badge-emerald' : 'badge-rose';
              const remoteLogPath = `/home/kai/qwenf5/asymptote/${v.vertexId}/out.log`;
              
              logBox.innerHTML += `
                <div class="p-2 mb-2" style="background: #0d131f; border: 1px solid var(--panel-border); border-radius: 6px;">
                  <div class="flex-between">
                    <span class="font-bold text-xs color-cyan">${v.vertexId} (${v.vid || 'Vertex'})</span>
                    <span class="badge ${stateBadge}">${v.state}</span>
                  </div>
                  <div class="text-xs text-muted mt-1">Target Host: <code>${v.host}:${v.port}</code> ${v.pid ? `| PID: <b class="color-amber">${v.pid}</b>` : ''}</div>
                  <div class="text-xs text-muted mt-1">Remote Log: <code>${remoteLogPath}</code></div>
                  ${v.message ? `<div class="text-xs ${vSuccess ? 'color-emerald' : 'color-rose'} mt-1 font-mono" style="word-break: break-all;">Diagnostic: ${v.message}</div>` : ''}
                </div>
              `;
            });
          }
        }

        this.currentDeploymentId = deployRes.deploymentId || this.currentDeploymentId;

        const stopBtn = document.getElementById('btn-stop-deploy');
        const headerStopBtn = document.getElementById('btn-terminate-cluster');
        if (stopBtn) {
          stopBtn.style.display = 'inline-block';
          stopBtn.onclick = () => this.terminateCurrentDeployment();
        }
        if (headerStopBtn) {
          headerStopBtn.style.display = 'inline-flex';
          headerStopBtn.onclick = () => this.terminateCurrentDeployment();
        }

        if (isSuccess) {
          this.showCustomToast(`Cluster Deployment RUNNING!`, "success");
          confirmBtn.textContent = "Deployment Finished";
        } else {
          this.showCustomToast(`Deployment finished with status: ${deployRes.status}`, "warning");
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Retry Deployment";
        }
      } catch (err) {
        clearInterval(progressTimer);
        if (typeof scpTimer !== 'undefined') clearInterval(scpTimer);
        if (logBox) {
          logBox.innerHTML += `
            <div class="p-2 mb-2" style="background: rgba(244,63,94,0.15); border-left: 3px solid var(--accent-rose); border-radius: 4px;">
              <div class="font-bold text-xs color-rose">[ERROR] Cluster Deployment Failed</div>
              <div class="text-xs text-muted mt-1 font-mono color-rose" style="word-break: break-all;">${err.message}</div>
            </div>
          `;
        }
        if (progressLabel) progressLabel.textContent = "Status: Failed";
        this.showCustomToast("Deployment failed: " + err.message, "error");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Retry Deployment";
      }
    };
  }

  async terminateCurrentDeployment() {
    if (!this.currentDeploymentId) {
      this.showCustomToast("No active deployment to terminate.", "warning");
      return;
    }

    const stopBtn = document.getElementById('btn-stop-deploy');
    const headerStopBtn = document.getElementById('btn-terminate-cluster');
    if (stopBtn) {
      stopBtn.disabled = true;
      stopBtn.textContent = "Terminating...";
    }
    if (headerStopBtn) {
      headerStopBtn.disabled = true;
      headerStopBtn.textContent = "Terminating...";
    }

    try {
      this.showCustomToast("Sending SSH kill signals to cluster vertices...", "info");
      const res = await stopDeploymentAPI(this.currentDeploymentId);
      
      this.showCustomToast("Cluster deployment stopped! All processes killed.", "success");
      
      if (stopBtn) {
        stopBtn.style.display = 'none';
        stopBtn.disabled = false;
        stopBtn.textContent = "🛑 Terminate Cluster Processes";
      }
      if (headerStopBtn) {
        headerStopBtn.style.display = 'none';
        headerStopBtn.disabled = false;
        headerStopBtn.textContent = "Stop Cluster";
      }

      const progressLabel = document.getElementById('deploy-progress-label');
      if (progressLabel) progressLabel.textContent = "Status: STOPPED";

      const logBox = document.getElementById('deploy-live-log');
      if (logBox) {
        logBox.innerHTML += `
          <div class="p-2 mb-2" style="background: rgba(244,63,94,0.1); border-left: 3px solid var(--accent-rose); border-radius: 4px;">
            <div class="font-bold text-xs color-rose">🛑 [TERMINATED] All Remote Vertex Processes Stopped</div>
            <div class="text-xs text-muted mt-1">Deployment ID: <code>${this.currentDeploymentId}</code> | Status: <b>STOPPED</b></div>
          </div>
        `;
      }
    } catch (err) {
      this.showCustomToast("Terminate cluster failed: " + err.message, "error");
      if (stopBtn) {
        stopBtn.disabled = false;
        stopBtn.textContent = "🛑 Terminate Cluster Processes";
      }
      if (headerStopBtn) {
        headerStopBtn.disabled = false;
        headerStopBtn.textContent = "Stop Cluster";
      }
    }
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

  async openHostsModal() {
    const backdrop = document.getElementById('hosts-modal-backdrop');
    const container = document.getElementById('hosts-list-container');
    if (!backdrop || !container) return;

    backdrop.style.display = 'flex';
    container.innerHTML = `<span class="text-muted text-xs">Fetching registered hosts from Spring Boot DB...</span>`;

    try {
      const hosts = await getHostsAPI();
      if (!Array.isArray(hosts) || hosts.length === 0) {
        container.innerHTML = `<div class="text-xs text-muted">No hosts registered yet. Fill out the form above to add SSH host credentials.</div>`;
        return;
      }

      container.innerHTML = hosts.map(h => `
        <div class="flex-between p-2 mb-1" style="background:var(--input-bg); border-radius:6px; border:1px solid var(--panel-border);">
          <div>
            <div class="font-bold text-sm color-cyan">${h.ip} ${h.hostname ? '(' + h.hostname + ')' : ''}</div>
            <div class="text-xs text-muted">SSH User: <code>${h.username || h.sshUser || 'root'}</code> | Port: <code>${h.sshPort || 22}</code></div>
          </div>
          <button class="btn btn-xs btn-danger-icon btn-del-host" data-ip="${h.ip}">Delete</button>
        </div>
      `).join('');

      container.querySelectorAll('.btn-del-host').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const ip = e.target.getAttribute('data-ip');
          const confirmed = await this.showCustomConfirm("Delete Host", `Are you sure you want to delete SSH credentials for host ${ip}?`);
          if (confirmed) {
            await deleteHostAPI(ip);
            this.showCustomToast(`Deleted host ${ip}`, "info");
            this.openHostsModal();
          }
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="text-xs color-rose">Failed to load hosts: ${err.message}</div>`;
    }
  }

  async openTensorsModal() {
    const backdrop = document.getElementById('tensors-modal-backdrop');
    const container = document.getElementById('tensors-list-container');
    if (!backdrop || !container) return;

    backdrop.style.display = 'flex';
    container.innerHTML = `<span class="text-muted text-xs">Fetching indexed model tensors from GridFS...</span>`;

    try {
      const tensors = await getModelTensorsAPI();
      if (!Array.isArray(tensors) || tensors.length === 0) {
        container.innerHTML = `<div class="text-xs text-muted">No model tensors uploaded yet. Select a .safetensors file above to index.</div>`;
        return;
      }

      container.innerHTML = tensors.map(t => `
        <div class="p-2 mb-1" style="background:var(--input-bg); border-radius:6px; border:1px solid var(--panel-border);">
          <div class="flex-between">
            <span class="font-bold text-sm color-emerald">${t.name}</span>
            <span class="badge badge-purple">${t.tensorCount || (t.tensorIndex ? Object.keys(t.tensorIndex).length : 0)} Projections</span>
          </div>
          <div class="text-xs text-muted mt-1">Uploaded: <code>${t.uploadedAt ? new Date(t.uploadedAt).toLocaleString() : 'N/A'}</code></div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div class="text-xs color-rose">Failed to load model tensors: ${err.message}</div>`;
    }
  }

  async openVertexDefsModal() {
    const backdrop = document.getElementById('vertex-defs-modal-backdrop');
    const container = document.getElementById('vertex-defs-list-container');
    if (!backdrop || !container) return;

    backdrop.style.display = 'flex';
    container.innerHTML = `<span class="text-muted text-xs">Fetching registered vertex definitions from MongoDB...</span>`;

    try {
      const defs = await getVertexJarsAPI();
      if (!Array.isArray(defs) || defs.length === 0) {
        container.innerHTML = `<div class="text-xs text-muted">No vertex definitions uploaded yet. Select a JAR file above to register.</div>`;
        return;
      }

      container.innerHTML = defs.map(d => `
        <div class="p-2 mb-1" style="background:var(--input-bg); border-radius:6px; border:1px solid var(--panel-border);">
          <div class="flex-between">
            <span class="font-bold text-sm color-purple">${d.name} <code>(${d.vid || 'VTX-DEF'})</code></span>
            <span class="badge badge-blue">v${d.version || 1} • ${d.jarFileName || 'JAR'}</span>
          </div>
          <div class="text-xs text-muted mt-1">${d.description || 'Spring Boot Executable Vertex Module'}</div>
          <div class="text-xs text-muted mt-1 font-mono">Checksum: <code>${d.jarChecksum ? d.jarChecksum.substring(0, 20) + '...' : 'N/A'}</code></div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div class="text-xs color-rose">Failed to load vertex definitions: ${err.message}</div>`;
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

    // Vertex Registry Modal Binding
    const vdefBtn = document.getElementById('btn-vertex-defs-modal');
    if (vdefBtn) vdefBtn.addEventListener('click', () => this.openVertexDefsModal());

    const closeVdefBtn = document.getElementById('btn-close-vertex-defs-modal');
    const vdefBackdrop = document.getElementById('vertex-defs-modal-backdrop');
    if (closeVdefBtn) closeVdefBtn.addEventListener('click', () => vdefBackdrop.style.display = 'none');

    const formVdef = document.getElementById('form-create-vertex-def');
    if (formVdef) {
      formVdef.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('vdef-name-input')?.value.trim();
        const description = document.getElementById('vdef-desc-input')?.value.trim();
        const jarFile = document.getElementById('vdef-jar-input')?.files[0];
        const requiresWeights = document.getElementById('vdef-weights-input')?.checked ?? true;

        if (!jarFile) {
          this.showCustomToast("Please select a .jar file to upload", "error");
          return;
        }

        try {
          this.showCustomToast("Uploading JAR to GridFS...", "info");
          await createVertexDefinitionAPI({ name, description, requiresWeights }, jarFile);
          this.showCustomToast(`Registered vertex definition '${name}'!`, "success");
          this.openVertexDefsModal();
        } catch (err) {
          this.showCustomToast("Failed to upload vertex JAR: " + err.message, "error");
        }
      });
    }

    const hostsBtn = document.getElementById('btn-hosts-modal');
    if (hostsBtn) hostsBtn.addEventListener('click', () => this.openHostsModal());

    const closeHostsBtn = document.getElementById('btn-close-hosts-modal');
    const hostsBackdrop = document.getElementById('hosts-modal-backdrop');
    if (closeHostsBtn) closeHostsBtn.addEventListener('click', () => hostsBackdrop.style.display = 'none');

    const formHost = document.getElementById('form-register-host');
    if (formHost) {
      formHost.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ip = document.getElementById('host-ip-input')?.value.trim();
        const sshUser = document.getElementById('host-user-input')?.value.trim();
        const sshPort = Number(document.getElementById('host-port-input')?.value) || 22;
        const pass = document.getElementById('host-pass-input')?.value.trim();
        try {
          await registerHostAPI({ ip, sshUser, sshPort, authType: 'PASSWORD', encryptedPassword: pass });
          this.showCustomToast(`Host ${ip} registered in Spring Boot DB!`, "success");
          this.openHostsModal();
        } catch (err) {
          this.showCustomToast("Host registration failed: " + err.message, "error");
        }
      });
    }

    const tensorsBtn = document.getElementById('btn-tensors-modal');
    if (tensorsBtn) tensorsBtn.addEventListener('click', () => this.openTensorsModal());

    const closeTensorsBtn = document.getElementById('btn-close-tensors-modal');
    const tensorsBackdrop = document.getElementById('tensors-modal-backdrop');
    if (closeTensorsBtn) closeTensorsBtn.addEventListener('click', () => tensorsBackdrop.style.display = 'none');

    const formTensor = document.getElementById('form-upload-tensor');
    if (formTensor) {
      formTensor.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('tensor-name-input')?.value.trim();
        const fileInput = document.getElementById('tensor-file-input');
        const file = fileInput?.files[0];
        if (!file) return;
        try {
          this.showCustomToast("Uploading .safetensors file to GridFS...", "info");
          await uploadModelTensorAPI(name, file);
          this.showCustomToast(`Uploaded ${name} to GridFS!`, "success");
          this.openTensorsModal();
        } catch (err) {
          this.showCustomToast("Tensor upload failed: " + err.message, "error");
        }
      });
    }

    const saveBtn = document.getElementById('btn-save-graph');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveCurrentGraph());
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

    const autoLayoutBtn = document.getElementById('btn-auto-layout');
    if (autoLayoutBtn) {
      autoLayoutBtn.addEventListener('click', () => this.runAutoLayout());
    }

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
