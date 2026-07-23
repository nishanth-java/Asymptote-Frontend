// Preset definition catalog matching exact topology type conventions and color badge mappings

export const CUSTOM_PRESET = {
  type: "CUSTOM",
  label: "Custom Vertex",
  category: "⚙️ Custom",
  badgeClass: "badge-gray",
  defaultHost: "192.168.0.100",
  defaultPort: 9000,
  defaultInternalPort: 10000,
  params: {}
};

export const VERTEX_PRESETS = [
  {
    type: "EMBEDDING",
    label: "EMBEDDING (Embedding Layer)",
    category: "Embedding",
    badgeClass: "badge-cyan",
    defaultHost: "192.168.0.90",
    defaultPort: 9032,
    defaultInternalPort: 10032,
    params: { dim: 896, vocabSize: 151936 }
  },
  {
    type: "RMS",
    label: "RMS (RMS Normalization)",
    category: "Norm",
    badgeClass: "badge-purple",
    defaultHost: "192.168.0.196",
    defaultPort: 9000,
    defaultInternalPort: 10000,
    params: { eps: 0.000001, dim: 896, noOfLayers: 24 }
  },
  {
    type: "MatWt",
    label: "MatWt (Query Weight Matrix)",
    category: "Attention",
    badgeClass: "badge-blue",
    defaultHost: "192.168.0.83",
    defaultPort: 9027,
    defaultInternalPort: 10027,
    params: { noOfWeightRows: 896, noOfLayers: 24 }
  },
  {
    type: "MatWtK",
    label: "MatWtK (Key Weight Matrix)",
    category: "Attention",
    badgeClass: "badge-teal",
    defaultHost: "192.168.0.90",
    defaultPort: 9001,
    defaultInternalPort: 10001,
    params: { noOfWeightRows: 896, noOfLayers: 24 }
  },
  {
    type: "MatWtV",
    label: "MatWtV (Value Weight Matrix)",
    category: "Attention",
    badgeClass: "badge-emerald",
    defaultHost: "192.168.0.98",
    defaultPort: 9028,
    defaultInternalPort: 10028,
    params: { noOfWeightRows: 896, noOfLayers: 24 }
  },
  {
    type: "Q",
    label: "Q (Query Slice Head)",
    category: "Attention",
    badgeClass: "badge-amber",
    defaultHost: "192.168.0.196",
    defaultPort: 9003,
    defaultInternalPort: 10003,
    params: { noOfDimensionHeads: 14, sliceIndex: 0, baseValue: 1000000, noOfLayers: 24 }
  },
  {
    type: "K",
    label: "K (Key Slice Head)",
    category: "Attention",
    badgeClass: "badge-teal",
    defaultHost: "192.168.0.196",
    defaultPort: 9049,
    defaultInternalPort: 10043,
    params: { sliceIndex: 0, noOfDimensionHeads: 2, baseValue: 1000000 }
  },
  {
    type: "V",
    label: "V (Value Slice Head)",
    category: "Attention",
    badgeClass: "badge-emerald",
    defaultHost: "192.168.0.196",
    defaultPort: 9017,
    defaultInternalPort: 10017,
    params: { sliceIndex: 0, noOfDimensionHeads: 2 }
  },
  {
    type: "HS",
    label: "HS (HStack / Concat)",
    category: "Concat",
    badgeClass: "badge-orange",
    defaultHost: "192.168.0.196",
    defaultPort: 9019,
    defaultInternalPort: 10019,
    params: { expectedInputSize: 14 }
  },
  {
    type: "WO",
    label: "WO / O (Output Weight Matrix)",
    category: "Attention",
    badgeClass: "badge-indigo",
    defaultHost: "192.168.0.86",
    defaultPort: 9020,
    defaultInternalPort: 10020,
    params: { noOfWeightRows: 896, noOfLayers: 24 }
  },
  {
    type: "RES",
    label: "RES (Residual Addition)",
    category: "Residual",
    badgeClass: "badge-rose",
    defaultHost: "192.168.0.196",
    defaultPort: 9021,
    defaultInternalPort: 10021,
    params: {}
  },
  {
    type: "GATE",
    label: "GATE (MLP Gate Matrix)",
    category: "MLP",
    badgeClass: "badge-pink",
    defaultHost: "192.168.0.238",
    defaultPort: 9023,
    defaultInternalPort: 10023,
    params: { noOfWeightRows: 4864, noOfLayers: 24 }
  },
  {
    type: "UP",
    label: "UP (MLP Up Matrix)",
    category: "MLP",
    badgeClass: "badge-lime",
    defaultHost: "192.168.0.99",
    defaultPort: 9024,
    defaultInternalPort: 10024,
    params: { noOfWeightRows: 4864, noOfLayers: 24 }
  },
  {
    type: "DOWN",
    label: "DOWN (MLP Down Matrix)",
    category: "MLP",
    badgeClass: "badge-amber",
    defaultHost: "192.168.0.94",
    defaultPort: 9025,
    defaultInternalPort: 10025,
    params: { noOfWeightRows: 896, noOfLayers: 24 }
  },
  {
    type: "RES_POST",
    label: "RES_POST (Post-MLP Residual)",
    category: "Residual",
    badgeClass: "badge-rose",
    defaultHost: "192.168.0.196",
    defaultPort: 9026,
    defaultInternalPort: 10026,
    params: { noOfLayers: 24 }
  },
  {
    type: "RMS_final",
    label: "RMS_final (Final RMS Norm)",
    category: "Norm",
    badgeClass: "badge-purple",
    defaultHost: "192.168.0.196",
    defaultPort: 9030,
    defaultInternalPort: 10030,
    params: {}
  },
  {
    type: "LM_HEAD",
    label: "LM_HEAD (Language Model Head)",
    category: "Output",
    badgeClass: "badge-red",
    defaultHost: "192.168.0.238",
    defaultPort: 9031,
    defaultInternalPort: 10031,
    params: { noOfWeightRows: 151936, maxNoOfTokens: 30, eosToken: 151643 }
  }
];

