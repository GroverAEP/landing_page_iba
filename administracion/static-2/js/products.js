/**
 * products.js
 * Módulo de productos. List View y Card View comparten el mismo estado
 * y la misma lógica de datos (state.items) — solo cambia el render.
 */

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-products-page]");
  if (!root) return;

  const state = {
    items: [],
    count: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
    search: "",
    filters: { category: "", availability: "", visibility: "" },
    ordering: "",
    view: localStorage.getItem("ibafex.productsView") || "list",
    selected: new Set(),
    loading: false,
    error: false,
  };

  const els = {
    tableBody: root.querySelector("[data-products-tbody]"),
    cardGrid: root.querySelector("[data-products-cardgrid]"),
    listWrap: root.querySelector("[data-view-list]"),
    cardWrap: root.querySelector("[data-view-card]"),
    viewListBtn: root.querySelector("[data-view-btn='list']"),
    viewCardBtn: root.querySelector("[data-view-btn='card']"),
    searchInput: root.querySelector("[data-search-input]"),
    clearSearchBtn: root.querySelector("[data-clear-search]"),
    categoryFilter: root.querySelector("[data-filter='category']"),
    availabilityFilter: root.querySelector("[data-filter='availability']"),
    visibilityFilter: root.querySelector("[data-filter='visibility']"),
    clearFiltersBtn: root.querySelector("[data-clear-filters]"),
    activeFiltersBar: root.querySelector("[data-active-filters]"),
    pagination: root.querySelector("[data-pagination]"),
    resultsCount: root.querySelector("[data-results-count]"),
    bulkBar: root.querySelector("[data-bulk-bar]"),
    selectAllCheckbox: root.querySelector("[data-select-all]"),
    addBtn: root.querySelector("[data-add-product]"),
    downloadBtn: root.querySelector("[data-download-catalog]"),
    pageSizeSelect: root.querySelector("[data-page-size]"),
    filtersPanel: root.querySelector("[data-filters-panel]"),
    filtersToggleBtn: root.querySelector("[data-filters-toggle]"),
  };

  let searchDebounce;

  function money(n) {
    return `S/ ${Number(n).toFixed(2)}`;
  }

  function availabilityBadge(available) {
    return available
      ? `<span class="badge badge-success"><span class="badge-dot"></span>Available</span>`
      : `<span class="badge badge-danger"><span class="badge-dot"></span>Out of stock</span>`;
  }
  function visibilityBadge(visible) {
    return visible
      ? `<span class="badge badge-info"><span class="badge-dot"></span>Visible</span>`
      : `<span class="badge badge-neutral"><span class="badge-dot"></span>Hidden</span>`;
  }

  // ------------------------------------------------------------ Fetching
  async function fetchProducts() {
    state.loading = true;
    state.error = false;
    renderList();

    try {
      const res = await Api.products.list({
        search: state.search,
        category: state.filters.category,
        availability: state.filters.availability,
        visibility: state.filters.visibility,
        ordering: state.ordering,
        page: state.page,
        pageSize: state.pageSize,
      });
      state.items = res.results;
      state.count = res.count;
      state.totalPages = res.totalPages;
    } catch (err) {
      state.error = true;
    } finally {
      state.loading = false;
      renderList();
    }
  }

  // -------------------------------------------------------------- Render
  function renderList() {
    renderToolbarState();

    if (state.loading) {
      renderSkeleton();
      return;
    }
    if (state.error) {
      renderErrorState();
      return;
    }
    if (state.items.length === 0) {
      renderEmptyState();
      renderPagination();
      renderBulkBar();
      return;
    }

    renderTable();
    renderCards();
    renderPagination();
    renderBulkBar();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderSkeleton() {
    const rows = Array.from({ length: 6 }).map(() => `
      <tr><td colspan="10"><div class="skeleton" style="height:36px;"></div></td></tr>
    `).join("");
    els.tableBody.innerHTML = rows;
    els.cardGrid.innerHTML = Array.from({ length: 6 }).map(() => `
      <div class="card" style="height:220px;"><div class="skeleton" style="height:100%;"></div></div>
    `).join("");
  }

  function renderErrorState() {
    const html = `
      <div class="state-block" style="padding:2.5rem 1.5rem;">
        <div class="state-icon"><i data-lucide="wifi-off"></i></div>
        <p class="state-title">No se pudo cargar la información</p>
        <p class="state-desc">Inténtalo nuevamente.</p>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:.75rem;" data-retry>Reintentar</button>
      </div>`;
    els.tableBody.innerHTML = `<tr><td colspan="10">${html}</td></tr>`;
    els.cardGrid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    root.querySelectorAll("[data-retry]").forEach((b) => b.addEventListener("click", fetchProducts));
  }

  function renderEmptyState() {
    const hasFilters = state.search || state.filters.category || state.filters.availability || state.filters.visibility;
    const html = `
      <div class="state-block" style="padding:2.5rem 1.5rem;">
        <div class="state-icon"><i data-lucide="package-search"></i></div>
        <p class="state-title">No products found</p>
        <p class="state-desc">${hasFilters ? "No hay productos que coincidan con los filtros seleccionados." : "Todavía no se registraron productos."}</p>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:.75rem;" data-empty-action>
          ${hasFilters ? "Clear filters" : "Add Product"}
        </button>
      </div>`;
    els.tableBody.innerHTML = `<tr><td colspan="10">${html}</td></tr>`;
    els.cardGrid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    root.querySelectorAll("[data-empty-action]").forEach((b) => b.addEventListener("click", () => {
      if (hasFilters) clearFilters(); else openProductModal();
    }));
  }

  function renderToolbarState() {
    els.listWrap.style.display = state.view === "list" ? "" : "none";
    els.cardWrap.style.display = state.view === "card" ? "" : "none";
    els.viewListBtn.classList.toggle("btn-primary", state.view === "list");
    els.viewListBtn.classList.toggle("btn-secondary", state.view !== "list");
    els.viewCardBtn.classList.toggle("btn-primary", state.view === "card");
    els.viewCardBtn.classList.toggle("btn-secondary", state.view !== "card");
    els.clearSearchBtn.style.display = state.search ? "" : "none";

    const chips = [];
    if (state.filters.category) chips.push({ key: "category", label: `Category: ${state.filters.category}` });
    if (state.filters.availability) chips.push({ key: "availability", label: `Availability: ${state.filters.availability === "available" ? "Available" : "Out of stock"}` });
    if (state.filters.visibility) chips.push({ key: "visibility", label: `Visibility: ${state.filters.visibility === "visible" ? "Visible" : "Hidden"}` });

    els.activeFiltersBar.innerHTML = chips.map((c) => `
      <span class="badge badge-neutral" style="gap:.4rem;">
        ${c.label}
        <button type="button" data-remove-filter="${c.key}" aria-label="Quitar filtro" style="background:none;border:none;cursor:pointer;display:flex;color:var(--ink-500);">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>
    `).join("");
    els.activeFiltersBar.style.display = chips.length ? "flex" : "none";
    els.activeFiltersBar.querySelectorAll("[data-remove-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters[btn.dataset.removeFilter] = "";
        syncFilterInputs();
        state.page = 1;
        fetchProducts();
      });
    });

    if (els.resultsCount) {
      els.resultsCount.textContent = state.loading ? "Cargando..." : `${state.count} resultado${state.count === 1 ? "" : "s"}`;
    }
  }

  function renderTable() {
    els.tableBody.innerHTML = state.items.map((p) => `
      <tr data-row="${p.id}" class="${state.selected.has(p.id) ? "is-selected" : ""}">
        <td>
          <input type="checkbox" data-row-checkbox="${p.id}" ${state.selected.has(p.id) ? "checked" : ""} aria-label="Seleccionar ${p.name}">
        </td>
        <td>
          <div style="width:38px;height:38px;border-radius:6px;background:var(--ink-100);display:flex;align-items:center;justify-content:center;color:var(--ink-400);">
            <i data-lucide="image" width="16" height="16"></i>
          </div>
        </td>
        <td>#${p.id}</td>
        <td style="max-width:220px;">
          <p style="margin:0;font-weight:600;color:var(--ink-950);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</p>
          <p style="margin:0;font-size:.75rem;color:var(--ink-500);">${p.unitOfMeasure}</p>
        </td>
        <td>${p.brand}</td>
        <td>${p.category}</td>
        <td style="font-weight:600;color:var(--ink-950);">${money(p.unitPrice)}</td>
        <td>${availabilityBadge(p.available)}</td>
        <td>${visibilityBadge(p.visible)}</td>
        <td>
          <div style="display:flex;gap:.25rem;">
            <button type="button" class="btn btn-ghost btn-icon" style="color:var(--brand-600);" data-edit="${p.id}" title="Edit" aria-label="Editar ${p.name}">
              <i data-lucide="pencil" width="16" height="16"></i>
            </button>
            <button type="button" class="btn btn-ghost btn-icon" style="color:var(--danger-600);" data-delete="${p.id}" title="Delete" aria-label="Eliminar ${p.name}">
              <i data-lucide="trash-2" width="16" height="16"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    els.tableBody.querySelectorAll("[data-row-checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => toggleSelect(Number(cb.dataset.rowCheckbox), cb.checked));
    });
    els.tableBody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openProductModal(Number(b.dataset.edit))));
    els.tableBody.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteProduct(Number(b.dataset.delete))));
  }

  function renderCards() {
    els.cardGrid.innerHTML = state.items.map((p) => `
      <div class="card" data-card="${p.id}" style="display:flex;flex-direction:column;gap:.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="width:44px;height:44px;border-radius:8px;background:var(--ink-100);display:flex;align-items:center;justify-content:center;color:var(--ink-400);flex-shrink:0;">
            <i data-lucide="image" width="18" height="18"></i>
          </div>
          <input type="checkbox" data-row-checkbox="${p.id}" ${state.selected.has(p.id) ? "checked" : ""} aria-label="Seleccionar ${p.name}">
        </div>
        <div>
          <p style="margin:0;font-weight:600;color:var(--ink-950);font-size:.9375rem;">${p.name}</p>
          <p style="margin:.125rem 0 0;font-size:.8125rem;color:var(--ink-500);">${p.brand} · ${p.category}</p>
        </div>
        <p style="margin:0;font-weight:700;color:var(--ink-950);font-size:1.05rem;">${money(p.unitPrice)}</p>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;">${availabilityBadge(p.available)}${visibilityBadge(p.visible)}</div>
        <div style="display:flex;gap:.5rem;margin-top:auto;padding-top:.5rem;border-top:1px solid var(--ink-100);">
          <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" data-edit="${p.id}"><i data-lucide="pencil" width="14" height="14"></i>Edit</button>
          <button type="button" class="btn btn-secondary btn-sm" style="flex:1;color:var(--danger-600);" data-delete="${p.id}"><i data-lucide="trash-2" width="14" height="14"></i>Delete</button>
        </div>
      </div>
    `).join("");

    els.cardGrid.querySelectorAll("[data-row-checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => toggleSelect(Number(cb.dataset.rowCheckbox), cb.checked));
    });
    els.cardGrid.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openProductModal(Number(b.dataset.edit))));
    els.cardGrid.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteProduct(Number(b.dataset.delete))));
  }

  function renderPagination() {
    if (!els.pagination) return;
    if (state.items.length === 0) { els.pagination.innerHTML = ""; return; }

    const pages = [];
    const total = state.totalPages;
    const cur = state.page;
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - cur) <= 1) pages.push(i);
      else if (pages[pages.length - 1] !== "…") pages.push("…");
    }

    els.pagination.innerHTML = `
      <p style="font-size:.8125rem;color:var(--ink-600);margin:0;">
        Mostrando ${(state.page - 1) * state.pageSize + 1}–${Math.min(state.page * state.pageSize, state.count)} de ${state.count}
      </p>
      <div class="pagination-pages">
        <button type="button" class="page-btn" data-page="prev" ${cur === 1 ? "disabled" : ""} aria-label="Previous"><i data-lucide="chevron-left" width="15" height="15"></i></button>
        ${pages.map((p) => p === "…"
          ? `<span class="page-btn" style="cursor:default;">…</span>`
          : `<button type="button" class="page-btn ${p === cur ? "is-active" : ""}" data-page="${p}">${p}</button>`
        ).join("")}
        <button type="button" class="page-btn" data-page="next" ${cur === total ? "disabled" : ""} aria-label="Next"><i data-lucide="chevron-right" width="15" height="15"></i></button>
      </div>
    `;
    els.pagination.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        if (val === "prev") state.page = Math.max(1, state.page - 1);
        else if (val === "next") state.page = Math.min(state.totalPages, state.page + 1);
        else state.page = Number(val);
        fetchProducts();
      });
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function renderBulkBar() {
    const n = state.selected.size;
    els.bulkBar.style.display = n > 0 ? "flex" : "none";
    if (n === 0) return;
    els.bulkBar.innerHTML = `
      <span style="font-size:.875rem;font-weight:600;">${n} product${n === 1 ? "" : "s"} selected</span>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-sm" data-bulk="mark-available">Mark as available</button>
        <button type="button" class="btn btn-secondary btn-sm" data-bulk="mark-unavailable">Mark as unavailable</button>
        <button type="button" class="btn btn-secondary btn-sm" data-bulk="make-hidden">Change visibility</button>
        <button type="button" class="btn btn-danger btn-sm" data-bulk="delete">Delete selected</button>
        <button type="button" class="btn btn-ghost btn-sm" style="color:#fff;" data-bulk="clear">Clear selection</button>
      </div>
    `;
    els.bulkBar.querySelectorAll("[data-bulk]").forEach((btn) => btn.addEventListener("click", () => handleBulkAction(btn.dataset.bulk)));
  }

  // ------------------------------------------------------------ Actions
  function toggleSelect(id, checked) {
    if (checked) state.selected.add(id); else state.selected.delete(id);
    renderBulkBar();
    const row = root.querySelector(`[data-row="${id}"]`);
    row?.classList.toggle("is-selected", checked);
  }

  els.selectAllCheckbox?.addEventListener("change", (e) => {
    if (e.target.checked) state.items.forEach((p) => state.selected.add(p.id));
    else state.items.forEach((p) => state.selected.delete(p.id));
    renderList();
  });

  async function handleBulkAction(action) {
    if (action === "clear") { state.selected.clear(); renderList(); return; }
    const ids = Array.from(state.selected);

    if (action === "delete") {
      const ok = await ModalManager.confirmAction({
        title: "Eliminar productos seleccionados",
        description: `¿Está seguro de que desea eliminar ${ids.length} producto(s)? Esta acción no se puede deshacer.`,
        confirmLabel: "Delete",
      });
      if (!ok) return;
    }

    try {
      await Api.products.bulkAction(ids, action);
      state.selected.clear();
      Notify.success(action === "delete" ? "Se eliminaron los productos seleccionados." : "Se actualizaron los productos seleccionados.");
      fetchProducts();
    } catch (err) {
      Notify.error("No se pudo completar la operación.");
    }
  }

  async function deleteProduct(id) {
    const product = state.items.find((p) => p.id === id);
    const ok = await ModalManager.confirmAction({
      title: "Eliminar producto",
      description: `¿Está seguro de que desea eliminar "${product?.name ?? "este producto"}"? Esta acción no se puede deshacer.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await Api.products.remove(id);
      state.selected.delete(id);
      Notify.success("El producto fue eliminado correctamente.");
      fetchProducts();
    } catch (err) {
      Notify.error("No se pudo completar la operación.");
    }
  }

  // -------------------------------------------------------- Filters/search
  function syncFilterInputs() {
    els.categoryFilter.value = state.filters.category;
    els.availabilityFilter.value = state.filters.availability;
    els.visibilityFilter.value = state.filters.visibility;
  }
  function clearFilters() {
    state.filters = { category: "", availability: "", visibility: "" };
    state.search = "";
    els.searchInput.value = "";
    syncFilterInputs();
    state.page = 1;
    fetchProducts();
  }

  els.searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = els.searchInput.value.trim();
      state.page = 1;
      fetchProducts();
    }, 350);
  });
  els.clearSearchBtn?.addEventListener("click", () => {
    els.searchInput.value = "";
    state.search = "";
    state.page = 1;
    fetchProducts();
  });

  [["category", els.categoryFilter], ["availability", els.availabilityFilter], ["visibility", els.visibilityFilter]].forEach(([key, el]) => {
    el?.addEventListener("change", () => {
      state.filters[key] = el.value;
      state.page = 1;
      fetchProducts();
    });
  });
  els.clearFiltersBtn?.addEventListener("click", clearFilters);
  els.filtersToggleBtn?.addEventListener("click", () => els.filtersPanel.classList.toggle("is-open-mobile"));

  els.pageSizeSelect?.addEventListener("change", () => {
    state.pageSize = Number(els.pageSizeSelect.value);
    state.page = 1;
    fetchProducts();
  });

  root.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      state.ordering = state.ordering === field ? `-${field}` : field;
      root.querySelectorAll("th.sortable [data-sort-icon]").forEach((i) => (i.textContent = ""));
      const icon = th.querySelector("[data-sort-icon]");
      if (icon) icon.textContent = state.ordering.startsWith("-") ? "↓" : "↑";
      fetchProducts();
    });
  });

  els.viewListBtn?.addEventListener("click", () => { state.view = "list"; localStorage.setItem("ibafex.productsView", "list"); renderList(); });
  els.viewCardBtn?.addEventListener("click", () => { state.view = "card"; localStorage.setItem("ibafex.productsView", "card"); renderList(); });

  // ---------------------------------------------------------- Create/Edit
  function openProductModal(id) {
    const isEdit = Boolean(id);
    const product = isEdit ? state.items.find((p) => p.id === id) : null;
    const categoryOptions = MockDB.categories.map((c) => `<option ${product?.category === c ? "selected" : ""}>${c}</option>`).join("");
    const unitOptions = MockDB.units.map((u) => `<option ${product?.unitOfMeasure === u ? "selected" : ""}>${u}</option>`).join("");

    const overlay = ModalManager.openModal(`
      <div class="modal-header">
        <h3>${isEdit ? "Edit Product" : "Add Product"}</h3>
        <button type="button" class="modal-close" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <form id="product-form">
        <div class="modal-body" style="display:flex; flex-direction:column; gap:1rem;">
          <div class="field" data-field="image">
            <label class="field-label">Product image</label>
            <div style="display:flex;align-items:center;gap:.875rem;">
              <div data-image-preview style="width:64px;height:64px;border-radius:8px;background:var(--ink-100);display:flex;align-items:center;justify-content:center;color:var(--ink-400);overflow:hidden;flex-shrink:0;">
                <i data-lucide="image" width="22" height="22"></i>
              </div>
              <div style="display:flex; gap:.5rem;">
                <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
                  Seleccionar archivo
                  <input type="file" data-image-input accept="image/jpeg,image/png,image/webp" class="visually-hidden">
                </label>
                <button type="button" class="btn btn-ghost btn-sm" data-image-remove>Eliminar imagen</button>
              </div>
            </div>
            <p class="field-error"></p>
            <p class="field-hint">JPG, PNG o WebP. Máximo 5 MB.</p>
          </div>

          <div class="field" data-field="name">
            <label class="field-label field-required">Name</label>
            <input class="field-input" value="${product?.name ?? ""}" placeholder="Ej. Arroz extra 5kg">
            <p class="field-error"></p>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;" data-form-row>
            <div class="field" data-field="brand">
              <label class="field-label field-required">Brand</label>
              <input class="field-input" list="brand-options" value="${product?.brand ?? ""}" placeholder="Ej. Andina">
              <datalist id="brand-options">${MockDB.brands.map((b) => `<option value="${b}">`).join("")}</datalist>
              <p class="field-error"></p>
            </div>
            <div class="field" data-field="category">
              <label class="field-label field-required">Category</label>
              <select class="field-select"><option value="">Selecciona...</option>${categoryOptions}</select>
              <p class="field-error"></p>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;" data-form-row>
            <div class="field" data-field="unitPrice">
              <label class="field-label field-required">Unit price (S/)</label>
              <input class="field-input" type="number" min="0" step="0.01" value="${product?.unitPrice ?? ""}" placeholder="0.00">
              <p class="field-error"></p>
            </div>
            <div class="field" data-field="unitOfMeasure">
              <label class="field-label field-required">Unit of measure</label>
              <select class="field-select">${unitOptions}</select>
              <p class="field-error"></p>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;" data-form-row>
            <div class="field" data-field="packagePrice">
              <label class="field-label">Package price (S/)</label>
              <input class="field-input" type="number" min="0" step="0.01" value="${product?.packagePrice ?? ""}" placeholder="0.00">
              <p class="field-error"></p>
            </div>
            <div class="field" data-field="unitsPerPackage">
              <label class="field-label">Package unit</label>
              <input class="field-input" type="number" min="1" step="1" value="${product?.unitsPerPackage ?? ""}" placeholder="Ej. 12">
              <p class="field-error"></p>
            </div>
          </div>

          <div class="toggle-row">
            <span class="toggle">
              <input type="checkbox" data-field-raw="available" ${product?.available ?? true ? "checked" : ""}>
              <span class="toggle-track"></span>
              <span class="toggle-thumb"></span>
            </span>
            Product available
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-autofocus>${isEdit ? "Save Changes" : "Create Product"}</button>
        </div>
      </form>
    `, { size: "md" });

    if (window.lucide) window.lucide.createIcons();

    const form = overlay.querySelector("#product-form");
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", ModalManager.close);

    // Responsive: una columna en móvil.
    function applyFormLayout() {
      overlay.querySelectorAll("[data-form-row]").forEach((row) => {
        row.style.gridTemplateColumns = window.innerWidth < 480 ? "1fr" : "1fr 1fr";
      });
    }
    applyFormLayout();
    window.addEventListener("resize", applyFormLayout);

    // Manejo de imagen.
    const imageInput = overlay.querySelector("[data-image-input]");
    const imagePreview = overlay.querySelector("[data-image-preview]");
    const imageField = overlay.querySelector("[data-field='image']");
    let imageDataUrl = product?.image || null;
    if (imageDataUrl) imagePreview.innerHTML = `<img src="${imageDataUrl}" style="width:100%;height:100%;object-fit:cover;">`;

    imageInput.addEventListener("change", () => {
      const file = imageInput.files[0];
      const error = Validators.imageFile(file);
      setFieldError(imageField, error);
      if (error || !file) return;
      const reader = new FileReader();
      reader.onload = () => {
        imageDataUrl = reader.result;
        imagePreview.innerHTML = `<img src="${imageDataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
      };
      reader.readAsDataURL(file);
    });
    overlay.querySelector("[data-image-remove]").addEventListener("click", () => {
      imageDataUrl = null;
      imageInput.value = "";
      imagePreview.innerHTML = `<i data-lucide="image" width="22" height="22"></i>`;
      if (window.lucide) window.lucide.createIcons();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fields = {
        name: { el: form.querySelector("[data-field='name']"), rules: [Validators.required] },
        brand: { el: form.querySelector("[data-field='brand']"), rules: [Validators.required] },
        category: { el: form.querySelector("[data-field='category']"), rules: [Validators.required] },
        unitPrice: { el: form.querySelector("[data-field='unitPrice']"), rules: [Validators.required, Validators.nonNegativeNumber] },
        packagePrice: { el: form.querySelector("[data-field='packagePrice']"), rules: [Validators.nonNegativeNumber] },
        unitsPerPackage: { el: form.querySelector("[data-field='unitsPerPackage']"), rules: [Validators.positiveInteger] },
      };
      const isValid = validateForm(fields);
      if (!isValid) return;

      const payload = {
        name: fields.name.el.querySelector(".field-input").value.trim(),
        brand: fields.brand.el.querySelector(".field-input").value.trim(),
        category: fields.category.el.querySelector(".field-select").value,
        unitPrice: Number(fields.unitPrice.el.querySelector(".field-input").value),
        unitOfMeasure: form.querySelector("[data-field='unitOfMeasure'] .field-select").value,
        packagePrice: Number(fields.packagePrice.el.querySelector(".field-input").value || 0),
        unitsPerPackage: Number(fields.unitsPerPackage.el.querySelector(".field-input").value || 1),
        available: form.querySelector("[data-field-raw='available']").checked,
        visible: product?.visible ?? true,
        image: imageDataUrl,
      };

      const submitBtn = form.querySelector('[type="submit"]');
      submitBtn.classList.add("btn-loading");
      submitBtn.disabled = true;

      try {
        if (isEdit) {
          await Api.products.update(id, payload);
          Notify.success("Producto actualizado correctamente.");
        } else {
          await Api.products.create(payload);
          Notify.success("Producto creado correctamente.");
        }
        ModalManager.close();
        fetchProducts();
      } catch (err) {
        Notify.error("No se pudo completar la operación.");
      } finally {
        submitBtn.classList.remove("btn-loading");
        submitBtn.disabled = false;
      }
    });
  }

  els.addBtn?.addEventListener("click", () => openProductModal());

  // ----------------------------------------------------------- Catalog PDF
  els.downloadBtn?.addEventListener("click", async () => {
    if (els.downloadBtn.classList.contains("btn-loading")) return;
    els.downloadBtn.classList.add("btn-loading");
    els.downloadBtn.disabled = true;
    try {
      await Api.products.downloadCatalogPdf();
      Notify.success("El catálogo se descargó correctamente.");
    } catch (err) {
      Notify.error("No se pudo descargar el catálogo. Inténtalo nuevamente.");
    } finally {
      els.downloadBtn.classList.remove("btn-loading");
      els.downloadBtn.disabled = false;
    }
  });

  fetchProducts();
});
