/**
 * modal.js
 * Modal genérico y modal de confirmación reutilizables.
 * Accesible: trap de foco básico, cierre con Escape, aria-modal.
 */

const ModalManager = (() => {
  let activeOverlay = null;
  let lastFocusedEl = null;

  function buildOverlay(innerHtml, { size = "md" } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <div class="modal-panel" role="dialog" aria-modal="true" style="${size === "lg" ? "max-width:720px" : ""}">
        ${innerHtml}
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function open(overlay) {
    lastFocusedEl = document.activeElement;
    activeOverlay = overlay;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    document.body.style.overflow = "hidden";

    const focusable = overlay.querySelector("[data-autofocus]") || overlay.querySelector("input, select, button");
    if (focusable) focusable.focus();

    const onKeydown = (e) => {
      if (e.key === "Escape") close();
    };
    overlay.addEventListener("keydown", onKeydown);
    overlay._onKeydown = onKeydown;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  function close() {
    if (!activeOverlay) return;
    const overlay = activeOverlay;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(() => overlay.remove(), 150);
    activeOverlay = null;
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  /**
   * open(): crea y muestra un modal genérico.
   * contentHtml debe incluir modal-header/body/footer.
   * Devuelve el nodo overlay para que el llamador pueda enlazar eventos.
   */
  function openModal(contentHtml, opts = {}) {
    const overlay = buildOverlay(contentHtml, opts);
    const closeBtn = overlay.querySelector(".modal-close");
    if (closeBtn) closeBtn.addEventListener("click", close);
    open(overlay);
    return overlay;
  }

  /**
   * confirm(): modal de confirmación para acciones destructivas o importantes.
   * Devuelve una Promise<boolean>.
   */
  function confirmAction({
    title = "Confirmar acción",
    description = "¿Deseas continuar?",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    danger = true,
  } = {}) {
    return new Promise((resolve) => {
      const overlay = buildOverlay(`
        <div class="modal-body" style="text-align:center; padding-top:1.75rem;">
          <div class="state-icon" style="margin:0 auto .75rem; ${danger ? "background:var(--danger-50); color:var(--danger-600);" : "background:var(--warning-50); color:var(--warning-600);"}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
          </div>
          <h3 style="margin:0 0 .375rem; font-size:1rem; font-weight:600; color:var(--ink-950);">${title}</h3>
          <p style="margin:0; font-size:.875rem; color:var(--ink-600);">${description}</p>
        </div>
        <div class="modal-footer" style="justify-content:center;">
          <button type="button" class="btn btn-secondary" data-action="cancel">${cancelLabel}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm" data-autofocus>${confirmLabel}</button>
        </div>
      `);

      overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => { close(); resolve(false); });
      overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => { close(); resolve(true); });
      open(overlay);
    });
  }

  return { openModal, close, confirmAction };
})();
