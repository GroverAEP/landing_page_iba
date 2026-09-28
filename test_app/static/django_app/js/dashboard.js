/**
 * Ibafex Admin - Dashboard Logic
 * Products management: search, filters, card/table view toggle, bulk delete, PDF export, pagination
 *
 * Product structure (mirrors the Django `Producto` model):
 *   id, image, brand, category, name, unit_price, unit_of_measure,
 *   bulk_price, bulk_unit_of_measure, date_added, product_of_stock
 *
 * Products now come from Django through window.storage (async / fetch).
 * getProducts, addProduct, updateProduct, deleteProduct and deleteProducts
 * return Promises, so every caller uses async/await + try/catch.
 *
 * Every step is isolated: if an element or helper is missing, the problem is
 * reported in the console as "[dashboard] ..." and the rest keeps working.
 */


/**
 * Configuración centralizada de catálogo: categorías de producto y
 * unidades de paquete. Cambiar acá afecta automáticamente los <select>
 * del formulario y del filtro, sin tocar el HTML.
 */
const PRODUCT_CATEGORIES = [
  'Abarrotes',
  'Bebidas',
  'Lácteos',
  'Panadería',
  'Frutas y Verduras',
  'Carnes y Embutidos',
  'Limpieza',
  'Cuidado Personal',
  'Snacks',
  'Congelados',
];

const PACKAGE_UNITS = [
  { value: '', label: 'Sin paquete' },
  { value: 'caja', label: 'Caja' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'paquete', label: 'Paquete' },
  { value: 'fardo', label: 'Fardo' },
  { value: 'docena', label: 'Docena' },
  { value: 'pack', label: 'Pack' },
  { value: 'bidón', label: 'Bidón' },
];






function startDashboard() {
  /* --- Tiny helpers --- */
  const $ = (id) => document.getElementById(id);
  const on = (el, type, handler) => { if (el) el.addEventListener(type, handler); };
  const setDisplay = (el, value) => { if (el) el.style.display = value; };
  const setValue = (el, value) => { if (el) el.value = value; };
  const safe = (label, fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`[dashboard] Error en "${label}":`, err);
    }
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Lowercases and strips accents/diacritics so the search box matches
  // "cafe", "Cafe", "café" and "CAFÉ" as the same thing.
  const normalizeSearchText = (value) => String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  /** Turns any error thrown by storage/apiFetch into a message the user can read. */
  const errorMessage = (err) => {
    if (err instanceof SyntaxError) {
      return 'El servidor no devolvió JSON válido. Puede que tu sesión haya expirado; recarga la página e inicia sesión de nuevo.';
    }
    if (err instanceof TypeError) {
      return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    }
    return (err && err.message) ? err.message : 'Ocurrió un error inesperado.';
  };

  /* --- Diagnostics: shared services --- */
  if (!window.utils || !window.storage) {
    console.error('[dashboard] window.utils o window.storage no existen. storage.js y utils.js deben cargarse antes que dashboard.js.');
    return;
  }

  const requiredUtils = ['initCommonLayout', 'openModal', 'closeModal', 'confirmAction', 'showToast', 'formatCurrency', 'getCurrentFormattedDate'];
  const requiredStorage = ['getProducts', 'addProduct', 'updateProduct', 'deleteProduct', 'deleteProducts', 'getViewPref', 'saveViewPref', 'getUsers', 'getSettings'];
  const missingUtils = requiredUtils.filter(fn => typeof window.utils[fn] !== 'function');
  const missingStorage = requiredStorage.filter(fn => typeof window.storage[fn] !== 'function');
  if (missingUtils.length) console.error('[dashboard] Faltan funciones en window.utils:', missingUtils.join(', '));
  if (missingStorage.length) console.error('[dashboard] Faltan funciones en window.storage:', missingStorage.join(', '));

  safe('initCommonLayout', () => window.utils.initCommonLayout('dashboard'));

  // Pagination config
  const PRODUCTS_PER_PAGE = 50;

  // State
  let products = [];
  let filteredProducts = [];
  let selectedIds = new Set(); // ids are always stored as strings
  let currentViewMode = 'card'; // 'card' or 'table'
  let loadState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
  let loadRequestId = 0; // ignores responses from outdated loadProducts() calls
  let isSaving = false; // blocks double submit of the product form
  let selectedLetter = ''; // A-Z filter: '' = all, otherwise one uppercase letter (Ñ included)
  let currentPage = 1; // 1-based current page for pagination
  let pendingImageFile = null; // File optimizado (canvas -> Blob) listo para subir; null = no hay imagen nueva seleccionada
  safe('getViewPref', () => {
    currentViewMode = window.storage.getViewPref('dashboard_view', 'card');
  });

  const btnSelectAllFiltered = $('btnSelectAllFiltered'); // nuevo
  const btnSelectAllFilteredLabel = $('btnSelectAllFilteredLabel');
  // DOM Elements
  const searchInput = $('searchInput');
  const searchClearBtn = $('searchClearBtn');
  const filterCategory = $('filterCategory');
  const filterAvailability = $('filterAvailability'); // product_of_stock filter
  const filterPriceRange = $('filterPriceRange');
  // A-Z filter (all optional: if the HTML doesn't have them, the filter is simply inactive)
  const filterLetter = $('filterLetter');
  const alphabetNav = $('alphabetNav');
  const alphabetCurrentFilter = $('alphabetCurrentFilter');
  const alphabetCurrentLetter = $('alphabetCurrentLetter');
  const btnClearLetterFilter = $('btnClearLetterFilter');
  const btnResetFilters = $('btnResetFilters');
  const btnEmptyReset = $('btnEmptyReset');

  const btnCardView = $('btnCardView');
  const btnTableView = $('btnTableView');
  const cardViewContainer = $('cardViewContainer');
  const tableViewContainer = $('tableViewContainer');
  const productTableBody = $('productTableBody');
  const selectAllCheckbox = $('selectAllCheckbox');
  const emptyState = $('emptyState');
  let statusEl = $('loadingState'); // optional; ensureStatusEl() creates it if missing
  let paginationEl = $('paginationBar'); // optional; ensurePaginationEl() creates it if missing

  const bulkActionsBar = $('bulkActionsBar');
  const bulkSelectedCount = $('bulkSelectedCount');
  const btnBulkDelete = $('btnBulkDelete');

  const btnExportPdf = $('btnExportPdf');
  const btnOpenAddModal = $('btnOpenAddModal'); // header button
  const btnAddProductToolbar = $('btnAddProductToolbar'); // toolbar button

  // Product Modal & Form
  const productModalTitle = $('productModalTitle');
  const productForm = $('productForm');
  const productIdInput = $('productId');
  const productNameInput = $('productName');
  const productBrandInput = $('productBrand'); // brand
  const productCategoryInput = $('productCategory');
  const productPriceInput = $('productPrice'); // unit_price
  const productUnitInput = $('productUnit'); // unit_of_measure
  const productBulkPriceInput = $('productBulkPrice'); // bulk_price (optional)
  const productBulkUnitInput = $('productBulkUnit'); // bulk_unit_of_measure (optional)
  const productAvailableInput = $('productAvailable'); // product_of_stock
  const productVisibleInput = document.getElementById('productVisible'); // 👈 nuevo
  // Image Upload Elements
  const imageUploadZone = $('imageUploadZone');
  const productImageFile = $('productImageFile');
  const productImageInput = $('productImage');
  const productImageUrl = $('productImageUrl');
  const btnApplyImageUrl = $('btnApplyImageUrl');
  const uploadPlaceholder = $('uploadPlaceholder');
  const uploadPreviewWrap = $('uploadPreviewWrap');
  const uploadPreviewImg = $('uploadPreviewImg');
  const btnBrowseImage = $('btnBrowseImage');
  const btnChangeImage = $('btnChangeImage');
  const btnRemoveImage = $('btnRemoveImage');

  // KPIs
  const kpiTotalProducts = $('kpiTotalProducts');
  const kpiTotalBrands = $('kpiTotalBrands'); // unique brands
  const kpiAvailableProducts = $('kpiAvailableProducts'); // available products
  const kpiAvgPrice = $('kpiAvgPrice'); // average unit price

  /* --- Diagnostics: ids that the HTML must have --- */
  const requiredIds = [
    'searchInput', 'searchClearBtn', 'filterCategory', 'filterAvailability', 'filterPriceRange',
    'btnResetFilters', 'btnEmptyReset', 'btnCardView', 'btnTableView',
    'cardViewContainer', 'tableViewContainer', 'productTableBody', 'selectAllCheckbox', 'emptyState',
    'bulkActionsBar', 'bulkSelectedCount', 'btnBulkDelete', 'btnExportPdf',
    'btnOpenAddModal', 'btnAddProductToolbar',
    'productModal', 'productModalTitle', 'productForm', 'productId', 'productName',
    'productBrand', 'productCategory', 'productPrice', 'productUnit',
    'productBulkPrice', 'productBulkUnit', 'productAvailable'
  ];
  const missingIds = requiredIds.filter(id => !$(id));
  if (missingIds.length) {
    console.warn('[dashboard] Estos ids no existen en el HTML:', missingIds.join(', '));
  }

  // Initialize
  init();

