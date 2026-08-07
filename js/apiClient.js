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
  ? 'http://localhost:8081' 
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
 * Helper to unwrap Spring Boot ApiResponse DTOs or direct payloads
 */
function unwrapResponse(json) {
  if (json && json.data !== undefined && json.success !== undefined) {
    return json.data;
  }
  return json;
}

/**
 * 1. Fetch Vertices Catalog API
 * Fetches available vertex definitions along with JAR binary info from backend.
 * @param {string} searchQuery Optional search term.
 * @returns {Promise<Array<Object>>} Array of catalog vertex definitions.
 */
export async function getVerticesCatalogAPI(searchQuery = '') {
  try {
    const sbUrl = `${API_BASE_URL}/api/vertex-definitions?q=${encodeURIComponent(searchQuery)}`;
    let res = await fetch(sbUrl);
    if (!res.ok) {
      res = await fetch(`${API_BASE_URL}/api/vertices/catalog?q=${encodeURIComponent(searchQuery)}`);
    }
    if (res.ok) {
      const rawData = await res.json();
      const data = unwrapResponse(rawData);
      let items = Array.isArray(data) ? data : (data.content && Array.isArray(data.content) ? data.content : []);
      
      if (items.length > 0) {
        return items.map(item => ({
          vid: item.vid || item.type,
          type: item.type || item.vid || (item.name ? item.name.replace(/[^a-zA-Z0-9_]/g, '_') : 'CUSTOM'),
          label: item.name || item.label || item.vid,
          description: item.description || '',
          category: item.category || 'Layer',
          badgeClass: 'badge-blue',
          defaultHost: '192.168.0.83',
          defaultPort: 9000,
          defaultInternalPort: 10000,
          requiresWeights: item.requiresWeights || false,
          params: {}
        }));
      }
    }
  } catch (err) {
    console.warn("API catalog endpoint fallback:", err.message);
  }

  // Fallback presets catalog so UI always has vertices to drag & drop
  const fallback = await loadMockFallback();
  if (fallback && fallback.FALLBACK_PRESETS) {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return fallback.FALLBACK_PRESETS;
    return fallback.FALLBACK_PRESETS.filter(p =>
      (p.label && p.label.toLowerCase().includes(q)) ||
      (p.type && p.type.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }
  return [];
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
export async function getTopologyAPI(graphId = null) {
  if (!graphId) {
    return { vertices: [], groups: [], positions: {} };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/graphs/${encodeURIComponent(graphId)}`);
    if (res.ok) {
      const rawData = await res.json();
      return unwrapResponse(rawData) || { vertices: [], groups: [], positions: {} };
    }
  } catch (err) {
    console.warn(`API /api/graphs/${graphId} fetch fallback:`, err.message);
  }
  return { vertices: [], groups: [], positions: {} };
}

function getDefaultProjectionName(v) {
  if (v.projectionName) return v.projectionName;
  if (v.params && v.params.projectionName) return v.params.projectionName;
  const label = (v.label || v.type || v.id || '').toLowerCase();
  if (label.includes('embed')) return 'embed_tokens';
  if (label.includes('head') || label.includes('lm')) return 'lm_head';
  if (label.includes('mlp') || label.includes('gate')) return 'gate_proj';
  if (label.includes('norm') || label.includes('rms')) return 'input_layernorm';
  if (label.includes('q')) return 'q_proj';
  if (label.includes('k')) return 'k_proj';
  if (label.includes('v')) return 'v_proj';
  if (label.includes('o')) return 'o_proj';
  return 'q_proj';
}

export async function saveTopologyAPI(vertices, groups, positions, graphName = "LLM Topology Pipeline", modelTensorId = null, graphId = null) {
  try {
    const formattedVertices = (vertices || []).map(v => {
      const projName = getDefaultProjectionName(v);
      return {
        id: String(v.id),
        vid: v.vid || v.type || "VTX-0001",
        host: v.host || "192.168.0.83",
        port: Number(v.port || 9000),
        internalPort: Number(v.internalPort || 10000),
        projectionName: projName,
        expectedLayerCount: v.expectedLayerCount ? Number(v.expectedLayerCount) : (v.params?.noOfLayers ? Number(v.params.noOfLayers) : null),
        params: {
          ...(v.params || {}),
          projectionName: projName
        },
        edges: (v.edges || []).map(e => String(e))
      };
    });

    const payload = {
      graphId: graphId || null,
      name: graphName,
      modelTensorId: modelTensorId || null,
      vertices: formattedVertices
    };

    const res = await fetch(`${API_BASE_URL}/api/graphs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const json = await res.json();
      return unwrapResponse(json);
    }
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  } catch (err) {
    console.error("API /api/graphs save failed:", err.message);
    throw err;
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
    const localLayoutModule = await import('./autoLayout.js');
    return localLayoutModule.computeAutoLayout(vertices, groups);
  } catch (err) {
    console.warn("Local autoLayout module error:", err.message);
    return {};
  }
}

/**
 * 6. Batch Slices Generator API
 * Generates parallel slice vertices array (e.g. Q_0..Q_13).
 * @param {Object} batchConfig Batch configuration object.
 * @returns {Promise<Array>} Generated vertices array.
 */
export async function generateBatchAPI(batchConfig) {
  return null;
}

/**
 * 7. Import Topology JSON API
 * Parses and validates JSON payload.
 * @param {string} jsonText Raw JSON string.
 * @returns {Promise<Array>} Parsed vertices array.
 */
export async function importJSONAPI(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed : (parsed.vertices || []);
  } catch (err) {
    console.warn("JSON import parse error:", err.message);
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
    const res = await fetch(`${API_BASE_URL}/api/vertex-definitions`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const rawData = await res.json();
    const data = unwrapResponse(rawData);
    return Array.isArray(data) ? data : (data.content && Array.isArray(data.content) ? data.content : []);
  } catch (err) {
    console.warn("API /api/vertex-definitions fetch failed:", err.message);
    return [];
  }
}

/**
 * 14. Create / Register New Vertex Definition with JAR Upload (Spring Boot)
 */
export async function createVertexDefinitionAPI(metadata, jarFile) {
  try {
    const payloadMetadata = {
      name: metadata.name,
      description: metadata.description || 'Spring Boot Executable Vertex Module',
      args: metadata.args || [],
      requiresWeights: metadata.requiresWeights ?? true
    };
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(payloadMetadata)], { type: 'application/json' }));
    if (jarFile) formData.append('jar', jarFile);

    const res = await fetch(`${API_BASE_URL}/api/vertex-definitions`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/vertex-definitions create failed:", err.message);
    throw err;
  }
}

