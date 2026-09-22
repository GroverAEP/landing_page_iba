/**
 * notifications.js
 * Sistema reutilizable de notificaciones (toast). Todos los mensajes
 * visibles para el usuario final se muestran en español.
 */

const NotificationIcons = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
};

const Notify = (() => {
  let region;

  function ensureRegion() {
    if (region) return region;
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
    return region;
  }

  function show(message, type = "info", { duration = 4200 } = {}) {
    const el = ensureRegion();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      ${NotificationIcons[type] || NotificationIcons.info}
      <span>${message}</span>
      <button type="button" class="toast-close" aria-label="Cerrar notificación">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    `;
    el.appendChild(toast);

    const remove = () => {
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 150);
    };
    toast.querySelector(".toast-close").addEventListener("click", remove);
    if (duration) setTimeout(remove, duration);
    return remove;
  }

  return {
    success: (msg, opts) => show(msg, "success", opts),
    error: (msg, opts) => show(msg, "error", opts),
    warning: (msg, opts) => show(msg, "warning", opts),
    info: (msg, opts) => show(msg, "info", opts),
  };
})();
