/**
 * =========================================================================================
 * TOPOLOGY STUDIO — SUGIYAMA RANK RELAXATION & BARYCENTER AUTO-LAYOUT ENGINE
 * =========================================================================================
 * File: js/autoLayout.js
 *
 * Industry-standard DAG layering engine based on Sugiyama framework:
 * 1. Seeds architectural ranks for recognized components (EMBED=0, RMS0=1, K/Q/V=2, Q-slice=4, HS=5, O=6, RES0=7, RMS1=8, GATE/UP=9, DOWN=10, RES1=11, finalRMS=12, LMHead=13).
 * 2. Runs Bellman-Ford rank relaxation across all directed edges (u -> v => rank(v) >= rank(u) + 1).
 * 3. Remaps distinct ranks to clean, sequential horizontal display columns (X = 80 + col * 240px).
 * 4. Positions backbone single-node columns directly on center spine line (Y = 340px).
 * 5. Orders multi-node parallel branch columns vertically using Parent Y-Barycenter sorting.
 * =========================================================================================
 */

const NODE_H      = 66;  // Node card height (px)
const COL_SPACING = 240; // Horizontal distance between columns (px)
const ROW_SPACING = 22;  // Vertical gap between branch nodes (px)
const START_X     = 80;  // Left canvas padding (px)
const CENTER_Y    = 340; // Horizontal center spine line (px)

/**
 * Returns initial seed rank for recognized component types or IDs.
 */
function getSeedRank(id = '', type = '', category = '') {
  const str = (id + ' ' + type + ' ' + category).toUpperCase();

  if (str.includes('EMBED')) return 0;
  if (str.includes('RMS0') || (str.includes('RMS') && str.includes('PRE'))) return 1;
  if (id === 'K' || id === 'Q' || id === 'V' || str.includes('KEY_VALUE_PROJ')) return 2;
  if (id === 'K0' || id === 'K1' || id === 'V0' || id === 'V1') return 3;
  if (id.startsWith('Q_') || id.startsWith('Q') || id.includes('Q0') || id.includes('Q13') || str.includes('GROUP-Q')) return 4;
  if (str.includes('HS') || str.includes('HIDDEN') || str.includes('HSTACK') || str.includes('CONCAT')) return 5;
  if (id === 'O' || str.includes('ATTN_OUT') || str.includes('OUTPUT_PROJ')) return 6;
  if (str.includes('RES0') || str.includes('ADD0')) return 7;
  if (str.includes('RMS1') || (str.includes('RMS') && str.includes('POST'))) return 8;
  if (str.includes('GATE') || str.includes('UP')) return 9;
  if (str.includes('DOWN')) return 10;
  if (str.includes('RES1') || str.includes('ADD1')) return 11;
  if (str.includes('FINAL_RMS') || str.includes('FINAL RMS') || str.includes('RMS_FINAL')) return 12;
  if (str.includes('LM_HEAD') || str.includes('LMHEAD') || str.includes('LM HEAD')) return 13;

  return 0;
}

