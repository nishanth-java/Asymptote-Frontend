# 🚀 Asymptotic Studio — Java Backend API Specification (v1.0)

This document provides a complete REST API contract specification for implementing a **Java Backend (Spring Boot / Quarkus / Micronaut)** to interface seamlessly with the **Asymptotic Studio** frontend visual editor.

---

## 📋 Table of Contents
1. [CORS & Base URL Configuration](#1-cors--base-url-configuration)
2. [Database Schema Recommendations](#2-database-schema-recommendations)
3. [REST API Endpoint Specs](#3-rest-api-endpoint-specs)
   - [Component Catalog API](#31-component-catalog-api)
   - [Topology Graph APIs](#32-topology-graph-apis)
   - [Model Weights & S3 Storage APIs](#33-model-weights--s3-storage-apis)
   - [JAR Artifacts & Vertex Association API](#34-jar-artifacts--vertex-association-api)
   - [Stage 1 Upload & Package API](#35-stage-1-upload--package-api)
   - [Stage 2 Java Remote Execution API](#36-stage-2-java-remote-execution-api)
   - [Live Telemetry & Logs APIs](#37-live-telemetry--logs-apis)
   - [Inference Input API](#38-inference-input-api)
4. [Key Java Backend Implementation Notes](#4-key-java-backend-implementation-notes)

---

## 1. CORS & Base URL Configuration

- **Frontend Origin**: `http://localhost:5173` (Vite Dev Server) or custom domain.
- **Java Backend Port**: Defaults to `http://localhost:3000` or `http://localhost:8080`.
- **CORS Requirements**: Ensure your Java Spring `@CrossOrigin` controller handles:
  - Allowed Headers: `Content-Type`, `Authorization`
  - Allowed Methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`

---

## 2. Database Schema Recommendations

### MongoDB Collections / PostgreSQL Tables:
1. `vertices_catalog`: Component preset definitions.
2. `topologies`: Graph topologies containing `vertices`, `groups`, and `positions`.
3. `model_weights`: Model weight files metadata with `s3Url`, `s3Bucket`, `s3Key`, and `vertexId`.
4. `jar_artifacts`: Binary executable JAR definitions (`lambdaTest-1.0-SNAPSHOT.jar`).
5. `cluster_servers`: Server node telemetry (`serverIp`, `cpuUtilPct`, `ramUtilPct`, `gpuName`).
6. `vertex_logs`: Execution log messages per vertex node.

---

## 3. REST API Endpoint Specs

### 3.1 Component Catalog API

#### `GET /api/vertices/catalog`
Fetches available LLM layer component presets.

- **Query Parameters**: `q` (optional search filter string)
- **Response Format** (`200 OK`):
```json
{
  "catalog": [
    {
      "type": "EMBEDDING",
      "label": "Embedding Layer",
      "category": "Embedding",
      "description": "Converts input token IDs into vector embeddings.",
      "badgeClass": "badge-cyan",
      "defaultHost": "192.168.0.196",
      "defaultPort": 9000,
      "defaultInternalPort": 10000,
      "params": { "dim": 896, "vocabSize": 151936 },
      "jarInfo": { "jarName": "lambdaTest-1.0-SNAPSHOT.jar", "sizeMb": 18.5, "version": "1.0-SNAPSHOT" }
    }
  ]
}
```

---

### 3.2 Topology Graph APIs

#### `GET /api/topology`
Fetches the active saved topology graph.

- **Response Format** (`200 OK`):
```json
{
  "name": "Default_Topology",
  "vertices": [
    { "id": "EMBED", "type": "EMBEDDING", "host": "192.168.0.196", "port": 9000, "internalPort": 10000 }
  ],
  "groups": [],
  "positions": { "EMBED": { "x": 100, "y": 200 } },
  "updatedAt": "2026-07-27T16:00:00Z"
}
```

#### `POST /api/topology`
Saves or updates canvas topology graph.

- **Request Body**:
```json
{
  "name": "Qwen_0.5B_Graph",
  "vertices": [...],
  "groups": [...],
  "positions": { "EMBED": { "x": 100, "y": 200 } }
}
```
- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "message": "Topology graph saved successfully.",
  "topology": { ... }
}
```

#### `POST /api/topology/autolayout`
Computes Sugiyama DAG rank layout for vertices.

- **Request Body**: `{ "vertices": [...], "groups": [...] }`
- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "positions": {
    "EMBED": { "x": 80, "y": 200 },
    "RMS0": { "x": 340, "y": 200 }
  }
}
```

---

### 3.3 Model Weights & S3 Storage APIs

#### `GET /api/weights`
Queries all model weight CSV files stored in `model_weights`.

- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "totalWeightsCount": 292,
  "weights": [
    {
      "weightName": "bias_0_K.csv",
      "vertexId": "K",
      "layerIndex": 0,
      "sizeMb": 1.25,
      "s3Url": "https://asymptotic-model-weights.s3.amazonaws.com/weights_csv/bias_0_K.csv",
      "s3Bucket": "asymptotic-model-weights",
      "s3Key": "weights_csv/bias_0_K.csv"
    }
  ]
}
```

---

### 3.4 JAR Artifacts & Vertex Association API

#### `GET /api/vertices/jars`
Queries all active vertices along with their associated execution JAR.

- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "count": 14,
  "vertexJars": [
    {
      "vertexId": "EMBED",
      "type": "EMBEDDING",
      "associatedJar": "lambdaTest-1.0-SNAPSHOT.jar",
      "sizeMb": 18.5,
      "targetServerIp": "192.168.0.196"
    }
  ]
}
```

---

### 3.5 Stage 1 Upload & Package API

#### `POST /api/deploy/stage1`
Prepares topology JSON, verifies selected weights, and outputs SCP and AWS S3 Sync transfer commands for target Linux servers.

- **Request Body**:
```json
{
  "destDirectory": "/home/kai/qwenf5/",
  "targetServerIp": "192.168.0.126",
  "sshUser": "kai",
  "selectedWeights": ["bias_0_K.csv", "weight_0_Q.csv"],
  "topoJsonName": "qwenHalfBTopo.json",
  "jarName": "lambdaTest-1.0-SNAPSHOT.jar"
}
```

- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "message": "Stage 1 Topology & JAR Prepared for Linux Target Server.",
  "targetDirectory": "/home/kai/qwenf5/",
  "targetServerIp": "192.168.0.126",
  "copiedFiles": ["lambdaTest-1.0-SNAPSHOT.jar", "qwenHalfBTopo.json"],
  "weightsCopiedCount": 292,
  "scpPreview": "scp -r lambdaTest-1.0-SNAPSHOT.jar qwenHalfBTopo.json weights_csv/ kai@192.168.0.126:/home/kai/qwenf5/",
  "s3BucketUri": "s3://asymptotic-model-weights/weights_csv/",
  "s3TransferCommand": "aws s3 cp s3://asymptotic-model-weights/weights_csv/ /home/kai/qwenf5/weights_csv/ --recursive"
}
```

---

### 3.6 Stage 2 Java Remote Execution API

#### `POST /api/deploy/execute`
Executes the JAR runtime command on target server nodes.

- **Request Body**:
```json
{
  "xms": "8g",
  "xmx": "24g",
  "jarName": "lambdaTest-1.0-SNAPSHOT.jar",
  "serverIp": "192.168.0.60",
  "topoJson": "qwenHalfBTopo.json",
  "modelSize": "0.5B",
  "destDirectory": "/home/kai/qwenf5/"
}
```

- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "executionCommand": "java -Xms8g -Xmx24g -jar lambdaTest-1.0-SNAPSHOT.jar 192.168.0.60 qwenHalfBTopo.json 0.5B",
  "workingDirectory": "/home/kai/qwenf5/",
  "logs": [
    "[16:20:00] [SYSTEM] Execution Command: java -Xms8g -Xmx24g -jar lambdaTest-1.0-SNAPSHOT.jar 192.168.0.60 qwenHalfBTopo.json 0.5B",
    "[16:20:01] [STDOUT] Model weights initialized from /home/kai/qwenf5/weights_csv/"
  ]
}
```

---

### 3.7 Live Telemetry & Logs APIs

#### `GET /api/:vertexId/logs`
Returns continuous execution logs for a vertex node or `SYSTEM`.

- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "vertexId": "SYSTEM",
  "logCount": 5,
  "logs": [
    "[16:20:00] [SYSTEM] Connected to remote SSH daemon...",
    "[16:20:01] [EMBEDDING] Loaded embed_tokens.weight into memory."
  ]
}
```

#### `GET /api/ip?serverIp=192.168.0.196`
Returns server hardware telemetry (CPU, RAM, GPU utilization).

- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "serverIp": "192.168.0.196",
  "hostname": "gpu-node-01.local",
  "telemetry": {
    "status": "ONLINE",
    "cpuUtilPct": 34,
    "ramUtilPct": 58,
    "cpuCores": 64,
    "ramGb": 256,
    "gpuName": "NVIDIA H100 80GB",
    "pingMs": 3
  }
}
```

---

### 3.8 Inference Input API

#### `POST /api/input`
Sends prompt text into embedding layer.

- **Request Body**: `{ "textInput": "Hello Asymptotic LLM" }`
- **Response Format** (`200 OK`):
```json
{
  "success": true,
  "textInput": "Hello Asymptotic LLM",
  "tokenCount": 3,
  "tokens": [1042, 8821, 14002],
  "targetVertex": "EMBED"
}
```

---

## 4. Key Java Backend Implementation Notes

1. **Spring Boot / Jackson JSON Naming**:
   - Ensure camelCase JSON field names match the contract (`vertexId`, `s3Url`, `serverIp`, `fileSizeBytes`).
2. **Spring Security / CORS Filter**:
   - Register a `CorsFilter` bean permitting `http://localhost:5173`.
3. **Execution Thread Pool**:
   - When executing `java -jar` binaries via `ProcessBuilder`, consume `stdout` and `stderr` asynchronously in separate threads to avoid process blocking.
4. **AWS SDK for S3**:
   - Use AWS Java SDK v2 (`software.amazon.awssdk:s3`) for S3 pre-signed URL generation or object listing.
