// JSON Import/Export & Live Preview Manager

export function generateTopologyJSON(vertices) {
  // Clean up vertices for export
  const cleanVertices = vertices.map(v => {
    const obj = {
      id: v.id,
      type: v.type
    };

    if (v.host) obj.host = v.host;
    if (v.port !== undefined && v.port !== null) obj.port = Number(v.port);
    if (v.internalPort !== undefined && v.internalPort !== null) obj.internalPort = Number(v.internalPort);
    
    if (v.params && Object.keys(v.params).length > 0) {
      obj.params = { ...v.params };
    }

    if (v.edges && v.edges.length > 0) {
      obj.edges = [...v.edges];
    }

    return obj;
  });

  return JSON.stringify({ vertices: cleanVertices }, null, 2);
}

export function downloadJSON(jsonString, filename = "qwenHalfBTopo.json") {
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseTopologyJSON(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    if (!data || !Array.isArray(data.vertices)) {
      throw new Error("Invalid topology format: Top-level object must contain a 'vertices' array.");
    }
    return data.vertices;
  } catch (err) {
    throw new Error("JSON Parse Error: " + err.message);
  }
}
