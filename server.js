// Production REST API Server for Topology Studio
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================================================
// In-Memory Production State & Default Presets
// ==========================================================================

const COMPONENT_PRESETS = [
  { type: 'EMBEDDING', label: 'EMBEDDING (Embedding Layer)', category: 'Embedding', defaultHost: '192.168.0.196', defaultPort: 9000, defaultInternalPort: 10000, badgeClass: 'badge-cyan', params: { dim: 896, vocabSize: 151936 } },
  { type: 'RMS', label: 'RMS (RMS Normalization)', category: 'Norm', defaultHost: '192.168.0.196', defaultPort: 9001, defaultInternalPort: 10001, badgeClass: 'badge-purple', params: { eps: 0.000001, dim: 896 } },
  { type: 'KEY_VALUE_PROJ', label: 'KEY_VALUE_PROJ (K/V Projection)', category: 'Attention', defaultHost: '192.168.0.196', defaultPort: 9002, defaultInternalPort: 10002, badgeClass: 'badge-teal', params: { numHeads: 2, headDim: 128 } },
  { type: 'Q', label: 'Q (Query Slice Head)', category: 'Attention', defaultHost: '192.168.0.196', defaultPort: 9003, defaultInternalPort: 10003, badgeClass: 'badge-amber', params: { noOfDimensionHeads: 14, baseValue: 1000000, noOfLayers: 24 } },
  { type: 'K', label: 'K (Key Slice Head)', category: 'Attention', defaultHost: '192.168.0.196', defaultPort: 9049, defaultInternalPort: 10043, badgeClass: 'badge-teal', params: { sliceIndex: 0 } },
  { type: 'V', label: 'V (Value Slice Head)', category: 'Attention', defaultHost: '192.168.0.196', defaultPort: 9017, defaultInternalPort: 10017, badgeClass: 'badge-emerald', params: { sliceIndex: 0 } },
  { type: 'HS', label: 'HS (HStack Concat)', category: 'Concat', defaultHost: '192.168.0.196', defaultPort: 9019, defaultInternalPort: 10019, badgeClass: 'badge-orange', params: { expectedInputSize: 14 } },
  { type: 'O', label: 'O (Output Weight Matrix)', category: 'Attention', defaultHost: '192.168.0.196', defaultPort: 9020, defaultInternalPort: 10020, badgeClass: 'badge-indigo', params: { outDim: 896 } },
  { type: 'RES', label: 'RES (Residual Addition)', category: 'Residual', defaultHost: '192.168.0.196', defaultPort: 9021, defaultInternalPort: 10021, badgeClass: 'badge-rose', params: {} },
  { type: 'GATE', label: 'GATE (MLP Gate Matrix)', category: 'MLP', defaultHost: '192.168.0.196', defaultPort: 9023, defaultInternalPort: 10023, badgeClass: 'badge-pink', params: { hiddenDim: 4864 } },
  { type: 'UP', label: 'UP (MLP Up Matrix)', category: 'MLP', defaultHost: '192.168.0.196', defaultPort: 9024, defaultInternalPort: 10024, badgeClass: 'badge-lime', params: { hiddenDim: 4864 } },
  { type: 'DOWN', label: 'DOWN (MLP Down Matrix)', category: 'MLP', defaultHost: '192.168.0.196', defaultPort: 9025, defaultInternalPort: 10025, badgeClass: 'badge-amber', params: { outDim: 896 } },
  { type: 'RMS_final', label: 'RMS_final (Final RMS Norm)', category: 'Norm', defaultHost: '192.168.0.196', defaultPort: 9030, defaultInternalPort: 10030, badgeClass: 'badge-purple', params: {} },
  { type: 'LM_HEAD', label: 'LM_HEAD (Language Model Head)', category: 'Output', defaultHost: '192.168.0.196', defaultPort: 9031, defaultInternalPort: 10031, badgeClass: 'badge-red', params: { vocabSize: 151936 } }
];

