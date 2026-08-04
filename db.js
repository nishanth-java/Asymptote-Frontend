/**
 * =========================================================================================
 * TOPOLOGY STUDIO - MONGOOSE DATABASE CONNECTION & EXAMPLE DATA SEEDER
 * =========================================================================================
 * File: db.js
 * Connects Express Backend to MongoDB ('mongodb://localhost:27017/topology_studio').
 * Auto-seeds example data into MongoDB collections on first launch.
 * Includes graceful fallback if local MongoDB service is offline so server never crashes.
 * =========================================================================================
 */

import mongoose from 'mongoose';
import { VertexCatalog, JarArtifact, ClusterServer, Topology, ModelWeight } from './models.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/topology_studio';

let isMongoConnected = false;

/**
 * Example Initial Seed Data for Vertex Catalog & JAR Artifacts
 */
const SEED_CATALOG_DATA = [
  {
    type: 'EMBEDDING',
    label: 'Embedding Layer',
    category: 'Embedding',
    description: 'Converts input token IDs into continuous vector embeddings.',
    badgeClass: 'badge-cyan',
    defaultHost: '192.168.0.196',
    defaultPort: 9000,
    defaultInternalPort: 10000,
    params: { dim: 896, vocabSize: 151936 },
    jarInfo: { jarName: 'embedding-service-v1.0.jar', sizeMb: 18.4, version: '1.0.0' }
  },
  {
    type: 'RMS',
    label: 'RMS Normalization',
    category: 'Norm',
    description: 'Root Mean Square Normalization layer for stabilizing activations.',
    badgeClass: 'badge-purple',
    defaultHost: '192.168.0.196',
    defaultPort: 9001,
    defaultInternalPort: 10001,
    params: { eps: 0.000001, dim: 896, noOfLayers: 24 },
    jarInfo: { jarName: 'rms-norm-service-v1.0.jar', sizeMb: 12.1, version: '1.0.0' }
  },
  {
    type: 'KEY_VALUE_PROJ',
    label: 'KV Projection (K/V)',
    category: 'Attention',
    description: 'Key and Value projection matrix for Multi-Query / Grouped Attention.',
    badgeClass: 'badge-teal',
    defaultHost: '192.168.0.196',
    defaultPort: 9002,
    defaultInternalPort: 10002,
    params: { numHeads: 2, headDim: 128 },
    jarInfo: { jarName: 'kv-projection-engine-v1.0.jar', sizeMb: 24.6, version: '1.0.0' }
  },
  {
    type: 'Q',
    label: 'Query Head Slice (Q)',
    category: 'Attention',
    description: 'Query Attention Head Slice processor.',
    badgeClass: 'badge-amber',
    defaultHost: '192.168.0.196',
    defaultPort: 9003,
    defaultInternalPort: 10003,
    params: { noOfDimensionHeads: 14, baseValue: 1000000, noOfLayers: 24 },
    jarInfo: { jarName: 'q-slice-head-executor-v1.0.jar', sizeMb: 31.8, version: '1.0.0' }
  },
  {
    type: 'K',
    label: 'Key Head Slice (K)',
    category: 'Attention',
    description: 'Key Attention Head Slice processor.',
    badgeClass: 'badge-teal',
    defaultHost: '192.168.0.197',
    defaultPort: 9049,
    defaultInternalPort: 10043,
    params: { sliceIndex: 0, noOfDimensionHeads: 2, baseValue: 1000000 },
    jarInfo: { jarName: 'k-slice-head-executor-v1.0.jar', sizeMb: 28.5, version: '1.0.0' }
  },
  {
    type: 'V',
    label: 'Value Head Slice (V)',
    category: 'Attention',
    description: 'Value Attention Head Slice processor.',
    badgeClass: 'badge-emerald',
    defaultHost: '192.168.0.197',
    defaultPort: 9017,
    defaultInternalPort: 10017,
    params: { sliceIndex: 0, noOfDimensionHeads: 2 },
    jarInfo: { jarName: 'v-slice-head-executor-v1.0.jar', sizeMb: 28.5, version: '1.0.0' }
  },
  {
    type: 'HS',
    label: 'Attention Concat (HStack)',
    category: 'Concat',
    description: 'Horizontal Concatenation layer joining multi-head attention outputs.',
    badgeClass: 'badge-orange',
    defaultHost: '192.168.0.198',
    defaultPort: 9019,
    defaultInternalPort: 10019,
    params: { expectedInputSize: 14 },
    jarInfo: { jarName: 'hstack-concat-router-v1.0.jar', sizeMb: 15.3, version: '1.0.0' }
  },
  {
    type: 'O',
    label: 'Output Projection (WO)',
    category: 'Attention',
    description: 'Linear Output Projection matrix layer.',
    badgeClass: 'badge-indigo',
    defaultHost: '192.168.0.198',
    defaultPort: 9020,
    defaultInternalPort: 10020,
    params: { outDim: 896, noOfLayers: 24 },
    jarInfo: { jarName: 'linear-proj-matrix-v1.0.jar', sizeMb: 22.7, version: '1.0.0' }
  },
  {
    type: 'RES',
    label: 'Residual Addition (Add)',
    category: 'Residual',
    description: 'Elementwise Residual Connection Adder.',
    badgeClass: 'badge-rose',
    defaultHost: '192.168.0.196',
    defaultPort: 9021,
    defaultInternalPort: 10021,
    params: { mode: 'elementwise_add' },
    jarInfo: { jarName: 'residual-add-core-v1.0.jar', sizeMb: 8.9, version: '1.0.0' }
  },
  {
    type: 'GATE',
    label: 'MLP SwiGLU Gate Matrix',
    category: 'MLP',
    description: 'SwiGLU Activation Gate Linear Weight Matrix.',
    badgeClass: 'badge-pink',
    defaultHost: '192.168.0.198',
    defaultPort: 9023,
    defaultInternalPort: 10023,
    params: { hiddenDim: 4864, noOfLayers: 24 },
    jarInfo: { jarName: 'mlp-swiglu-gate-v1.0.jar', sizeMb: 45.2, version: '1.0.0' }
  },
  {
    type: 'UP',
    label: 'MLP SwiGLU Up Matrix',
    category: 'MLP',
    description: 'SwiGLU Up-projection Weight Matrix.',
    badgeClass: 'badge-lime',
    defaultHost: '192.168.0.198',
    defaultPort: 9024,
    defaultInternalPort: 10024,
    params: { hiddenDim: 4864, noOfLayers: 24 },
    jarInfo: { jarName: 'mlp-swiglu-up-v1.0.jar', sizeMb: 45.2, version: '1.0.0' }
  },
  {
    type: 'DOWN',
    label: 'MLP Down Projection Matrix',
    category: 'MLP',
    description: 'Down-projection Linear Matrix reducing hidden state dimension.',
    badgeClass: 'badge-amber',
    defaultHost: '192.168.0.198',
    defaultPort: 9025,
    defaultInternalPort: 10025,
    params: { outDim: 896, noOfLayers: 24 },
    jarInfo: { jarName: 'mlp-down-proj-v1.0.jar', sizeMb: 36.8, version: '1.0.0' }
  },
  {
    type: 'RMS_final',
    label: 'Final RMS Norm',
    category: 'Norm',
    description: 'Final Layer Normalization prior to LM Head projection.',
    badgeClass: 'badge-purple',
    defaultHost: '192.168.0.196',
    defaultPort: 9030,
    defaultInternalPort: 10030,
    params: { eps: 0.000001, dim: 896 },
    jarInfo: { jarName: 'rms-norm-service-v1.0.jar', sizeMb: 12.1, version: '1.0.0' }
  },
  {
    type: 'LM_HEAD',
    label: 'Language Model Head Proj',
    category: 'Output',
    description: 'Final Vocabulary Logits Projection Head.',
    badgeClass: 'badge-red',
    defaultHost: '192.168.0.196',
    defaultPort: 9031,
    defaultInternalPort: 10031,
    params: { vocabSize: 151936, maxNoOfTokens: 30, eosToken: 151643 },
    jarInfo: { jarName: 'lm-head-vocab-projector-v1.0.jar', sizeMb: 62.4, version: '1.0.0' }
  }
];

