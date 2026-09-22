/**
 * settings.js
 * Comportamiento de la sección Settings: guardar cambios de cuenta y
 * cambio de contraseña con validación y feedback estándar.
 */

document.addEventListener("DOMContentLoaded", () => {
  const accountForm = document.querySelector("#account-form");
  accountForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = accountForm.querySelector('[type="submit"]');
    btn.classList.add("btn-loading"); btn.disabled = true;
    await new Promise((r) => setTimeout(r, 600));
    btn.classList.remove("btn-loading"); btn.disabled = false;
    Notify.success("Los cambios se guardaron correctamente.");
  });

  const securityForm = document.querySelector("#security-form");
  securityForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentField = securityForm.querySelector("[data-field='currentPassword']");
    const newField = securityForm.querySelector("[data-field='newPassword']");
    const confirmField = securityForm.querySelector("[data-field='confirmPassword']");
    const newVal = newField.querySelector(".field-input").value;

    const fields = {
      current: { el: currentField, rules: [Validators.required] },
      next: { el: newField, rules: [Validators.required, Validators.minLength(8)] },
      confirm: { el: confirmField, rules: [Validators.required, Validators.matches(newVal, "Las contraseñas no coinciden.")] },
    };
    if (!validateForm(fields)) return;

    const btn = securityForm.querySelector('[type="submit"]');
    btn.classList.add("btn-loading"); btn.disabled = true;
    await new Promise((r) => setTimeout(r, 700));
    btn.classList.remove("btn-loading"); btn.disabled = false;
    securityForm.reset();
    Notify.success("La contraseña se actualizó correctamente.");
  });

  document.querySelectorAll("[data-settings-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-settings-tab]").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll("[data-settings-panel]").forEach((p) => p.classList.add("visually-hidden"));
      tab.classList.add("is-active");
      document.querySelector(`[data-settings-panel="${tab.dataset.settingsTab}"]`)?.classList.remove("visually-hidden");
    });
  });
});