function init() {
  if (productNameInput) productNameInput.maxLength = 55;

  safe('catálogo (categorías/unidades)', populateCatalogSelects); // nuevo
  safe('barra alfabeto', buildAlphabetNav);
  safe('listeners', setupEventListeners);
  safe('vista tarjetas/tabla', () => applyViewMode(currentViewMode));

  loadProducts();

  console.info('[dashboard] iniciado');
}
  

  /* --- Helpers --- */
  function findProduct(id) {
    return products.find(p => String(p.id) === String(id));
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d) ? '—' : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toggleError(id, show) {
    const el = $(id);
    if (el) el.classList.toggle('visible', show);
  }

  // Accepts data saved with the old structure (producer, price, unit, stock, status...)
  // so stale data still renders. Can be removed once the backend is the only source.
  function normalizeProduct(p) {
    return {
      ...p,
      brand: p.brand ?? p.producer ?? '',
      unit_price: p.unit_price ?? p.price ?? 0,
      unit_of_measure: p.unit_of_measure ?? p.unit ?? '',
      bulk_price: p.bulk_price ?? null,
      bulk_unit_of_measure: p.bulk_unit_of_measure ?? null,
      date_added: p.date_added ?? p.createdDate ?? null,
      product_of_stock: p.product_of_stock ?? (p.status === 'Activo')
    };
  }

  // Django may answer with a bare array or wrap it ({ productos: [...] }, { results: [...] })
  function extractProductList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.productos)) return data.productos;
    if (data && Array.isArray(data.products)) return data.products;
    if (data && Array.isArray(data.results)) return data.results;
    throw new Error('Formato de respuesta inesperado en /productos/ (se esperaba una lista de productos).');
  }

  /* --- Loading / error status (created on the fly if the HTML has no #loadingState) --- */
  // statusEl is declared with the other DOM elements above, before init() runs
  function ensureStatusEl() {
    if (statusEl) return statusEl;
    if (!cardViewContainer || !cardViewContainer.parentNode) return null;
    statusEl = document.createElement('div');
    statusEl.id = 'loadingState';
    statusEl.setAttribute('role', 'status');
    statusEl.style.cssText = 'display:none;padding:3rem 1rem;text-align:center;color:var(--text-muted);';
    cardViewContainer.parentNode.insertBefore(statusEl, cardViewContainer);
    return statusEl;
  }

  // The status box replaces the list only while there is nothing to show yet.
  // On later reloads (after save/delete) the current list stays visible.
  function isStatusBlocking() {
    return products.length === 0 && (loadState === 'loading' || loadState === 'error');
  }

  function setLoadState(state, message = '') {
    loadState = state;
    const el = ensureStatusEl();
    if (!el) return;

    if (isStatusBlocking()) {
      if (state === 'loading') {
        el.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Cargando productos…</span>`;
      } else {
        el.innerHTML = `
          <p style="margin-bottom: 0.75rem;">${esc(message || 'No se pudieron cargar los productos.')}</p>
          <button type="button" class="btn btn-secondary" id="btnRetryLoad">Reintentar</button>
        `;
      }
      el.style.display = 'block';
      setDisplay(emptyState, 'none');
      setDisplay(cardViewContainer, 'none');
      setDisplay(tableViewContainer, 'none');
    } else {
      el.style.display = 'none';
    }

    if (cardViewContainer) cardViewContainer.setAttribute('aria-busy', String(state === 'loading'));
  }

  /**
   * Loads products from Django. Never rejects: on failure it shows a toast,
   * keeps the previous list and resolves to false.
   * @returns {Promise<boolean>} true if the list was refreshed
   */
  async function loadProducts() {
    const requestId = ++loadRequestId;
    setLoadState('loading');

    try {
      const data = await window.storage.getProducts();
      if (requestId !== loadRequestId) return false; // a newer call took over

      products = extractProductList(data).map(normalizeProduct);

      // Drop selections of products that no longer exist
      const existingIds = new Set(products.map(p => String(p.id)));
      selectedIds = new Set([...selectedIds].filter(id => existingIds.has(id)));

      setLoadState('ready');
      // Keep the page the user was on (renderProducts clamps it if it no longer exists)
      safe('filtros y render', () => applyFilters(false));
      safe('KPIs', updateKPIs);
      return true;
    } catch (err) {
      if (requestId !== loadRequestId) return false;
      console.error('[dashboard] Error al cargar productos:', err);
      const message = errorMessage(err);
      setLoadState('error', message);
      window.utils.showToast('No se pudieron cargar los productos', message, 'danger');
      safe('filtros y render', () => applyFilters(false));
      safe('KPIs', updateKPIs);
      return false;
    }
  }

  /* --- KPIs Calculation --- */
  // Async porque window.storage.getUsers() ahora habla con Django (fetch) y
  // devuelve una Promise; safe('KPIs', updateKPIs) sigue funcionando igual
  // porque no espera el resultado, solo dispara la función.
  async function updateKPIs() {
    const totalItems = products.length;
    const uniqueBrands = new Set(products.map(p => String(p.brand).trim())).size;
    const availableCount = products.filter(p => p.product_of_stock).length;
    const totalPrice = products.reduce((acc, p) => acc + (Number(p.unit_price) || 0), 0);
    const avgPrice = totalItems ? totalPrice / totalItems : 0;

    if (kpiTotalProducts) kpiTotalProducts.textContent = totalItems;
    if (kpiTotalBrands) kpiTotalBrands.textContent = uniqueBrands;
    if (kpiAvailableProducts) kpiAvailableProducts.textContent = availableCount.toLocaleString('es-CO');
    if (kpiAvgPrice) kpiAvgPrice.textContent = window.utils.formatCurrency(avgPrice);

    // Update user badge in nav if users exist
    const userBadge = $('navUserBadge');
    if (userBadge) {
      try {
        const usersList = await window.storage.getUsers();
        userBadge.textContent = Array.isArray(usersList) ? usersList.length : 0;
      } catch (err) {
        console.error('[dashboard] Error al cargar usuarios para el badge:', err);
      }
    }
  }

  /* --- View Mode Switcher --- */
  function applyViewMode(mode) {
    currentViewMode = mode;
    window.storage.saveViewPref('dashboard_view', mode);

    const isCard = mode === 'card';
    const isEmpty = filteredProducts.length === 0;
    if (btnCardView) btnCardView.classList.toggle('active', isCard);
    if (btnTableView) btnTableView.classList.toggle('active', !isCard);
    setDisplay(cardViewContainer, isEmpty || !isCard ? 'none' : 'grid');
    setDisplay(tableViewContainer, isEmpty || isCard ? 'none' : 'block');
  }

  /* --- Search & Filters --- */
  // resetPage: true when the user changes a filter/search/letter (go back to page 1).
  // false when we're just re-rendering after a data reload (keep the current page).
  function applyFilters(resetPage = true) {
    const query = normalizeSearchText((searchInput && searchInput.value) || '').trim();
    const category = (filterCategory && filterCategory.value) || '';
    const availability = (filterAvailability && filterAvailability.value) || ''; // '', 'true', 'false'
    const priceRange = (filterPriceRange && filterPriceRange.value) || '';

    if (searchClearBtn) searchClearBtn.classList.toggle('active', query.length > 0);

    filteredProducts = products.filter(p => {
      // Search match: accent-insensitive and case-insensitive (café = cafe = CAFÉ)
      const matchesQuery = !query ||
        normalizeSearchText(p.name).includes(query) ||
        normalizeSearchText(p.brand).includes(query) ||
        normalizeSearchText(p.category).includes(query);

      // Category match
      const matchesCategory = !category || p.category === category;

      // Availability match
      const matchesAvailability = !availability || String(Boolean(p.product_of_stock)) === availability;

      // Price range match (unit price)
      let matchesPrice = true;
      const price = Number(p.unit_price) || 0;
      if (priceRange === '0-15') matchesPrice = price < 15;
      else if (priceRange === '15-30') matchesPrice = price >= 15 && price <= 30;
      else if (priceRange === '30-50') matchesPrice = price > 30 && price <= 50;
      else if (priceRange === '50+') matchesPrice = price > 50;

      // Alphabet (A-Z) match on the product name
      const matchesLetter = !selectedLetter || getProductInitialLetter(p.name) === selectedLetter;

      return matchesQuery && matchesCategory && matchesAvailability && matchesPrice && matchesLetter;
    });

    // With text in the search box, show the most relevant matches first:
    // 1) name starts with what was typed ("Café Molido" for "ca")
    // 2) brand starts with it
    // 3) category starts with it
    // 4) anything else that only matches somewhere in the middle (e.g. "Inca Kola")
    if (query) {
      const searchRank = (p) => {
        if (normalizeSearchText(p.name).startsWith(query)) return 0;
        if (normalizeSearchText(p.brand).startsWith(query)) return 1;
        if (normalizeSearchText(p.category).startsWith(query)) return 2;
        return 3;
      };
      filteredProducts = filteredProducts
        .map((p, index) => ({ p, rank: searchRank(p), index }))
        .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
        .map(({ p }) => p);
    }

    if (resetPage) currentPage = 1;

    // Isolated: a problem in the alphabet bar must never stop the list from rendering
    safe('alfabeto', updateAlphabetUI);
    renderProducts();
  }

  // Llena los <select> de categoría y unidad de paquete desde la configuración
// centralizada (PRODUCT_CATEGORIES / PACKAGE_UNITS), en vez de tenerlos
// hardcodeados y duplicados en el HTML.
function populateCatalogSelects() {
  const categoryOptionsHtml = PRODUCT_CATEGORIES
    .map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`)
    .join('');

  // Filtro de categoría (mantiene su opción "Todas")
  if (filterCategory) {
    filterCategory.innerHTML =
      `<option value="">Todas las categorías</option>` + categoryOptionsHtml;
  }

  // Categoría del formulario (mantiene su opción "Seleccionar categoría")
  if (productCategoryInput) {
    productCategoryInput.innerHTML =
      `<option value="">Seleccionar categoría</option>` + categoryOptionsHtml;
  }

  // Unidad de paquete del formulario
  if (productBulkUnitInput) {
    productBulkUnitInput.innerHTML = PACKAGE_UNITS
      .map(u => `<option value="${esc(u.value)}">${esc(u.label)}</option>`)
      .join('');
  }
}
  /* --- Alphabetical Filter (A - Z) --- */

  // First letter of the name in uppercase; keeps Ñ, strips accents from the rest (Á -> A)
  function getProductInitialLetter(name) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return '';
    const firstChar = trimmed.charAt(0).toUpperCase();
    if (firstChar === 'Ñ') return 'Ñ';
    return firstChar.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // If #alphabetNav exists but is empty, fill it with "Todos" + A-Z (Spanish alphabet).
  // If the HTML already has .alphabet-btn buttons, they are used as they are.
  function buildAlphabetNav() {
    if (!alphabetNav || alphabetNav.querySelector('.alphabet-btn')) return;
    const letters = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
    alphabetNav.innerHTML = ['', ...letters].map(l =>
      `<button type="button" class="alphabet-btn" data-letter="${l}">${l || 'Todos'}</button>`
    ).join('');
  }

  function setLetterFilter(letter) {
    selectedLetter = letter ? String(letter).toUpperCase() : '';
    setValue(filterLetter, selectedLetter);
    applyFilters();
  }

  function updateAlphabetUI() {
    // Active button
    if (alphabetNav) {
      alphabetNav.querySelectorAll('.alphabet-btn').forEach(btn => {
        const btnLetter = (btn.dataset.letter || '').toUpperCase();
        btn.classList.toggle('active', btnLetter === selectedLetter);
      });
    }

    // Badge with the active letter
    if (alphabetCurrentFilter && alphabetCurrentLetter) {
      alphabetCurrentLetter.textContent = selectedLetter;
      setDisplay(alphabetCurrentFilter, selectedLetter ? 'inline-flex' : 'none');
    }

    updateAvailableLetterBadges();
  }

  // Marks which letters have products in the whole catalog (has-products / no-products)
  function updateAvailableLetterBadges() {
    if (!alphabetNav || products.length === 0) return; // nothing loaded yet: don't dim every letter

    const existingLetters = new Set();
    products.forEach(p => {
      const l = getProductInitialLetter(p.name);
      if (l) existingLetters.add(l);
    });

    alphabetNav.querySelectorAll('.alphabet-btn').forEach(btn => {
      const btnLetter = (btn.dataset.letter || '').toUpperCase();
      if (!btnLetter) return; // "Todos" stays neutral
      const has = existingLetters.has(btnLetter);
      btn.classList.toggle('has-products', has);
      btn.classList.toggle('no-products', !has);
    });
  }

  /* --- Pagination (50 products per page) --- */

  function getTotalPages() {
    return Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  }

  // Creates the pagination bar on the fly if the HTML doesn't have #paginationBar,
  // right after whichever view container (card/table) comes last in the DOM.
  function ensurePaginationEl() {
    if (paginationEl) return paginationEl;
    const anchor = tableViewContainer || cardViewContainer;
    if (!anchor || !anchor.parentNode) return null;
    paginationEl = document.createElement('div');
    paginationEl.id = 'paginationBar';
    paginationEl.className = 'pagination-bar';
    paginationEl.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'gap:1rem', 'flex-wrap:wrap', 'margin-top:1.25rem', 'padding-top:1rem',
      'border-top:1px solid var(--border-color, #e2e8f0)'
    ].join(';');
    anchor.parentNode.insertBefore(paginationEl, anchor.nextSibling);
    return paginationEl;
  }

  // Builds a windowed list of page numbers with '...' gaps, e.g. [1, '...', 4, 5, 6, '...', 12]
  function buildPageButtonsList(current, total) {
    const delta = 1;
    const range = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }
    const result = [];
    let prev = null;
    for (const i of range) {
      if (prev !== null && i - prev > 1) result.push('...');
      result.push(i);
      prev = i;
    }
    return result;
  }

  function renderPagination() {
    const el = ensurePaginationEl();
    if (!el) return;

    const total = filteredProducts.length;

    if (total === 0) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }

    const totalPages = getTotalPages();
    const startItem = (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * PRODUCTS_PER_PAGE, total);
    const pageButtons = buildPageButtonsList(currentPage, totalPages);

    el.style.display = 'flex';
    el.innerHTML = `
      <div class="pagination-info" style="font-size: var(--font-size-sm, 0.875rem); color: var(--text-muted, #64748b);">
        Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${total}</strong> productos
      </div>
      <div class="pagination-controls" style="display:flex; align-items:center; gap:0.35rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary btn-sm" id="btnPagePrev" ${currentPage === 1 ? 'disabled' : ''} aria-label="Página anterior" title="Página anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        ${pageButtons.map(p => p === '...'
          ? `<span class="pagination-ellipsis" aria-hidden="true" style="padding: 0 0.35rem; color: var(--text-muted, #64748b);">&hellip;</span>`
          : `<button type="button" class="btn btn-sm ${p === currentPage ? 'btn-primary' : 'btn-secondary'} page-number-btn" data-page="${p}" aria-current="${p === currentPage ? 'page' : 'false'}">${p}</button>`
        ).join('')}
        <button type="button" class="btn btn-secondary btn-sm" id="btnPageNext" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Página siguiente" title="Página siguiente">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    `;
  }
  function formatDate(dateString) {
  if (!dateString) return '—';

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  let date;
  if (match) {
    date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  } else {
    date = new Date(dateString);
  }

  if (isNaN(date.getTime())) return '—';

  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = meses[date.getMonth()];
  const anio = String(date.getFullYear()).slice(-2);

  return `${dia}/${mes}/${anio}`;
}
  function goToPage(page) {
    const totalPages = getTotalPages();
    const nextPage = Math.min(Math.max(1, page), totalPages);
    if (nextPage === currentPage) return;
    currentPage = nextPage;
    renderProducts();
    if (cardViewContainer && typeof cardViewContainer.scrollIntoView === 'function') {
      cardViewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* --- Render Products (Card and Table) --- */
  function renderProducts() {
    const total = filteredProducts.length;
    const totalPages = getTotalPages();
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // Only the current page's slice gets drawn (pagination: 50 per page)
    const pageProducts = filteredProducts.slice(
      (currentPage - 1) * PRODUCTS_PER_PAGE,
      currentPage * PRODUCTS_PER_PAGE
    );

    // Check if empty
    if (total === 0) {
      // While loading (or after a failed first load) the status box is shown instead
      setDisplay(emptyState, isStatusBlocking() ? 'none' : 'block');
      setDisplay(cardViewContainer, 'none');
      setDisplay(tableViewContainer, 'none');
      updateSelectAllState(pageProducts);
      updateBulkActionBar();
      updateSelectAllFilteredButton(); // nuevo
      safe('paginación', renderPagination);
      return;
    }

    setDisplay(emptyState, 'none');
    setDisplay(cardViewContainer, currentViewMode === 'card' ? 'grid' : 'none');
    setDisplay(tableViewContainer, currentViewMode === 'card' ? 'none' : 'block');

    const fallbackImg = 'https://images.unsplash.com/photo-1495107334309-fcf20504a5ab?w=600&auto=format&fit=crop&q=80';

    // 1. Render Card View (current page only)
    if (cardViewContainer) {
      cardViewContainer.innerHTML = pageProducts.map(p => {
        const isSelected = selectedIds.has(String(p.id));
        const availBadgeClass = p.product_of_stock ? 'badge-success' : 'badge-danger';
        const availText = p.product_of_stock ? 'Disponible' : 'No disponible';
        const imgSrc = p.image || fallbackImg;



        const isVisible = p.is_visible !== false; // por defecto true si viene undefined
        const visibleIcon = isVisible ? 'fa-eye' : 'fa-eye-slash';
        const visibleTitle = isVisible ? 'Visible en catálogo' : 'Oculto del catálogo';
        const visibleClass = isVisible ? 'btn-icon-success' : 'btn-icon-muted';


        const bulkText = p.bulk_price != null
      ? `${window.utils.formatCurrency(p.bulk_price)} <small style="font-size: 0.7rem; font-weight: normal; color: var(--text-muted);">/${esc(p.bulk_unit_of_measure)}</small>`
      : '—';

    return `
          <article class="product-card ${isSelected ? 'card-selected' : ''}" data-id="${esc(p.id)}">
            <div class="pcard-image-wrap">
              <img src="${imgSrc}" alt="${esc(p.name)}" class="pcard-img" loading="lazy" onerror="this.src='${fallbackImg}'">
              <div class="pcard-img-check">
                <input type="checkbox" class="pcard-checkbox product-select-box" data-id="${esc(p.id)}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar ${esc(p.name)}">
                <span class="pcard-sku" style="margin-bottom: 0;">${formatDate(p.date_added)}</span>
              </div>
              <div class="pcard-img-badges">
                <span class="badge ${availBadgeClass}"><span class="badge-dot"></span>${availText}</span>
                <span class="badge badge-neutral">${esc(p.category)}</span>
              </div>
            </div>

            <div class="pcard-body-content">
              <h3 class="pcard-title">${esc(p.name)}</h3>
              <div class="pcard-producer">
                <i class="fa-solid fa-tag"></i>
                <span>${esc(p.brand)}</span>
              </div>

              <div class="pcard-metrics">
                <div class="pcard-price-block">
                  <span class="pcard-price-label">Precio por unidad</span>
                  <span class="pcard-price">${window.utils.formatCurrency(p.unit_price)} <small style="font-size: 0.7rem; font-weight: normal; color: var(--text-muted);">/${esc(p.unit_of_measure)}</small></span>
                </div>
                <div class="pcard-stock-block">
                  <span class="pcard-stock-label">Precio por paquete</span>
                  <span class="pcard-stock">${bulkText}</span>
                </div>
              </div>
            </div>

            <div class="pcard-actions">
              <button type="button" class="btn-icon btn-toggle-visible ${visibleClass}" data-id="${esc(p.id)}" data-visible="${isVisible}" title="${visibleTitle}">
                <i class="fa-solid ${visibleIcon}"></i>
              </button>
              <button type="button" class="btn-icon btn-edit-product" data-id="${esc(p.id)}" title="Editar producto">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button type="button" class="btn-icon btn-icon-danger btn-delete-product" data-id="${esc(p.id)}" title="Eliminar producto">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </article>
        `;
  }).join('');
}
    

    function generateProductCode(globalIndex, total) {
      const number = total - globalIndex; // el primero de la lista (más nuevo) = número más alto
      return `P${String(number).padStart(4, '0')}`;
    }
    // 2. Render Table View (current page only)
    // Columns: [checkbox] Fecha | Producto | Marca | Categoría | Precio unitario | Precio paquete | Disponible | [acciones]
    if (productTableBody) {
      const total = filteredProducts.length;
      const pageStartIndex = (currentPage - 1) * PRODUCTS_PER_PAGE; // offset global de esta página

      productTableBody.innerHTML = pageProducts.map((p, localIndex) => {
        const globalIndex = pageStartIndex + localIndex;
        const productCode = generateProductCode(globalIndex, total);

        const isSelected = selectedIds.has(String(p.id));
        const availBadgeClass = p.product_of_stock ? 'badge-success' : 'badge-danger';
        const availText = p.product_of_stock ? 'Disponible' : 'No disponible';
        const imgSrc = p.image || fallbackImg;

  // 👇 faltaba esto en este scope
  const isVisible = p.is_visible !== false;
  const visibleIcon = isVisible ? 'fa-eye' : 'fa-eye-slash';
  const visibleTitle = isVisible ? 'Visible en catálogo' : 'Oculto del catálogo';
  const visibleClass = isVisible ? 'btn-icon-success' : 'btn-icon-muted';

  const bulkText = p.bulk_price != null
    ? `${window.utils.formatCurrency(p.bulk_price)} <small style="color: var(--text-muted);">/${esc(p.bulk_unit_of_measure)}</small>`
    : '—';

  return `
    <tr class="${isSelected ? 'row-selected' : ''}" data-id="${esc(p.id)}">
      <td class="td-checkbox">
        <input type="checkbox" class="product-select-box" data-id="${esc(p.id)}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar ${esc(p.name)}">
      </td>
      <td><span class="pcard-sku">${productCode}</span></td>
      <td>
        <div class="product-table-cell">
          <img src="${imgSrc}" alt="${esc(p.name)}" class="table-product-thumb" loading="lazy" onerror="this.src='${fallbackImg}'">
          <div class="product-thumb-name">
            <strong>${esc(p.name)}</strong>
            <span class="product-sub-producer">Unidad: ${esc(p.unit_of_measure)}</span>
          </div>
        </div>
      </td>
      <td>${esc(p.brand)}</td>
      <td><span class="badge badge-neutral">${esc(p.category)}</span></td>
      <td style="font-weight: 700; color: var(--primary-color);">${window.utils.formatCurrency(p.unit_price)} <small style="font-weight: normal; color: var(--text-muted);">/${esc(p.unit_of_measure)}</small></td>
      <td>${bulkText}</td>
      <td><span class="pcard-sku">${formatDate(p.date_added)}</span></td>
      <td><span class="badge ${availBadgeClass}"><span class="badge-dot"></span>${availText}</span></td>
      <td>
        <div class="pcard-actions">
          <button type="button" class="btn-icon btn-toggle-visible ${visibleClass}" data-id="${esc(p.id)}" data-visible="${isVisible}" title="${visibleTitle}">
            <i class="fa-solid ${visibleIcon}"></i>
          </button>
          <button type="button" class="btn-icon btn-edit-product" data-id="${esc(p.id)}" title="Editar producto">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button type="button" class="btn-icon btn-icon-danger btn-delete-product" data-id="${esc(p.id)}" title="Eliminar producto">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}).join('');
    }
    // Update select all checkbox state (only reflects the visible page) and pagination bar
    updateSelectAllState(pageProducts);
    updateBulkActionBar();
    safe('paginación', renderPagination);
  }

  /* --- Checkbox & Bulk Actions --- */
  // items: defaults to the currently visible page (select-all only affects what's on screen)
  function updateSelectAllState(items) {
    if (!selectAllCheckbox) return;
    const list = items || filteredProducts.slice(
      (currentPage - 1) * PRODUCTS_PER_PAGE,
      currentPage * PRODUCTS_PER_PAGE
    );

    if (list.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    const allSelected = list.every(p => selectedIds.has(String(p.id)));
    const someSelected = list.some(p => selectedIds.has(String(p.id)));

    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = !allSelected && someSelected;
  }

  function updateBulkActionBar() {
    if (!bulkActionsBar) return;

    const count = selectedIds.size;
    if (count > 0) {
      bulkActionsBar.classList.add('visible');
      if (bulkSelectedCount) {
        bulkSelectedCount.textContent = `${count} producto${count > 1 ? 's' : ''} seleccionado${count > 1 ? 's' : ''}`;
      }
    } else {
      bulkActionsBar.classList.remove('visible');
    }
  }


  // Selecciona/deselecciona TODOS los productos que pasan el filtro actual
  // (todas las páginas, no solo la visible)
  function toggleSelectAllFiltered() {
    const allSelected = filteredProducts.length > 0 &&
      filteredProducts.every(p => selectedIds.has(String(p.id)));

    if (allSelected) {
      filteredProducts.forEach(p => selectedIds.delete(String(p.id)));
    } else {
      filteredProducts.forEach(p => selectedIds.add(String(p.id)));
    }
    renderProducts();
  }

  function updateSelectAllFilteredButton() {
    if (!btnSelectAllFiltered || !btnSelectAllFilteredLabel) return;
    const allSelected = filteredProducts.length > 0 &&
      filteredProducts.every(p => selectedIds.has(String(p.id)));
    btnSelectAllFilteredLabel.textContent = allSelected ? 'Deseleccionar todo' : 'Seleccionar todo';
    btnSelectAllFiltered.classList.toggle('active', allSelected);
  }


  function handleSelectToggle(id, isChecked) {
    if (isChecked) {
      selectedIds.add(String(id));
    } else {
      selectedIds.delete(String(id));
    }
    renderProducts();
  }

  // "Select all" only affects the products visible on the current page
  function handleSelectAll(isChecked) {
    const pageProducts = filteredProducts.slice(
      (currentPage - 1) * PRODUCTS_PER_PAGE,
      currentPage * PRODUCTS_PER_PAGE
    );
    if (isChecked) {
      pageProducts.forEach(p => selectedIds.add(String(p.id)));
    } else {
      pageProducts.forEach(p => selectedIds.delete(String(p.id)));
    }
    renderProducts();
  }

  /* --- Product Image Upload Logic --- */
  function setImagePreview(src) {
    if (!uploadPreviewImg || !productImageInput) return;

    if (src) {
      uploadPreviewImg.src = src;
      productImageInput.value = src;
      setDisplay(uploadPreviewWrap, 'block');
      setDisplay(uploadPlaceholder, 'none');
      if (productImageUrl) productImageUrl.value = src.startsWith('data:') ? '' : src;
    } else {
      uploadPreviewImg.src = '';
      productImageInput.value = '';
      setValue(productImageFile, '');
      setValue(productImageUrl, '');
      setDisplay(uploadPreviewWrap, 'none');
      setDisplay(uploadPlaceholder, 'flex');
    }
  }

  // Convierte el <canvas> ya redimensionado en un File real (Blob) para subirlo
  // vía multipart/form-data en addProduct/updateProduct. Se guarda en pendingImageFile.
  function canvasToPendingFile(canvas, originalFileName) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        const safeName = (originalFileName || 'imagen').replace(/\.\w+$/, '') + '.jpg';
        resolve(new File([blob], safeName, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    });
  }

  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      window.utils.showToast('Archivo no válido', 'Por favor selecciona un archivo de imagen (PNG, JPG o WEBP).', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      window.utils.showToast('Archivo muy pesado', 'La imagen supera los 5MB. Por favor sube una imagen más ligera.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      // Resize on canvas to optimize storage size (max 640x480)
      const img = new Image();
      img.onload = async () => {
        const maxDim = 640;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Preview visual (dataURL, liviano de mostrar en <img>)
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImagePreview(optimizedDataUrl);

        // Archivo real que se va a subir al backend (multipart/form-data)
        pendingImageFile = await canvasToPendingFile(canvas, file.name);

        window.utils.showToast('Imagen cargada', 'Fotografía procesada con éxito.', 'success', 2000);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setupImageUpload() {
    if (!imageUploadZone) return;

    // Click zone triggers file input
    on(imageUploadZone, 'click', (e) => {
      if (e.target.closest('#btnRemoveImage') || e.target.closest('#btnChangeImage') || e.target.closest('.image-url-row')) return;
      if (productImageFile) productImageFile.click();
    });

    on(btnBrowseImage, 'click', (e) => {
      e.stopPropagation();
      if (productImageFile) productImageFile.click();
    });

    on(btnChangeImage, 'click', (e) => {
      e.stopPropagation();
      if (productImageFile) productImageFile.click();
    });

    on(btnRemoveImage, 'click', (e) => {
      e.stopPropagation();
      pendingImageFile = null;
      setImagePreview('');
    });

    on(productImageFile, 'change', () => {
      if (productImageFile.files && productImageFile.files[0]) {
        handleImageFile(productImageFile.files[0]);
      }
    });

    // Drag and drop support
    on(imageUploadZone, 'dragover', (e) => {
      e.preventDefault();
      imageUploadZone.classList.add('dragover');
    });

    on(imageUploadZone, 'dragleave', () => {
      imageUploadZone.classList.remove('dragover');
    });

    on(imageUploadZone, 'drop', (e) => {
      e.preventDefault();
      imageUploadZone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageFile(e.dataTransfer.files[0]);
      }
    });

    // Apply URL button (imagen por URL: no hay File nuevo que subir, va como string en el JSON)
    on(btnApplyImageUrl, 'click', () => {
      const url = productImageUrl ? productImageUrl.value.trim() : '';
      if (url) {
        pendingImageFile = null;
        setImagePreview(url);
        window.utils.showToast('Enlace aplicado', 'URL de imagen vinculada al producto.', 'info', 2000);
      }
    });
  }

  /* --- Add / Edit Product Modals --- */
  function openAddModal() {
    if (productForm) productForm.reset();
    setValue(productIdInput, '');
    if (productModalTitle) {
      productModalTitle.innerHTML = `
        <i class="fa-solid fa-circle-plus" style="color: var(--primary-color);"></i>
        <span>Agregar nuevo producto</span>
      `;
    }

    setValue(productAvailableInput, 'true');
    setValue(productUnitInput, 'kg');
    setValue(productBulkPriceInput, '');
    setValue(productBulkUnitInput, '');

    pendingImageFile = null;
    setImagePreview('');
    clearFormValidation();
    window.utils.openModal('productModal');
  }

  function openEditModal(id) {
    const product = findProduct(id);
    if (!product) return;

    if (productForm) productForm.reset();
    clearFormValidation();

    console.log(product)

    setValue(productIdInput, product.id);
    setValue(productNameInput, product.name);
    setValue(productBrandInput, product.brand);
    setValue(productCategoryInput, product.category);
    setValue(productPriceInput, product.unit_price);
    setValue(productUnitInput, product.unit_of_measure || 'kg');
    setValue(productBulkPriceInput, product.bulk_price ?? '');
    setValue(productBulkUnitInput, product.bulk_unit_of_measure ?? '');
    setValue(productAvailableInput, String(Boolean(product.product_of_stock)));

    // Editar no implica subir una imagen nueva hasta que el usuario elija una:
    // el preview muestra la imagen existente, pero pendingImageFile queda en null.
    pendingImageFile = null;
    setImagePreview(product.image || '');

    if (productModalTitle) {
      productModalTitle.innerHTML = `
        <i class="fa-solid fa-pen-to-square" style="color: var(--primary-color);"></i>
        <span>Editar producto: ${esc(product.name)}</span>
      `;
    }

    window.utils.openModal('productModal');
  }

  function clearFormValidation() {
    if (!productForm) return;
    productForm.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
    productForm.querySelectorAll('.form-control, .form-select').forEach(input => input.classList.remove('is-invalid'));
  }


  // Disables the submit button while the request is in flight (avoids duplicate products)
  function setSaving(saving) {
    isSaving = saving;
    const submitBtn = productForm ? productForm.querySelector('[type="submit"]') : null;
    if (!submitBtn) return;

    if (saving) {
      submitBtn.dataset.originalHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Guardando…</span>';
      submitBtn.disabled = true;
    } else {
      if (submitBtn.dataset.originalHtml) submitBtn.innerHTML = submitBtn.dataset.originalHtml;
      submitBtn.disabled = false;
    }
  }

  async function saveProductForm(e) {
    e.preventDefault();
    if (isSaving) return;

    const name = ((productNameInput && productNameInput.value) || '').trim();
    const brand = ((productBrandInput && productBrandInput.value) || '').trim();
    const category = (productCategoryInput && productCategoryInput.value) || '';
    const unit_price = parseFloat(productPriceInput ? productPriceInput.value : '');
    const unit_of_measure = (productUnitInput && productUnitInput.value) || '';
    const product_of_stock = productAvailableInput ? productAvailableInput.value === 'true' : true;
    const is_visible = productVisibleInput ? productVisibleInput.value === 'true' : true; // 👈 nuevo
    let isValid = true;

    const nameOk = name.length > 0 && name.length <= 55;
    toggleError('productNameError', !nameOk);
    if (!nameOk) isValid = false;

    toggleError('productBrandError', !brand);
    if (!brand) isValid = false;

    toggleError('productCategoryError', !category);
    if (!category) isValid = false;

    const priceOk = !isNaN(unit_price) && unit_price >= 0;
    toggleError('productPriceError', !priceOk);
    if (!priceOk) isValid = false;

    // Bulk (package) fields are optional, but price and unit go together
    const payloadBulk = {};
    if (productBulkPriceInput || productBulkUnitInput) {
      const bulkRaw = productBulkPriceInput ? productBulkPriceInput.value.trim() : '';
      const bulk_price = bulkRaw === '' ? null : parseFloat(bulkRaw);
      const bulk_unit_of_measure = productBulkUnitInput && productBulkUnitInput.value ? productBulkUnitInput.value : null;

      const invalidPrice = bulk_price !== null && (isNaN(bulk_price) || bulk_price < 0);
      const incomplete = (bulk_price === null) !== (bulk_unit_of_measure === null);

      if (invalidPrice || incomplete) {
        window.utils.showToast('Datos de paquete incompletos', 'Indica el precio y la unidad del paquete, o deja ambos vacíos.', 'warning');
        isValid = false;
      }
      payloadBulk.bulk_price = bulk_price;
      payloadBulk.bulk_unit_of_measure = bulk_unit_of_measure;
    }

    if (!isValid) return;

    // Image fallback by category
    const defaultCatImages = {
      'Café': 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80',
      'Cacao': 'https://images.unsplash.com/photo-1548848221-0c2e497ed557?w=600&auto=format&fit=crop&q=80',
      'Frutas': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
      'Apicultura': 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&auto=format&fit=crop&q=80',
      'Granos': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80',
      'Derivados': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80'
    };

    // 'image' solo se usa como string (URL) cuando NO hay un archivo nuevo pendiente
    // (pendingImageFile). Si hay archivo, se sube aparte como multipart y no se
    // manda 'image' en el JSON para no pisarlo con un string.
    const image = (productImageInput && productImageInput.value.trim())
      ? productImageInput.value.trim()
      : (defaultCatImages[category] || 'https://images.unsplash.com/photo-1495107334309-fcf20504a5ab?w=600&auto=format&fit=crop&q=80');

    const productPayload = {
      brand,
      category,
      name,
      unit_price,
      unit_of_measure,
      is_visible,
      ...payloadBulk,
      product_of_stock
    };

    if (!pendingImageFile) {
      productPayload.image = image;
    }

    const existing = productIdInput && productIdInput.value ? findProduct(productIdInput.value) : null;

    setSaving(true);
    try {
      if (existing) {
        // Edit (keep the original id type and creation date)
        productPayload.date_added = existing.date_added;
        await window.storage.updateProduct(existing.id, productPayload, pendingImageFile);
      } else {
        // Add
        productPayload.date_added = new Date().toISOString();
        await window.storage.addProduct(productPayload, pendingImageFile);
      }
    } catch (err) {
      // The server rejected it (or the network failed): keep the modal open so nothing is lost
      console.error('[dashboard] Error al guardar producto:', err);
      window.utils.showToast('No se pudo guardar el producto', errorMessage(err), 'danger');
      return;
    } finally {
      setSaving(false);
    }

    pendingImageFile = null;

    if (existing) {
      window.utils.showToast('Producto actualizado', `Se guardaron los cambios para "${name}".`, 'success');
    } else {
      window.utils.showToast('Producto creado', `"${name}" se agregó al catálogo exitosamente.`, 'success');
    }

    window.utils.closeModal('productModal');
    await loadProducts();
  }

  /* --- Delete Item with Confirmation --- */
  function deleteSingleProduct(id) {
    const product = findProduct(id);
    if (!product) return;
    const prodName = product.name;
    const productId = product.id;

    window.utils.confirmAction({
      title: 'Eliminar producto',
      message: `¿Estás seguro de que deseas eliminar "${prodName}" del catálogo de Ibafex? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.storage.deleteProduct(productId);
        } catch (err) {
          console.error('[dashboard] Error al eliminar producto:', err);
          window.utils.showToast('No se pudo eliminar el producto', errorMessage(err), 'danger');
          return;
        }

        selectedIds.delete(String(productId));

        // The return value of deleteProduct is unreliable (a 204 comes back as false),
        // so the fresh list from Django decides whether it was really deleted.
        const refreshed = await loadProducts();
        if (refreshed && findProduct(productId)) {
          window.utils.showToast('No se pudo eliminar', `"${prodName}" sigue en el catálogo. Inténtalo de nuevo.`, 'warning');
        } else {
          window.utils.showToast('Producto eliminado', `"${prodName}" ha sido removido del sistema.`, 'info');
        }
      }
    });
  }

  /* --- Bulk Delete with Confirmation --- */
  function deleteSelectedProducts() {
    const count = selectedIds.size;
    if (count === 0) return;

    window.utils.confirmAction({
      title: 'Eliminar productos seleccionados',
      message: `¿Estás seguro de eliminar los ${count} productos seleccionados? Esta operación es definitiva.`,
      confirmText: `Eliminar ${count} productos`,
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        // Use the original ids (number or string) as stored
        const idsToDelete = products.filter(p => selectedIds.has(String(p.id))).map(p => p.id);

        let deletedCount = null;
        try {
          deletedCount = await window.storage.deleteProducts(idsToDelete);
        } catch (err) {
          console.error('[dashboard] Error en eliminación por lotes:', err);
          window.utils.showToast('No se pudieron eliminar los productos', errorMessage(err), 'danger');
          return;
        }

        // Prefer the real result from the fresh list; fall back to what Django reported
        const refreshed = await loadProducts();
        if (refreshed) {
          const remaining = idsToDelete.filter(id => findProduct(id)).length;
          deletedCount = idsToDelete.length - remaining;
        }
        selectedIds.clear();

        if (deletedCount === null || deletedCount === idsToDelete.length) {
          window.utils.showToast('Eliminación por lotes', `Se eliminaron ${idsToDelete.length} productos exitosamente.`, 'success');
        } else if (deletedCount > 0) {
          window.utils.showToast('Eliminación parcial', `Se eliminaron ${deletedCount} de ${idsToDelete.length} productos.`, 'warning');
        } else {
          window.utils.showToast('No se eliminó ningún producto', 'Inténtalo de nuevo o revisa los permisos en el servidor.', 'danger');
        }
      }
    });
  }


 async function toggleProductVisibility(id, currentlyVisible, btnEl) {
  const newVisible = !currentlyVisible;

  // 👇 Cambio visual INMEDIATO (optimista), antes de esperar la respuesta del server
  if (btnEl) {
    const icon = btnEl.querySelector('i');
    btnEl.dataset.visible = String(newVisible);
    btnEl.title = newVisible ? 'Visible en catálogo' : 'Oculto del catálogo';
    btnEl.classList.toggle('btn-icon-success', newVisible);
    btnEl.classList.toggle('btn-icon-muted', !newVisible);
    if (icon) {
      icon.classList.toggle('fa-eye', newVisible);
      icon.classList.toggle('fa-eye-slash', !newVisible);
    }
    btnEl.disabled = true; // evitar doble click mientras se guarda
    console.log('clases del icon DESPUÉS:', btnEl?.querySelector('i')?.className);
  }

  try {
    await window.storage.updateProduct(id, { is_visible: newVisible }, null);
    window.utils.showToast(
      newVisible ? 'Producto visible' : 'Producto oculto',
      '',
      'success'
    );
    await loadProducts(); // re-renderiza para mantener todo sincronizado con el server
  } catch (err) {
    console.error('[dashboard] Error al cambiar visibilidad:', err);
    window.utils.showToast('No se pudo cambiar la visibilidad', errorMessage(err), 'danger');

    // 👇 Revertir el cambio visual si falló
    if (btnEl) {
      const icon = btnEl.querySelector('i');
      btnEl.dataset.visible = String(currentlyVisible);
      btnEl.title = currentlyVisible ? 'Visible en catálogo' : 'Oculto del catálogo';
      btnEl.classList.toggle('btn-icon-success', currentlyVisible);
      btnEl.classList.toggle('btn-icon-muted', !currentlyVisible);
      if (icon) {
        icon.classList.toggle('fa-eye', currentlyVisible);
        icon.classList.toggle('fa-eye-slash', !currentlyVisible);
      }
      btnEl.disabled = false;
    }
  }
}

  /* --- Export to PDF with jsPDF and AutoTable --- */
  // function exportProductsToPdf() {
  //   try {
  //     if (!window.jspdf || !window.jspdf.jsPDF) {
  //       window.utils.showToast('Error de exportación', 'Librería jsPDF no disponible.', 'danger');
  //       return;
  //     }

  //     const { jsPDF } = window.jspdf;
  //     const doc = new jsPDF({
  //       orientation: 'landscape',
  //       unit: 'pt',
  //       format: 'a4'
  //     });

  //     const settings = window.storage.getSettings() || {};
  //     const companyName = settings.companyName || 'Ibafex';
  //     const reportDate = window.utils.getCurrentFormattedDate();

  //     // Top Banner Background
  //     doc.setFillColor(6, 78, 59); // Primary deep green #064e3b
  //     doc.rect(0, 0, 842, 65, 'F');

  //     // Header Text
  //     doc.setTextColor(255, 255, 255);
  //     doc.setFontSize(20);
  //     doc.setFont('helvetica', 'bold');
  //     doc.text(companyName.toUpperCase() + ' - CATÁLOGO DE PRODUCTOS', 40, 38);

  //     doc.setFontSize(10);
  //     doc.setFont('helvetica', 'normal');
  //     // Export always includes the full filtered list (not just the current page)
  //     doc.text(`Fecha de emisión: ${reportDate} | Total ítems: ${filteredProducts.length}`, 40, 52);

  //     // Prepare Table Data (full filtered list, independent of pagination)
  //     const tableHeaders = [['Fecha', 'Producto', 'Marca', 'Categoría', 'Precio por unidad', 'Precio por paquete', 'Disponible']];
  //     const tableRows = filteredProducts.map(p => [
  //       formatDate(p.date_added),
  //       p.name,
  //       p.brand,
  //       p.category,
  //       `${window.utils.formatCurrency(p.unit_price)} / ${p.unit_of_measure}`,
  //       p.bulk_price != null ? `${window.utils.formatCurrency(p.bulk_price)} / ${p.bulk_unit_of_measure}` : '—',
  //       p.product_of_stock ? 'Sí' : 'No'
  //     ]);

  //     // Generate AutoTable
  //     doc.autoTable({
  //       head: tableHeaders,
  //       body: tableRows,
  //       startY: 85,
  //       theme: 'striped',
  //       headStyles: {
  //         fillColor: [5, 150, 105], // #059669
  //         textColor: [255, 255, 255],
  //         fontSize: 9,
  //         fontStyle: 'bold'
  //       },
  //       bodyStyles: {
  //         fontSize: 8.5,
  //         textColor: [30, 41, 59]
  //       },
  //       alternateRowStyles: {
  //         fillColor: [248, 250, 252]
  //       },
  //       margin: { left: 40, right: 40 },
  //       didDrawPage: (data) => {
  //         // Footer
  //         const pageCount = doc.internal.getNumberOfPages();
  //         doc.setFontSize(8);
  //         doc.setTextColor(148, 163, 184);
  //         doc.text(
  //           `Página ${data.pageNumber} de ${pageCount} - Documento oficial generado por ${companyName} Admin`,
  //           40,
  //           doc.internal.pageSize.height - 20
  //         );
  //       }
  //     });

  //     // Save PDF file
  //     const fileName = `Ibafex_Catalogo_Productos_${new Date().toISOString().split('T')[0]}.pdf`;
  //     doc.save(fileName);

  //     window.utils.showToast('Descarga iniciada', `El catálogo ha sido exportado como "${fileName}".`, 'success');

  //   } catch (err) {
  //     console.error('PDF export error:', err);
  //     window.utils.showToast('Error', 'No se pudo generar el documento PDF.', 'danger');
  //   }
  // }

  const pdfUrlsEl = "catalogos-pdf/generar/";
  const pdfGenerateUrl = window.PDF_GENERATE_URL || null;
  const pdfStatusUrlTemplate = window.PDF_STATUS_URL_TEMPLATE || null;

