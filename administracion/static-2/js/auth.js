/**
 * auth.js
 * Lógica de la pantalla de login y de recuperación de contraseña.
 * Ambos flujos viven en la misma pantalla para no romper la identidad
 * visual (ver sección 9 del brief).
 */

document.addEventListener("DOMContentLoaded", () => {
  const loginView = document.querySelector("[data-view='login']");
  const recoverView = document.querySelector("[data-view='recover']");
  const successView = document.querySelector("[data-view='recover-success']");

  function showView(view) {
    [loginView, recoverView, successView].forEach((v) => v?.classList.add("visually-hidden"));
    view?.classList.remove("visually-hidden");
  }

  document.querySelector("[data-go-recover]")?.addEventListener("click", (e) => {
    e.preventDefault();
    showView(recoverView);
  });
  document.querySelectorAll("[data-go-login]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); showView(loginView); })
  );

  // ------------------------------------------------------------- Login
  const loginForm = document.querySelector("#login-form");
  if (loginForm) {
    const togglePasswordBtn = loginForm.querySelector("[data-toggle-password]");
    const passwordInput = loginForm.querySelector("#login-password");
    togglePasswordBtn?.addEventListener("click", () => {
      const isText = passwordInput.type === "text";
      passwordInput.type = isText ? "password" : "text";
      togglePasswordBtn.setAttribute("aria-label", isText ? "Mostrar contraseña" : "Ocultar contraseña");
      togglePasswordBtn.innerHTML = isText
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.4 18.4 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
    });

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const usernameField = loginForm.querySelector("[data-field='username']");
      const passwordField = loginForm.querySelector("[data-field='password']");
      const username = usernameField.querySelector(".field-input").value.trim();
      const password = passwordField.querySelector(".field-input").value;

      let hasError = false;
      if (!username && !password) {
        setFieldError(usernameField, "El usuario y la contraseña son obligatorios.");
        setFieldError(passwordField, "El usuario y la contraseña son obligatorios.");
        hasError = true;
      } else {
        const uErr = runValidators(username, [Validators.required]);
        const pErr = runValidators(password, [Validators.required]);
        setFieldError(usernameField, uErr);
        setFieldError(passwordField, pErr);
        hasError = !!(uErr || pErr);
      }
      if (hasError) return;

      const submitBtn = loginForm.querySelector("[type='submit']");
      submitBtn.classList.add("btn-loading");
      submitBtn.disabled = true;

      try {
        await Api.auth.login({ username, password });
        Notify.success("Bienvenido de nuevo.");
        setTimeout(() => { window.location.href = "/dashboard/"; }, 500);
      } catch (err) {
        Notify.error(err.message || "Las credenciales ingresadas no son válidas.");
        setFieldError(passwordField, "Las credenciales ingresadas no son válidas.");
      } finally {
        submitBtn.classList.remove("btn-loading");
        submitBtn.disabled = false;
      }
    });
  }

  // -------------------------------------------------- Password recovery
  const recoverForm = document.querySelector("#recover-form");
  if (recoverForm) {
    recoverForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailField = recoverForm.querySelector("[data-field='email']");
      const email = emailField.querySelector(".field-input").value.trim();
      const error = runValidators(email, [Validators.required, Validators.email]);
      setFieldError(emailField, error);
      if (error) return;

      const submitBtn = recoverForm.querySelector("[type='submit']");
      submitBtn.classList.add("btn-loading");
      submitBtn.disabled = true;

      try {
        await Api.auth.requestPasswordReset({ email });
        showView(successView);
      } catch (err) {
        Notify.error("No se pudo procesar la solicitud. Inténtalo nuevamente.");
      } finally {
        submitBtn.classList.remove("btn-loading");
        submitBtn.disabled = false;
      }
    });
  }
});