export function getPresetForType(type) {
  if (!type) return { badgeClass: 'badge-gray', category: 'Custom' };
  if (type === "CUSTOM") return CUSTOM_PRESET;

  const upper = type.toUpperCase();
  const exact = VERTEX_PRESETS.find(p => p.type === type || p.type.toUpperCase() === upper);
  if (exact) return exact;

  // Vibrant color fallbacks by type substring match
  if (upper.startsWith('EMBED')) return { type, badgeClass: 'badge-cyan', category: 'Embedding' };
  if (upper.includes('RMS')) return { type, badgeClass: 'badge-purple', category: 'Norm' };
  if (upper.startsWith('Q') || upper.includes('ATTN_HEAD')) return { type, badgeClass: 'badge-amber', category: 'Attention' };
  if (upper.startsWith('K') || upper.includes('KEY')) return { type, badgeClass: 'badge-teal', category: 'Attention' };
  if (upper.startsWith('V') || upper.includes('VAL')) return { type, badgeClass: 'badge-emerald', category: 'Attention' };
  if (upper === 'HS' || upper.includes('CONCAT')) return { type, badgeClass: 'badge-orange', category: 'Concat' };
  if (upper === 'O' || upper === 'WO' || upper.includes('OUTPUT')) return { type, badgeClass: 'badge-indigo', category: 'Attention' };
  if (upper.startsWith('RES') || upper.includes('ADD')) return { type, badgeClass: 'badge-rose', category: 'Residual' };
  if (upper === 'GATE' || upper === 'UP' || upper.includes('SWIGLU')) return { type, badgeClass: 'badge-pink', category: 'MLP' };
  if (upper === 'DOWN' || upper.includes('DOWN_PROJ')) return { type, badgeClass: 'badge-lime', category: 'MLP' };
  if (upper.includes('HEAD') || upper.includes('LM')) return { type, badgeClass: 'badge-red', category: 'Output' };

  return {
    type,
    label: type,
    category: 'Custom',
    badgeClass: 'badge-blue',
    defaultHost: '192.168.0.100',
    defaultPort: 9000,
    defaultInternalPort: 10000,
    params: {}
  };
}
