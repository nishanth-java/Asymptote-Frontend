// Production API Client Abstraction Layer
// Communicates with backend REST API endpoints (/api/*)
// Gracefully handles missing local mock fallback files if deleted by the user.

const API_BASE_URL = window.location.origin.includes('5173') 
  ? 'http://localhost:3000' 
  : window.location.origin;

// Helper to safely dynamically load mockFallbackData if available
async function loadMockFallback() {
  try {
    const mockModule = await import('./mockFallbackData.js');
    return mockModule;
  } catch (err) {
    // Single mock file was deleted by user or unavailable! Return null cleanly.
    return null;
  }
}

// 1. Fetch Presets List API
export async function getPresetsAPI(searchQuery = '') {
  try {
    const url = `${API_BASE_URL}/api/presets?q=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.presets || [];
  } catch (err) {
    console.warn("API /api/presets unavailable, trying local mock fallback...", err.message);
    const fallback = await loadMockFallback();
    if (fallback && fallback.FALLBACK_PRESETS) {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return fallback.FALLBACK_PRESETS;
      return fallback.FALLBACK_PRESETS.filter(p =>
        p.label.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }
    return [];
  }
}

// 2. Fetch Current Topology API
export async function getTopologyAPI() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/topology`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    if (data.vertices && data.vertices.length > 0) {
      return data;
    }
    throw new Error("Empty graph payload");
  } catch (err) {
    console.warn("API /api/topology unavailable or empty, trying local mock fallback...", err.message);
    const fallback = await loadMockFallback();
    if (fallback) {
      return {
        vertices: fallback.STARTER_VERTICES || [],
        groups: fallback.STARTER_GROUPS || [],
        positions: {}
      };
    }
    return { vertices: [], groups: [], positions: {} };
  }
}

// 3. Save Active Topology API
export async function saveTopologyAPI(vertices, groups, positions) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/topology`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertices, groups, positions })
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("API /api/topology save failed:", err.message);
    return { success: false, error: err.message };
  }
}

// 4. Compute Dynamic DAG Auto-Layout API
export async function computeAutoLayoutAPI(vertices, groups) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/topology/autolayout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertices, groups })
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.positions || {};
  } catch (err) {
    console.warn("API /api/topology/autolayout unavailable, computing locally...", err.message);
    const localLayoutModule = await import('./autoLayout.js');
    return localLayoutModule.computeAutoLayout(vertices, groups);
  }
}

// 5. Batch Slices Generator API
export async function generateBatchAPI(batchConfig) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/topology/batch-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchConfig)
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.vertices || [];
  } catch (err) {
    console.warn("API /api/topology/batch-generate failed:", err.message);
    return null;
  }
}

// 6. Import Topology JSON API
export async function importJSONAPI(jsonText) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/topology/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonText })
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.vertices || [];
  } catch (err) {
    console.warn("API /api/topology/import failed:", err.message);
    return null;
  }
}

// 7. Check API Health
export async function checkAPIHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch (e) {
    return false;
  }
}