const getCsrfToken = () => {
  const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
  return input ? input.value : '';
};

async function exportProductsToPdf() {
  if (!pdfGenerateUrl) {
    console.error('[dashboard] Falta #pdfExportUrls con data-generate-url en el HTML.');
    window.utils.showToast('Error de exportación', 'No se encontró la URL para generar el catálogo.', 'danger');
    return;
  }

  const idsToExport = Array.from(selectedIds);
  if (idsToExport.length === 0) {
    window.utils.showToast('Selecciona productos', 'Marca al menos un producto para exportar a PDF.', 'warning');
    return;
  }

  setExportingUI(true);

  let jobId = null;

  console.log(pdfGenerateUrl)

  try {
    const res = await fetch(pdfGenerateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrfToken(),
        'Accept': 'application/json'
      },
      body: JSON.stringify({ product_ids: idsToExport })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));

      if (data.limit_reached) {
        setExportingUI(false);
        openLimitReachedModal(data);   // 👈 modal en vez de toast
        return;
      }

      throw new Error(data.error || `El servidor respondió ${res.status}.`);
    }

    const data = await res.json();
    jobId = data.job_id;
  } catch (err) {
    console.error('[dashboard] Error al iniciar la generación del PDF:', err);
    setExportingUI(false);
    window.utils.showToast('No se pudo generar el catálogo', errorMessage(err), 'danger');
    return;
  }

  pollPdfJobStatus(jobId, idsToExport.length);
}

