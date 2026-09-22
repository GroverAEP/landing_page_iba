/**
 * users.js
 * Módulo de usuarios administrativos: listado, búsqueda, filtros y
 * formulario reutilizable de creación/edición.
 */

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-users-page]");
  if (!root) return;

  const state = {
    items: [], count: 0, page: 1, pageSize: 10, totalPages: 1,
    search: "", filters: { role: "", status: "" }, ordering: "", loading: false, error: false,
  };

  const els = {
    tbody: root.querySelector("[data-users-tbody]"),
    searchInput: root.querySelector("[data-search-input]"),
    clearSearchBtn: root.querySelector("[data-clear-search]"),
    roleFilter: root.querySelector("[data-filter='role']"),
    statusFilter: root.querySelector("[data-filter='status']"),
    clearFiltersBtn: root.querySelector("[data-clear-filters]"),
    pagination: root.querySelector("[data-pagination]"),
    resultsCount: root.querySelector("[data-results-count]"),
    addBtn: root.querySelector("[data-add-user]"),
  };
  let searchDebounce;

  function initials(username) { return username.slice(0, 2).toUpperCase(); }
  function statusBadge(status) {
    return status === "Active"
      ? `<span class="badge badge-success"><span class="badge-dot"></span>Active</span>`
      : `<span class="badge badge-neutral"><span class="badge-dot"></span>Disabled</span>`;
  }
  function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  }

  async function fetchUsers() {
    state.loading = true; state.error = false; render();
    try {
      const res = await Api.users.list({ search: state.search, role: state.filters.role, status: state.filters.status, page: state.page, pageSize: state.pageSize, ordering: state.ordering });
      state.items = res.results; state.count = res.count; state.totalPages = res.totalPages;
    } catch (err) { state.error = true; }
    finally { state.loading = false; render(); }
  }

  function render() {
    if (els.resultsCount) els.resultsCount.textContent = state.loading ? "Cargando..." : `${state.count} resultado${state.count === 1 ? "" : "s"}`;
    els.clearSearchBtn.style.display = state.search ? "" : "none";

    if (state.loading) {
      els.tbody.innerHTML = Array.from({ length: 5 }).map(() => `<tr><td colspan="8"><div class="skeleton" style="height:34px;"></div></td></tr>`).join("");
      return;
    }
    if (state.error) {
      els.tbody.innerHTML = `<tr><td colspan="8">
        <div class="state-block"><div class="state-icon"><i data-lucide="wifi-off"></i></div>
        <p class="state-title">No se pudo cargar la información</p>
        <p class="state-desc">Inténtalo nuevamente.</p>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:.75rem;" data-retry>Reintentar</button></div>
      </td></tr>`;
      if (window.lucide) window.lucide.createIcons();
      root.querySelector("[data-retry]")?.addEventListener("click", fetchUsers);
      return;
    }
    if (state.items.length === 0) {
      const hasFilters = state.search || state.filters.role || state.filters.status;
      els.tbody.innerHTML = `<tr><td colspan="8">
        <div class="state-block"><div class="state-icon"><i data-lucide="users"></i></div>
        <p class="state-title">No users found</p>
        <p class="state-desc">${hasFilters ? "No hay usuarios que coincidan con los filtros seleccionados." : "Todavía no se registraron usuarios."}</p>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:.75rem;" data-empty-action>${hasFilters ? "Clear filters" : "Add User"}</button></div>
      </td></tr>`;
      if (window.lucide) window.lucide.createIcons();
      root.querySelector("[data-empty-action]")?.addEventListener("click", () => hasFilters ? clearFilters() : openUserModal());
      renderPagination();
      return;
    }

    els.tbody.innerHTML = state.items.map((u) => `
      <tr>
        <td>#${u.id}</td>
        <td>
          <div style="display:flex; align-items:center; gap:.625rem;">
            <span class="avatar">${initials(u.username)}</span>
            <span style="font-weight:600; color:var(--ink-950);">${u.username}</span>
          </div>
        </td>
        <td>${u.email}</td>
        <td><span class="badge badge-neutral">${u.role}</span></td>
        <td>${statusBadge(u.status)}</td>
        <td>${formatDate(u.createdAt)}</td>
        <td>${formatDate(u.lastAccess)}</td>
        <td>
          <div style="display:flex;gap:.25rem;">
            <button type="button" class="btn btn-ghost btn-icon" style="color:var(--brand-600);" data-edit="${u.id}" title="Edit" aria-label="Editar ${u.username}"><i data-lucide="pencil" width="16" height="16"></i></button>
            <button type="button" class="btn btn-ghost btn-icon" style="color:var(--warning-600);" data-toggle-status="${u.id}" title="${u.status === "Active" ? "Disable" : "Enable"}" aria-label="Cambiar estado de ${u.username}"><i data-lucide="${u.status === "Active" ? "user-x" : "user-check"}" width="16" height="16"></i></button>
            <button type="button" class="btn btn-ghost btn-icon" style="color:var(--danger-600);" data-delete="${u.id}" title="Delete" aria-label="Eliminar ${u.username}"><i data-lucide="trash-2" width="16" height="16"></i></button>
          </div>
        </td>
      </tr>
    `).join("");

    els.tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openUserModal(Number(b.dataset.edit))));
    els.tbody.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteUser(Number(b.dataset.delete))));
    els.tbody.querySelectorAll("[data-toggle-status]").forEach((b) => b.addEventListener("click", () => toggleStatus(Number(b.dataset.toggleStatus))));
    if (window.lucide) window.lucide.createIcons();
    renderPagination();
  }

  function renderPagination() {
    if (!els.pagination) return;
    if (state.items.length === 0) { els.pagination.innerHTML = ""; return; }
    const cur = state.page, total = state.totalPages;
    let pages = [];
    for (let i = 1; i <= total; i++) if (i === 1 || i === total || Math.abs(i - cur) <= 1) pages.push(i); else if (pages[pages.length - 1] !== "…") pages.push("…");
    els.pagination.innerHTML = `
      <p style="font-size:.8125rem;color:var(--ink-600);margin:0;">Mostrando ${(cur - 1) * state.pageSize + 1}–${Math.min(cur * state.pageSize, state.count)} de ${state.count}</p>
      <div class="pagination-pages">
        <button type="button" class="page-btn" data-page="prev" ${cur === 1 ? "disabled" : ""}><i data-lucide="chevron-left" width="15" height="15"></i></button>
        ${pages.map((p) => p === "…" ? `<span class="page-btn" style="cursor:default;">…</span>` : `<button type="button" class="page-btn ${p === cur ? "is-active" : ""}" data-page="${p}">${p}</button>`).join("")}
        <button type="button" class="page-btn" data-page="next" ${cur === total ? "disabled" : ""}><i data-lucide="chevron-right" width="15" height="15"></i></button>
      </div>`;
    els.pagination.querySelectorAll("[data-page]").forEach((btn) => btn.addEventListener("click", () => {
      const v = btn.dataset.page;
      state.page = v === "prev" ? Math.max(1, state.page - 1) : v === "next" ? Math.min(state.totalPages, state.page + 1) : Number(v);
      fetchUsers();
    }));
    if (window.lucide) window.lucide.createIcons();
  }

  function clearFilters() {
    state.search = ""; state.filters = { role: "", status: "" };
    els.searchInput.value = ""; els.roleFilter.value = ""; els.statusFilter.value = "";
    state.page = 1; fetchUsers();
  }

  els.searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { state.search = els.searchInput.value.trim(); state.page = 1; fetchUsers(); }, 350);
  });
  els.clearSearchBtn?.addEventListener("click", () => { els.searchInput.value = ""; state.search = ""; state.page = 1; fetchUsers(); });
  els.roleFilter?.addEventListener("change", () => { state.filters.role = els.roleFilter.value; state.page = 1; fetchUsers(); });
  els.statusFilter?.addEventListener("change", () => { state.filters.status = els.statusFilter.value; state.page = 1; fetchUsers(); });
  els.clearFiltersBtn?.addEventListener("click", clearFilters);

  async function toggleStatus(id) {
    const user = state.items.find((u) => u.id === id);
    const newStatus = user.status === "Active" ? "Disabled" : "Active";
    try {
      await Api.users.update(id, { status: newStatus });
      Notify.success(newStatus === "Active" ? "El usuario fue habilitado correctamente." : "El usuario fue deshabilitado correctamente.");
      fetchUsers();
    } catch (err) { Notify.error("No se pudo completar la operación."); }
  }

  async function deleteUser(id) {
    const user = state.items.find((u) => u.id === id);
    const ok = await ModalManager.confirmAction({
      title: "Eliminar usuario",
      description: `¿Está seguro de que desea eliminar a "${user?.username}"? Esta acción no se puede deshacer.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try { await Api.users.remove(id); Notify.success("El usuario fue eliminado correctamente."); fetchUsers(); }
    catch (err) { Notify.error("No se pudo completar la operación."); }
  }

  function openUserModal(id) {
    const isEdit = Boolean(id);
    const user = isEdit ? state.items.find((u) => u.id === id) : null;
    const roles = ["Administrator", "Manager", "Staff"];
    const roleOptions = roles.map((r) => `<option ${user?.role === r ? "selected" : ""}>${r}</option>`).join("");

    const overlay = ModalManager.openModal(`
      <div class="modal-header">
        <h3>${isEdit ? "Edit User" : "Add User"}</h3>
        <button type="button" class="modal-close" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <form id="user-form">
        <div class="modal-body" style="display:flex; flex-direction:column; gap:1rem;">
          <div class="field" data-field="username">
            <label class="field-label field-required">Username</label>
            <input class="field-input" value="${user?.username ?? ""}" placeholder="Ej. jrios">
            <p class="field-error"></p>
          </div>
          <div class="field" data-field="email">
            <label class="field-label field-required">Email</label>
            <input class="field-input" type="email" value="${user?.email ?? ""}" placeholder="usuario@ibafex.pe">
            <p class="field-error"></p>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div class="field" data-field="password">
              <label class="field-label ${isEdit ? "" : "field-required"}">Password</label>
              <input class="field-input" type="password" placeholder="${isEdit ? "Dejar en blanco para no cambiar" : "••••••••"}" autocomplete="new-password">
              <p class="field-error"></p>
            </div>
            <div class="field" data-field="confirmPassword">
              <label class="field-label ${isEdit ? "" : "field-required"}">Confirm Password</label>
              <input class="field-input" type="password" placeholder="••••••••" autocomplete="new-password">
              <p class="field-error"></p>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
            <div class="field" data-field="role">
              <label class="field-label field-required">Role</label>
              <select class="field-select">${roleOptions}</select>
              <p class="field-error"></p>
            </div>
            <div class="field" data-field="status">
              <label class="field-label field-required">Status</label>
              <select class="field-select">
                <option ${user?.status === "Active" || !user ? "selected" : ""}>Active</option>
                <option ${user?.status === "Disabled" ? "selected" : ""}>Disabled</option>
              </select>
              <p class="field-error"></p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-autofocus>${isEdit ? "Save Changes" : "Create User"}</button>
        </div>
      </form>
    `);
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", ModalManager.close);

    const form = overlay.querySelector("#user-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const passwordEl = form.querySelector("[data-field='password'] .field-input");
      const confirmEl = form.querySelector("[data-field='confirmPassword'] .field-input");
      const passwordRules = isEdit && !passwordEl.value ? [] : [Validators.required, Validators.minLength(8)];

      const fields = {
        username: { el: form.querySelector("[data-field='username']"), rules: [Validators.required] },
        email: { el: form.querySelector("[data-field='email']"), rules: [Validators.required, Validators.email] },
        password: { el: form.querySelector("[data-field='password']"), rules: passwordRules, getValue: () => passwordEl.value },
        confirmPassword: {
          el: form.querySelector("[data-field='confirmPassword']"),
          rules: passwordRules.length ? [Validators.required, Validators.matches(passwordEl.value, "Las contraseñas no coinciden.")] : [],
          getValue: () => confirmEl.value,
        },
        role: { el: form.querySelector("[data-field='role']"), rules: [Validators.required] },
      };
      if (!validateForm(fields)) return;

      const payload = {
        username: fields.username.el.querySelector(".field-input").value.trim(),
        email: fields.email.el.querySelector(".field-input").value.trim(),
        role: fields.role.el.querySelector(".field-select").value,
        status: form.querySelector("[data-field='status'] .field-select").value,
      };
      if (passwordEl.value) payload.password = passwordEl.value;

      const submitBtn = form.querySelector('[type="submit"]');
      submitBtn.classList.add("btn-loading"); submitBtn.disabled = true;
      try {
        if (isEdit) { await Api.users.update(id, payload); Notify.success("Usuario actualizado correctamente."); }
        else { await Api.users.create(payload); Notify.success("Usuario creado correctamente."); }
        ModalManager.close(); fetchUsers();
      } catch (err) { Notify.error("No se pudo completar la operación."); }
      finally { submitBtn.classList.remove("btn-loading"); submitBtn.disabled = false; }
    });
  }

  els.addBtn?.addEventListener("click", () => openUserModal());
  fetchUsers();
});
