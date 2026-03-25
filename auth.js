const authState = {
  currentRole: "admin",
  credentials: {
    admin: {
      email: "admin@dds.local",
      password: "admin123",
      hint: "Admin demo: admin@dds.local / admin123"
    },
    user: {
      email: "user@dds.local",
      password: "user123",
      hint: "User demo: user@dds.local / user123"
    }
  }
};

const authDom = {
  tabs: Array.from(document.querySelectorAll(".auth-tab")),
  loginRole: document.getElementById("loginRole"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginForm: document.getElementById("loginForm"),
  loginHint: document.getElementById("loginHint"),
  loginError: document.getElementById("loginError")
};

function initAuth() {
  const hashRole = window.location.hash.replace("#", "");
  if (hashRole === "user" || hashRole === "admin") {
    setRole(hashRole);
  } else {
    setRole("admin");
  }

  authDom.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setRole(tab.dataset.role);
    });
  });

  authDom.loginForm.addEventListener("submit", handleLogin);
}

function setRole(role) {
  authState.currentRole = role;
  authDom.loginRole.value = role;
  authDom.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.role === role);
  });
  authDom.emailInput.value = authState.credentials[role].email;
  authDom.passwordInput.value = authState.credentials[role].password;
  authDom.loginHint.textContent = authState.credentials[role].hint;
  authDom.loginError.classList.add("hidden");
  authDom.loginError.textContent = "";
}

function handleLogin(event) {
  event.preventDefault();
  const role = authDom.loginRole.value;
  const email = authDom.emailInput.value.trim().toLowerCase();
  const password = authDom.passwordInput.value;
  const expected = authState.credentials[role];

  if (email !== expected.email || password !== expected.password) {
    authDom.loginError.textContent = "Invalid credentials for the selected role.";
    authDom.loginError.classList.remove("hidden");
    return;
  }

  sessionStorage.setItem("dds-auth-role", role);
  sessionStorage.setItem("dds-auth-email", expected.email);
  window.location.href = "dashboard.html";
}

initAuth();
