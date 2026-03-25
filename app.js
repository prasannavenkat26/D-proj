const firebaseConfig = {
  apiKey: "AIzaSyAJ3QEJyL_AFhMdOjwJKaeQUB0A937mQLI",
  authDomain: "drone-defence-8fc8b.firebaseapp.com",
  databaseURL: "https://drone-defence-8fc8b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "drone-defence-8fc8b",
  storageBucket: "drone-defence-8fc8b.firebasestorage.app",
  messagingSenderId: "166788888102",
  appId: "1:166788888102:web:734b737cb222cda1f698e7"
};

const dom = {
  body: document.body,
  statusText: document.getElementById("statusText"),
  statusDescription: document.getElementById("statusDescription"),
  distanceValue: document.getElementById("distanceValue"),
  timestampValue: document.getElementById("timestampValue"),
  droneCount: document.getElementById("droneCount"),
  batteryValue: document.getElementById("batteryValue"),
  batteryBar: document.getElementById("batteryBar"),
  signalValue: document.getElementById("signalValue"),
  signalBar: document.getElementById("signalBar"),
  coordinatesValue: document.getElementById("coordinatesValue"),
  alertModeValue: document.getElementById("alertModeValue"),
  deviceStatusBadge: document.getElementById("deviceStatusBadge"),
  connectionState: document.getElementById("connectionState"),
  historyList: document.getElementById("historyList"),
  historyCount: document.getElementById("historyCount"),
  fleetList: document.getElementById("fleetList"),
  themeToggle: document.getElementById("themeToggle"),
  adminToggle: document.getElementById("adminToggle"),
  adminPanel: document.getElementById("adminPanel"),
  alarmToggle: document.getElementById("alarmToggle"),
  manualAlert: document.getElementById("manualAlert"),
  notificationToggle: document.getElementById("notificationToggle"),
  radarToggle: document.getElementById("radarToggle"),
  reconnectToggle: document.getElementById("reconnectToggle"),
  browserStatus: document.getElementById("browserStatus"),
  mapStatus: document.getElementById("mapStatus"),
  mapFallback: document.getElementById("mapFallback"),
  notificationContainer: document.getElementById("notificationContainer")
};

const state = {
  theme: localStorage.getItem("dds-theme") || "dark",
  alarmEnabled: JSON.parse(localStorage.getItem("dds-alarm-enabled") ?? "true"),
  notificationsEnabled: JSON.parse(localStorage.getItem("dds-notifications-enabled") ?? "true"),
  radarEnabled: JSON.parse(localStorage.getItem("dds-radar-enabled") ?? "true"),
  reconnectEnabled: JSON.parse(localStorage.getItem("dds-reconnect-enabled") ?? "true"),
  adminOpen: false,
  firebaseConnected: false,
  browserOnline: navigator.onLine,
  mapLoaded: false,
  map: null,
  marker: null,
  sirenContext: null,
  sirenNodes: [],
  sirenInterval: null,
  radarAngle: 0,
  drones: [],
  latestDrone: null,
  history: JSON.parse(localStorage.getItem("dds-history") || "[]").slice(0, 30),
  chartPoints: [],
  lastAlertSignature: "",
  reconnectTimer: null,
  freshnessInterval: null,
  lastFirebaseSnapshotAt: 0
};

const radarCanvas = document.getElementById("radarCanvas");
const radarCtx = radarCanvas.getContext("2d");
const chartCanvas = document.getElementById("chartCanvas");
const chartCtx = chartCanvas.getContext("2d");

const firebaseApp = firebase.initializeApp(firebaseConfig);
const database = firebase.database(firebaseApp);
const rootDroneRef = database.ref("drone");
const dronesRef = database.ref("drones");
const connectionRef = database.ref(".info/connected");

function getMapsApiKey() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get("mapsKey");
  if (urlKey) {
    localStorage.setItem("dds-google-maps-key", urlKey);
    return urlKey;
  }
  return (
    localStorage.getItem("dds-google-maps-key") ||
    window.DRONE_DEFENSE_MAPS_API_KEY ||
    ""
  ).trim();
}

