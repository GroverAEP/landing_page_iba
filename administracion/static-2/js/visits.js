/**
 * visits.js
 * Dashboard y tabla del módulo de Visitas.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.querySelector("[data-visits-page]");
  if (!root) return;

  const cardsEl = root.querySelector("[data-visits-cards]");
  const chartCanvas = root.querySelector("#visits-chart");
  const tbody = root.querySelector("[data-visits-tbody]");
  const deviceFilter = root.querySelector("[data-filter='device']");
  const sourceFilter = root.querySelector("[data-filter='source']");

  const state = { page: 1, pageSize: 10, device: "", source: "", loading: true };

  function renderCardsSkeleton() {
    cardsEl.innerHTML = Array.from({ length: 4 }).map(() => `<div class="stat-card"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:28px;width:40%"></div></div>`).join("");
  }

  async function loadSummary() {
    renderCardsSkeleton();
    try {
      const summary = await Api.visits.summary();
      cardsEl.innerHTML = [
        { label: "Total Visits", value: summary.totalVisits, icon: "bar-chart-2" },
        { label: "Today's Visits", value: summary.todayVisits, icon: "calendar" },
        { label: "Unique Visitors", value: summary.uniqueVisitors, icon: "users" },
        { label: "This Week", value: summary.thisWeek, icon: "trending-up" },
      ].map((c) => `
        <div class="stat-card">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span class="stat-label">${c.label}</span>
            <span class="stat-icon" style="background:var(--brand-50); color:var(--brand-700);"><i data-lucide="${c.icon}" width="17" height="17"></i></span>
          </div>
          <span class="stat-value">${c.value.toLocaleString("es-PE")}</span>
        </div>
      `).join("");
      if (window.lucide) window.lucide.createIcons();
      renderChart(summary.series);
    } catch (err) {
      cardsEl.innerHTML = `<div class="state-block" style="grid-column:1/-1;"><div class="state-icon"><i data-lucide="wifi-off"></i></div><p class="state-title">No se pudo cargar la información</p><p class="state-desc">Inténtalo nuevamente.</p></div>`;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function renderChart(series) {
    if (!chartCanvas || !window.Chart) return;
    const ctx = chartCanvas.getContext("2d");
    if (chartCanvas._chart) chartCanvas._chart.destroy();
    chartCanvas._chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: series.labels.map((d) => new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })),
        datasets: [{
          label: "Visits",
          data: series.values,
          borderColor: "#107B12",
          backgroundColor: "rgba(16,123,18,0.08)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: "#107B12",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: "#EEEDE3" } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function formatDeviceIcon(device) {
    return device === "Mobile" ? "smartphone" : device === "Tablet" ? "tablet" : "monitor";
  }

  async function loadTable() {
    state.loading = true;
    tbody.innerHTML = Array.from({ length: 6 }).map(() => `<tr><td colspan="8"><div class="skeleton" style="height:32px;"></div></td></tr>`).join("");
    try {
      const res = await Api.visits.list({ page: state.page, pageSize: state.pageSize, device: state.device, source: state.source });
      if (res.results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="state-block"><div class="state-icon"><i data-lucide="bar-chart-2"></i></div><p class="state-title">No visits found</p><p class="state-desc">No hay visitas que coincidan con los filtros seleccionados.</p></div></td></tr>`;
      } else {
        tbody.innerHTML = res.results.map((v) => `
          <tr>
            <td>${new Date(v.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</td>
            <td>${v.time}</td>
            <td style="font-weight:600; color:var(--ink-950);">${v.visits}</td>
            <td>${v.uniqueVisitors}</td>
            <td><span class="badge badge-neutral"><i data-lucide="${formatDeviceIcon(v.device)}" width="12" height="12"></i>${v.device}</span></td>
            <td>${v.browser}</td>
            <td>${v.os}</td>
            <td>${v.source}</td>
          </tr>
        `).join("");
      }
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="state-block"><div class="state-icon"><i data-lucide="wifi-off"></i></div><p class="state-title">No se pudo cargar la información</p><p class="state-desc">Inténtalo nuevamente.</p><button type="button" class="btn btn-secondary btn-sm" data-retry style="margin-top:.75rem;">Reintentar</button></div></td></tr>`;
      if (window.lucide) window.lucide.createIcons();
      root.querySelector("[data-retry]")?.addEventListener("click", loadTable);
    }
  }

  deviceFilter?.addEventListener("change", () => { state.device = deviceFilter.value; loadTable(); });
  sourceFilter?.addEventListener("change", () => { state.source = sourceFilter.value; loadTable(); });

  loadSummary();
  loadTable();
});
