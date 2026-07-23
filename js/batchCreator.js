// Batch Node Creator Modal module with live preview and clear explanations
import { VERTEX_PRESETS, getPresetForType } from './presets.js';

export function openBatchModal(onBatchGenerate) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  
  backdrop.innerHTML = `
    <div class="modal-card modal-large">
      <div class="modal-header">
        <h3>🧬 Batch Create Vertices</h3>
        <button class="btn-close" id="batch-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="info-callout">
          <div class="info-callout-icon">💡</div>
          <div>
            <strong>What does Batch Create do?</strong>
            <p class="text-sm">Batch Create automatically generates a series of parallel vertex slices (e.g. Query/Key/Value attention heads <code>Q_0</code> through <code>Q_13</code>) with sequential port numbers, host IP, parameters, and outgoing target edge connections in one step.</p>
          </div>
        </div>
        
        <div class="form-grid">
          <div class="form-group">
            <label>Vertex Type Preset</label>
            <select id="batch-type" class="form-control">
              ${VERTEX_PRESETS.map(p => `<option value="${p.type}">${p.label} (${p.category})</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>ID Naming Pattern (<code>{i}</code> = slice number)</label>
            <input type="text" id="batch-pattern" class="form-control" value="Q_{i}">
          </div>

          <div class="form-group">
            <label>Start Index</label>
            <input type="number" id="batch-start" class="form-control" value="0" min="0">
          </div>

          <div class="form-group">
            <label>End Index (Total count: <span id="batch-count-badge" class="badge badge-cyan">14</span>)</label>
            <input type="number" id="batch-end" class="form-control" value="13" min="0">
          </div>

          <div class="form-group">
            <label>Base Host IP</label>
            <input type="text" id="batch-host" class="form-control" value="192.168.0.196">
          </div>

          <div class="form-group">
            <label>Start Port (Increments +1 per slice)</label>
            <input type="number" id="batch-port" class="form-control" value="9003">
          </div>

          <div class="form-group">
            <label>Start Internal Port (+1 per slice)</label>
            <input type="number" id="batch-internal-port" class="form-control" value="10003">
          </div>

          <div class="form-group">
            <label>Connect All To Target ID(s)</label>
            <input type="text" id="batch-edges" class="form-control" value="HS0" placeholder="e.g. HS0">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Default Parameters JSON (Applied to all generated slices)</label>
          <textarea id="batch-params" class="form-control code-font" rows="3">{\n  "noOfDimensionHeads": 14,\n  "baseValue": 1000000,\n  "noOfLayers": 24\n}</textarea>
        </div>

        <div class="preview-box mt-3">
          <div class="preview-box-header">
            <span>🔍 Live Generation Preview</span>
            <span class="text-xs text-muted" id="preview-summary">14 vertices will be generated</span>
          </div>
          <div class="preview-list code-font" id="batch-preview-list">
            <!-- Dynamically populated -->
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" id="batch-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="batch-submit-btn">✨ Generate 14 Vertices</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const typeSelect = backdrop.querySelector('#batch-type');
  const patternInput = backdrop.querySelector('#batch-pattern');
  const startInput = backdrop.querySelector('#batch-start');
  const endInput = backdrop.querySelector('#batch-end');
  const hostInput = backdrop.querySelector('#batch-host');
  const portInput = backdrop.querySelector('#batch-port');
  const intPortInput = backdrop.querySelector('#batch-internal-port');
  const edgesInput = backdrop.querySelector('#batch-edges');
  const paramsInput = backdrop.querySelector('#batch-params');
  const previewList = backdrop.querySelector('#batch-preview-list');
  const previewSummary = backdrop.querySelector('#preview-summary');
  const submitBtn = backdrop.querySelector('#batch-submit-btn');
  const countBadge = backdrop.querySelector('#batch-count-badge');

  const updatePreview = () => {
    const pattern = patternInput.value.trim() || 'Node_{i}';
    const start = parseInt(startInput.value, 10) || 0;
    const end = parseInt(endInput.value, 10) || 0;
    const count = Math.max(0, end - start + 1);
    
    countBadge.textContent = `${count} nodes`;
    previewSummary.textContent = `${count} vertices will be generated (${pattern.replace('{i}', start)} ... ${pattern.replace('{i}', end)})`;
    submitBtn.textContent = `✨ Generate ${count} Vertices`;

    const basePort = parseInt(portInput.value, 10) || 9000;
    const baseHost = hostInput.value.trim() || '192.168.0.196';
    const targetEdges = edgesInput.value.trim() || 'none';

    const items = [];
    const previewCount = Math.min(count, 5);
    for (let i = start; i < start + previewCount; i++) {
      const id = pattern.replace('{i}', i);
      items.push(`<li><span class="text-cyan">${id}</span> → host: <code>${baseHost}:${basePort + (i - start)}</code>, edges: <code>[${targetEdges}]</code></li>`);
    }
    if (count > 5) {
      items.push(`<li class="text-muted">... and ${count - 5} more vertices (${pattern.replace('{i}', start + 5)} to ${pattern.replace('{i}', end)})</li>`);
    }

    previewList.innerHTML = items.join('');
  };

  typeSelect.addEventListener('change', () => {
    const preset = getPresetForType(typeSelect.value);
    patternInput.value = `${preset.type}_{i}`;
    hostInput.value = preset.defaultHost;
    portInput.value = preset.defaultPort;
    intPortInput.value = preset.defaultInternalPort;
    const p = { ...preset.params, sliceIndex: 0 };
    paramsInput.value = JSON.stringify(p, null, 2);
    updatePreview();
  });

  [patternInput, startInput, endInput, hostInput, portInput, intPortInput, edgesInput].forEach(el => {
    el.addEventListener('input', updatePreview);
  });

  updatePreview();

  const close = () => backdrop.remove();

  backdrop.querySelector('#batch-close-btn').addEventListener('click', close);
  backdrop.querySelector('#batch-cancel-btn').addEventListener('click', close);
  
  submitBtn.addEventListener('click', () => {
    const type = typeSelect.value;
    const pattern = patternInput.value.trim() || 'Node_{i}';
    const start = parseInt(startInput.value, 10) || 0;
    const end = parseInt(endInput.value, 10) || 0;
    const baseHost = hostInput.value.trim() || '192.168.0.196';
    const basePort = parseInt(portInput.value, 10) || 9000;
    const baseInternalPort = parseInt(intPortInput.value, 10) || 10000;
    const edgesRaw = edgesInput.value.trim();
    const edges = edgesRaw ? edgesRaw.split(',').map(e => e.trim()).filter(Boolean) : [];

    let customParams = {};
    try {
      customParams = JSON.parse(paramsInput.value);
    } catch (e) {
      alert("Invalid JSON in parameters field!");
      return;
    }

    const newVertices = [];
    for (let i = start; i <= end; i++) {
      const id = pattern.replace('{i}', i);
      const vertex = {
        id,
        type,
        host: baseHost,
        port: basePort + (i - start),
        internalPort: baseInternalPort + (i - start),
        params: {
          ...customParams,
          sliceIndex: i
        },
        edges: [...edges]
      };
      newVertices.push(vertex);
    }

    onBatchGenerate(newVertices);
    close();
  });
}
