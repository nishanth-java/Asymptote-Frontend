/**
 * =========================================================================================
 * TOPOLOGY STUDIO - MONGOOSE DATABASE SCHEMAS & MODELS
 * =========================================================================================
 * File: models.js
 * Comprehensive Mongoose Schemas for MongoDB Collections:
 * 1. VertexCatalogSchema ('vertices_catalog'): Component type catalog definitions & JAR references.
 * 2. JarArtifactSchema ('jar_artifacts'): Execution JAR binary metadata & GridFS pointers.
 * 3. TopologySchema ('topologies'): Graph topology structures (vertices, groups, positions).
 * 4. DeploymentSchema ('deployments'): Cluster deployment manifests & audit history logs.
 * 5. ClusterServerSchema ('cluster_servers'): Target server IP registry & telemetry.
 * 6. ModelWeightSchema ('model_weights'): Tensor weight binary metadata & storage pointers.
 * 7. VertexLogSchema ('vertex_logs'): Real-time continuous execution log stream per vertex.
 * =========================================================================================
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * 1. VERTEX CATALOG SCHEMA ('vertices_catalog')
 * Stores component type presets, descriptions, parameters, and associated execution JAR metadata.
 */
const VertexCatalogSchema = new Schema({
  type: { type: String, required: true, unique: true, uppercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  badgeClass: { type: String, default: 'badge-blue' },
  defaultHost: { type: String, default: '192.168.0.196' },
  defaultPort: { type: Number, default: 9000 },
  defaultInternalPort: { type: Number, default: 10000 },
  params: { type: Schema.Types.Mixed, default: {} },
  jarInfo: {
    jarName: { type: String, required: true },
    sizeMb: { type: Number, default: 15.0 },
    version: { type: String, default: '1.0.0' }
  },
  createdAt: { type: Date, default: Date.now }
});

/**
 * 2. JAR ARTIFACT SCHEMA ('jar_artifacts')
 * Stores metadata and file references for execution JAR binaries in Central DB.
 */
const JarArtifactSchema = new Schema({
  jarName: { type: String, required: true, unique: true, trim: true },
  type: { type: String, required: true, uppercase: true, trim: true },
  version: { type: String, default: '1.0.0' },
  sizeMb: { type: Number, required: true },
  checksum: { type: String, default: '' },
  uploadDate: { type: Date, default: Date.now },
  contentType: { type: String, default: 'application/java-archive' },
  gridfsFileId: { type: Schema.Types.ObjectId, default: null }
});

/**
 * 3. TOPOLOGY SCHEMA ('topologies')
 * Stores active and saved user graph topologies.
 */
const TopologySchema = new Schema({
  name: { type: String, required: true, default: 'Default_Topology' },
  description: { type: String, default: 'Visual network topology graph' },
  isDefault: { type: Boolean, default: true },
  vertices: [
    {
      id: { type: String, required: true },
      type: { type: String, required: true },
      host: { type: String, default: '192.168.0.196' },
      port: { type: Number, default: 9000 },
      internalPort: { type: Number, default: 10000 },
      params: { type: Schema.Types.Mixed, default: {} },
      edges: [{ type: String }]
    }
  ],
  groups: [
    {
      id: { type: String, required: true },
      label: { type: String, required: true },
      memberIds: [{ type: String }],
      collapsed: { type: Boolean, default: true }
    }
  ],
  positions: { type: Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now }
});

/**
 * 4. DEPLOYMENT MANIFEST SCHEMA ('deployments')
 * Stores execution logs and audit records for cluster deployment runs.
 */
const DeploymentSchema = new Schema({
  deploymentId: { type: String, required: true, unique: true },
  deploymentName: { type: String, default: 'Cluster_Deployment' },
  timestamp: { type: Date, default: Date.now },
  summary: {
    totalVertices: { type: Number, default: 0 },
    totalGroups: { type: Number, default: 0 },
    totalUniqueServers: { type: Number, default: 0 },
    totalJarsTransferred: { type: Number, default: 0 }
  },
  serverDeployments: [
    {
      serverIp: { type: String, required: true },
      verticesCount: { type: Number, default: 0 },
      vertexIds: [{ type: String }],
      jarsToTransfer: [
        {
          jarName: { type: String, required: true },
          sizeMb: { type: Number, default: 0 },
          version: { type: String, default: '1.0.0' }
        }
      ],
      executionCommand: { type: String, default: '' },
      status: { type: String, default: 'JAR_TRANSFERRED_AND_TOPO_CONFIGURED' },
      transferredAt: { type: Date, default: Date.now }
    }
  ],
  globalTopologyBroadcast: {
    status: { type: String, default: 'BROADCASTED_TO_ALL_SERVERS' },
    uploadedTopologySizeKb: { type: Number, default: 0 },
    nodesCount: { type: Number, default: 0 },
    dataFlowIntegrity: { type: String, default: 'VERIFIED' }
  }
});

/**
 * 5. CLUSTER SERVER REGISTRY SCHEMA ('cluster_servers')
 * Stores registered server host IPs and telemetry status.
 */
const ClusterServerSchema = new Schema({
  serverIp: { type: String, required: true, unique: true, trim: true },
  hostname: { type: String, default: 'node.cluster.local' },
  status: { type: String, enum: ['ONLINE', 'OFFLINE', 'MAINTENANCE'], default: 'ONLINE' },
  cpuCores: { type: Number, default: 32 },
  ramGb: { type: Number, default: 128 },
  gpuName: { type: String, default: 'NVIDIA RTX 4090 / H100' },
  activeVertices: [{ type: String }],
  lastPing: { type: Date, default: Date.now }
});

/**
 * 6. MODEL WEIGHT SCHEMA ('model_weights')
 * Stores tensor weight binary metadata and storage pointers.
 */
const ModelWeightSchema = new Schema({
  weightName: { type: String, required: true, unique: true, trim: true },
  vertexId: { type: String, default: 'ALL' },
  layerIndex: { type: Number, default: 0 },
  fileSizeBytes: { type: Number, default: 0 },
  sizeMb: { type: Number, default: 0.1 },
  relativeFolder: { type: String, default: 'weights_csv' },
  dtype: { type: String, default: 'csv' },
  checksum: { type: String, default: '' },
  targetServerIp: { type: String, default: '192.168.0.60' },
  s3Url: { type: String, default: '' },
  s3Bucket: { type: String, default: 'asymptotic-model-weights' },
  s3Key: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

/**
 * 7. VERTEX LOG SCHEMA ('vertex_logs')
 * Stores continuous execution logs per vertex node.
 */
const VertexLogSchema = new Schema({
  vertexId: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now },
  level: { type: String, enum: ['INFO', 'EXEC', 'WARN', 'ERROR'], default: 'INFO' },
  message: { type: String, required: true }
});

// Compile and export Mongoose Models
export const VertexCatalog = model('VertexCatalog', VertexCatalogSchema, 'vertices_catalog');
export const JarArtifact = model('JarArtifact', JarArtifactSchema, 'jar_artifacts');
export const Topology = model('Topology', TopologySchema, 'topologies');
export const Deployment = model('Deployment', DeploymentSchema, 'deployments');
export const ClusterServer = model('ClusterServer', ClusterServerSchema, 'cluster_servers');
export const ModelWeight = model('ModelWeight', ModelWeightSchema, 'model_weights');
export const VertexLog = model('VertexLog', VertexLogSchema, 'vertex_logs');
