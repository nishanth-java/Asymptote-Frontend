// JSON Import/Export & Live Preview Manager

export function generateTopologyJSON(vertices) {
  // Clean up vertices for export to match Spring Boot VertexInstanceDto
  const cleanVertices = vertices.map(v => {
    const vidVal = v.vid || (v.type ? v.type.toLowerCase() + '_v1' : 'vertex_v1');
    const obj = {
      id: v.id,
      vid: vidVal,
      type: v.type
    };

    if (v.host) obj.host = v.host;
    if (v.port !== undefined && v.port !== null) obj.port = Number(v.port);
    if (v.internalPort !== undefined && v.internalPort !== null) obj.internalPort = Number(v.internalPort);
    
    obj.params = (v.params && typeof v.params === 'object') ? { ...v.params } : {};
    obj.edges = (v.edges && Array.isArray(v.edges)) ? [...v.edges] : [];

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
