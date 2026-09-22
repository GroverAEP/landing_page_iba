/**
 * dashboard.js
 * Carga y renderiza las tarjetas de resumen del Dashboard.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.querySelector("[data-dashboard-cards]");
  const activityList = document.querySelector("[data-recent-activity]");
  if (!grid) return;

  grid.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="stat-card"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:28px;width:40%"></div></div>
  `).join("");

  try {
    const summary = await Api.dashboard.summary();

    const cards = [
      { label: "Total de productos", value: summary.totalProducts, icon: "package", tone: "neutral" },
      { label: "Productos disponibles", value: summary.available, icon: "check-circle", tone: "success" },
      { label: "Productos agotados", value: summary.outOfStock, icon: "alert-triangle", tone: "danger" },
      { label: "Productos ocultos", value: summary.hidden, icon: "eye-off", tone: "warning" },
      { label: "Categorías", value: summary.totalCategories, icon: "layers", tone: "info" },
      { label: "Marcas", value: summary.totalBrands, icon: "tag", tone: "neutral" },
      { label: "Total de visitas", value: summary.totalVisits, icon: "bar-chart-2", tone: "info" },
    ];

    const toneStyles = {
      success: "background:var(--success-50); color:var(--brand-700);",
      danger: "background:var(--danger-50); color:var(--danger-600);",
      warning: "background:var(--warning-50); color:var(--warning-600);",
      info: "background:var(--info-50); color:var(--info-600);",
      neutral: "background:var(--ink-100); color:var(--ink-700);",
    };

    grid.innerHTML = cards.map((c) => `
      <div class="stat-card">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="stat-label">${c.label}</span>
          <span class="stat-icon" style="${toneStyles[c.tone]}">
            <i data-lucide="${c.icon}" width="17" height="17"></i>
          </span>
        </div>
        <span class="stat-value">${c.value.toLocaleString("es-PE")}</span>
      </div>
    `).join("");

    if (activityList) {
      activityList.innerHTML = summary.recentActivity.map((a) => `
        <li style="display:flex; gap:.75rem; padding:.75rem 0; border-bottom:1px solid var(--ink-100);">
          <span class="stat-icon" style="background:var(--brand-50); color:var(--brand-700); flex-shrink:0; width:28px; height:28px;">
            <i data-lucide="activity" width="14" height="14"></i>
          </span>
          <div>
            <p style="margin:0; font-size:.875rem; color:var(--ink-900);">${a.text}</p>
            <p style="margin:.125rem 0 0; font-size:.75rem; color:var(--ink-500);">${a.time}</p>
          </div>
        </li>
      `).join("");
    }

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    grid.innerHTML = `
      <div class="state-block" style="grid-column: 1 / -1;">
        <div class="state-icon"><i data-lucide="wifi-off"></i></div>
        <p class="state-title">No se pudo cargar la información</p>
        <p class="state-desc">Inténtalo nuevamente en unos segundos.</p>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:.75rem;" data-retry-dashboard>Reintentar</button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    document.querySelector("[data-retry-dashboard]")?.addEventListener("click", () => window.location.reload());
  }
});