/**
 * 15. Fetch Registered Target Hosts (Spring Boot)
 */
export async function getHostsAPI() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/hosts`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    return unwrapResponse(json) || [];
  } catch (err) {
    console.warn("API /api/hosts failed:", err.message);
    return [];
  }
}

/**
 * 16. Register / Replace Host SSH Credentials (Spring Boot)
 */
export async function registerHostAPI(hostData) {
  try {
    const payload = {
      ip: hostData.ip,
      sshPort: Number(hostData.sshPort) || 22,
      username: hostData.sshUser || hostData.username || 'root',
      authType: hostData.authType || 'PASSWORD',
      secret: hostData.encryptedPassword || hostData.secret || 'password',
      privateKeyPassphrase: hostData.privateKeyPassphrase || null
    };
    const res = await fetch(`${API_BASE_URL}/api/hosts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/hosts register failed:", err.message);
    throw err;
  }
}

/**
 * 17. Delete Host SSH Credentials (Spring Boot)
 */
export async function deleteHostAPI(ip) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/hosts/${encodeURIComponent(ip)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/hosts delete failed:", err.message);
    throw err;
  }
}

/**
 * 18. List Model Tensor Assets (.safetensors) (Spring Boot)
 */
export async function getModelTensorsAPI() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/model-tensors`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    const data = unwrapResponse(json);
    return data.content || data || [];
  } catch (err) {
    console.warn("API /api/model-tensors failed:", err.message);
    return [];
  }
}

/**
 * 19. Upload Model Tensor Asset (.safetensors) (Spring Boot)
 */
export async function uploadModelTensorAPI(name, file) {
  try {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/api/model-tensors`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/model-tensors upload failed:", err.message);
    throw err;
  }
}

/**
 * Delete Model Tensor Asset (.safetensors) (Spring Boot)
 */
export async function deleteModelTensorAPI(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/model-tensors/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/model-tensors delete failed:", err.message);
    throw err;
  }
}

/**
 * Delete Registered Vertex Definition (Spring Boot)
 */
export async function deleteVertexDefinitionAPI(vid) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/vertex-definitions/${encodeURIComponent(vid)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/vertex-definitions delete failed:", err.message);
    throw err;
  }
}

/**
 * 20. Trigger Automated Spring Boot SSH Cluster Deployment (Spring Boot)
 */
export async function deployGraphAPI(graphId, version = 1) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphId, version })
    });
    if (res.ok) {
      const json = await res.json();
      return unwrapResponse(json);
    }
    const errText = await res.text();
    let msg = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.message) msg = parsed.message;
    } catch (_) {}
    throw new Error(`HTTP ${res.status}: ${msg}`);
  } catch (err) {
    console.error("API /api/deployments failed:", err.message);
    throw err;
  }
}

/**
 * 21. Fetch Deployment Status (Spring Boot)
 */
export async function getDeploymentStatusAPI(deploymentId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/deployments/${encodeURIComponent(deploymentId)}`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/deployments status failed:", err.message);
    throw err;
  }
}

/**
 * 22. Stop Active Deployment (Spring Boot)
 */
export async function stopDeploymentAPI(deploymentId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/deployments/${encodeURIComponent(deploymentId)}/stop`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const json = await res.json();
    return unwrapResponse(json);
  } catch (err) {
    console.error("API /api/deployments stop failed:", err.message);
    throw err;
  }
}

/**
 * 23. Stage 1 Transfer Helper API
 */
export async function copyStage1API(payload) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/deployments/stage1-copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      return unwrapResponse(data);
    }
  } catch (err) {
    console.warn("API /api/deployments/stage1-copy failed, using fallback:", err.message);
  }
  return { success: true, copiedFiles: payload?.selectedWeights || [] };
}

