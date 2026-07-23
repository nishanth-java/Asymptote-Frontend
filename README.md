# 🪐 Topology Studio - Full-Stack REST API & Modular Canvas Architecture

Topology Studio is a production-ready, full-stack visual graph & vertex network studio for designing, inspecting, and auto-layouting LLM neural network topologies.

---

## 🏗️ Architecture Overview

The system is decoupled into a modular REST API backend and an Apple-inspired SVG canvas frontend:

- **Backend REST API Server (`server.js`)**: Express production server providing endpoints for graph topologies, presets fetching, dynamic DAG auto-layout calculations, batch generation, and JSON imports/exports.
- **Frontend API Client (`js/apiClient.js`)**: Production API abstraction layer communicating with `/api/*` endpoints.
- **Isolated Temporary Fallback File (`js/mockFallbackData.js`)**: All starter sample data and fallback defaults are isolated inside **this single file**.
  > 💡 **Independent Operation**: If `js/mockFallbackData.js` is deleted, the application seamlessly relies **100% EXCLUSIVELY on backend REST API endpoints** without crashing.

---

## 📡 REST API Endpoints Reference

| Method | Endpoint | Description | Request Payload / Query | Response Payload |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Backend status check | N/A | `{ status: "ok", version: "2.5.0", timestamp: ISO }` |
| `GET` | `/api/presets` | Fetch component presets | `?q=EMBED` (optional search) | `{ presets: [ { type, label, category, badgeClass, params } ] }` |
| `GET` | `/api/topology` | Fetch active graph state | N/A | `{ vertices: [], groups: [], positions: {} }` |
| `POST` | `/api/topology` | Update active graph state | `{ vertices: [], groups: [], positions: {} }` | `{ success: true, message: "Topology updated", vertexCount: N }` |
| `POST` | `/api/topology/autolayout` | Dynamic DAG Auto-Layout | `{ vertices: [], groups: [] }` | `{ positions: { nodeID: { x, y } } }` |
| `GET` | `/api/topology/export` | Export formatted JSON | N/A | Raw JSON file download (`topology.json`) |
| `POST` | `/api/topology/import` | Parse & import JSON | `{ jsonText: "..." }` | `{ success: true, vertices: [], vertexCount: N }` |
| `POST` | `/api/topology/batch-generate` | Generate batch slices | `{ type, pattern, start, end, baseHost, basePort, edges }` | `{ success: true, count: N, vertices: [] }` |

---

## 🧪 Single Mock File Deletion Test

To verify that the application operates strictly against REST API endpoints without local mock fallbacks:

1. Start the API server:
   ```bash
   npm run start
   ```
2. Delete the temporary mock file:
   ```bash
   rm js/mockFallbackData.js
   ```
3. Open `http://localhost:3000/` in your browser.
4. The system will continue to load presets, graph state, auto-layouts, and batch generation **strictly via backend REST API endpoints**.

---

## 🚀 How to Run

### 1. Production Mode (Full Stack Server)
Run the Express production server (serves API & static frontend on `http://localhost:3000`):
```bash
npm run start
```

### 2. Development Mode
Run the backend server and Vite frontend concurrently:
```bash
# Terminal 1: Backend API Server (Port 3000)
npm run server

# Terminal 2: Vite Dev Frontend (Port 5173)
npm run dev
```

---

## 📁 File Structure

```
Frontend/
├── server.js               # Express Production REST API Server
├── index.html              # Clean Workspace UI Shell
├── style.css               # Apple Design System & Canvas Animations
├── package.json            # Scripts & Dependencies
├── README.md               # API & Architecture Documentation
└── js/
    ├── apiClient.js        # API Abstraction Layer & Endpoints Handler
    ├── mockFallbackData.js # SINGLE Isolated Temporary Starter Data File
    ├── app.js              # State Coordinator & Event Pipeline
    ├── graphEngine.js      # Interactive SVG Canvas & Wire Engine
    ├── autoLayout.js       # Dynamic DAG Topological Layout Generator
    ├── inspector.js        # Inspector Side Panel Component
    ├── batchCreator.js     # Batch Generation Modal Component
    ├── customVertexModal.js# Custom Vertex Creator Modal Component
    ├── jsonManager.js      # JSON Parser & Generator Utilities
    └── presets.js          # Component Metadata Helpers
```
