(function () {
  const AUTH_STORAGE_KEY = "dds-auth-session";
  const users = {
    admin: {
      role: "admin",
      label: "Admin",
      email: "admin@dds.local",
      passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
      redirect: "admin.html",
      hint: "Admin demo: admin@dds.local / admin123"
    },
    viewer: {
      role: "viewer",
      label: "Viewer",
      email: "viewer@dds.local",
      passwordHash: "65375049b9e4d7cad6c9ba286fdeb9394b28135a3e84136404cfccfdcc438894",
      redirect: "dashboard.html",
      hint: "Viewer demo: viewer@dds.local / viewer123"
    }
  };

  function saveSession(session) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  async function sha256(value) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("");
  }

  async function login(role, email, password) {
    const account = users[role];
    if (!account) {
      throw new Error("Unknown role.");
    }

    const passwordHash = await sha256(password);
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== account.email || passwordHash !== account.passwordHash) {
      throw new Error("Invalid credentials.");
    }

    const session = {
      role: account.role,
      email: account.email,
      label: account.label,
      loggedInAt: new Date().toISOString()
    };
    saveSession(session);
    return session;
  }

  function requireRole(allowedRoles) {
    const session = getSession();
    if (!session || !allowedRoles.includes(session.role)) {
      window.location.href = "login.html";
      return null;
    }
    return session;
  }

  function redirectIfAuthenticated() {
    const session = getSession();
    if (!session) {
      return;
    }
    const account = users[session.role];
    if (account) {
      window.location.href = account.redirect;
    }
  }

  function getUserByRole(role) {
    return users[role] || null;
  }

  window.DDSAuth = {
    users,
    login,
    getSession,
    clearSession,
    requireRole,
    redirectIfAuthenticated,
    getUserByRole
  };
})();
