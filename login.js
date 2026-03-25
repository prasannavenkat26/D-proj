(function () {
  window.DDSAuth.redirectIfAuthenticated();

  const dom = {
    tabs: Array.from(document.querySelectorAll(".auth-tab")),
    loginRole: document.getElementById("loginRole"),
    emailInput: document.getElementById("emailInput"),
    passwordInput: document.getElementById("passwordInput"),
    loginForm: document.getElementById("loginForm"),
    loginHint: document.getElementById("loginHint"),
    loginError: document.getElementById("loginError")
  };

  let currentRole = "admin";

  function setRole(role) {
    currentRole = role;
    dom.loginRole.value = role;
    const account = window.DDSAuth.getUserByRole(role);
    dom.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.role === role));
    dom.emailInput.value = account.email;
    dom.passwordInput.value = role === "admin" ? "admin123" : "viewer123";
    dom.loginHint.textContent = account.hint;
    dom.loginError.classList.add("hidden");
    dom.loginError.textContent = "";
  }

  async function handleLogin(event) {
    event.preventDefault();
    try {
      const session = await window.DDSAuth.login(currentRole, dom.emailInput.value, dom.passwordInput.value);
      const redirect = window.DDSAuth.getUserByRole(session.role).redirect;
      window.location.href = redirect;
    } catch (error) {
      dom.loginError.textContent = error.message || "Unable to login.";
      dom.loginError.classList.remove("hidden");
    }
  }

  dom.tabs.forEach((tab) => tab.addEventListener("click", () => setRole(tab.dataset.role)));
  dom.loginForm.addEventListener("submit", handleLogin);
  setRole(window.location.hash === "#viewer" ? "viewer" : "admin");
})();
