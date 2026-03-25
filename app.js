(function () {
  const session = window.DDSAuth.requireRole(["viewer", "admin"]);
  if (!session) {
    return;
  }

  const { refs, seedDefaults, pushAlert, pushLog, defaultDrone, defaultAdminState } = window.DDSFirebase;

  const dom = {
    body: document.body,
    roleBadge: document.getElementById("roleBadge"),
    themeToggle: document.getElementById("themeToggle"),
    adminToggle: document.getElementById("adminToggle"),
    logoutButton: document.getElementById("logoutButton"),
    deviceStatusBadge: document.getElementById("deviceStatusBadge"),
    statusText: document.getElementById("statusText"),
    statusDescription: document.getElementById("statusDescription"),
    distanceValue: document.getElementById("distanceValue"),
    timestampValue: document.getElementById("timestampValue"),
    droneCount: document.getElementById("droneCount"),
    threatValue: document.getElementById("threatValue"),
    connectionState: document.getElementById("connectionState"),
    batteryBar: document.getElementById("batteryBar"),
    signalBar: document.getElementById("signalBar"),
    batteryValue: document.getElementById("batteryValue"),
    signalValue: document.getElementById("signalValue"),
    coordinatesValue: document.getElementById("coordinatesValue"),
    alertModeValue: document.getElementById("alertModeValue"),
    speedValue: document.getElementById("speedValue"),
    altitudeValue: document.getElementById("altitudeValue"),
    threatLevelBadge: document.getElementById("threatLevelBadge"),
    systemStateBadge: document.getElementById("systemStateBadge"),
    nearestDroneValue: document.getElementById("nearestDroneValue"),
    avgBatteryValue: document.getElementById("avgBatteryValue"),
    avgSignalValue: document.getElementById("avgSignalValue"),
    geofenceStatusValue: document.getElementById("geofenceStatusValue"),
    modeValue: document.getElementById("modeValue"),
    aiThreatValue: document.getElementById("aiThreatValue"),
    snapshotImage: document.getElementById("snapshotImage"),
    mapStatus: document.getElementById("mapStatus"),
    mapFallback: document.getElementById("mapFallback"),
    fleetList: document.getElementById("fleetList"),
    historyList: document.getElementById("historyList"),
    historyCount: document.getElementById("historyCount"),
    exportHistory: document.getElementById("exportHistory"),
    clearHistory: document.getElementById("clearHistory"),
    alarmToggle: document.getElementById("alarmToggle"),
    manualAlert: document.getElementById("manualAlert"),
    adminPanel: document.getElementById("adminPanel"),
    notificationToggle: document.getElementById("notificationToggle"),
    radarToggle: document.getElementById("radarToggle"),
    reconnectToggle: document.getElementById("reconnectToggle"),
    offlineToggle: document.getElementById("offlineToggle"),
    firebasePathValue: document.getElementById("firebasePathValue"),
    browserStatus: document.getElementById("browserStatus"),
    notificationContainer: document.getElementById("notificationContainer")
  };

  const state = {
    session,
    theme: localStorage.getItem("dds-theme") || "dark",
    alarmEnabled: JSON.parse(localStorage.getItem("dds-alarm-enabled") ?? "true"),
    notificationsEnabled: JSON.parse(localStorage.getItem("dds-notifications-enabled") ?? "true"),
    radarEnabled: JSON.parse(localStorage.getItem("dds-radar-enabled") ?? "true"),
    reconnectEnabled: JSON.parse(localStorage.getItem("dds-reconnect-enabled") ?? "true"),
    offlineEnabled: JSON.parse(localStorage.getItem("dds-offline-enabled") ?? "true"),
    firebaseConnected: false,
    adminOpen: false,
    adminState: { ...defaultAdminState },
    drones: [],
    alerts: JSON.parse(localStorage.getItem("dds-alert-cache") || "[]"),
    chartPoints: JSON.parse(localStorage.getItem("dds-chart-cache") || "[]"),
    map: null,
    markers: new Map(),
    trails: new Map(),
    radarAngle: 0,
    sirenContext: null,
    sirenInterval: null,
    latestAlertSignature: "",
    lastGeofenceSignature: "",
    lastSnapshotAt: 0
  };

  const radarCanvas = document.getElementById("radarCanvas");
  const radarCtx = radarCanvas.getContext("2d");
  let analyticsChart = null;

  function init() {
    seedDefaults();
    applySession();
    applyPreferences();
    bindEvents();
    renderAlerts();
    renderFleet();
    initMap();
    initChart();
    subscribeRealtime();
    startRadar();
    registerServiceWorker();
    window.addEventListener("resize", resizeRadar);
  }

  function applySession() {
    dom.roleBadge.textContent = state.session.label;
    dom.roleBadge.className = `mini-badge ${state.session.role === "admin" ? "warning" : "online"}`;
    if (state.session.role !== "admin") {
      dom.manualAlert.classList.add("hidden");
    }
  }

  function applyPreferences() {
    dom.body.dataset.theme = state.theme;
    dom.themeToggle.textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
    dom.alarmToggle.textContent = `Alarm: ${state.alarmEnabled ? "ON" : "OFF"}`;
    dom.notificationToggle.checked = state.notificationsEnabled;
    dom.radarToggle.checked = state.radarEnabled;
    dom.reconnectToggle.checked = state.reconnectEnabled;
    dom.offlineToggle.checked = state.offlineEnabled;
    dom.browserStatus.textContent = "Ready";
  }

  function bindEvents() {
    dom.themeToggle.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("dds-theme", state.theme);
      applyPreferences();
      if (analyticsChart) {
        renderChart();
      }
    });

    dom.adminToggle.addEventListener("click", () => {
      if (state.session.role === "admin") {
        window.location.href = "admin.html";
        return;
      }
      state.adminOpen = !state.adminOpen;
      dom.adminPanel.classList.toggle("hidden", !state.adminOpen);
      dom.adminToggle.setAttribute("aria-expanded", String(state.adminOpen));
    });

    dom.logoutButton.addEventListener("click", () => {
      window.DDSAuth.clearSession();
      window.location.href = "login.html";
    });

    dom.alarmToggle.addEventListener("click", () => {
      state.alarmEnabled = !state.alarmEnabled;
      localStorage.setItem("dds-alarm-enabled", JSON.stringify(state.alarmEnabled));
      dom.alarmToggle.textContent = `Alarm: ${state.alarmEnabled ? "ON" : "OFF"}`;
      if (!state.alarmEnabled) {
        stopSiren();
      }
    });

    dom.manualAlert.addEventListener("click", async () => {
      const drone = state.drones[0] || { ...defaultDrone, status: "Detected", threat: "HIGH" };
      await pushAlert({
        type: "Manual Alert",
        level: drone.threat || "HIGH",
        droneId: drone.id || "drone-main",
        message: "Admin manually triggered an alert."
      });
      await pushLog({
        action: "Manual alert triggered from viewer dashboard",
        actor: state.session.email,
        details: drone.id || "drone-main"
      });
    });

    [
      ["dds-notifications-enabled", dom.notificationToggle, "notificationsEnabled"],
      ["dds-radar-enabled", dom.radarToggle, "radarEnabled"],
      ["dds-reconnect-enabled", dom.reconnectToggle, "reconnectEnabled"],
      ["dds-offline-enabled", dom.offlineToggle, "offlineEnabled"]
    ].forEach(([key, input, stateKey]) => {
      input.addEventListener("change", () => {
        state[stateKey] = input.checked;
        localStorage.setItem(key, JSON.stringify(input.checked));
      });
    });

    dom.exportHistory.addEventListener("click", exportAlertHistory);
    dom.clearHistory.addEventListener("click", () => {
      localStorage.removeItem("dds-alert-cache");
      localStorage.removeItem("dds-chart-cache");
      state.alerts = [];
      state.chartPoints = [];
      renderAlerts();
      renderChart();
      toast("Cache cleared", "Offline dashboard cache reset.", "safe");
    });

    document.addEventListener("click", ensureAudioContext, { once: true });
  }

  function subscribeRealtime() {
    refs.connection.on("value", (snapshot) => {
      state.firebaseConnected = !!snapshot.val();
      dom.connectionState.textContent = state.firebaseConnected ? "Realtime Connected" : "Realtime Offline";
      dom.connectionState.className = `mini-badge ${state.firebaseConnected ? "online" : "offline"}`;
      dom.deviceStatusBadge.textContent = state.firebaseConnected ? "System Online" : "System Offline";
      dom.deviceStatusBadge.className = `badge ${state.firebaseConnected ? "online" : "offline"}`;
      dom.browserStatus.textContent = state.firebaseConnected ? "Firebase online" : "Firebase offline";
    });

    refs.admin.on("value", (snapshot) => {
      state.adminState = { ...defaultAdminState, ...(snapshot.val() || {}) };
      applyAdminState();
    });

    refs.drone.on("value", () => syncDroneSources());
    refs.drones.on("value", () => syncDroneSources());

    refs.alerts.limitToLast(50).on("value", (snapshot) => {
      const value = snapshot.val() || {};
      state.alerts = Object.entries(value)
        .map(([id, item]) => ({ id, ...item }))
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      localStorage.setItem("dds-alert-cache", JSON.stringify(state.alerts));
      renderAlerts();
      maybeRaiseAlert(state.alerts[0]);
    }, handleFirebaseError);
  }

  function syncDroneSources() {
    Promise.all([refs.drone.get(), refs.drones.get()])
      .then(([droneSnap, dronesSnap]) => {
        const drones = [];
        if (droneSnap.exists()) {
          drones.push(normalizeDrone(droneSnap.val(), "drone-main"));
        }
        if (dronesSnap.exists()) {
          const fleet = dronesSnap.val();
          if (Array.isArray(fleet)) {
            fleet.filter(Boolean).forEach((item, index) => drones.push(normalizeDrone(item, `drone-${index + 1}`)));
          } else {
            Object.entries(fleet).forEach(([key, item]) => drones.push(normalizeDrone(item, key)));
          }
        }
        state.drones = dedupeById(drones).sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
        if (!state.drones.length && state.offlineEnabled) {
          const cached = JSON.parse(localStorage.getItem("dds-last-drone-cache") || "null");
          if (cached) {
            state.drones = [cached];
          }
        }
        renderDashboard();
      })
      .catch(handleFirebaseError);
  }

  function normalizeDrone(item, fallbackId) {
    const timestamp = item.timestamp || new Date().toISOString();
    return {
      id: item.id || fallbackId,
      status: item.status || "No Drone",
      distance: Number(item.distance ?? 0),
      battery: Number(item.battery ?? 0),
      signal: Number(item.signal ?? 0),
      lat: Number(item.lat ?? defaultDrone.lat),
      lng: Number(item.lng ?? defaultDrone.lng),
      altitude: Number(item.altitude ?? 0),
      speed: Number(item.speed ?? 0),
      threat: (item.threat || "LOW").toUpperCase(),
      timestamp,
      snapshot: item.snapshot || item.imageUrl || defaultDrone.snapshot
    };
  }

  function dedupeById(drones) {
    const map = new Map();
    drones.forEach((drone) => {
      if (!map.has(drone.id) || toMillis(drone.timestamp) > toMillis(map.get(drone.id).timestamp)) {
        map.set(drone.id, drone);
      }
    });
    return Array.from(map.values());
  }

  function renderDashboard() {
    const primary = state.drones[0];
    if (!primary) {
      renderNoData();
      return;
    }

    localStorage.setItem("dds-last-drone-cache", JSON.stringify(primary));
    const aiThreat = computeThreat(primary);
    const threat = state.adminState.aiThreat ? aiThreat : primary.threat;
    const detected = /detected/i.test(primary.status);

    dom.statusText.textContent = detected ? "Drone Detected" : "No Drone";
    dom.statusText.className = `status-text ${detected ? "alert" : "safe"}`;
    dom.statusDescription.textContent = detected
      ? `Active threat tracked ${format(primary.distance)} meters away with ${threat} threat classification.`
      : "Airspace clear. Sensors remain armed and synchronized.";
    dom.distanceValue.textContent = `${format(primary.distance)} m`;
    dom.timestampValue.textContent = new Date(primary.timestamp).toLocaleString();
    dom.droneCount.textContent = String(state.drones.length);
    dom.threatValue.textContent = threat;
    dom.batteryValue.textContent = `${format(primary.battery)}%`;
    dom.signalValue.textContent = `${format(primary.signal)}%`;
    dom.batteryBar.style.width = `${clamp(primary.battery, 0, 100)}%`;
    dom.signalBar.style.width = `${clamp(primary.signal, 0, 100)}%`;
    dom.coordinatesValue.textContent = `${primary.lat.toFixed(4)}, ${primary.lng.toFixed(4)}`;
    dom.alertModeValue.textContent = detected ? "Defence Active" : "Standby";
    dom.speedValue.textContent = `${format(primary.speed)} km/h`;
    dom.altitudeValue.textContent = `${format(primary.altitude)} m`;
    dom.snapshotImage.src = primary.snapshot || defaultDrone.snapshot;
    dom.snapshotImage.alt = `${primary.id} snapshot`;
    dom.threatLevelBadge.textContent = `Threat: ${threat}`;
    dom.threatLevelBadge.className = `mini-badge ${threat === "HIGH" ? "offline" : threat === "MEDIUM" ? "warning" : "online"}`;
    dom.aiThreatValue.textContent = aiThreat;

    renderInsights(threat);
    renderFleet();
    updateMap();
    pushChartPoint(primary, threat);
    if (detected && state.alarmEnabled && state.adminState.siren !== false) {
      playSiren();
    } else {
      stopSiren();
    }
  }

  function renderInsights(threat) {
    const nearest = state.drones.reduce((best, drone) => (drone.distance < best.distance ? drone : best), state.drones[0]);
    const avgBattery = state.drones.reduce((sum, drone) => sum + drone.battery, 0) / state.drones.length;
    const avgSignal = state.drones.reduce((sum, drone) => sum + drone.signal, 0) / state.drones.length;
    dom.nearestDroneValue.textContent = `${nearest.id} (${format(nearest.distance)} m)`;
    dom.avgBatteryValue.textContent = `${format(avgBattery)}%`;
    dom.avgSignalValue.textContent = `${format(avgSignal)}%`;
    dom.geofenceStatusValue.textContent = state.adminState.geofenceEnabled
      ? `Active at ${state.adminState.geofenceRadius} m`
      : "Monitoring Off";
    dom.modeValue.textContent = state.adminState.mode || "LIVE";
    dom.systemStateBadge.textContent = state.adminState.systemActive ? "System Active" : "System Offline";
    dom.systemStateBadge.className = `mini-badge ${state.adminState.systemActive ? "online" : "offline"}`;
    evaluateGeofence(nearest, threat);
  }

  function renderFleet() {
    if (!state.drones.length) {
      dom.fleetList.innerHTML = '<div class="fleet-item"><strong>No drones</strong><p>Waiting for realtime fleet data.</p></div>';
      return;
    }
    dom.fleetList.innerHTML = state.drones.map((drone) => `
      <div class="fleet-item">
        <strong>${escapeHtml(drone.id)} - ${escapeHtml(drone.status)}</strong>
        <p>Distance ${format(drone.distance)} m | Speed ${format(drone.speed)} km/h | Altitude ${format(drone.altitude)} m</p>
        <p>Battery ${format(drone.battery)}% | Signal ${format(drone.signal)}% | Threat ${escapeHtml(drone.threat)}</p>
      </div>
    `).join("");
  }

  function renderAlerts() {
    dom.historyCount.textContent = `${state.alerts.length} alerts`;
    if (!state.alerts.length) {
      dom.historyList.innerHTML = '<div class="history-item"><strong>No alerts</strong><p>Incoming Firebase alerts will appear here.</p></div>';
      return;
    }
    dom.historyList.innerHTML = state.alerts.slice(0, 30).map((alert) => `
      <div class="history-item">
        <strong>${escapeHtml(alert.type || "Alert")} • ${escapeHtml(alert.level || "LOW")}</strong>
        <p>${escapeHtml(alert.message || "Realtime alert event")}</p>
        <p>${new Date(alert.time).toLocaleString()}</p>
      </div>
    `).join("");
  }

  function maybeRaiseAlert(alert) {
    if (!alert) {
      return;
    }
    const signature = `${alert.id}-${alert.time}`;
    if (signature === state.latestAlertSignature) {
      return;
    }
    state.latestAlertSignature = signature;
    if (state.notificationsEnabled && state.adminState.popups !== false) {
      toast(alert.type || "Drone Alert", alert.message || "Realtime alert received.", "alert");
      if ("Notification" in window && Notification.permission === "granted" && state.adminState.push !== false) {
        new Notification(alert.type || "Drone Alert", { body: alert.message || "Realtime alert received." });
      }
    }
  }

  function exportAlertHistory() {
    const payload = {
      exportedAt: new Date().toISOString(),
      role: state.session.role,
      alerts: state.alerts
    };
    downloadBlob("dds-alert-history.json", JSON.stringify(payload, null, 2), "application/json");
  }

  function computeThreat(drone) {
    const score = (200 - clamp(drone.distance, 0, 200)) * 0.35
      + clamp(drone.speed, 0, 120) * 0.3
      + clamp(drone.altitude, 0, 300) * 0.1
      + (100 - clamp(drone.battery, 0, 100)) * 0.05
      + clamp(drone.signal, 0, 100) * 0.2;
    if (score > 80) {
      return "HIGH";
    }
    if (score > 45) {
      return "MEDIUM";
    }
    return "LOW";
  }

  function evaluateGeofence(drone, threat) {
    if (!state.adminState.geofenceEnabled) {
      return;
    }
    if (drone.distance > Number(state.adminState.geofenceRadius || 120)) {
      return;
    }
    const signature = `${drone.id}-${new Date(drone.timestamp).toISOString()}-${state.adminState.geofenceRadius}`;
    if (signature === state.lastGeofenceSignature) {
      return;
    }
    state.lastGeofenceSignature = signature;
    pushAlert({
      type: "Geo-fence Breach",
      level: threat,
      droneId: drone.id,
      message: `${drone.id} entered the restricted radius at ${format(drone.distance)} meters.`
    });
  }

  function initMap() {
    if (!window.L) {
      dom.mapFallback.classList.remove("hidden");
      dom.mapStatus.textContent = "Map Load Failed";
      return;
    }
    state.map = L.map("map", { zoomControl: true }).setView([defaultDrone.lat, defaultDrone.lng], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.map);
    dom.mapStatus.textContent = "Map Tracking Active";
  }

  function updateMap() {
    if (!state.map) {
      return;
    }
    state.drones.forEach((drone) => {
      if (!state.markers.has(drone.id)) {
        const marker = L.marker([drone.lat, drone.lng], { title: drone.id }).addTo(state.map);
        marker.bindPopup(`${escapeHtml(drone.id)}<br>${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}`);
        state.markers.set(drone.id, marker);
        state.trails.set(drone.id, L.polyline([], { color: "#48dbfb", weight: 3, opacity: 0.85 }).addTo(state.map));
      }
      const marker = state.markers.get(drone.id);
      const trail = state.trails.get(drone.id);
      marker.setLatLng([drone.lat, drone.lng]);
      marker.setPopupContent(`${escapeHtml(drone.id)}<br>${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}<br>Threat ${escapeHtml(drone.threat)}`);
      const currentTrail = trail.getLatLngs();
      currentTrail.push([drone.lat, drone.lng]);
      trail.setLatLngs(currentTrail.slice(-14));
    });
    if (state.drones[0]) {
      state.map.panTo([state.drones[0].lat, state.drones[0].lng], { animate: true, duration: 0.35 });
    }
  }

  function initChart() {
    const canvas = document.getElementById("chartCanvas");
    analyticsChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Distance (m)",
            data: [],
            borderColor: "#48dbfb",
            backgroundColor: "rgba(72,219,251,0.18)",
            fill: true,
            tension: 0.35
          },
          {
            label: "Speed (km/h)",
            data: [],
            borderColor: "#00f5d4",
            backgroundColor: "rgba(0,245,212,0.12)",
            fill: false,
            tension: 0.35
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#ecf4ff" } }
        },
        scales: {
          x: { ticks: { color: "#92a4c5" }, grid: { color: "rgba(146,164,197,0.1)" } },
          y: { ticks: { color: "#92a4c5" }, grid: { color: "rgba(146,164,197,0.1)" } }
        }
      }
    });
    renderChart();
  }

  function pushChartPoint(drone, threat) {
    state.chartPoints.push({
      label: new Date(drone.timestamp).toLocaleTimeString(),
      distance: drone.distance,
      speed: drone.speed,
      threat
    });
    state.chartPoints = state.chartPoints.slice(-18);
    localStorage.setItem("dds-chart-cache", JSON.stringify(state.chartPoints));
    renderChart();
  }

  function renderChart() {
    if (!analyticsChart) {
      return;
    }
    analyticsChart.data.labels = state.chartPoints.map((item) => item.label);
    analyticsChart.data.datasets[0].data = state.chartPoints.map((item) => item.distance);
    analyticsChart.data.datasets[1].data = state.chartPoints.map((item) => item.speed);
    analyticsChart.options.scales.x.ticks.color = state.theme === "dark" ? "#92a4c5" : "#52627f";
    analyticsChart.options.scales.y.ticks.color = state.theme === "dark" ? "#92a4c5" : "#52627f";
    analyticsChart.options.plugins.legend.labels.color = state.theme === "dark" ? "#ecf4ff" : "#10203d";
    analyticsChart.update();
  }

  function applyAdminState() {
    dom.firebasePathValue.textContent = `${state.adminState.firebasePaths.primary} • ${state.adminState.firebasePaths.fleet} • ${state.adminState.firebasePaths.alerts}`;
    if (state.adminState.theme && state.adminState.theme !== state.theme) {
      state.theme = state.adminState.theme;
      localStorage.setItem("dds-theme", state.theme);
      applyPreferences();
      renderChart();
    }
    if (!state.adminState.systemActive) {
      dom.statusText.textContent = "System Offline";
      dom.statusText.className = "status-text loading";
      stopSiren();
    }
  }

  function renderNoData() {
    dom.statusText.textContent = "Waiting...";
    dom.statusText.className = "status-text loading";
    dom.statusDescription.textContent = "No drone data available yet.";
    dom.snapshotImage.src = defaultDrone.snapshot;
    dom.fleetList.innerHTML = '<div class="fleet-item"><strong>No drones</strong><p>Waiting for realtime fleet data.</p></div>';
  }

  function ensureAudioContext() {
    if (!state.sirenContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        state.sirenContext = new AudioContextCtor();
      }
    }
    if (state.sirenContext && state.sirenContext.state === "suspended") {
      state.sirenContext.resume().catch(() => {});
    }
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  function playSiren() {
    if (!state.alarmEnabled || state.sirenInterval) {
      return;
    }
    ensureAudioContext();
    if (!state.sirenContext) {
      return;
    }
    const createPulse = () => {
      const oscillator = state.sirenContext.createOscillator();
      const gain = state.sirenContext.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(640, state.sirenContext.currentTime);
      oscillator.frequency.linearRampToValueAtTime(980, state.sirenContext.currentTime + 0.4);
      gain.gain.setValueAtTime(0.0001, state.sirenContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.07, state.sirenContext.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, state.sirenContext.currentTime + 0.45);
      oscillator.connect(gain).connect(state.sirenContext.destination);
      oscillator.start();
      oscillator.stop(state.sirenContext.currentTime + 0.48);
    };
    createPulse();
    state.sirenInterval = window.setInterval(createPulse, 520);
  }

  function stopSiren() {
    if (state.sirenInterval) {
      clearInterval(state.sirenInterval);
      state.sirenInterval = null;
    }
  }

  function startRadar() {
    const frame = () => {
      drawRadar();
      requestAnimationFrame(frame);
    };
    resizeRadar();
    frame();
  }

  function resizeRadar() {
    const rect = radarCanvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    radarCanvas.width = Math.max(1, rect.width * ratio);
    radarCanvas.height = Math.max(1, rect.height * ratio);
  }

  function drawRadar() {
    const width = radarCanvas.width;
    const height = radarCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.42;
    radarCtx.clearRect(0, 0, width, height);
    radarCtx.fillStyle = state.theme === "dark" ? "#04101f" : "#f3f8ff";
    radarCtx.fillRect(0, 0, width, height);
    radarCtx.strokeStyle = "rgba(72,219,251,0.24)";
    radarCtx.lineWidth = 1.2;
    [0.25, 0.5, 0.75, 1].forEach((ratio) => {
      radarCtx.beginPath();
      radarCtx.arc(centerX, centerY, radius * ratio, 0, Math.PI * 2);
      radarCtx.stroke();
    });
    if (state.radarEnabled) {
      state.radarAngle += 0.025;
    }
    radarCtx.save();
    radarCtx.translate(centerX, centerY);
    radarCtx.rotate(state.radarAngle);
    const gradient = radarCtx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, "rgba(0,245,212,0.35)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    radarCtx.beginPath();
    radarCtx.moveTo(0, 0);
    radarCtx.arc(0, 0, radius, -0.18, 0.18);
    radarCtx.closePath();
    radarCtx.fillStyle = gradient;
    radarCtx.fill();
    radarCtx.restore();
    state.drones.slice(0, 8).forEach((drone, index) => {
      const angle = state.radarAngle + index * (Math.PI / 4);
      const distanceRatio = clamp(drone.distance / 250, 0.15, 1);
      const x = centerX + Math.cos(angle) * radius * distanceRatio;
      const y = centerY + Math.sin(angle) * radius * distanceRatio;
      radarCtx.beginPath();
      radarCtx.arc(x, y, 6, 0, Math.PI * 2);
      radarCtx.fillStyle = computeThreat(drone) === "HIGH" ? "#ff4d6d" : "#40f3a1";
      radarCtx.shadowColor = radarCtx.fillStyle;
      radarCtx.shadowBlur = 18;
      radarCtx.fill();
      radarCtx.shadowBlur = 0;
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  function toast(title, message, variant) {
    const node = document.createElement("div");
    node.className = `toast ${variant || "safe"}`;
    node.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
    dom.notificationContainer.prepend(node);
    setTimeout(() => node.remove(), 4200);
  }

  function downloadBlob(filename, contents, type) {
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

  function handleFirebaseError(error) {
    console.error(error);
    dom.browserStatus.textContent = "Firebase error";
    if (state.offlineEnabled) {
      const cachedDrone = JSON.parse(localStorage.getItem("dds-last-drone-cache") || "null");
      if (cachedDrone) {
        state.drones = [cachedDrone];
        renderDashboard();
      }
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function format(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function toMillis(value) {
    return new Date(value).getTime() || 0;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  init();
})();
