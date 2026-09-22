/**
 * Ibafex Admin - Views (Analytics) Logic
 * Chart.js monthly visits graph, dynamic KPI recalculations, and pages breakdown.
 * Datos reales desde /api/visitas/resumen/ (modelo VisitCounter).
 *
 * NOTA: el modelo VisitCounter solo registra visitas totales por página/día.
 * No existen 'visitantes únicos', 'páginas vistas' separadas, 'tasa de rebote'
 * ni 'tiempo promedio' -> esas métricas se quitaron del dashboard porque
 * no hay datos reales que las respalden.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize common sidebar & layout
  window.utils.initCommonLayout('views');

  // Chart instance
  let visitsChart = null;

  // DOM Elements
  const periodFilter = document.getElementById('periodFilter');
  const btnRefreshStats = document.getElementById('btnRefreshStats');

  const kpiTotalVisits = document.getElementById('kpiTotalVisits');
  const kpiCurrentMonthVisits = document.getElementById('kpiCurrentMonthVisits');
  const kpiGrowthRate = document.getElementById('kpiGrowthRate');
  const kpiGrowthTrend = document.getElementById('kpiGrowthTrend');
  const kpiDailyAvg = document.getElementById('kpiDailyAvg');

  const topPagesList = document.getElementById('topPagesList');
  const monthlyTableBody = document.getElementById('monthlyTableBody');
  const chartCanvas = document.getElementById('monthlyVisitsChart');

  const API_URL = '/testing/api/visitas/resumen/';

  // Init
  init();

  function init() {
    fetchAndRender(periodFilter ? periodFilter.value : 'year-2026');
    setupEventListeners();
  }

  /* --- Fetch desde Django y render --- */
  function fetchAndRender(periodKey) {
    fetch(`${API_URL}?period=${encodeURIComponent(periodKey)}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => renderViewsData(data))
      .catch(err => {
        console.error('Error cargando métricas de visitas:', err);
        if (window.utils && window.utils.showToast) {
          window.utils.showToast(
            'No se pudieron cargar las métricas',
            'Ocurrió un problema al consultar los datos de visitas. Intenta de nuevo.',
            'danger'
          );
        }
      });
  }

  /* --- Render Data for Period (ahora recibe el JSON ya calculado por Django) --- */
  function renderViewsData(data) {
    // data: { labels, visits, currentMonthVisits, prevMonthVisits, activeMonthsCount, topPages }
    const totalVisits = data.visits.reduce((a, b) => a + b, 0);

    let growth = '0.0';
    if (data.prevMonthVisits > 0) {
      growth = (((data.currentMonthVisits - data.prevMonthVisits) / data.prevMonthVisits) * 100).toFixed(1);
    } else if (data.currentMonthVisits > 0) {
      growth = '100.0';
    }

    const daysInPeriod = Math.max(data.activeMonthsCount, 1) * 30;
    const dailyAvg = Math.round(totalVisits / daysInPeriod);

    kpiTotalVisits.textContent = totalVisits.toLocaleString('es-CO');
    kpiCurrentMonthVisits.textContent = data.currentMonthVisits.toLocaleString('es-CO');

    const isPositiveGrowth = Number(growth) >= 0;
    kpiGrowthRate.textContent = `${isPositiveGrowth ? '+' : ''}${growth}%`;
    kpiGrowthTrend.className = `kpi-trend ${isPositiveGrowth ? 'trend-up' : 'trend-down'}`;
    kpiGrowthTrend.innerHTML = `
      <i class="fa-solid ${isPositiveGrowth ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
      <span>vs. mes anterior</span>
    `;

    kpiDailyAvg.textContent = `${dailyAvg.toLocaleString('es-CO')} / día`;

    renderChart(data.labels, data.visits);
    renderMonthlyTable(data.labels, data.visits);
    renderTopPages(data.topPages || []);
  }

  /* --- Chart.js Rendering (una sola serie: Visitas Totales, sin 'Únicos') --- */
  function renderChart(labels, visits) {
    if (!chartCanvas || !window.Chart) return;

    const ctx = chartCanvas.getContext('2d');

    if (visitsChart) {
      visitsChart.destroy();
    }

    const gradientVisits = ctx.createLinearGradient(0, 0, 0, 300);
    gradientVisits.addColorStop(0, 'rgba(5, 150, 105, 0.35)');
    gradientVisits.addColorStop(1, 'rgba(5, 150, 105, 0.0)');

    visitsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Visitas Totales',
            data: visits,
            borderColor: '#059669',
            backgroundColor: gradientVisits,
            fill: true,
            borderWidth: 2.5,
            tension: 0.38,
            pointBackgroundColor: '#059669',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false // Using custom header legend
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13, weight: 'bold' },
            bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
            padding: 12,
            cornerRadius: 8,
            boxPadding: 6,
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${context.parsed.y.toLocaleString('es-CO')} visitas`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#94a3b8',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(226, 232, 240, 0.6)' },
            ticks: {
              color: '#94a3b8',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
              callback: function (val) {
                return val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val;
              }
            }
          }
        }
      }
    });
  }

  /* --- Render Top Pages List (sin bounceRate/avgDuration: no existen en el modelo) --- */
  function renderTopPages(topPages) {
    if (!topPagesList) return;

    if (!topPages.length) {
      topPagesList.innerHTML = '<li class="top-page-item">Sin datos de visitas para este periodo.</li>';
      return;
    }

    topPagesList.innerHTML = topPages.map(page => `
        <li class="top-page-item">
          <div class="top-page-header">
            <div>
              <div class="top-page-title">${window.utils.escapeHtml(page.page_name)}</div>
            </div>
            <div class="top-page-visits">
              ${page.visits.toLocaleString('es-CO')}
            </div>
          </div>
          <div class="page-progress-wrap">
            <div class="page-progress-bar" style="width: ${page.percentage}%;"></div>
          </div>
        </li>
      `).join('');
  }

  /* --- Render Monthly Table (solo Mes + Visitas: son los únicos datos reales) --- */
  function renderMonthlyTable(labels, visits) {
    if (!monthlyTableBody) return;

    let rowsHtml = '';
    for (let i = 0; i < labels.length; i++) {
      if (visits[i] === 0) continue; // omite meses futuros/sin datos
      rowsHtml += `
        <tr>
          <td><strong>${labels[i]}</strong></td>
          <td style="font-weight: 600; color: var(--primary-color);">${visits[i].toLocaleString('es-CO')}</td>
        </tr>
      `;
    }

    monthlyTableBody.innerHTML = rowsHtml || '<tr><td colspan="2">Sin datos para este periodo.</td></tr>';
  }

  /* --- Event Listeners --- */
  function setupEventListeners() {
    periodFilter.addEventListener('change', (e) => {
      fetchAndRender(e.target.value);
      window.utils.showToast('Periodo actualizado', `Mostrando métricas para "${e.target.options[e.target.selectedIndex].text}".`, 'info');
    });

    btnRefreshStats.addEventListener('click', () => {
      const icon = btnRefreshStats.querySelector('i');
      if (icon) icon.classList.add('fa-spin');

      fetchAndRender(periodFilter.value);
      setTimeout(() => {
        if (icon) icon.classList.remove('fa-spin');
        window.utils.showToast('Datos actualizados', 'Se han sincronizado las métricas de visitas más recientes.', 'success');
      }, 500);
    });
  }
});