let activeTopologyState = {
  vertices: [],
  groups: [],
  positions: {}
};

// ==========================================================================
// REST API Endpoints
// ==========================================================================

// 1. Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.5.0',
    timestamp: new Date().toISOString()
  });
});

// 2. Component Presets List Endpoint
app.get('/api/presets', (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  if (!query) {
    return res.json({ presets: COMPONENT_PRESETS });
  }

  const filtered = COMPONENT_PRESETS.filter(p =>
    p.label.toLowerCase().includes(query) ||
    p.type.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query)
  );

  res.json({ presets: filtered });
});

// 3. Get Active Topology Graph Endpoint
app.get('/api/topology', (req, res) => {
  res.json(activeTopologyState);
});

// 4. Update / Save Active Topology Graph Endpoint
app.post('/api/topology', (req, res) => {
  const { vertices, groups, positions } = req.body;
  if (!Array.isArray(vertices)) {
    return res.status(400).json({ error: "Invalid payload: 'vertices' must be an array" });
  }

  activeTopologyState = {
    vertices: vertices || [],
    groups: groups || [],
    positions: positions || {}
  };

  res.json({
    success: true,
    message: "Active topology graph updated successfully",
    vertexCount: activeTopologyState.vertices.length
  });
});

// 5. Dynamic DAG Topological Auto-Layout Computation Endpoint
app.post('/api/topology/autolayout', (req, res) => {
  const { vertices = [], groups = [] } = req.body;

  const nodeHeight = 72;
  const colSpacing = 240;
  const startX = 80;
  const centerY = 360;

  const collapsedMemberIds = new Set();
  const vertexToGroupMap = new Map();

  groups.forEach(g => {
    if (g.collapsed) {
      g.memberIds.forEach(mId => {
        collapsedMemberIds.add(mId);
        vertexToGroupMap.set(mId, g.id);
      });
    }
  });

  const visualItems = [];
  const visualItemMap = new Map();

  vertices.forEach(v => {
    if (!collapsedMemberIds.has(v.id)) {
      visualItems.push({ id: v.id, type: 'vertex', data: v });
      visualItemMap.set(v.id, { id: v.id, type: 'vertex', data: v });
    }
  });

  groups.forEach(g => {
    if (g.collapsed) {
      visualItems.push({ id: g.id, type: 'group', data: g });
      visualItemMap.set(g.id, { id: g.id, type: 'group', data: g });
    }
  });

  if (visualItems.length === 0) {
    return res.json({ positions: {} });
  }

  const adj = new Map();
  const inDegree = new Map();
  visualItems.forEach(item => {
    adj.set(item.id, new Set());
    inDegree.set(item.id, 0);
  });

  vertices.forEach(source => {
    if (!source.edges) return;
    const srcVisualId = vertexToGroupMap.get(source.id) || source.id;

    source.edges.forEach(targetId => {
      const tgtVisualId = vertexToGroupMap.get(targetId) || targetId;
      if (srcVisualId !== tgtVisualId && visualItemMap.has(srcVisualId) && visualItemMap.has(tgtVisualId)) {
        adj.get(srcVisualId).add(tgtVisualId);
      }
    });
  });

  adj.forEach((targets) => {
    targets.forEach(tgtId => {
      inDegree.set(tgtId, (inDegree.get(tgtId) || 0) + 1);
    });
  });

  const levels = new Map();
  const queue = [];

  visualItems.forEach(item => {
    if (inDegree.get(item.id) === 0) {
      levels.set(item.id, 0);
      queue.push(item.id);
    }
  });

  if (queue.length === 0 && visualItems.length > 0) {
    const firstId = visualItems[0].id;
    levels.set(firstId, 0);
    queue.push(firstId);
  }

  const visited = new Set();
  while (queue.length > 0) {
    const currId = queue.shift();
    const currLevel = levels.get(currId) || 0;
    visited.add(currId);

    const neighbors = adj.get(currId) || new Set();
    neighbors.forEach(tgtId => {
      const existingLevel = levels.get(tgtId) || 0;
      const nextLevel = Math.max(existingLevel, currLevel + 1);
      levels.set(tgtId, nextLevel);

      const deg = inDegree.get(tgtId) - 1;
      inDegree.set(tgtId, deg);
      if (deg <= 0 && !visited.has(tgtId)) {
        queue.push(tgtId);
      }
    });
  }

  visualItems.forEach(item => {
    if (!levels.has(item.id)) {
      levels.set(item.id, 0);
    }
  });

  const levelColumns = {};
  visualItems.forEach(item => {
    const lvl = levels.get(item.id) || 0;
    if (!levelColumns[lvl]) levelColumns[lvl] = [];
    levelColumns[lvl].push(item);
  });

  Object.keys(levelColumns).forEach(lvlKey => {
    levelColumns[lvlKey].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  });

  const computedPositions = {};

  Object.keys(levelColumns).forEach(lvlKey => {
    const colIdx = parseInt(lvlKey, 10);
    const itemList = levelColumns[lvlKey];
    
    const count = itemList.length;
    const gapY = count > 8 ? 18 : 24;
    const totalHeight = count * nodeHeight + (count - 1) * gapY;
    let currentY = Math.max(80, centerY - totalHeight / 2);
    const colX = startX + colIdx * colSpacing;

    itemList.forEach(item => {
      const pos = {
        x: colX,
        y: Math.round(currentY)
      };
      computedPositions[item.id] = pos;

      if (item.type === 'group' && item.data.memberIds) {
        item.data.memberIds.forEach(mId => {
          computedPositions[mId] = { ...pos };
        });
      }

      currentY += nodeHeight + gapY;
    });
  });

  res.json({ positions: computedPositions });
});