export function computeAutoLayout(vertices = [], groups = []) {
  if (vertices.length === 0 && groups.length === 0) return {};

  // 1. Identify collapsed groups & members
  const collapsedMemberIds = new Set();
  const collapsedGroups = [];

  groups.forEach(g => {
    if (g.collapsed) {
      g.memberIds.forEach(mId => collapsedMemberIds.add(mId));
      collapsedGroups.push(g);
    }
  });

  const visibleVertices = vertices.filter(v => !collapsedMemberIds.has(v.id));
  const allItems = [...visibleVertices, ...collapsedGroups];

  if (allItems.length === 0) return {};

  // 2. Build adjacency maps (adj and revAdj)
  const adj = new Map();     // item.id -> Set(successor ids)
  const revAdj = new Map();  // item.id -> Set(predecessor ids)

  allItems.forEach(item => {
    adj.set(item.id, new Set());
    revAdj.set(item.id, new Set());
  });

  const resolveTarget = (tgtId) => {
    for (const g of collapsedGroups) {
      if (g.memberIds.includes(tgtId)) return g.id;
    }
    return tgtId;
  };

  // Add edges from visible vertices
  visibleVertices.forEach(v => {
    (v.edges || []).forEach(rawTgt => {
      const dst = resolveTarget(rawTgt);
      if (dst !== v.id && adj.has(v.id) && adj.has(dst)) {
        adj.get(v.id).add(dst);
        revAdj.get(dst).add(v.id);
      }
    });
  });

  // Add edges from collapsed group members
  collapsedGroups.forEach(g => {
    g.memberIds.forEach(mId => {
      const member = vertices.find(v => v.id === mId);
      if (!member) return;
      (member.edges || []).forEach(rawTgt => {
        const dst = resolveTarget(rawTgt);
        if (dst !== g.id && adj.has(g.id) && adj.has(dst)) {
          adj.get(g.id).add(dst);
          revAdj.get(dst).add(g.id);
        }
      });
    });
  });

  // 3. Seed Ranks
  const ranks = new Map();
  allItems.forEach(item => {
    let r = 0;
    if (item.memberIds) {
      r = getSeedRank(item.label || item.id);
    } else {
      r = getSeedRank(item.id, item.type, item.category);
    }
    ranks.set(item.id, r);
  });

  // 4. Sugiyama / Bellman-Ford Rank Relaxation (Ensures u -> v implies rank(v) >= rank(u) + 1)
  const N = allItems.length;
  for (let pass = 0; pass < N; pass++) {
    let updated = false;
    allItems.forEach(item => {
      const uRank = ranks.get(item.id) || 0;
      (adj.get(item.id) || new Set()).forEach(vId => {
        const vRank = ranks.get(vId) || 0;
        if (vRank <= uRank) {
          ranks.set(vId, uRank + 1);
          updated = true;
        }
      });
    });
    if (!updated) break;
  }

  // 5. Group items by rank
  const rawRankMap = {};
  allItems.forEach(item => {
    const r = ranks.get(item.id) || 0;
    if (!rawRankMap[r]) rawRankMap[r] = [];
    rawRankMap[r].push(item);
  });

  // Remap sparse active ranks (e.g. 0, 1, 2, 4, 7, 8) to compact sequential display columns (0, 1, 2, 3, 4, 5)
  const sortedRanks = Object.keys(rawRankMap).map(Number).sort((a, b) => a - b);
  const displayColumns = sortedRanks.map(r => rawRankMap[r]);

  // 6. Calculate Positions Column-by-Column using Parent Y-Barycenters & Center-Spine Anchoring
  const positions = {};

  displayColumns.forEach((itemsInCol, colIdx) => {
    const colX = START_X + colIdx * COL_SPACING;

    if (itemsInCol.length === 1) {
      // Single backbone node in this column -> Anchor directly on horizontal center spine!
      const item = itemsInCol[0];
      positions[item.id] = { x: colX, y: CENTER_Y };
      if (item.memberIds) {
        item.memberIds.forEach(mId => positions[mId] = { x: colX, y: CENTER_Y });
      }
    } else {
      // Multiple parallel branch nodes in this column -> Calculate parent Y barycenter for organic flow
      const itemsWithBary = itemsInCol.map(item => {
        const preds = Array.from(revAdj.get(item.id) || []);
        let sumY = 0, count = 0;
        preds.forEach(pId => {
          if (positions[pId]) {
            sumY += positions[pId].y;
            count++;
          }
        });
        
        // Soft bias for standard naming conventions (Upper: K, K0, Gate / Center: Q / Lower: V, V0, UP)
        let nameBias = 0;
        const idUpper = (item.id || '').toUpperCase();
        if (idUpper.startsWith('K') || idUpper.includes('GATE')) nameBias = -120;
        else if (idUpper.startsWith('V') || idUpper.includes('UP')) nameBias = 120;

        const baryY = count > 0 ? (sumY / count) + nameBias : CENTER_Y + nameBias;
        return { item, baryY };
      });

      // Sort nodes vertically by parent Y barycenter
      itemsWithBary.sort((a, b) => a.baryY - b.baryY);

      // Distribute symmetrically around CENTER_Y
      const n = itemsWithBary.length;
      const stepY = n > 8 ? 45 : NODE_H + ROW_SPACING;
      const totalH = (n - 1) * stepY;
      let startY = CENTER_Y - totalH / 2;

      itemsWithBary.forEach(({ item }, idx) => {
        const yPos = Math.round(startY + idx * stepY);
        positions[item.id] = { x: colX, y: yPos };
        if (item.memberIds) {
          item.memberIds.forEach(mId => positions[mId] = { x: colX, y: yPos });
        }
      });
    }
  });

  // 7. Expanded group members
  groups.forEach(g => {
    if (!g.collapsed) {
      const basePos = positions[g.id] || { x: START_X, y: CENTER_Y };
      g.memberIds.forEach((mId, idx) => {
        if (!positions[mId]) {
          positions[mId] = {
            x: basePos.x,
            y: basePos.y + idx * (NODE_H + ROW_SPACING)
          };
        }
      });
    }
  });

  return positions;
}