const SEED_CLUSTER_SERVERS = [
  { serverIp: '192.168.0.196', hostname: 'gpu-node-01.local', status: 'ONLINE', cpuCores: 64, ramGb: 256, gpuName: 'NVIDIA H100 80GB' },
  { serverIp: '192.168.0.197', hostname: 'gpu-node-02.local', status: 'ONLINE', cpuCores: 64, ramGb: 256, gpuName: 'NVIDIA H100 80GB' },
  { serverIp: '192.168.0.198', hostname: 'cpu-worker-01.local', status: 'ONLINE', cpuCores: 128, ramGb: 512, gpuName: 'N/A (CPU Worker)' }
];

import fs from 'fs';
import path from 'path';

/**
 * Auto-seeds example data into MongoDB collections if empty.
 */
async function seedExampleData() {
  try {
    const catalogCount = await VertexCatalog.countDocuments();
    if (catalogCount === 0) {
      // Associate lambdaTest-1.0-SNAPSHOT.jar with all vertices in catalog
      const catalogDataWithJar = SEED_CATALOG_DATA.map(item => ({
        ...item,
        jarInfo: { jarName: 'lambdaTest-1.0-SNAPSHOT.jar', sizeMb: 18.5, version: '1.0-SNAPSHOT' }
      }));
      await VertexCatalog.insertMany(catalogDataWithJar);
      console.log('🌱 MongoDB Seeder: Seeded 14 Component Types into "vertices_catalog" collection (linked with lambdaTest-1.0-SNAPSHOT.jar).');
    }

    const jarCount = await JarArtifact.countDocuments();
    if (jarCount === 0) {
      await JarArtifact.create({
        jarName: 'lambdaTest-1.0-SNAPSHOT.jar',
        type: 'ALL_VERTICES',
        version: '1.0-SNAPSHOT',
        sizeMb: 18.5,
        checksum: 'sha256-lambdatest-v1.0-snapshot',
        contentType: 'application/java-archive'
      });
      console.log('🌱 MongoDB Seeder: Seeded "lambdaTest-1.0-SNAPSHOT.jar" into "jar_artifacts" collection.');
    }

    const serverCount = await ClusterServer.countDocuments();
    if (serverCount === 0) {
      await ClusterServer.insertMany(SEED_CLUSTER_SERVERS);
      console.log('🌱 MongoDB Seeder: Seeded 3 Cluster Server Nodes into "cluster_servers" collection.');
    }

    const topoCount = await Topology.countDocuments();
    if (topoCount === 0) {
      await Topology.create({
        name: 'Default_Topology',
        isDefault: true,
        vertices: [],
        groups: [],
        positions: {}
      });
      console.log('🌱 MongoDB Seeder: Created default empty topology graph in "topologies" collection.');
    }

    const weightsCount = await ModelWeight.countDocuments();
    if (weightsCount < 200) {
      await ModelWeight.deleteMany({}); // Clear old mock weights
      const weightsDir = path.join(process.cwd(), 'weights_csv');
      if (fs.existsSync(weightsDir)) {
        const files = fs.readdirSync(weightsDir).filter(f => f.endsWith('.csv'));
        const weightDocs = files.map(filename => {
          const stats = fs.statSync(path.join(weightsDir, filename));
          let vertexId = 'ALL';
          let layerIndex = 0;
          const match = filename.match(/(?:bias|weight)_(\d+)_([A-Za-z0-9_]+)\.csv/);
          if (match) {
            layerIndex = parseInt(match[1], 10);
            vertexId = match[2];
          } else if (filename.includes('embed')) {
            vertexId = 'EMBEDDING';
          } else if (filename.includes('LMHead')) {
            vertexId = 'LM_HEAD';
          } else if (filename.includes('finalRMS')) {
            vertexId = 'RMS_final';
          }

          return {
            weightName: filename,
            vertexId,
            layerIndex,
            fileSizeBytes: stats.size,
            sizeMb: parseFloat((stats.size / (1024 * 1024)).toFixed(3)),
            relativeFolder: 'weights_csv',
            dtype: 'csv',
            targetServerIp: '192.168.0.60'
          };
        });

        if (weightDocs.length > 0) {
          await ModelWeight.insertMany(weightDocs);
          console.log(`🌱 MongoDB Seeder: Successfully scanned and stored all ${weightDocs.length} CSV model weights into "model_weights" collection!`);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ MongoDB Seeding Warning:', err.message);
  }
}

/**
 * Connects to MongoDB database with fallback handling.
 */
export async function connectMongoDB() {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000 // 3 sec timeout if mongo service is offline
    });
    isMongoConnected = true;
    console.log(`🍃 Connected successfully to MongoDB Database at: ${MONGODB_URI}`);
  } catch (err) {
    isMongoConnected = false;
    console.warn(`⚠️ MongoDB Connection Error (${err.message}).`);
    console.warn(`👉 Switching backend to in-memory fallback state so application functions seamlessly.`);
  }
}

export function getMongoStatus() {
  return isMongoConnected;
}