function init() {
  applyStoredPreferences();
  bindUi();
  renderHistory();
  renderFleet();
  renderChart();
  resizeCanvases();
  requestNotificationAccess();
  initMap();
  startRadarLoop();
  subscribeRealtime();
  syncBrowserConnectivity();
  window.addEventListener("resize", resizeCanvases);
  window.addEventListener("online", syncBrowserConnectivity);
  window.addEventListener("offline", syncBrowserConnectivity);
}

function applyStoredPreferences() {
  dom.body.dataset.theme = state.theme;
  dom.themeToggle.textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
  dom.alarmToggle.textContent = `Alarm: ${state.alarmEnabled ? "ON" : "OFF"}`;
  dom.notificationToggle.checked = state.notificationsEnabled;
  dom.radarToggle.checked = state.radarEnabled;
  dom.reconnectToggle.checked = state.reconnectEnabled;
  updateBrowserStatus("Ready");
}

function bindUi() {
  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.adminToggle.addEventListener("click", toggleAdminPanel);
  dom.alarmToggle.addEventListener("click", toggleAlarm);
  dom.manualAlert.addEventListener("click", triggerManualAlert);
  dom.notificationToggle.addEventListener("change", (event) => {
    state.notificationsEnabled = event.target.checked;
    localStorage.setItem("dds-notifications-enabled", JSON.stringify(state.notificationsEnabled));
    if (state.notificationsEnabled) {
      requestNotificationAccess();
    }
    toast(
      state.notificationsEnabled ? "Notifications enabled" : "Notifications disabled",
      "Browser popup alerts updated.",
      "safe"
    );
  });
  dom.radarToggle.addEventListener("change", (event) => {
    state.radarEnabled = event.target.checked;
    localStorage.setItem("dds-radar-enabled", JSON.stringify(state.radarEnabled));
  });
  dom.reconnectToggle.addEventListener("change", (event) => {
    state.reconnectEnabled = event.target.checked;
    localStorage.setItem("dds-reconnect-enabled", JSON.stringify(state.reconnectEnabled));
    resetFreshnessTimer();
  });
  document.addEventListener("click", ensureAudioContext, { once: true });
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  dom.body.dataset.theme = state.theme;
  dom.themeToggle.textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
  localStorage.setItem("dds-theme", state.theme);
  if (state.map) {
    state.map.setOptions({ styles: getMapStyles() });
  }
  renderChart();
}

function toggleAdminPanel() {
  state.adminOpen = !state.adminOpen;
  dom.adminPanel.classList.toggle("hidden", !state.adminOpen);
  dom.adminPanel.setAttribute("aria-hidden", String(!state.adminOpen));
  dom.adminToggle.setAttribute("aria-expanded", String(state.adminOpen));
}

function toggleAlarm() {
  state.alarmEnabled = !state.alarmEnabled;
  dom.alarmToggle.textContent = `Alarm: ${state.alarmEnabled ? "ON" : "OFF"}`;
  localStorage.setItem("dds-alarm-enabled", JSON.stringify(state.alarmEnabled));
  if (!state.alarmEnabled) {
    stopSiren();
  } else if (state.latestDrone && isDetected(state.latestDrone)) {
    playSiren();
  }
}

function triggerManualAlert() {
  const syntheticDrone = state.latestDrone || {
    id: "manual-defense-check",
    status: "Drone Detected",
    distance: 0,
    battery: 100,
    signal: 100,
    lat: 13.0827,
    lng: 80.2707,
    timestamp: Math.floor(Date.now() / 1000)
  };
  handleDetectionEvent(syntheticDrone, true);
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
}

function playSiren() {
  if (!state.alarmEnabled) {
    return;
  }
  ensureAudioContext();
  if (!state.sirenContext || state.sirenInterval) {
    return;
  }

  const createPulse = () => {
    const context = state.sirenContext;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(680, context.currentTime);
    oscillator.frequency.linearRampToValueAtTime(980, context.currentTime + 0.45);
    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
    oscillator.connect(gainNode).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.62);
    state.sirenNodes.push({ oscillator, gainNode });
    state.sirenNodes = state.sirenNodes.slice(-6);
  };

  createPulse();
  state.sirenInterval = window.setInterval(createPulse, 650);
}

function stopSiren() {
  if (state.sirenInterval) {
    clearInterval(state.sirenInterval);
    state.sirenInterval = null;
  }
  state.sirenNodes.forEach(({ oscillator }) => {
    try {
      oscillator.stop();
    } catch (error) {
      void error;
    }
  });
  state.sirenNodes = [];
}

