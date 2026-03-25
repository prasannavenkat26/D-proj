(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAJ3QEJyL_AFhMdOjwJKaeQUB0A937mQLI",
    authDomain: "drone-defence-8fc8b.firebaseapp.com",
    databaseURL: "https://drone-defence-8fc8b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "drone-defence-8fc8b",
    storageBucket: "drone-defence-8fc8b.firebasestorage.app",
    messagingSenderId: "166788888102",
    appId: "1:166788888102:web:734b737cb222cda1f698e7",
    measurementId: "G-0NHH6ZL9LX"
  };

  const app = firebase.initializeApp(firebaseConfig);
  const database = firebase.database(app);

  const refs = {
    drone: database.ref("drone"),
    drones: database.ref("drones"),
    alerts: database.ref("alerts"),
    admin: database.ref("admin"),
    logs: database.ref("logs"),
    connection: database.ref(".info/connected")
  };

  const defaultAdminState = {
    systemActive: true,
    mode: "LIVE",
    notifications: true,
    radar: true,
    autoReconnect: true,
    offlineMode: true,
    theme: "dark",
    siren: true,
    popups: true,
    push: true,
    geofenceEnabled: false,
    geofenceRadius: 120,
    firebasePaths: {
      primary: "/drone",
      fleet: "/drones",
      alerts: "/alerts"
    },
    mapLayer: "OSM",
    aiThreat: true
  };

  const defaultDrone = {
    id: "drone-main",
    status: "No Drone",
    distance: 0,
    battery: 100,
    signal: 100,
    lat: 13.0827,
    lng: 80.2707,
    altitude: 0,
    speed: 0,
    threat: "LOW",
    timestamp: new Date().toISOString(),
    snapshot: "assets/drone-snapshot.svg"
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function seedDefaults() {
    try {
      const [adminSnap, droneSnap] = await Promise.all([refs.admin.get(), refs.drone.get()]);
      if (!adminSnap.exists()) {
        await refs.admin.set(defaultAdminState);
      }
      if (!droneSnap.exists()) {
        await refs.drone.set(defaultDrone);
      }
    } catch (error) {
      console.error("Default seed failed", error);
    }
  }

  function pushAlert(payload) {
    return refs.alerts.push({
      type: payload.type || "Drone Detected",
      level: payload.level || "HIGH",
      message: payload.message || "",
      droneId: payload.droneId || "unknown",
      time: payload.time || new Date().toISOString()
    });
  }

  function pushLog(payload) {
    return refs.logs.push({
      action: payload.action || "System action",
      actor: payload.actor || "system",
      details: payload.details || "",
      time: payload.time || new Date().toISOString()
    });
  }

  function exportPath(ref) {
    return ref.get().then((snapshot) => snapshot.val());
  }

  function listen(ref, callback, onError) {
    ref.on("value", callback, onError);
    return () => ref.off("value", callback);
  }

  function writePath(path, value) {
    return database.ref(path).set(value);
  }

  function updatePath(path, value) {
    return database.ref(path).update(value);
  }

  function removePath(path) {
    return database.ref(path).remove();
  }

  window.DDSFirebase = {
    app,
    database,
    refs,
    defaultAdminState,
    defaultDrone,
    clone,
    seedDefaults,
    pushAlert,
    pushLog,
    exportPath,
    listen,
    writePath,
    updatePath,
    removePath
  };
})();