function openLimitReachedModal(data) {
  const overlay = document.getElementById('limitReachedModalOverlay');
  if (!overlay) {
    // fallback por si todavía no agregaste el modal al HTML
    window.utils.showToast('Límite alcanzado', data.error, 'danger');
    return;
  }
  const msgEl = overlay.querySelector('#limitReachedModalMessage');
  if (msgEl) msgEl.textContent = data.error;
  overlay.style.display = 'flex';
  overlay.classList.add('active');
}


function setExportingUI(isExporting) {
  if (!btnExportPdf) return;
  btnExportPdf.disabled = isExporting;
  if (isExporting) {
    btnExportPdf.dataset.originalHtml = btnExportPdf.innerHTML;
    btnExportPdf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Generando PDF…</span>';
  } else if (btnExportPdf.dataset.originalHtml) {
    btnExportPdf.innerHTML = btnExportPdf.dataset.originalHtml;
  }
}

function pollPdfJobStatus(jobId, totalSelected) {
  if (!pdfStatusUrlTemplate) { setExportingUI(false); return; }
  const url = pdfStatusUrlTemplate.replace('0', jobId);

  const timer = setInterval(async () => {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);
      const job = await res.json();

      if (job.status === 'completed') {
        clearInterval(timer);
        setExportingUI(false);
        if (job.file_url) {
          const a = document.createElement('a');
          a.href = job.file_url;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        window.utils.showToast(
          'Catálogo generado',
          `PDF listo con ${totalSelected} producto${totalSelected > 1 ? 's' : ''}.`,
          'success'
        );
      } else if (job.status === 'failed') {
        clearInterval(timer);
        setExportingUI(false);
        window.utils.showToast('No se pudo generar el catálogo', job.error_message || 'Error desconocido.', 'danger');
      }
      // si sigue 'pending'/'processing', el intervalo sigue esperando
    } catch (err) {
      clearInterval(timer);
      setExportingUI(false);
      console.error('[dashboard] Error consultando el estado del PDF:', err);
      window.utils.showToast('Error de exportación', errorMessage(err), 'danger');
    }
  }, 1500);
}



  /* --- Event Listeners Setup --- */
  function setupEventListeners() {
    // Open add modal (header and toolbar buttons; first, so they register even if anything below is missing)
    on(btnOpenAddModal, 'click', () => safe('abrir modal de agregar', openAddModal));
    on(btnAddProductToolbar, 'click', () => safe('abrir modal de agregar', openAddModal));

    // Search input
    on(searchInput, 'input', () => applyFilters());
    on(searchClearBtn, 'click', () => {
      setValue(searchInput, '');
      applyFilters();
      if (searchInput) searchInput.focus();
    });

    // Filters
    on(filterCategory, 'change', () => applyFilters());
    on(filterAvailability, 'change', () => applyFilters());
    on(filterPriceRange, 'change', () => applyFilters());

    // Alphabet (A-Z) filter: select, button bar (delegated) and "clear letter" button
    on(filterLetter, 'change', (e) => setLetterFilter(e.target.value));
    on(alphabetNav, 'click', (e) => {
      const btn = e.target.closest('.alphabet-btn');
      if (btn) setLetterFilter(btn.dataset.letter || '');
    });
    on(btnClearLetterFilter, 'click', () => setLetterFilter(''));

    // Reset filters
    const resetFn = () => {
      setValue(searchInput, '');
      setValue(filterCategory, '');
      setValue(filterAvailability, '');
      setValue(filterPriceRange, '');
      selectedLetter = '';
      setValue(filterLetter, '');
      applyFilters();
    };

    on(btnResetFilters, 'click', resetFn);
    on(btnEmptyReset, 'click', resetFn);
    on(btnSelectAllFiltered, 'click', toggleSelectAllFiltered);
    // View toggles
    on(btnCardView, 'click', () => applyViewMode('card'));
    on(btnTableView, 'click', () => applyViewMode('table'));

    // Export PDF
    on(btnExportPdf, 'click', exportProductsToPdf);

    // Product form save
    on(productForm, 'submit', saveProductForm);

    // Select All (applies only to the current page)
    on(selectAllCheckbox, 'change', (e) => handleSelectAll(e.target.checked));

    // Bulk delete
    on(btnBulkDelete, 'click', deleteSelectedProducts);

    // Retry button shown when the first load fails
    on(ensureStatusEl(), 'click', (e) => {
      if (e.target.closest('#btnRetryLoad')) loadProducts();
    });

    // Pagination controls (created dynamically; delegated so it always works)
    on(ensurePaginationEl(), 'click', (e) => {
      const prevBtn = e.target.closest('#btnPagePrev');
      if (prevBtn) { goToPage(currentPage - 1); return; }

      const nextBtn = e.target.closest('#btnPageNext');
      if (nextBtn) { goToPage(currentPage + 1); return; }

      const pageBtn = e.target.closest('.page-number-btn');
      if (pageBtn) { goToPage(Number(pageBtn.dataset.page)); return; }

      // 👇 nuevo: toggle de visibilidad
    });
    
    // Delegation for Cards & Table actions (Edit, Delete, Checkbox)
    const handleActionClick = (e) => {
      const selectBox = e.target.closest('.product-select-box');
      if (selectBox) {
        handleSelectToggle(selectBox.dataset.id, selectBox.checked);
        return;
      }
      
      const editBtn = e.target.closest('.btn-edit-product');
      if (editBtn) {
        openEditModal(editBtn.dataset.id);
        return;
      }
      
      const deleteBtn = e.target.closest('.btn-delete-product');
      if (deleteBtn) {
        deleteSingleProduct(deleteBtn.dataset.id);
        return;
      }
      const visibleBtn = e.target.closest('.btn-toggle-visible');
      if (visibleBtn) {
        toggleProductVisibility(visibleBtn.dataset.id, visibleBtn.dataset.visible === 'true');
        return;
      }
    };

    on(cardViewContainer, 'click', handleActionClick);
    on(productTableBody, 'click', handleActionClick);

    // Image upload handling
    setupImageUpload();
  }
}

// Run whether the DOM is still loading or already parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDashboard);
} else {
  startDashboard();
}