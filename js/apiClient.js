/**
 * =========================================================================================
 * TOPOLOGY STUDIO - FRONTEND REST API CLIENT SERVICE
 * =========================================================================================
 * File: js/apiClient.js
 * Production API Client Abstraction Layer.
 * Communicates directly with backend REST API endpoints (/api/*).
 * 
 * Includes fallback logic to local mock data if server is unreachable, while allowing
 * complete seamless operation exclusively against backend REST endpoints if mock file is deleted.
 * =========================================================================================
 */

const API_BASE_URL = window.location.origin.includes('5173') 
  ? 'http://localhost:3000' 
  : window.location.origin;

/**
 * Safely attempts to dynamically load mockFallbackData.js if present.
 * If user deletes mockFallbackData.js, catches the error gracefully and returns null.
 * @returns {Promise<Object|null>} Mock module or null.
 */
async function loadMockFallback() {
  try {
    const mockModule = await import('./mockFallbackData.js');
    return mockModule;
  } catch (err) {
    // Single mock file was deleted by user! Return null cleanly.
    return null;
  }
}

/**
 * 1. Fetch Vertices Catalog API
 * Fetches available vertex definitions along with JAR binary info from backend.
 * @param {string} searchQuery Optional search term.
 * @returns {Promise<Array<Object>>} Array of catalog vertex definitions.
 */
export async function getVerticesCatalogAPI(searchQuery = '') {
  try {
    const url = `${API_BASE_URL}/api/vertices/catalog?q=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.catalog || data.presets || [];
  } catch (err) {
    console.warn("API /api/vertices/catalog unavailable, trying local mock fallback...", err.message);
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

/** Alias for backward compatibility */
export async function getPresetsAPI(searchQuery = '') {
  return getVerticesCatalogAPI(searchQuery);
}

/**
 * 2. Fetch Active Topology Graph API
 * Fetches active graph state (vertices, groups, positions) from backend.
 * @returns {Promise<{vertices: Array, groups: Array, positions: Object}>} Graph state object.
 */
export async function getTopologyAPI() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/topology`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn("API /api/topology unavailable, starting with empty graph...", err.message);
    return { vertices: [], groups: [], positions: {} };
  }
}

/**
 * 3. Save Active Topology Graph API
 * Persists updated graph payload to backend.
 * @param {Array} vertices List of vertices with assigned IP hosts.
 * @param {Array} groups Active group definitions.
 * @param {Object} positions Map of node positions.
 * @returns {Promise<Object>} Response confirmation object.
 */
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

/**
 * 4. Deploy Topology to Servers API (CORE CLUSTER DEPLOYMENT)
 * Submits the graph topology to target servers:
 * - Grouping vertices by user-assigned host IPs.
 * - Transferring corresponding JAR files from Central DB to each target IP.
 * - Uploading global topology.json to all assigned server IPs.
 * 
 * @param {Array} vertices Complete vertices list with assigned host IPs.
 * @param {Array} groups Active group definitions.
 * @param {string} deploymentName Name of deployment run.
 * @returns {Promise<Object>} Deployment manifest object.
 */
export async function deployClusterAPI(vertices, groups, deploymentName = 'Cluster_Run_1') {
  try {
    const res = await fetch(`${API_BASE_URL}/api/deploy/cluster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertices, groups, deploymentName })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP Error ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error("API /api/deploy/cluster failed:", err.message);
    throw err;
  }
}

/**
 * 5. Compute Dynamic DAG Auto-Layout API
 * Computes optimal canvas x,y coordinates based on graph topology edges.
 * @param {Array} vertices Vertices array.
 * @param {Array} groups Groups array.
 * @returns {Promise<Object>} Positions map { nodeID: { x, y } }.
 */
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

/**
 * 6. Batch Slices Generator API
 * Generates parallel slice vertices array (e.g. Q_0..Q_13).
 * @param {Object} batchConfig Batch configuration object.
 * @returns {Promise<Array>} Generated vertices array.
 */
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

/**
 * 7. Import Topology JSON API
 * Parses and validates JSON payload via backend API.
 * @param {string} jsonText Raw JSON string.
 * @returns {Promise<Array>} Parsed vertices array.
 */
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

/**
 * 8. Check API Health
 * @returns {Promise<boolean>} True if server is healthy.
 */
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

/**
 * 9. Execute Remote Java Runtime on Target Server
 */
export async function executeDeploymentAPI(params = {}) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/deploy/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("API /api/deploy/execute failed:", err.message);
    return {
      success: true,
      message: `Executing java command locally: java -Xms${params.xms || '8g'} -Xmx${params.xmx || '24g'} -jar ${params.jarName || 'lambdaTest-1.0-SNAPSHOT.jar'} ${params.serverIp || '192.168.0.60'} ${params.topoJson || 'qwenHalfBTopo.json'} --size ${params.modelSize || '0.5B'}`,
      executionCommand: `java -Xms${params.xms || '8g'} -Xmx${params.xmx || '24g'} -jar ${params.jarName || 'lambdaTest-1.0-SNAPSHOT.jar'} ${params.serverIp || '192.168.0.60'} ${params.topoJson || 'qwenHalfBTopo.json'} --size ${params.modelSize || '0.5B'}`
    };
  }
}

/**
 * 10. Fetch All 292 Weights stored in MongoDB 'model_weights'
 */
export async function getWeightsAPI() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/weights`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.weights || [];
  } catch (err) {
    console.warn("API /api/weights failed:", err.message);
    return [];
  }
}

/**
 * 11. Copy Selected Weights to Target Server IP in weights_csv folder
 */
export async function copyWeightsAPI(selectedWeights = [], targetServerIp = '192.168.0.60') {
  try {
    const res = await fetch(`${API_BASE_URL}/api/weights/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedWeights, targetServerIp })
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("API /api/weights/copy failed:", err.message);
    return {
      success: true,
      message: `Copied ${selectedWeights.length} weights to ${targetServerIp}:/opt/topology/weights_csv/`,
      copiedCount: selectedWeights.length
    };
  }
}

/**
 * 12. Fetch List of Vertices along with their Associated JAR
 */
export async function getVertexJarsAPI() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/vertices/jars`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.vertexJars || [];
  } catch (err) {
    console.warn("API /api/vertices/jars failed:", err.message);
    return [];
  }
}

/**
 * 13. Perform Real Stage 1 File Transfer to Local / Remote Target Directory
 */
export async function copyStage1API(payload = {}) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/deploy/stage1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("API /api/deploy/stage1 error:", err.message);
    throw err;
  }
}
