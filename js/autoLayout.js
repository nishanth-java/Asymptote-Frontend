// Auto-layout engine considering collapsed group units, member topological columns, and clean alignments

export function computeAutoLayout(vertices, groups = []) {
  const nodeHeight = 80;
  const colSpacing = 260;
  const startX = 80;

  // Explicit column mapping for model architecture
  const explicitCols = {
    "EMBED": 0,
    "RMS0": 1,
    "K": 2, "Q": 2, "V": 2,
    "K0": 3, "K1": 3, "V0": 3, "V1": 3,
    "group-Q0:Q6": 4, "group-Q7:Q13": 4, "Q": 4,
    "HS0": 5,
    "O": 6,
    "RES0": 7,
    "RMS1": 8,
    "GATE": 9, "UP": 9,
    "DOWN": 10,
    "RES1": 11,
    "finalRMS": 12,
    "LMHead": 13
  };

  // Helper to resolve column for any vertex ID
  const getVertexDefaultCol = (vId) => {
    if (explicitCols[vId] !== undefined) return explicitCols[vId];
    if (vId.startsWith("Q_") || vId.startsWith("Q")) return 4;
    if (vId.startsWith("K") || vId.startsWith("V")) return 3;
    if (vId.startsWith("RMS0")) return 1;
    if (vId.startsWith("HS")) return 5;
    if (vId.startsWith("RES0")) return 7;
    if (vId.startsWith("RMS1")) return 8;
    if (vId.startsWith("GATE") || vId.startsWith("UP")) return 9;
    if (vId.startsWith("DOWN")) return 10;
    if (vId.startsWith("RES1")) return 11;
    if (vId.startsWith("finalRMS")) return 12;
    if (vId.startsWith("LM")) return 13;
    return 0;
  };

  // Identify member IDs of collapsed groups
  const collapsedMemberIds = new Set();
  const collapsedGroupMap = new Map();

  groups.forEach(g => {
    if (g.collapsed) {
      g.memberIds.forEach(mId => collapsedMemberIds.add(mId));
      collapsedGroupMap.set(g.id, g);
    }
  });

  // Assign column numbers to all items
  const itemCols = {};
  
  // Assign columns for groups based on explicit mapping or average member columns!
  groups.forEach(g => {
    if (explicitCols[g.id] !== undefined) {
      itemCols[g.id] = explicitCols[g.id];
    } else {
      let sumCols = 0;
      let count = 0;
      g.memberIds.forEach(mId => {
        sumCols += getVertexDefaultCol(mId);
        count++;
      });
      itemCols[g.id] = count > 0 ? Math.round(sumCols / count) : 4;
    }
  });

  // Assign columns for visual vertices
  vertices.forEach(v => {
    if (collapsedMemberIds.has(v.id)) return; // Skip collapsed member nodes
    itemCols[v.id] = getVertexDefaultCol(v.id);
  });

  // Assign unmapped items topologically
  const allVisualItems = [
    ...vertices.filter(v => !collapsedMemberIds.has(v.id)),
    ...groups.filter(g => g.collapsed)
  ];

  allVisualItems.forEach(item => {
    if (itemCols[item.id] === undefined) {
      itemCols[item.id] = 0;
    }
  });

  // Group items by column
  const columns = {};
  allVisualItems.forEach(item => {
    const col = itemCols[item.id] !== undefined ? itemCols[item.id] : 0;
    if (!columns[col]) columns[col] = [];
    columns[col].push(item);
  });

  // Sort items within each column
  Object.keys(columns).forEach(colKey => {
    columns[colKey].sort((a, b) => {
      const aId = a.id || '';
      const bId = b.id || '';
      if (aId.startsWith("Q") && bId.startsWith("Q")) {
        return aId.localeCompare(bId, undefined, { numeric: true });
      }
      return aId.localeCompare(bId);
    });
  });

  // Compute positions
  const positions = {};

  Object.keys(columns).forEach(colKey => {
    const colIdx = parseInt(colKey, 10);
    const itemList = columns[colKey];
    
    // Total height of visual items in this column
    const totalHeight = itemList.length * nodeHeight + (itemList.length - 1) * 25;
    let currentY = Math.max(120, 360 - totalHeight / 2);
    const colX = startX + colIdx * colSpacing;

    itemList.forEach(item => {
      positions[item.id] = {
        x: colX,
        y: Math.round(currentY)
      };

      // If it's a collapsed group, assign member positions to match group position
      if (item.memberIds) {
        item.memberIds.forEach(mId => {
          positions[mId] = {
            x: colX,
            y: Math.round(currentY)
          };
        });
      }

      currentY += nodeHeight + 25;
    });
  });

  // Ensure member nodes of expanded groups are also assigned positions if not set
  groups.forEach(g => {
    if (!g.collapsed) {
      const basePos = positions[g.id] || { x: startX + 4 * colSpacing, y: 120 };
      let yOffset = 0;
      g.memberIds.forEach(mId => {
        if (!positions[mId]) {
          positions[mId] = {
            x: basePos.x,
            y: basePos.y + yOffset
          };
          yOffset += 65;
        }
      });
    }
  });

  return positions;
}
