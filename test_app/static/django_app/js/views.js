/**
 * Ibafex Admin - Views (Analytics) Logic
 * Chart.js monthly/daily visits graph, dynamic KPI recalculations, pages breakdown
 * y comparación entre dos meses.
 * Datos reales desde /api/visitas/resumen/ y /api/visitas/comparar/ (modelo VisitCounter).
 *
 * NOTA: el modelo VisitCounter solo registra visitas totales por página/día.
 * No existen 'visitantes únicos' separados, 'páginas vistas', 'tasa de rebote'
 * ni 'tiempo promedio' -> esas métricas se quitaron del dashboard porque
 * no hay datos reales que las respalden. "Visitas" ya representa visitantes
 * únicos por día gracias a la deduplicación por IP en el backend.
 */

document.addEventListener('DOMContentLoaded', () => {
  window.utils.initCommonLayout('views');

  let visitsChart = null;
  let currentGranularity = 'monthly'; // 'monthly' | 'daily'

  // DOM Elements
  const periodFilter = document.getElementById('periodFilter');
  const btnRefreshStats = document.getElementById('btnRefreshStats');
  const granularityButtons = document.querySelectorAll('.granularity-btn');

  const kpiTotalVisits = document.getElementById('kpiTotalVisits');
  const kpiCurrentMonthVisits = document.getElementById('kpiCurrentMonthVisits');
  const kpiGrowthRate = document.getElementById('kpiGrowthRate');
  const kpiGrowthTrend = document.getElementById('kpiGrowthTrend');
  const kpiDailyAvg = document.getElementById('kpiDailyAvg');

  const chartTitle = document.getElementById('chartTitle');
  const tableTitle = document.getElementById('tableTitle');
  const tableColLabel = document.getElementById('tableColLabel');

  const topPagesList = document.getElementById('topPagesList');
  const monthlyTableBody = document.getElementById('monthlyTableBody');
  const chartCanvas = document.getElementById('monthlyVisitsChart');

  const compareMonthA = document.getElementById('compareMonthA');
  const compareMonthB = document.getElementById('compareMonthB');
  const btnCompareMonths = document.getElementById('btnCompareMonths');
  const comparisonResult = document.getElementById('comparisonResult');

  const API_URL = '/administracion/api/visitas/resumen/';
  const COMPARE_API_URL = '/administracion/api/visitas/comparar/';

  init();

  function init() {
    populateMonthSelectors();
    fetchAndRender(periodFilter ? periodFilter.value : 'year-2026');
    setupEventListeners();
  }

  /* --- Fetch desde Django y render (mensual o diario) --- */
  function fetchAndRender(periodKey) {
    const url = `${API_URL}?period=${encodeURIComponent(periodKey)}&granularity=${currentGranularity}`;

    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
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

  /* --- Render Data for Period --- */
  function renderViewsData(data) {
    // data: { labels, visits, currentMonthVisits, prevMonthVisits, activeMonthsCount, topPages }
    const totalVisits = data.visits.reduce((a, b) => a + b, 0);

    let growth = '0.0';
    if (data.prevMonthVisits > 0) {
      growth = (((data.currentMonthVisits - data.prevMonthVisits) / data.prevMonthVisits) * 100).toFixed(1);
    } else if (data.currentMonthVisits > 0) {
      growth = '100.0';
    }

    // En modo diario, activeMonthsCount llega en "días activos" desde el backend
    const divisor = currentGranularity === 'daily'
      ? Math.max(data.activeMonthsCount, 1)
      : Math.max(data.activeMonthsCount, 1) * 30;
    const dailyAvg = Math.round(totalVisits / divisor);

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

  /* --- Chart.js Rendering (una sola serie: Visitas) --- */
  function renderChart(labels, visits) {
    if (!chartCanvas || !window.Chart) return;

    const ctx = chartCanvas.getContext('2d');
    if (visitsChart) visitsChart.destroy();

    const gradientVisits = ctx.createLinearGradient(0, 0, 0, 300);
    gradientVisits.addColorStop(0, 'rgba(5, 150, 105, 0.35)');
    gradientVisits.addColorStop(1, 'rgba(5, 150, 105, 0.0)');

    visitsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Visitas',
            data: visits,
            borderColor: '#059669',
            backgroundColor: gradientVisits,
            fill: true,
            borderWidth: 2.5,
            tension: 0.38,
            pointBackgroundColor: '#059669',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: currentGranularity === 'daily' ? 2 : 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
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
            ticks: { color: '#94a3b8', font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 } }
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

  /* --- Render Top Pages List --- */
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
            <div class="top-page-visits">${page.visits.toLocaleString('es-CO')}</div>
          </div>
          <div class="page-progress-wrap">
            <div class="page-progress-bar" style="width: ${page.percentage}%;"></div>
          </div>
        </li>
      `).join('');
  }

  /* --- Render Tabla (Mes o Día + Visitas) --- */
  function renderMonthlyTable(labels, visits) {
    if (!monthlyTableBody) return;

    let rowsHtml = '';
    for (let i = 0; i < labels.length; i++) {
      if (visits[i] === 0) continue;
      rowsHtml += `
        <tr>
          <td><strong>${labels[i]}</strong></td>
          <td style="font-weight: 600; color: var(--primary-color);">${visits[i].toLocaleString('es-CO')}</td>
        </tr>
      `;
    }

    monthlyTableBody.innerHTML = rowsHtml || '<tr><td colspan="2">Sin datos para este periodo.</td></tr>';
  }

  /* --- Toggle Mensual / Diario --- */
  function setGranularity(granularity) {
    currentGranularity = granularity;

    granularityButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.granularity === granularity);
    });

    if (granularity === 'daily') {
      periodFilter.style.display = 'none';
      chartTitle.textContent = 'Evolución Diaria de Visitas (últimos 30 días)';
      tableTitle.textContent = 'Rendimiento por Día';
      tableColLabel.textContent = 'Día';
    } else {
      periodFilter.style.display = '';
      chartTitle.textContent = 'Evolución Mensual de Visitas';
      tableTitle.textContent = 'Rendimiento por Mes';
      tableColLabel.textContent = 'Mes';
    }

    fetchAndRender(periodFilter.value);
  }

  /* --- Comparación de Meses --- */
  function populateMonthSelectors() {
    if (!compareMonthA || !compareMonthB) return;

    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const today = new Date();
    const options = [];

    // Últimos 24 meses, del más reciente al más antiguo
    for (let i = 0; i < 24; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
      options.push({ value, label });
    }

    const optionsHtml = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    compareMonthA.innerHTML = optionsHtml;
    compareMonthB.innerHTML = optionsHtml;

    // Por defecto: mes actual vs. mes anterior
    compareMonthA.selectedIndex = 1; // mes anterior
    compareMonthB.selectedIndex = 0; // mes actual
  }

  function fetchComparison() {
    const monthA = compareMonthA.value;
    const monthB = compareMonthB.value;

    if (!monthA || !monthB) return;

    fetch(`${COMPARE_API_URL}?month_a=${monthA}&month_b=${monthB}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => renderComparison(data))
      .catch(err => {
        console.error('Error cargando comparación de meses:', err);
        if (window.utils && window.utils.showToast) {
          window.utils.showToast('No se pudo comparar', 'Ocurrió un problema al consultar la comparación.', 'danger');
        }
      });
  }

  function renderComparison(data) {
    // data: { month_a: {label, total, topPages}, month_b: {...}, growthPercent }
    comparisonResult.style.display = 'block';

    document.getElementById('compareLabelA').textContent = data.month_a.label;
    document.getElementById('compareLabelB').textContent = data.month_b.label;
    document.getElementById('compareTotalA').textContent = data.month_a.total.toLocaleString('es-CO');
    document.getElementById('compareTotalB').textContent = data.month_b.total.toLocaleString('es-CO');
    document.getElementById('compareTopLabelA').textContent = `(${data.month_a.label})`;
    document.getElementById('compareTopLabelB').textContent = `(${data.month_b.label})`;

    const growthEl = document.getElementById('compareGrowth');
    const isPositive = Number(data.growthPercent) >= 0;
    growthEl.textContent = `${isPositive ? '+' : ''}${data.growthPercent}%`;
    growthEl.style.color = isPositive ? '#059669' : '#dc2626';

    renderCompareTopPages('compareTopPagesA', data.month_a.topPages || []);
    renderCompareTopPages('compareTopPagesB', data.month_b.topPages || []);
  }

  function renderCompareTopPages(containerId, topPages) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!topPages.length) {
      el.innerHTML = '<li class="top-page-item">Sin datos.</li>';
      return;
    }

    el.innerHTML = topPages.map(page => `
        <li class="top-page-item">
          <div class="top-page-header">
            <div class="top-page-title">${window.utils.escapeHtml(page.page_name)}</div>
            <div class="top-page-visits">${page.visits.toLocaleString('es-CO')}</div>
          </div>
          <div class="page-progress-wrap">
            <div class="page-progress-bar" style="width: ${page.percentage}%;"></div>
          </div>
        </li>
      `).join('');
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

    granularityButtons.forEach(btn => {
      btn.addEventListener('click', () => setGranularity(btn.dataset.granularity));
    });

    btnCompareMonths.addEventListener('click', fetchComparison);
  }
});