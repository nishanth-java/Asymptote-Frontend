/**
 * =========================================================================================
 * TOPOLOGY STUDIO - CLUSTER SERVER OVERVIEW & HEARTBEAT TELEMETRY CONTROLLER
 * =========================================================================================
 * File: js/clusterDashboard.js
 * Manages the Deployed Servers Overview Dashboard and Real-Time Heartbeat Telemetry.
 * Includes live polling, ping latency calculation, CPU/RAM metrics, node registration,
 * and simulated node outage recovery testing.
 * =========================================================================================
 */

import { showCustomConfirm, showCustomPrompt, showCustomToast } from './app.js';

export class ClusterDashboard {
  constructor(containerEl) {
    this.container = containerEl;
    this.pollingInterval = null;
    this.isViewActive = false;
    this.telemetryData = null;
  }

  /**
   * Initializes dashboard markup and event bindings.
   */
  init() {
    this.renderSkeleton();
    this.bindEvents();
  }

  /**
   * Renders the shell layout for the Cluster Overview Dashboard.
   */
  renderSkeleton() {
    this.container.innerHTML = `
      <div class="cluster-dashboard-container">
        <!-- Top Action Header -->
        <div class="dashboard-header flex-between mb-4">
          <div>
            <h2 class="font-bold text-lg flex-row gap-2">
              Deployed Cluster Servers &amp; Live Heartbeat Telemetry
            </h2>
            <p class="text-xs text-muted mt-1">
              Real-time monitoring of cluster nodes, target IP reachability, CPU/RAM metrics, and deployed vertex JAR processes.
            </p>
          </div>
          <div class="flex-row gap-2">
            <button class="btn btn-secondary btn-sm" id="btn-register-server" title="Register a new target server IP">
              + Register Server
            </button>
            <button class="btn btn-primary btn-sm" id="btn-ping-all" title="Trigger instant heartbeat ping across all nodes">
              Ping Heartbeats Now
            </button>
          </div>
        </div>

        <!-- Top Cluster Summary Cards (KPIs) -->
        <div class="cluster-kpi-grid mb-4" id="cluster-kpi-container">
          <div class="kpi-card">
            <span class="kpi-label">Total Servers</span>
            <span class="kpi-value text-main" id="kpi-total-servers">-- Nodes</span>
            <span class="kpi-subtext" id="kpi-sub-servers">Registered in Cluster</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Alive / Reachable</span>
            <span class="kpi-value color-emerald" id="kpi-alive-servers">-- Alive</span>
            <span class="kpi-subtext" id="kpi-sub-alive">0 Unreachable</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Deployed Vertices</span>
            <span class="kpi-value color-blue" id="kpi-deployed-vertices">-- Vertices</span>
            <span class="kpi-subtext" id="kpi-sub-vertices">Active Across Servers</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Global Cluster RAM</span>
            <span class="kpi-value color-amber" id="kpi-cluster-ram">-- %</span>
            <div class="progress-bar-container mt-1">
              <div class="progress-bar-fill bg-amber" id="kpi-ram-bar" style="width: 0%;"></div>
            </div>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Global Cluster CPU</span>
            <span class="kpi-value color-purple" id="kpi-cluster-cpu">-- %</span>
            <div class="progress-bar-container mt-1">
              <div class="progress-bar-fill bg-purple" id="kpi-cpu-bar" style="width: 0%;"></div>
            </div>
          </div>
        </div>

        <!-- Server Grid Container -->
        <div class="server-cards-grid" id="server-cards-grid">
          <div class="text-muted text-sm py-4 text-center">Fetching server heartbeat telemetry...</div>
        </div>
      </div>
    `;
  }

  /**
   * Binds action buttons for pinging, registering servers, and toggling state.
   */
  bindEvents() {
    const pingAllBtn = this.container.querySelector('#btn-ping-all');
    if (pingAllBtn) {
      pingAllBtn.addEventListener('click', () => this.fetchTelemetry(true));
    }

    const registerBtn = this.container.querySelector('#btn-register-server');
    if (registerBtn) {
      registerBtn.addEventListener('click', () => this.openRegisterModal());
    }
  }

  /**
   * Starts live telemetry polling (every 4 seconds) when the tab is active.
   */
  startPolling() {
    this.isViewActive = true;
    this.fetchTelemetry(false);
    if (!this.pollingInterval) {
      this.pollingInterval = setInterval(() => {
        if (this.isViewActive) {
          this.fetchTelemetry(false);
        }
      }, 4000);
    }
  }