function requestNotificationAccess() {
  if (!("Notification" in window) || !state.notificationsEnabled) {
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notifyBrowser(title, body) {
  if (!state.notificationsEnabled) {
    return;
  }
  toast(title, body, "alert");
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function toast(title, message, variant) {
  const node = document.createElement("div");
  node.className = `toast ${variant || "safe"}`;
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
  dom.notificationContainer.prepend(node);
  window.setTimeout(() => node.remove(), 4200);
}

function syncBrowserConnectivity() {
  state.browserOnline = navigator.onLine;
  updateBrowserStatus(state.browserOnline ? "Browser online" : "Browser offline");
  updateDeviceBadge();
}

function updateBrowserStatus(message) {
  dom.browserStatus.textContent = message;
}

function updateDeviceBadge() {
  const online = state.browserOnline && state.firebaseConnected;
  dom.deviceStatusBadge.textContent = online ? "System Online" : "System Offline";
  dom.deviceStatusBadge.className = `badge ${online ? "online" : "offline"}`;
}

function subscribeRealtime() {
  connectionRef.on("value", (snapshot) => {
    state.firebaseConnected = !!snapshot.val();
    dom.connectionState.textContent = state.firebaseConnected ? "Realtime Connected" : "Realtime Offline";
    dom.connectionState.className = `mini-badge ${state.firebaseConnected ? "online" : "offline"}`;
    updateDeviceBadge();

    if (!state.firebaseConnected && state.reconnectEnabled) {
      scheduleReconnect();
    }
  });

  rootDroneRef.on(
    "value",
    (snapshot) => {
      state.lastFirebaseSnapshotAt = Date.now();
      mergeIncomingData(snapshot.val(), "primary");
    },
    (error) => handleFirebaseError(error)
  );

  dronesRef.on(
    "value",
    (snapshot) => {
      state.lastFirebaseSnapshotAt = Date.now();
      mergeIncomingData(snapshot.val(), "fleet");
    },
    (error) => handleFirebaseError(error)
  );

  resetFreshnessTimer();
}

function resetFreshnessTimer() {
  if (state.freshnessInterval) {
    clearInterval(state.freshnessInterval);
    state.freshnessInterval = null;
  }
  if (state.reconnectEnabled) {
    state.freshnessInterval = window.setInterval(checkRealtimeFreshness, 10000);
  }
}

function mergeIncomingData(data, source) {
  let drones = state.drones.slice();

  if (source === "primary") {
    if (data && typeof data === "object") {
      const normalized = normalizeDrone(data, "drone");
      drones = drones.filter((item) => item.id !== normalized.id);
      drones.unshift(normalized);
    } else if (!data && drones.length === 0) {
      setNoDataState();
      return;
    }
  }

  if (source === "fleet") {
    if (Array.isArray(data)) {
      drones = data.filter(Boolean).map((item, index) => normalizeDrone(item, `drone-${index + 1}`));
    } else if (data && typeof data === "object") {
      drones = Object.entries(data).map(([key, value]) => normalizeDrone(value, key));
    }
  }

  const deduped = dedupeDrones(drones)
    .filter(Boolean)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  state.drones = deduped;
  state.latestDrone = deduped[0] || null;

  if (!state.latestDrone) {
    setNoDataState();
    return;
  }

  updateDashboard(state.latestDrone, deduped);
}

function normalizeDrone(data, fallbackId) {
  const timestamp = Number(data.timestamp || Math.floor(Date.now() / 1000));
  return {
    id: String(data.id || fallbackId),
    status: String(data.status || "No Drone"),
    distance: Number.isFinite(Number(data.distance)) ? Number(data.distance) : 0,
    lat: Number.isFinite(Number(data.lat)) ? Number(data.lat) : null,
    lng: Number.isFinite(Number(data.lng)) ? Number(data.lng) : null,
    battery: clamp(Number(data.battery ?? 0), 0, 100),
    signal: clamp(Number(data.signal ?? 0), 0, 100),
    timestamp
  };
}

function dedupeDrones(drones) {
  const seen = new Map();
  drones.forEach((drone) => {
    if (!drone) {
      return;
    }
    const existing = seen.get(drone.id);
    if (!existing || (drone.timestamp || 0) >= (existing.timestamp || 0)) {
      seen.set(drone.id, drone);
    }
  });
  return Array.from(seen.values());
}

function updateDashboard(drone, drones) {
  const detected = isDetected(drone);
  dom.statusText.textContent = drone.status || "No Drone";
  dom.statusText.className = `status-text ${detected ? "alert" : "safe"}`;
  dom.statusDescription.textContent = detected
    ? `Threat detected at ${drone.distance} meters. Tracking coordinates and broadcasting alerts in real time.`
    : "Airspace clear. Sensors are live and the defense system remains on standby.";
  dom.distanceValue.textContent = `${formatNumber(drone.distance)} m`;
  dom.timestampValue.textContent = formatTimestamp(drone.timestamp);
  dom.droneCount.textContent = String(drones.length);
  dom.batteryValue.textContent = `${formatNumber(drone.battery)}%`;
  dom.batteryBar.style.width = `${drone.battery}%`;
  dom.signalValue.textContent = `${formatNumber(drone.signal)}%`;
  dom.signalBar.style.width = `${drone.signal}%`;
  dom.coordinatesValue.textContent = drone.lat !== null && drone.lng !== null
    ? `${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}`
    : "--, --";
  dom.alertModeValue.textContent = detected ? "Defense Active" : "Standby";
  document.querySelector(".hero-card").classList.toggle("hero-alert", detected);

  updateMap(drone);
  updateChart(drone);
  renderFleet();

  if (detected) {
    handleDetectionEvent(drone, false);
  } else {
    stopSiren();
    const signature = `${drone.id}-${drone.timestamp}-safe`;
    if (state.lastAlertSignature !== signature) {
      pushHistory({
        title: "No Drone",
        detail: `Airspace cleared near ${formatLocation(drone)}.`,
        timestamp: Date.now()
      });
      state.lastAlertSignature = signature;
    }
  }
}

function handleDetectionEvent(drone, manual) {
  const signature = manual ? `manual-${Date.now()}` : `${drone.id}-${drone.timestamp}-${drone.status}`;
  if (!manual && state.lastAlertSignature === signature) {
    return;
  }

  const title = manual ? "Manual alert triggered" : `Drone Detected - ${drone.id}`;
  const detail = manual
    ? "Operator manually activated the siren and notification workflow."
    : `Target at ${formatNumber(drone.distance)} meters, battery ${formatNumber(drone.battery)}%, signal ${formatNumber(drone.signal)}%.`;

  notifyBrowser(title, detail);
  pushHistory({
    title,
    detail,
    timestamp: Date.now()
  });
  playSiren();
  state.lastAlertSignature = signature;
}

function pushHistory(entry) {
  state.history.unshift(entry);
  state.history = state.history.slice(0, 30);
  localStorage.setItem("dds-history", JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  dom.historyCount.textContent = `${state.history.length} events`;
  if (state.history.length === 0) {
    dom.historyList.innerHTML = '<div class="history-item"><strong>No events yet</strong><p>Incoming alerts and clear-state transitions will appear here.</p></div>';
    return;
  }

  dom.historyList.innerHTML = state.history
    .map(
      (item) => `
        <div class="history-item">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.detail)}</p>
          <p>${formatTimestamp(Math.floor(item.timestamp / 1000))}</p>
        </div>
      `
    )
    .join("");
}

function renderFleet() {
  if (state.drones.length === 0) {
    dom.fleetList.innerHTML = '<div class="fleet-item"><strong>No tracked drones</strong><p>The fleet panel will populate as soon as Firebase sends telemetry.</p></div>';
    return;
  }

  dom.fleetList.innerHTML = state.drones
    .map((drone) => {
      const detected = isDetected(drone);
      return `
        <div class="fleet-item">
          <strong>${escapeHtml(drone.id)} - ${escapeHtml(drone.status)}</strong>
          <p>Distance: ${formatNumber(drone.distance)} m | Battery: ${formatNumber(drone.battery)}% | Signal: ${formatNumber(drone.signal)}%</p>
          <p>${detected ? "Threat tracking active" : "Standby"} | ${formatTimestamp(drone.timestamp)}</p>
        </div>
      `;
    })
    .join("");
}

function updateChart(drone) {
  const lastPoint = state.chartPoints[state.chartPoints.length - 1];
  if (!lastPoint || lastPoint.label.getTime() !== (drone.timestamp || 0) * 1000 || lastPoint.value !== drone.distance) {
    state.chartPoints.push({
      label: new Date((drone.timestamp || Math.floor(Date.now() / 1000)) * 1000),
      value: Number(drone.distance) || 0
    });
  }
  state.chartPoints = state.chartPoints.slice(-18);
  renderChart();
}

function renderChart() {
  fitCanvasToDisplay(chartCanvas);
  const ctx = chartCtx;
  const width = chartCanvas.width;
  const height = chartCanvas.height;
  const dark = state.theme === "dark";
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = dark ? "rgba(255,255,255,0.03)" : "rgba(16,32,61,0.04)";
  ctx.fillRect(0, 0, width, height);

  const padding = 34;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const values = state.chartPoints.map((point) => point.value);
  const maxValue = Math.max(100, ...values, 1);

  ctx.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(16,32,61,0.1)";
  ctx.lineWidth = 1;
  for (let index = 0; index <= 4; index += 1) {
    const y = padding + (chartHeight / 4) * index;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  if (state.chartPoints.length < 2) {
    ctx.fillStyle = dark ? "rgba(236,244,255,0.75)" : "rgba(16,32,61,0.75)";
    ctx.font = "16px Space Grotesk";
    ctx.fillText("Waiting for enough telemetry to render a trend line.", padding, height / 2);
    return;
  }

  const points = state.chartPoints.map((point, index) => {
    const x = padding + (chartWidth / (state.chartPoints.length - 1)) * index;
    const y = height - padding - (point.value / maxValue) * chartHeight;
    return { x, y, value: point.value };
  });

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padding);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points[points.length - 1].x, height - padding);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, padding, 0, height - padding);
  fill.addColorStop(0, dark ? "rgba(0, 240, 255, 0.35)" : "rgba(20, 100, 255, 0.28)");
  fill.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.strokeStyle = dark ? "#48dbfb" : "#1464ff";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = dark ? "#ffffff" : "#10203d";
  ctx.font = "12px Space Grotesk";
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (index === points.length - 1) {
      ctx.fillText(`${formatNumber(point.value)}m`, point.x - 16, point.y - 14);
    }
  });
}

