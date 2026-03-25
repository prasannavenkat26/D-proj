(function () {
  const session = window.DDSAuth.requireRole(["admin"]);
  if (!session) return;

  const { refs, defaultAdminState, defaultDrone, pushAlert, pushLog, exportPath, writePath, seedDefaults } = window.DDSFirebase;

  const dom = {
    backViewer: document.getElementById("backViewer"),
    logoutButton: document.getElementById("logoutButton"),
    adminStateBadge: document.getElementById("adminStateBadge"),
    modeBadge: document.getElementById("modeBadge"),
    overviewDroneCount: document.getElementById("overviewDroneCount"),
    overviewAlertCount: document.getElementById("overviewAlertCount"),
    overviewSystemState: document.getElementById("overviewSystemState"),
    overviewSession: document.getElementById("overviewSession"),
    toggleSystem: document.getElementById("toggleSystem"),
    emergencyShutdown: document.getElementById("emergencyShutdown"),
    resetSystem: document.getElementById("resetSystem"),
    toggleMode: document.getElementById("toggleMode"),
    adminThreatLevel: document.getElementById("adminThreatLevel"),
    aiThreatToggle: document.getElementById("aiThreatToggle"),
    geofenceToggle: document.getElementById("geofenceToggle"),
    geofenceRadius: document.getElementById("geofenceRadius"),
    applyThreatSettings: document.getElementById("applyThreatSettings"),
    droneIdInput: document.getElementById("droneIdInput"),
    droneStatusInput: document.getElementById("droneStatusInput"),
    droneLatInput: document.getElementById("droneLatInput"),
    droneLngInput: document.getElementById("droneLngInput"),
    droneSpeedInput: document.getElementById("droneSpeedInput"),
    droneAltitudeInput: document.getElementById("droneAltitudeInput"),
    droneBatteryInput: document.getElementById("droneBatteryInput"),
    droneSignalInput: document.getElementById("droneSignalInput"),
    droneDistanceInput: document.getElementById("droneDistanceInput"),
    droneSnapshotInput: document.getElementById("droneSnapshotInput"),
    saveDrone: document.getElementById("saveDrone"),
    removeDrone: document.getElementById("removeDrone"),
    simulateMove: document.getElementById("simulateMove"),
    toggleMapLayer: document.getElementById("toggleMapLayer"),
    setZoneFromCenter: document.getElementById("setZoneFromCenter"),
    alertLevelFilter: document.getElementById("alertLevelFilter"),
    alertDateFilter: document.getElementById("alertDateFilter"),
    sirenToggle: document.getElementById("sirenToggle"),
    popupToggle: document.getElementById("popupToggle"),
    pushToggle: document.getElementById("pushToggle"),
    triggerManualAlert: document.getElementById("triggerManualAlert"),
    applyAlertSettings: document.getElementById("applyAlertSettings"),
    alertList: document.getElementById("alertList"),
    logSearch: document.getElementById("logSearch"),
    logDateFilter: document.getElementById("logDateFilter"),
    logList: document.getElementById("logList"),
    exportJsonReport: document.getElementById("exportJsonReport"),
    exportCsvReport: document.getElementById("exportCsvReport"),
    radarToggle: document.getElementById("radarToggle"),
    notificationsToggle: document.getElementById("notificationsToggle"),
    reconnectToggle: document.getElementById("reconnectToggle"),
    offlineToggle: document.getElementById("offlineToggle"),
    themeSelect: document.getElementById("themeSelect"),
    saveSettings: document.getElementById("saveSettings"),
    databasePathInput: document.getElementById("databasePathInput"),
    rawDataEditor: document.getElementById("rawDataEditor"),
    loadPathData: document.getElementById("loadPathData"),
    savePathData: document.getElementById("savePathData"),
    backupDatabase: document.getElementById("backupDatabase"),
    importJsonInput: document.getElementById("importJsonInput")
  };

  const state = {
    admin: { ...defaultAdminState },
    drones: [],
    alerts: [],
    logs: [],
    map: null,
    markers: new Map(),
    geofenceCircle: null,
    charts: {},
    usingAltLayer: false
  };

  const baseLayer = () => L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  });
  const altLayer = () => L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  });
  let activeLayer = null;

  function init() {
    seedDefaults();
    dom.overviewSession.textContent = session.email;
    bindEvents();
    initMap();
    initCharts();
    subscribeRealtime();
  }

  function bindEvents() {
    dom.backViewer.addEventListener("click", () => { window.location.href = "dashboard.html"; });
    dom.logoutButton.addEventListener("click", () => { window.DDSAuth.clearSession(); window.location.href = "login.html"; });
    dom.toggleSystem.addEventListener("click", async () => { await refs.admin.update({ systemActive: !state.admin.systemActive }); await logAction("Toggled system power"); });
    dom.emergencyShutdown.addEventListener("click", emergencyShutdown);
    dom.resetSystem.addEventListener("click", resetSystem);
    dom.toggleMode.addEventListener("click", async () => {
      const mode = state.admin.mode === "LIVE" ? "SIMULATION" : "LIVE";
      await refs.admin.update({ mode });
      await logAction(`Mode switched to ${mode}`);
    });
    dom.applyThreatSettings.addEventListener("click", applyThreatSettings);
    dom.saveDrone.addEventListener("click", saveDrone);
    dom.removeDrone.addEventListener("click", removeDrone);
    dom.simulateMove.addEventListener("click", simulateMovement);
    dom.toggleMapLayer.addEventListener("click", toggleMapLayer);
    dom.setZoneFromCenter.addEventListener("click", setZoneFromMapCenter);
    dom.triggerManualAlert.addEventListener("click", triggerManualAlert);
    dom.applyAlertSettings.addEventListener("click", applyAlertSettings);
    dom.alertLevelFilter.addEventListener("change", renderAlerts);
    dom.alertDateFilter.addEventListener("change", renderAlerts);
    dom.logSearch.addEventListener("input", renderLogs);
    dom.logDateFilter.addEventListener("change", renderLogs);
    dom.saveSettings.addEventListener("click", saveSettings);
    dom.loadPathData.addEventListener("click", loadPathData);
    dom.savePathData.addEventListener("click", savePathData);
    dom.backupDatabase.addEventListener("click", backupDatabase);
    dom.importJsonInput.addEventListener("change", importJsonFile);
    dom.exportJsonReport.addEventListener("click", exportJsonReport);
    dom.exportCsvReport.addEventListener("click", exportCsvReport);
  }

  function subscribeRealtime() {
    refs.admin.on("value", (snapshot) => {
      state.admin = { ...defaultAdminState, ...(snapshot.val() || {}) };
      renderAdminState();
    });
    refs.drone.on("value", syncDrones);
    refs.drones.on("value", syncDrones);
    refs.alerts.limitToLast(100).on("value", (snapshot) => {
      const value = snapshot.val() || {};
      state.alerts = Object.entries(value).map(([id, item]) => ({ id, ...item })).sort((a, b) => new Date(b.time) - new Date(a.time));
      renderAlerts();
      renderCharts();
      updateOverview();
    });
    refs.logs.limitToLast(150).on("value", (snapshot) => {
      const value = snapshot.val() || {};
      state.logs = Object.entries(value).map(([id, item]) => ({ id, ...item })).sort((a, b) => new Date(b.time) - new Date(a.time));
      renderLogs();
    });
  }

  function syncDrones() {
    Promise.all([refs.drone.get(), refs.drones.get()]).then(([mainSnap, fleetSnap]) => {
      const drones = [];
      if (mainSnap.exists()) drones.push(normalizeDrone(mainSnap.val(), "drone-main"));
      if (fleetSnap.exists()) Object.entries(fleetSnap.val()).forEach(([key, item]) => drones.push(normalizeDrone(item, key)));
      state.drones = dedupeById(drones);
      updateOverview();
      renderMapDrones();
    });
  }

  function normalizeDrone(item, fallbackId) {
    return {
      id: item.id || fallbackId,
      status: item.status || "No Drone",
      lat: Number(item.lat ?? defaultDrone.lat),
      lng: Number(item.lng ?? defaultDrone.lng),
      speed: Number(item.speed ?? 0),
      altitude: Number(item.altitude ?? 0),
      battery: Number(item.battery ?? 100),
      signal: Number(item.signal ?? 100),
      distance: Number(item.distance ?? 0),
      threat: item.threat || "LOW",
      snapshot: item.snapshot || defaultDrone.snapshot
    };
  }

  function dedupeById(drones) {
    const map = new Map();
    drones.forEach((drone) => map.set(drone.id, drone));
    return Array.from(map.values());
  }

  function renderAdminState() {
    dom.adminStateBadge.textContent = state.admin.systemActive ? "System Active" : "System Offline";
    dom.adminStateBadge.className = `status-pill ${state.admin.systemActive ? "online" : "offline"}`;
    dom.modeBadge.textContent = `${state.admin.mode} MODE`;
    dom.themeSelect.value = state.admin.theme;
    dom.radarToggle.checked = !!state.admin.radar;
    dom.notificationsToggle.checked = !!state.admin.notifications;
    dom.reconnectToggle.checked = !!state.admin.autoReconnect;
    dom.offlineToggle.checked = !!state.admin.offlineMode;
    dom.sirenToggle.checked = !!state.admin.siren;
    dom.popupToggle.checked = !!state.admin.popups;
    dom.pushToggle.checked = !!state.admin.push;
    dom.aiThreatToggle.checked = !!state.admin.aiThreat;
    dom.geofenceToggle.checked = !!state.admin.geofenceEnabled;
    dom.geofenceRadius.value = state.admin.geofenceRadius;
    renderGeofence();
    updateOverview();
  }

  function updateOverview() {
    dom.overviewDroneCount.textContent = String(state.drones.length);
    dom.overviewAlertCount.textContent = String(state.alerts.length);
    dom.overviewSystemState.textContent = state.admin.systemActive ? "ONLINE" : "OFFLINE";
  }

  async function emergencyShutdown() {
    await refs.admin.update({ systemActive: false, mode: "LIVE" });
    await refs.drone.update({ status: "No Drone", threat: "LOW", speed: 0 });
    await pushAlert({ type: "Emergency Shutdown", level: "HIGH", message: "Admin initiated emergency shutdown.", droneId: "system" });
    await logAction("Emergency shutdown");
  }

  async function resetSystem() {
    await refs.admin.set({ ...defaultAdminState });
    await refs.drone.set({ ...defaultDrone, timestamp: new Date().toISOString() });
    await logAction("System reset to defaults");
  }

  async function applyThreatSettings() {
    await refs.admin.update({
      aiThreat: dom.aiThreatToggle.checked,
      geofenceEnabled: dom.geofenceToggle.checked,
      geofenceRadius: Number(dom.geofenceRadius.value)
    });
    await refs.drone.update({ threat: dom.adminThreatLevel.value });
    await logAction("Threat settings updated");
  }

  async function saveDrone() {
    const id = dom.droneIdInput.value.trim() || "drone-main";
    const payload = {
      id,
      status: dom.droneStatusInput.value,
      lat: Number(dom.droneLatInput.value),
      lng: Number(dom.droneLngInput.value),
      speed: Number(dom.droneSpeedInput.value),
      altitude: Number(dom.droneAltitudeInput.value),
      battery: Number(dom.droneBatteryInput.value),
      signal: Number(dom.droneSignalInput.value),
      distance: Number(dom.droneDistanceInput.value),
      threat: dom.adminThreatLevel.value,
      timestamp: new Date().toISOString(),
      snapshot: dom.droneSnapshotInput.value.trim() || defaultDrone.snapshot
    };
    await refs.drone.set(payload);
    await refs.drones.child(id).set(payload);
    await logAction(`Drone ${id} saved`);
  }

  async function removeDrone() {
    const id = dom.droneIdInput.value.trim();
    if (!id) return;
    await refs.drones.child(id).remove();
    await logAction(`Drone ${id} removed`);
  }

  async function simulateMovement() {
    dom.droneLatInput.value = (Number(dom.droneLatInput.value) + 0.0025).toFixed(4);
    dom.droneLngInput.value = (Number(dom.droneLngInput.value) + 0.0025).toFixed(4);
    dom.droneDistanceInput.value = String(Math.max(10, Number(dom.droneDistanceInput.value) - 8));
    await saveDrone();
    await logAction("Simulated drone movement");
  }

  async function triggerManualAlert() {
    const target = state.drones[0] || defaultDrone;
    await pushAlert({
      type: "Manual Admin Alert",
      level: dom.adminThreatLevel.value,
      droneId: target.id,
      message: `Admin triggered manual alert for ${target.id}.`
    });
    await logAction("Manual alert triggered");
  }

  async function applyAlertSettings() {
    await refs.admin.update({
      siren: dom.sirenToggle.checked,
      popups: dom.popupToggle.checked,
      push: dom.pushToggle.checked
    });
    await logAction("Alert settings updated");
  }

  async function saveSettings() {
    await refs.admin.update({
      radar: dom.radarToggle.checked,
      notifications: dom.notificationsToggle.checked,
      autoReconnect: dom.reconnectToggle.checked,
      offlineMode: dom.offlineToggle.checked,
      theme: dom.themeSelect.value
    });
    await logAction("Global settings saved");
  }

  function initMap() {
    state.map = L.map("adminMap").setView([defaultDrone.lat, defaultDrone.lng], 11);
    activeLayer = baseLayer().addTo(state.map);
  }

  function renderMapDrones() {
    if (!state.map) return;
    state.drones.forEach((drone) => {
      if (!state.markers.has(drone.id)) {
        const marker = L.marker([drone.lat, drone.lng], { draggable: true }).addTo(state.map);
        marker.on("dragend", async () => {
          const position = marker.getLatLng();
          await refs.drones.child(drone.id).update({ lat: position.lat, lng: position.lng, timestamp: new Date().toISOString() });
          if (drone.id === "drone-main") await refs.drone.update({ lat: position.lat, lng: position.lng, timestamp: new Date().toISOString() });
          await logAction(`Dragged ${drone.id} on map`);
        });
        state.markers.set(drone.id, marker);
      }
      state.markers.get(drone.id).setLatLng([drone.lat, drone.lng]);
    });
    if (state.drones[0]) state.map.panTo([state.drones[0].lat, state.drones[0].lng], { animate: true, duration: 0.35 });
    renderGeofence();
  }

  function renderGeofence() {
    if (!state.map) return;
    if (state.geofenceCircle) {
      state.map.removeLayer(state.geofenceCircle);
      state.geofenceCircle = null;
    }
    if (!state.admin.geofenceEnabled) return;
    const centerDrone = state.drones[0] || defaultDrone;
    state.geofenceCircle = L.circle([centerDrone.lat, centerDrone.lng], {
      radius: Number(state.admin.geofenceRadius || 120),
      color: "#ffd166",
      fillColor: "rgba(255, 209, 102, 0.14)"
    }).addTo(state.map);
  }

  async function setZoneFromMapCenter() {
    const center = state.map.getCenter();
    await refs.drone.update({ lat: center.lat, lng: center.lng, timestamp: new Date().toISOString() });
    await refs.admin.update({ geofenceEnabled: true, geofenceRadius: Number(dom.geofenceRadius.value) });
    await logAction("Geofence centered from admin map");
  }

  async function toggleMapLayer() {
    if (activeLayer) state.map.removeLayer(activeLayer);
    state.usingAltLayer = !state.usingAltLayer;
    activeLayer = (state.usingAltLayer ? altLayer() : baseLayer()).addTo(state.map);
    await logAction(`Map layer switched to ${state.usingAltLayer ? "dark" : "default"}`);
  }

  function renderAlerts() {
    const level = dom.alertLevelFilter.value;
    const date = dom.alertDateFilter.value;
    const filtered = state.alerts.filter((alert) => (!level || alert.level === level) && (!date || String(alert.time).startsWith(date)));
    dom.alertList.innerHTML = filtered.length ? filtered.map((alert) => `
      <div class="list-item">
        <strong>${escapeHtml(alert.type)} - ${escapeHtml(alert.level)}</strong>
        <p>${escapeHtml(alert.message || "")}</p>
        <p>${new Date(alert.time).toLocaleString()}</p>
        <button class="ghost-button" type="button" data-delete-alert="${alert.id}">Delete</button>
      </div>
    `).join("") : '<div class="list-item"><strong>No alerts</strong><p>Filtered alert list is empty.</p></div>';
    dom.alertList.querySelectorAll("[data-delete-alert]").forEach((button) => {
      button.addEventListener("click", async () => {
        await refs.alerts.child(button.dataset.deleteAlert).remove();
        await logAction(`Deleted alert ${button.dataset.deleteAlert}`);
      });
    });
  }

  function renderLogs() {
    const query = dom.logSearch.value.trim().toLowerCase();
    const date = dom.logDateFilter.value;
    const filtered = state.logs.filter((log) => (!query || `${log.action} ${log.details} ${log.actor}`.toLowerCase().includes(query)) && (!date || String(log.time).startsWith(date)));
    dom.logList.innerHTML = filtered.length ? filtered.map((log) => `
      <div class="list-item">
        <strong>${escapeHtml(log.action)}</strong>
        <p>${escapeHtml(log.actor || "system")} • ${new Date(log.time).toLocaleString()}</p>
        <p>${escapeHtml(log.details || "")}</p>
      </div>
    `).join("") : '<div class="list-item"><strong>No logs</strong><p>No logs match the current filter.</p></div>';
  }

  function initCharts() {
    state.charts.analytics = new Chart(document.getElementById("analyticsChart"), {
      type: "line",
      data: { labels: [], datasets: [{ label: "Alerts Per Hour", data: [], borderColor: "#48dbfb", backgroundColor: "rgba(72,219,251,0.15)", fill: true }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#ecf4ff" } } }, scales: { x: { ticks: { color: "#90a3c4" } }, y: { ticks: { color: "#90a3c4" } } } }
    });
    state.charts.threat = new Chart(document.getElementById("threatChart"), {
      type: "doughnut",
      data: { labels: ["LOW", "MEDIUM", "HIGH"], datasets: [{ data: [0, 0, 0], backgroundColor: ["#40f3a1", "#ffd166", "#ff4d6d"] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#ecf4ff" } } } }
    });
  }

  function renderCharts() {
    const byHour = new Map();
    const threatCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    state.alerts.forEach((alert) => {
      const hour = new Date(alert.time).getHours();
      byHour.set(hour, (byHour.get(hour) || 0) + 1);
      threatCounts[alert.level] = (threatCounts[alert.level] || 0) + 1;
    });
    const hours = Array.from(byHour.keys()).sort((a, b) => a - b);
    state.charts.analytics.data.labels = hours.map((hour) => `${hour}:00`);
    state.charts.analytics.data.datasets[0].data = hours.map((hour) => byHour.get(hour));
    state.charts.analytics.update();
    state.charts.threat.data.datasets[0].data = [threatCounts.LOW || 0, threatCounts.MEDIUM || 0, threatCounts.HIGH || 0];
    state.charts.threat.update();
  }

  async function loadPathData() {
    const path = sanitizePath(dom.databasePathInput.value);
    const data = await exportPath(refs.connection.root.child(path));
    dom.rawDataEditor.value = JSON.stringify(data, null, 2);
  }

  async function savePathData() {
    const path = sanitizePath(dom.databasePathInput.value);
    await writePath(path, JSON.parse(dom.rawDataEditor.value || "null"));
    await logAction(`Saved JSON to ${path}`);
  }

  async function backupDatabase() {
    const payload = {
      drone: await exportPath(refs.drone),
      drones: await exportPath(refs.drones),
      alerts: await exportPath(refs.alerts),
      admin: await exportPath(refs.admin),
      logs: await exportPath(refs.logs)
    };
    download("dds-backup.json", JSON.stringify(payload, null, 2), "application/json");
  }

  async function importJsonFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const path = sanitizePath(dom.databasePathInput.value);
    const contents = await file.text();
    await writePath(path, JSON.parse(contents));
    await logAction(`Imported JSON into ${path}`);
  }

  function exportJsonReport() {
    download("dds-report.json", JSON.stringify({ exportedAt: new Date().toISOString(), drones: state.drones, alerts: state.alerts, logs: state.logs.slice(0, 100) }, null, 2), "application/json");
  }

  function exportCsvReport() {
    const rows = [["type", "level", "droneId", "time", "message"]];
    state.alerts.forEach((alert) => rows.push([alert.type, alert.level, alert.droneId, alert.time, alert.message]));
    download("dds-report.csv", rows.map((row) => row.map(csvEscape).join(",")).join("\n"), "text/csv");
  }

  function sanitizePath(path) { return String(path || "/drone").replace(/^\/+/, ""); }
  function download(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function csvEscape(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
  function logAction(action) { return pushLog({ action, actor: session.email, details: state.drones[0] ? state.drones[0].id : "system" }); }
  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  init();
})();
