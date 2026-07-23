// TEMPORARY STARTER MOCK DATA FILE
// Note: If this file is deleted, the application relies 100% EXCLUSIVELY on backend REST API endpoints.

export const FALLBACK_PRESETS = [
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

export const STARTER_VERTICES = [
  { id: "EMBED", type: "EMBEDDING", host: "192.168.0.196", port: 9000, internalPort: 10000, params: { dim: 896, vocabSize: 151936 }, edges: ["RMS0", "RES0"] },
  { id: "RMS0", type: "RMS", host: "192.168.0.196", port: 9001, internalPort: 10001, params: { eps: 0.000001, dim: 896 }, edges: ["K", "V", "Q_0", "Q_1", "Q_2", "Q_3", "Q_4", "Q_5", "Q_6", "Q_7", "Q_8", "Q_9", "Q_10", "Q_11", "Q_12", "Q_13"] },
  { id: "K", type: "KEY_VALUE_PROJ", host: "192.168.0.196", port: 9002, internalPort: 10002, params: { numHeads: 2, headDim: 128 }, edges: ["K0", "K1"] },
  { id: "V", type: "KEY_VALUE_PROJ", host: "192.168.0.196", port: 9002, internalPort: 10002, params: { numHeads: 2, headDim: 128 }, edges: ["V0", "V1"] },
  { id: "K0", type: "K", host: "192.168.0.196", port: 9003, internalPort: 10003, params: { sliceIndex: 0 }, edges: ["Q_0", "Q_1", "Q_2", "Q_3", "Q_4", "Q_5", "Q_6"] },
  { id: "V0", type: "V", host: "192.168.0.196", port: 9003, internalPort: 10003, params: { sliceIndex: 0 }, edges: ["Q_0", "Q_1", "Q_2", "Q_3", "Q_4", "Q_5", "Q_6"] },
  { id: "K1", type: "K", host: "192.168.0.196", port: 9004, internalPort: 10004, params: { sliceIndex: 1 }, edges: ["Q_7", "Q_8", "Q_9", "Q_10", "Q_11", "Q_12", "Q_13"] },
  { id: "V1", type: "V", host: "192.168.0.196", port: 9004, internalPort: 10004, params: { sliceIndex: 1 }, edges: ["Q_7", "Q_8", "Q_9", "Q_10", "Q_11", "Q_12", "Q_13"] },
  
  // Q_0 .. Q_13
  ...Array.from({ length: 14 }, (_, i) => ({
    id: `Q_${i}`,
    type: "Q",
    host: "192.168.0.196",
    port: 9003 + i,
    internalPort: 10003 + i,
    params: { noOfDimensionHeads: 14, baseValue: 1000000, noOfLayers: 24, sliceIndex: i },
    edges: ["HS0"]
  })),

  { id: "HS0", type: "HS", host: "192.168.0.196", port: 9017, internalPort: 10017, params: { concatDim: 1792 }, edges: ["O"] },
  { id: "O", type: "O", host: "192.168.0.196", port: 9018, internalPort: 10018, params: { outDim: 896 }, edges: ["RES0"] },
  { id: "RES0", type: "RES", host: "192.168.0.196", port: 9019, internalPort: 10019, params: { mode: "elementwise_add" }, edges: ["RMS1", "RES1"] },
  { id: "RMS1", type: "RMS", host: "192.168.0.196", port: 9020, internalPort: 10020, params: { eps: 0.000001, dim: 896 }, edges: ["GATE", "UP"] },
  { id: "GATE", type: "GATE", host: "192.168.0.196", port: 9021, internalPort: 10021, params: { hiddenDim: 4864 }, edges: ["DOWN"] },
  { id: "UP", type: "UP", host: "192.168.0.196", port: 9021, internalPort: 10021, params: { hiddenDim: 4864 }, edges: ["DOWN"] },
  { id: "DOWN", type: "DOWN", host: "192.168.0.196", port: 9022, internalPort: 10022, params: { outDim: 896 }, edges: ["RES1"] },
  { id: "RES1", type: "RES", host: "192.168.0.196", port: 9023, internalPort: 10023, params: { mode: "elementwise_add" }, edges: ["finalRMS"] },
  { id: "finalRMS", type: "RMS_final", host: "192.168.0.196", port: 9024, internalPort: 10024, params: { eps: 0.000001, dim: 896 }, edges: ["LMHead"] },
  { id: "LMHead", type: "LM_HEAD", host: "192.168.0.196", port: 9025, internalPort: 10025, params: { vocabSize: 151936 }, edges: [] }
];

export const STARTER_GROUPS = [
  {
    id: "group-Q0:Q6",
    label: "Q0:Q6",
    memberIds: ["Q_0", "Q_1", "Q_2", "Q_3", "Q_4", "Q_5", "Q_6"],
    collapsed: true
  },
  {
    id: "group-Q7:Q13",
    label: "Q7:Q13",
    memberIds: ["Q_7", "Q_8", "Q_9", "Q_10", "Q_11", "Q_12", "Q_13"],
    collapsed: true
  }
];