function startRadarLoop() {
  const draw = () => {
    renderRadar();
    window.requestAnimationFrame(draw);
  };
  draw();
}

function renderRadar() {
  fitCanvasToDisplay(radarCanvas);
  const ctx = radarCtx;
  const width = radarCanvas.width;
  const height = radarCanvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.42;
  const dark = state.theme === "dark";
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = dark ? "#04101f" : "#eff5ff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = dark ? "rgba(72, 219, 251, 0.22)" : "rgba(20, 100, 255, 0.22)";
  ctx.lineWidth = 1.4;
  [0.25, 0.5, 0.75, 1].forEach((ratio) => {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * ratio, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);
  ctx.stroke();

  if (state.radarEnabled) {
    state.radarAngle += 0.02;
  }

  const sweepGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  sweepGradient.addColorStop(0, dark ? "rgba(0, 240, 255, 0.42)" : "rgba(20, 100, 255, 0.36)");
  sweepGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(state.radarAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radius, -0.16, 0.16);
  ctx.closePath();
  ctx.fillStyle = sweepGradient;
  ctx.fill();
  ctx.restore();

  const dronesToPlot = state.drones.slice(0, 6);
  dronesToPlot.forEach((drone, index) => {
    const angle = (index / Math.max(dronesToPlot.length, 1)) * Math.PI * 2 + state.radarAngle * 0.35;
    const distanceRatio = clamp(drone.distance / 200, 0.12, 1);
    const x = centerX + Math.cos(angle) * radius * distanceRatio * 0.9;
    const y = centerY + Math.sin(angle) * radius * distanceRatio * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = isDetected(drone) ? "#ff4d6d" : "#40f3a1";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
  ctx.fillStyle = dark ? "#48dbfb" : "#1464ff";
  ctx.fill();
}

function initMap() {
  if (window.google && window.google.maps) {
    setupMap();
    return;
  }

  const apiKey = getMapsApiKey();
  if (!apiKey) {
    dom.mapStatus.textContent = "Maps Key Missing";
    dom.mapFallback.classList.remove("hidden");
    return;
  }

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=initDroneDefenseMap`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    dom.mapStatus.textContent = "Map Load Failed";
    dom.mapFallback.classList.remove("hidden");
  };
  window.initDroneDefenseMap = setupMap;
  document.head.appendChild(script);
}

function setupMap() {
  state.mapLoaded = true;
  const fallbackLocation = { lat: 13.0827, lng: 80.2707 };
  state.map = new google.maps.Map(document.getElementById("map"), {
    center: fallbackLocation,
    zoom: 11,
    styles: getMapStyles(),
    disableDefaultUI: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });

  state.marker = new google.maps.Marker({
    position: fallbackLocation,
    map: state.map,
    title: "Tracked Drone",
    animation: google.maps.Animation.DROP
  });

  dom.mapStatus.textContent = "Map Tracking Active";
  dom.mapFallback.classList.add("hidden");
}

function updateMap(drone) {
  if (!state.mapLoaded || !state.map || !state.marker || drone.lat === null || drone.lng === null) {
    return;
  }

  const position = { lat: drone.lat, lng: drone.lng };
  state.marker.setPosition(position);
  state.map.panTo(position);
}

function getMapStyles() {
  return state.theme === "dark"
    ? [
        { elementType: "geometry", stylers: [{ color: "#08101d" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#08101d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8fa9d6" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#0f2038" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#06111f" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] }
      ]
    : [];
}

function handleFirebaseError(error) {
  console.error("Firebase error:", error);
  dom.connectionState.textContent = "Realtime Error";
  dom.connectionState.className = "mini-badge offline";
  dom.statusText.textContent = "Connection Error";
  dom.statusText.className = "status-text loading";
  dom.statusDescription.textContent = "Unable to read Firebase data. The app will keep trying to reconnect automatically.";
  pushHistory({
    title: "Connection Error",
    detail: error.message || "Firebase listener failed.",
    timestamp: Date.now()
  });
  if (state.reconnectEnabled) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (state.reconnectTimer) {
    return;
  }
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    try {
      database.goOnline();
      updateBrowserStatus("Reconnect attempted");
    } catch (error) {
      console.error("Reconnect failed:", error);
    }
  }, 3000);
}

function checkRealtimeFreshness() {
  if (!state.reconnectEnabled) {
    return;
  }
  const staleFor = Date.now() - state.lastFirebaseSnapshotAt;
  if (state.lastFirebaseSnapshotAt > 0 && staleFor > 25000 && navigator.onLine) {
    try {
      database.goOffline();
      window.setTimeout(() => database.goOnline(), 600);
      updateBrowserStatus("Refreshing realtime connection");
    } catch (error) {
      console.error("Realtime refresh failed:", error);
    }
  }
}

function setNoDataState() {
  dom.statusText.textContent = "Waiting...";
  dom.statusText.className = "status-text loading";
  dom.statusDescription.textContent = "No drone data found yet at the configured Firebase paths.";
  dom.distanceValue.textContent = "-- m";
  dom.timestampValue.textContent = "No signal yet";
  dom.droneCount.textContent = "0";
  dom.batteryValue.textContent = "--%";
  dom.signalValue.textContent = "--%";
  dom.coordinatesValue.textContent = "--, --";
  dom.alertModeValue.textContent = "Standby";
  dom.batteryBar.style.width = "0%";
  dom.signalBar.style.width = "0%";
  document.querySelector(".hero-card").classList.remove("hero-alert");
  stopSiren();
  renderFleet();
}

function resizeCanvases() {
  fitCanvasToDisplay(radarCanvas);
  fitCanvasToDisplay(chartCanvas);
  renderChart();
}

function fitCanvasToDisplay(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(Math.floor(rect.width * ratio), 1);
  const height = Math.max(Math.floor(rect.height * ratio), 1);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function isDetected(drone) {
  return String(drone.status || "").toLowerCase().includes("detected");
}

function formatTimestamp(timestamp) {
  const value = Number(timestamp);
  if (!value) {
    return "Unknown";
  }
  return new Date(value * 1000).toLocaleString();
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatLocation(drone) {
  if (drone.lat === null || drone.lng === null) {
    return "unknown coordinates";
  }
  return `${drone.lat.toFixed(4)}, ${drone.lng.toFixed(4)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