// 6. Import Topology JSON Endpoint
app.post('/api/topology/import', (req, res) => {
  const { jsonText, payload } = req.body;
  let parsed = payload;

  if (jsonText) {
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON format: " + e.message });
    }
  }

  let vertices = [];
  if (Array.isArray(parsed)) {
    vertices = parsed;
  } else if (parsed && Array.isArray(parsed.vertices)) {
    vertices = parsed.vertices;
  } else if (parsed && typeof parsed === 'object') {
    vertices = Object.keys(parsed).map(key => ({
      id: key,
      ...parsed[key]
    }));
  }

  res.json({
    success: true,
    vertices,
    vertexCount: vertices.length
  });
});

// 7. Export Topology JSON Endpoint
app.get('/api/topology/export', (req, res) => {
  const formattedJSON = JSON.stringify(activeTopologyState.vertices, null, 2);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=topology.json');
  res.send(formattedJSON);
});

// 8. Batch Slices Generation Endpoint
app.post('/api/topology/batch-generate', (req, res) => {
  const {
    type = 'Q',
    pattern = 'Q_{i}',
    start = 0,
    end = 13,
    baseHost = '192.168.0.196',
    basePort = 9003,
    baseInternalPort = 10003,
    edges = ['HS0'],
    customParams = {}
  } = req.body;

  const generatedVertices = [];
  for (let i = start; i <= end; i++) {
    const id = pattern.replace('{i}', i);
    generatedVertices.push({
      id,
      type,
      host: baseHost,
      port: basePort + (i - start),
      internalPort: baseInternalPort + (i - start),
      params: {
        ...customParams,
        sliceIndex: i
      },
      edges: Array.isArray(edges) ? [...edges] : [edges]
    });
  }

  res.json({
    success: true,
    count: generatedVertices.length,
    vertices: generatedVertices
  });
});

// Serve Static Frontend Assets (Production Mode)
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname));

// Wildcard fallback middleware for SPA routing
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`⚡ Topology Studio REST API Server running at http://localhost:${PORT}`);
});
