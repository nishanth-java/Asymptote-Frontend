// Custom Vertex Creation Modal with key::value parameter builder & custom type dropdown
import { VERTEX_PRESETS } from './presets.js';

const KNOWN_PARAM_KEYS = [
  "noOfWeightRows",
  "noOfLayers",
  "sliceIndex",
  "noOfDimensionHeads",
  "baseValue",
  "expectedInputSize",
  "maxNoOfTokens",
  "eosToken"
];

export function openCustomVertexModal(onCreateVertex, existingVertexCount = 0) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const defaultId = `Custom${existingVertexCount}`;

  backdrop.innerHTML = `
    <div class="modal-card modal-large">
      <div class="modal-header">
        <h3>➕ Create Custom Vertex</h3>
        <button class="btn-close" id="custom-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label>Vertex ID (Unique Name)</label>
            <input type="text" id="custom-id" class="form-control code-font" value="${defaultId}">
          </div>

          <div class="form-group">
            <label>Vertex Type</label>
            <select id="custom-type-select" class="form-control">
              <option value="__NEW_TYPE__">➕ + Add New Type...</option>
              ${VERTEX_PRESETS.map(p => `<option value="${p.type}">${p.type} (${p.category})</option>`).join('')}
            </select>
          </div>

          <div class="form-group" id="custom-type-new-group" style="display: block;">
            <label>Enter Custom Type Name</label>
            <input type="text" id="custom-type-new-input" class="form-control code-font" value="CUSTOM_LAYER" placeholder="e.g. ROPE, SWIGLU, FLASH_ATTN">
          </div>

          <div class="form-group">
            <label>Host IP</label>
            <input type="text" id="custom-host" class="form-control code-font" value="192.168.0.100">
          </div>

          <div class="form-group">
            <label>Port</label>
            <input type="number" id="custom-port" class="form-control code-font" value="9000">
          </div>

          <div class="form-group">
            <label>Internal Port</label>
            <input type="number" id="custom-internal-port" class="form-control code-font" value="10000">
          </div>
        </div>

        <div class="inspector-section mt-3">
          <label>🧪 Parameters Builder (Use <code>key::value</code> syntax or pick key)</label>
          
          <div class="flex-row gap-2 mt-2">
            <select id="custom-param-preset-key" class="form-control flex-1">
              <option value="">-- Pick Known Param Key --</option>
              ${KNOWN_PARAM_KEYS.map(k => `<option value="${k}">${k}</option>`).join('')}
            </select>
            
            <input type="text" id="custom-param-kv-input" class="form-control flex-2 code-font" placeholder="e.g. noOfWeightRows::151936 or value">
            <button class="btn btn-sm btn-outline" id="custom-add-param-btn">➕ Add</button>
          </div>

          <div class="params-table mt-2" id="custom-params-list">
            <!-- Added params render here as key :: value rows -->
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" id="custom-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="custom-submit-btn">✨ Create Vertex</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const typeSelect = backdrop.querySelector('#custom-type-select');
  const newTypeGroup = backdrop.querySelector('#custom-type-new-group');
  const newTypeInput = backdrop.querySelector('#custom-type-new-input');
  
  const presetKeySelect = backdrop.querySelector('#custom-param-preset-key');
  const kvInput = backdrop.querySelector('#custom-param-kv-input');
  const addParamBtn = backdrop.querySelector('#custom-add-param-btn');
  const paramsList = backdrop.querySelector('#custom-params-list');

  const paramsObj = {};

  // Toggle Custom Type input field
  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === '__NEW_TYPE__') {
      newTypeGroup.style.display = 'block';
    } else {
      newTypeGroup.style.display = 'none';
    }
  });

  // Preset key dropdown select fills kv input
  presetKeySelect.addEventListener('change', () => {
    const key = presetKeySelect.value;
    if (!key) return;
    if (kvInput.value.includes('::')) {
      const parts = kvInput.value.split('::');
      kvInput.value = `${key}::${parts[1] || ''}`;
    } else if (kvInput.value.trim() !== '') {
      kvInput.value = `${key}::${kvInput.value.trim()}`;
    } else {
      kvInput.value = `${key}::`;
    }
  });

  const renderParams = () => {
    const keys = Object.keys(paramsObj);
    if (keys.length === 0) {
      paramsList.innerHTML = `<div class="text-xs text-muted py-2">No parameters added yet. Enter <code>key::value</code> above and click Add.</div>`;
      return;
    }

    paramsList.innerHTML = keys.map(k => `
      <div class="param-row">
        <span class="param-key">${k}</span>
        <span class="code-font text-cyan flex-1">:: ${paramsObj[k]}</span>
        <button class="btn-icon param-del-btn" data-key="${k}">&times;</button>
      </div>
    `).join('');

    paramsList.querySelectorAll('.param-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        delete paramsObj[e.target.dataset.key];
        renderParams();
      });
    });
  };

  addParamBtn.addEventListener('click', () => {
    const raw = kvInput.value.trim();
    if (!raw) return;

    let key = '';
    let valStr = '';

    if (raw.includes('::')) {
      const parts = raw.split('::');
      key = parts[0].trim();
      valStr = parts[1] ? parts[1].trim() : '';
    } else {
      key = presetKeySelect.value.trim();
      valStr = raw;
    }

    if (!key) {
      alert("Please specify a parameter key name or use key::value format!");
      return;
    }

    let parsedVal = valStr;
    if (!isNaN(valStr) && valStr !== '') {
      parsedVal = valStr.includes('.') ? parseFloat(valStr) : parseInt(valStr, 10);
    }

    paramsObj[key] = parsedVal;
    kvInput.value = '';
    presetKeySelect.value = '';
    renderParams();
  });

  renderParams();

  const close = () => backdrop.remove();

  backdrop.querySelector('#custom-close-btn').addEventListener('click', close);
  backdrop.querySelector('#custom-cancel-btn').addEventListener('click', close);

  backdrop.querySelector('#custom-submit-btn').addEventListener('click', () => {
    const id = backdrop.querySelector('#custom-id').value.trim() || defaultId;
    let type = typeSelect.value;
    if (type === '__NEW_TYPE__') {
      type = newTypeInput.value.trim() || 'CUSTOM_TYPE';
    }

    const host = backdrop.querySelector('#custom-host').value.trim() || '192.168.0.100';
    const port = parseInt(backdrop.querySelector('#custom-port').value, 10) || 9000;
    const internalPort = parseInt(backdrop.querySelector('#custom-internal-port').value, 10) || 10000;

    const vertex = {
      id,
      type,
      host,
      port,
      internalPort,
      params: { ...paramsObj },
      edges: []
    };

    onCreateVertex(vertex);
    close();
  });
}