  /**
   * Stops live telemetry polling when switching tabs.
   */
  stopPolling() {
    this.isViewActive = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Fetches real-time heartbeat status from backend API `/api/servers/heartbeat`.
   */
  async fetchTelemetry(userTriggered = false) {
    try {
      const res = await fetch('/api/servers/heartbeat');
      if (!res.ok) throw new Error("Failed to fetch server heartbeat");
      const data = await res.json();
      this.telemetryData = data;
      this.renderTelemetryData(data);
      if (userTriggered) {
        showCustomToast("Heartbeats pinged across all cluster servers", "success");
      }
    } catch (err) {
      console.warn("Heartbeat Error:", err.message);
      if (userTriggered) {
        showCustomToast("Heartbeat Ping Error: " + err.message, "error");
      }
    }
  }

  /**
   * Renders updated telemetry data into KPI cards and individual Server Cards.
   */
  renderTelemetryData(data) {
    const { summary = {}, servers = [] } = data;

    // Update KPI Summary Cards
    const kpiTotal = this.container.querySelector('#kpi-total-servers');
    const kpiAlive = this.container.querySelector('#kpi-alive-servers');
    const kpiSubAlive = this.container.querySelector('#kpi-sub-alive');
    const kpiVertices = this.container.querySelector('#kpi-deployed-vertices');
    const kpiRam = this.container.querySelector('#kpi-cluster-ram');
    const kpiRamBar = this.container.querySelector('#kpi-ram-bar');
    const kpiCpu = this.container.querySelector('#kpi-cluster-cpu');
    const kpiCpuBar = this.container.querySelector('#kpi-cpu-bar');

    if (kpiTotal) kpiTotal.textContent = `${summary.totalServers || servers.length} Nodes`;
    if (kpiAlive) {
      kpiAlive.textContent = `${summary.aliveCount || 0} Alive`;
      kpiAlive.className = summary.unreachableCount > 0 ? "kpi-value color-amber" : "kpi-value color-emerald";
    }
    if (kpiSubAlive) kpiSubAlive.textContent = `${summary.unreachableCount || 0} Unreachable`;
    if (kpiVertices) kpiVertices.textContent = `${summary.totalDeployedVertices || 0} Running`;
    if (kpiRam) kpiRam.textContent = `${summary.avgRamUtil || 0}%`;
    if (kpiRamBar) kpiRamBar.style.width = `${summary.avgRamUtil || 0}%`;
    if (kpiCpu) kpiCpu.textContent = `${summary.avgCpuUtil || 0}%`;
    if (kpiCpuBar) kpiCpuBar.style.width = `${summary.avgCpuUtil || 0}%`;

    // Render Server Cards Grid
    const grid = this.container.querySelector('#server-cards-grid');
    if (!grid) return;

    if (servers.length === 0) {
      grid.innerHTML = `<div class="text-muted text-sm py-4 text-center">No server nodes registered. Click "+ Register Server" to add target IPs.</div>`;
      return;
    }

    grid.innerHTML = servers.map(srv => {
      const isOnline = srv.status === 'ONLINE';
      const isHighLoad = srv.status === 'HIGH_LOAD';
      
      let badgeHtml = `<span class="server-status-badge badge-emerald"><span class="pulse-dot bg-emerald"></span> ALIVE (ONLINE)</span>`;
      if (isHighLoad) {
        badgeHtml = `<span class="server-status-badge badge-amber"><span class="pulse-dot bg-amber"></span> HIGH LOAD</span>`;
      } else if (!isOnline) {
        badgeHtml = `<span class="server-status-badge badge-rose"><span class="pulse-dot bg-rose"></span> UNREACHABLE (DEAD)</span>`;
      }

      const deployedList = srv.activeDeployedVertices && srv.activeDeployedVertices.length > 0
        ? srv.activeDeployedVertices.map(v => `<span class="badge badge-blue"><code>${v}</code></span>`).join(' ')
        : `<span class="text-xs text-muted">No vertices currently deployed</span>`;

      const jarList = srv.runningJars && srv.runningJars.length > 0
        ? srv.runningJars.map(j => `<div class="text-xs code-font text-muted">• ${j.jarName} (${j.sizeMb} MB)</div>`).join('')
        : `<div class="text-xs text-muted">No JAR processes running</div>`;

      return `
        <div class="server-node-card ${!isOnline ? 'offline-node' : ''}">
          <div class="server-node-header flex-between mb-2">
            <div>
              <h3 class="server-node-title font-bold text-md code-font">
                ${srv.serverIp}
              </h3>
              <span class="text-xs text-muted">${srv.hostname || 'node.cluster.local'}</span>
            </div>
            ${badgeHtml}
          </div>

          <div class="server-hardware-info mb-3">
            <div class="flex-between text-xs text-muted mb-1">
              <span>Hardware Specs:</span>
              <span class="font-semibold text-main">${srv.cpuCores} Cores • ${srv.ramGb} GB RAM • ${srv.gpuName || 'CPU Worker'}</span>
            </div>
            <div class="flex-between text-xs text-muted mb-1">
              <span>Heartbeat Latency:</span>
              <span class="font-bold code-font color-cyan">${srv.pingMs} ms</span>
            </div>
            <div class="flex-between text-xs text-muted">
              <span>Last Heartbeat:</span>
              <span class="code-font">${new Date(srv.lastPing).toLocaleTimeString()}</span>
            </div>
          </div>

          <!-- CPU & RAM Progress Bars -->
          <div class="server-metrics-group mb-3">
            <div class="metric-row mb-1">
              <div class="flex-between text-xs font-semibold mb-1">
                <span>CPU Load</span>
                <span>${srv.cpuUtil}%</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar-fill ${srv.cpuUtil > 80 ? 'bg-rose' : 'bg-purple'}" style="width: ${srv.cpuUtil}%;"></div>
              </div>
            </div>
            <div class="metric-row">
              <div class="flex-between text-xs font-semibold mb-1">
                <span>RAM Usage</span>
                <span>${srv.ramUtil}% (${Math.round((srv.ramGb * srv.ramUtil) / 100)} / ${srv.ramGb} GB)</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar-fill ${srv.ramUtil > 85 ? 'bg-rose' : 'bg-amber'}" style="width: ${srv.ramUtil}%;"></div>
              </div>
            </div>
          </div>

          <!-- Deployed Vertices & Executing JARs -->
          <div class="server-deployed-section mb-3">
            <div class="text-xs font-bold text-muted mb-1">Deployed Vertices & Active JAR Binaries:</div>
            <div class="flex-row gap-1 flex-wrap mb-2">
              ${deployedList}
            </div>
            <div class="running-jars-list">
              ${jarList}
            </div>
          </div>

          <!-- Card Actions -->
          <div class="server-node-actions flex-between pt-2 border-top">
            <button class="btn btn-xs btn-outline btn-ping-node" data-ip="${srv.serverIp}">
              ⚡ Ping Node
            </button>
            <button class="btn btn-xs ${isOnline ? 'btn-danger-outline' : 'btn-primary-outline'} btn-toggle-node" data-ip="${srv.serverIp}" data-status="${srv.status}">
              ${isOnline ? 'Simulate Outage (Kill)' : 'Recover Node (Bring Online)'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind individual card action buttons
    grid.querySelectorAll('.btn-ping-node').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const ip = e.target.dataset.ip;
        btn.disabled = true;
        btn.textContent = "Pinging...";
        try {
          const res = await fetch('/api/servers/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverIp: ip })
          });
          const result = await res.json();
          showCustomToast(`Ping to ${ip}: ${result.pingMs} ms (${result.status})`, result.status === 'ONLINE' ? 'success' : 'error');
          await this.fetchTelemetry(false);
        } catch (err) {
          showCustomToast(`Failed to ping ${ip}: ` + err.message, "error");
        } finally {
          btn.disabled = false;
          btn.textContent = "⚡ Ping Node";
        }
      });
    });

    grid.querySelectorAll('.btn-toggle-node').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const ip = e.target.dataset.ip;
        const currStatus = e.target.dataset.status;
        const nextStatus = currStatus === 'ONLINE' ? 'DEAD' : 'ONLINE';

        const confirmed = await showCustomConfirm(
          currStatus === 'ONLINE' ? "Simulate Node Outage" : "Recover Node",
          `Are you sure you want to change status of server ${ip} to ${nextStatus}?`
        );
        if (!confirmed) return;

        try {
          const res = await fetch('/api/servers/toggle-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverIp: ip, newStatus: nextStatus })
          });
          const result = await res.json();
          showCustomToast(`Server ${ip} status updated to ${nextStatus}`, nextStatus === 'ONLINE' ? 'success' : 'error');
          await this.fetchTelemetry(false);
        } catch (err) {
          showCustomToast("Status toggle failed: " + err.message, "error");
        }
      });
    });
  }

  /**
   * Opens in-app UI prompt modal to register a new target server IP.
   */
  async openRegisterModal() {
    const ipInput = await showCustomPrompt(
      "Register Target Server Node",
      "Enter Server IP Address (e.g. 192.168.0.199):",
      "192.168.0.199"
    );
    if (!ipInput) return;

    const hostnameInput = await showCustomPrompt(
      "Server Hostname",
      `Enter hostname for ${ipInput}:`,
      `gpu-node-${Math.floor(Math.random() * 90 + 10)}.local`
    );

    try {
      const res = await fetch('/api/servers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverIp: ipInput,
          hostname: hostnameInput || 'gpu-worker.local',
          cpuCores: 64,
          ramGb: 256,
          gpuName: 'NVIDIA H100 80GB'
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to register server");

      showCustomToast(`Server ${ipInput} registered successfully!`, "success");
      await this.fetchTelemetry(false);
    } catch (err) {
      showCustomToast("Registration Failed: " + err.message, "error");
    }
  }
}
