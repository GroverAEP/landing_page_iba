/**
 * Ibafex Admin - Historial de Catálogos PDF
 * La lista de jobs ya viene renderizada por Django (context "jobs"); este
 * script solo filtra/ordena/alterna vista sobre lo que ya está en el DOM.
 * No hace fetch de datos: todo el filtrado es del lado del cliente.
 */

function startCatalogHistory() {
  const $ = (id) => document.getElementById(id);
  const on = (el, type, handler) => { if (el) el.addEventListener(type, handler); };
  const setDisplay = (el, value) => { if (el) el.style.display = value; };
  const setValue = (el, value) => { if (el) el.value = value; };
  const safe = (label, fn) => {
    try { fn(); } catch (err) { console.error(`[historial-pdf] Error en "${label}":`, err); }
  };
  const normalizeSearchText = (value) => String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // DOM Elements
  const searchInput = $('searchInput');
  const searchClearBtn = $('searchClearBtn');
  const filterSort = $('filterSort');
  const btnResetFilters = $('btnResetFilters');
  const btnEmptyReset = $('btnEmptyReset');
  const btnRefreshList = $('btnRefreshList');
  const btnGenerateNewPdf = $('btnGenerateNewPdf');

  const btnCardView = $('btnCardView');
  const btnTableView = $('btnTableView');
  const cardViewContainer = $('cardViewContainer');
  const tableViewContainer = $('tableViewContainer');
  const catalogTableBody = $('catalogTableBody');
  const emptyStateFiltered = $('emptyStateFiltered');
  const emptyStateReal = $('emptyStateReal'); // only exists server-side when there are 0 jobs total

  const pageBody = $('catalogPageBody');
  const generationProgress = $('generationProgress');
  const generationProgressLabel = $('generationProgressLabel');
  const generationProgressPercent = $('generationProgressPercent');
  const generationProgressBar = $('generationProgressBar');

  // Delete confirmation modal
  const deleteModalOverlay = $('deleteModalOverlay');
  const deleteModalCatalogName = $('deleteModalCatalogName');
  const deleteModalProducts = $('deleteModalProducts');
  const deleteModalSize = $('deleteModalSize');
  const deleteModalDate = $('deleteModalDate');
  const btnModalCancel = $('btnModalCancel');
  const btnModalConfirm = $('btnModalConfirm');

  // Toasts (reemplazan los alert())
  const toastStack = $('toastStack');

  // URLs come from the template via data-* attributes (built with {% url %}),
  // so this script never hardcodes a path. The "0" placeholder gets swapped
  // for the real job id before each request.
  const generateUrl = pageBody ? pageBody.dataset.generateUrl : null;
  const statusUrlTemplate = pageBody ? pageBody.dataset.statusUrlTemplate : null;
  const deleteUrlTemplate = pageBody ? pageBody.dataset.deleteUrlTemplate : null;
  const buildUrl = (template, jobId) => template ? template.replace('0', jobId) : null;

  const getCsrfToken = () => {
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    return input ? input.value : '';
  };

  let pollTimer = null;
  let pendingDeleteId = null;
  let isDeleting = false;

  const requiredIds = ['searchInput', 'searchClearBtn', 'filterSort', 'btnResetFilters', 'btnCardView', 'btnTableView', 'cardViewContainer', 'tableViewContainer'];
  const missingIds = requiredIds.filter(id => !$(id));
  if (missingIds.length) {
    console.warn('[historial-pdf] Estos ids no existen en el HTML:', missingIds.join(', '));
  }

  let currentViewMode = 'card';

  init();

  function init() {
    safe('listeners', setupEventListeners);
    safe('vista inicial', () => applyViewMode(currentViewMode));
    safe('filtro inicial', applyFilters);
    console.info('[historial-pdf] iniciado');
  }

  // Reads every catalog card/row already in the DOM as a plain object,
  // so filtering/sorting never needs another request to the server.
  function getAllItems() {
    const cardItems = cardViewContainer
      ? Array.from(cardViewContainer.querySelectorAll('.catalog-card'))
      : [];

    return cardItems.map(cardEl => {
      const id = cardEl.dataset.id;
      const rowEl = catalogTableBody ? catalogTableBody.querySelector(`tr[data-id="${id}"]`) : null;
      return {
        id,
        cardEl,
        rowEl,
        search: normalizeSearchText(cardEl.dataset.search || ''),
        timestamp: Number(cardEl.dataset.timestamp) || 0,
        bytes: Number(cardEl.dataset.bytes) || 0,
        products: Number(cardEl.dataset.products) || 0
      };
    });
  }

  function applyFilters() {
    const query = normalizeSearchText((searchInput && searchInput.value) || '').trim();
    const sortBy = (filterSort && filterSort.value) || 'recent';

    if (searchClearBtn) searchClearBtn.classList.toggle('active', query.length > 0);

    const items = getAllItems();

    const matched = items.filter(item => !query || item.search.includes(query));
    const hidden = items.filter(item => !matched.includes(item));

    // Sort only the matched items; order is expressed by re-inserting DOM nodes
    matched.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return a.timestamp - b.timestamp;
        case 'largest': return b.bytes - a.bytes;
        case 'most_products': return b.products - a.products;
        case 'recent':
        default: return b.timestamp - a.timestamp;
      }
    });

    hidden.forEach(item => {
      setDisplay(item.cardEl, 'none');
      if (item.rowEl) setDisplay(item.rowEl, 'none');
    });

    matched.forEach(item => {
      setDisplay(item.cardEl, ''); // let the grid's own CSS decide (flex/grid)
      if (item.rowEl) setDisplay(item.rowEl, '');
      if (cardViewContainer) cardViewContainer.appendChild(item.cardEl);
      if (catalogTableBody && item.rowEl) catalogTableBody.appendChild(item.rowEl);
    });

    const totalVisible = matched.length;
    const totalItems = items.length;

    // "No hay catálogos generados aún" (server-rendered, 0 jobs total) always wins
    // over the "sin resultados de búsqueda" message.
    if (!emptyStateReal) {
      setDisplay(emptyStateFiltered, totalItems > 0 && totalVisible === 0 ? 'block' : 'none');
    }

    if (totalItems > 0) {
      const showCards = totalVisible > 0 && currentViewMode === 'card';
      const showTable = totalVisible > 0 && currentViewMode === 'table';
      setDisplay(cardViewContainer, showCards ? 'grid' : 'none');
      setDisplay(tableViewContainer, showTable ? 'block' : 'none');
    }
  }

  function applyViewMode(mode) {
    currentViewMode = mode;
    if (btnCardView) btnCardView.classList.toggle('active', mode === 'card');
    if (btnTableView) btnTableView.classList.toggle('active', mode === 'table');
    applyFilters(); // re-evaluates display based on the new mode + current filters
  }

  function setupEventListeners() {
    on(searchInput, 'input', applyFilters);
    on(searchClearBtn, 'click', () => {
      setValue(searchInput, '');
      applyFilters();
      if (searchInput) searchInput.focus();
    });

    on(filterSort, 'change', applyFilters);

    const resetFn = () => {
      setValue(searchInput, '');
      setValue(filterSort, 'recent');
      applyFilters();
    };
    on(btnResetFilters, 'click', resetFn);
    on(btnEmptyReset, 'click', resetFn);

    on(btnCardView, 'click', () => applyViewMode('card'));
    on(btnTableView, 'click', () => applyViewMode('table'));

    on(btnRefreshList, 'click', () => window.location.reload());

    on(btnGenerateNewPdf, 'click', startGeneration);

    // Delete from history: click en la papelera abre el modal, no elimina directo
    const handleDeleteClick = (e) => {
      const btn = e.target.closest('.btn-delete-catalog');
      if (!btn) return;
      openDeleteModal(btn.dataset.id);
    };
    on(cardViewContainer, 'click', handleDeleteClick);
    on(catalogTableBody, 'click', handleDeleteClick);

    // Delete confirmation modal
    on(btnModalCancel, 'click', closeDeleteModal);
    on(deleteModalOverlay, 'click', (e) => {
      if (e.target === deleteModalOverlay) closeDeleteModal();
    });
    on(btnModalConfirm, 'click', () => {
      if (!pendingDeleteId || isDeleting) return;
      deleteCatalog(pendingDeleteId);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && deleteModalOverlay && deleteModalOverlay.style.display !== 'none') {
        closeDeleteModal();
      }
    });
  }

  /* --- Generar nuevo catálogo --- */
  async function startGeneration() {
    if (!generateUrl) {
      console.error('[historial-pdf] Falta data-generate-url en #catalogPageBody (revisa que la URL "generar_catalogo_pdf" exista).');
      return;
    }

    setGeneratingUI(true, 'Iniciando generación…', 0);

    let jobId = null;
    try {
      const res = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'X-CSRFToken': getCsrfToken(),
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `El servidor respondió ${res.status}.`);
      }

      const data = await res.json();
      jobId = data.job_id;
    } catch (err) {
      console.error('[historial-pdf] Error al iniciar la generación:', err);
      setGeneratingUI(false);
      showToast(`No se pudo iniciar la generación del catálogo: ${err.message || err}`, 'error');
      return;
    }

    pollJobStatus(jobId);
  }

  function setGeneratingUI(isGenerating, label, percent) {
    if (btnGenerateNewPdf) btnGenerateNewPdf.disabled = isGenerating;
    setDisplay(generationProgress, isGenerating ? 'flex' : 'none');
    if (isGenerating) {
      if (generationProgressLabel) generationProgressLabel.textContent = label || 'Generando catálogo…';
      if (generationProgressPercent) generationProgressPercent.textContent = `${percent || 0}%`;
      if (generationProgressBar) generationProgressBar.style.width = `${percent || 0}%`;
    }
  }

  // Polls /catalogos-pdf/<job_id>/estado/ every 1.5s until the job finishes
  // (completed or failed), then reloads the page so the new card/row appears.
  function pollJobStatus(jobId) {
    if (!statusUrlTemplate) return;
    const url = buildUrl(statusUrlTemplate, jobId);

    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);
        const job = await res.json();

        const total = job.total_products || 0;
        const label = total
          ? `Generando catálogo… (${job.processed_products}/${total} productos)`
          : 'Generando catálogo…';
        setGeneratingUI(true, label, job.progress || 0);

        if (job.status === 'completed') {
          clearInterval(pollTimer);
          setGeneratingUI(false);
          window.location.reload();
        } else if (job.status === 'failed') {
          clearInterval(pollTimer);
          setGeneratingUI(false);
          showToast(`La generación falló: ${job.error_message || 'error desconocido.'}`, 'error');
        }
      } catch (err) {
        console.error('[historial-pdf] Error consultando el estado del job:', err);
        clearInterval(pollTimer);
        setGeneratingUI(false);
      }
    }, 1500);
  }

  /* --- Modal de confirmación de eliminación --- */
  function formatBytes(bytes) {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function openDeleteModal(jobId) {
    const cardEl = cardViewContainer ? cardViewContainer.querySelector(`.catalog-card[data-id="${jobId}"]`) : null;
    pendingDeleteId = jobId;

    if (deleteModalCatalogName) deleteModalCatalogName.textContent = `Catálogo #${jobId}`;
    if (cardEl) {
      if (deleteModalProducts) deleteModalProducts.textContent = cardEl.dataset.products || '—';
      if (deleteModalSize) deleteModalSize.textContent = formatBytes(Number(cardEl.dataset.bytes) || 0);
      const dateEl = cardEl.querySelector('.catalog-subdate');
      if (deleteModalDate) deleteModalDate.textContent = dateEl ? dateEl.textContent.trim() : '—';
    } else {
      if (deleteModalProducts) deleteModalProducts.textContent = '—';
      if (deleteModalSize) deleteModalSize.textContent = '—';
      if (deleteModalDate) deleteModalDate.textContent = '—';
    }

    setDisplay(deleteModalOverlay, 'flex');
    if (btnModalConfirm) btnModalConfirm.focus();
  }

  function closeDeleteModal() {
    if (isDeleting) return; // no cerrar mientras hay una eliminación en curso
    pendingDeleteId = null;
    setDisplay(deleteModalOverlay, 'none');
  }

  function setModalDeletingUI(isBusy) {
    isDeleting = isBusy;
    if (btnModalConfirm) {
      btnModalConfirm.disabled = isBusy;
      btnModalConfirm.innerHTML = isBusy
        ? '<i class="fa-solid fa-spinner fa-spin"></i><span>Eliminando…</span>'
        : '<i class="fa-solid fa-trash-can"></i><span>Sí, eliminar</span>';
    }
    if (btnModalCancel) btnModalCancel.disabled = isBusy;
  }

  /* --- Toasts (reemplazan los alert()) --- */
  function showToast(message, type = 'info') {
    if (!toastStack) { alert(message); return; }
    const el = document.createElement('div');
    el.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    el.textContent = message;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  /* --- Eliminar catálogo del historial --- */
  async function deleteCatalog(jobId) {
    if (!deleteUrlTemplate) {
      console.error('[historial-pdf] Falta data-delete-url-template en #catalogPageBody.');
      return;
    }

    setModalDeletingUI(true);

    const url = buildUrl(deleteUrlTemplate, jobId);
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': getCsrfToken(), 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);

      // Remove the card and the table row for this job from the DOM
      if (cardViewContainer) {
        const cardEl = cardViewContainer.querySelector(`.catalog-card[data-id="${jobId}"]`);
        if (cardEl) cardEl.remove();
      }
      if (catalogTableBody) {
        const rowEl = catalogTableBody.querySelector(`tr[data-id="${jobId}"]`);
        if (rowEl) rowEl.remove();
      }
      applyFilters();
      showToast('Catálogo eliminado del historial.', 'success');
    } catch (err) {
      console.error('[historial-pdf] Error al eliminar el catálogo:', err);
      showToast(`No se pudo eliminar el catálogo: ${err.message || err}`, 'error');
    } finally {
      setModalDeletingUI(false);
      pendingDeleteId = null;
      setDisplay(deleteModalOverlay, 'none');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startCatalogHistory);
} else {
  startCatalogHistory();
}