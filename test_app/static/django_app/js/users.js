/**
 * Ibafex Admin - Users Management Logic
 * Full CRUD for users, duplicate email validation, grid/list toggle, search & filters
 *
 * Los usuarios ahora vienen de Django (API JSON) vía window.storage:
 * getUsers / addUser / updateUser / deleteUser son asíncronos (async/await).
 *
 * RESTRICCIÓN DE ROL: solo usuarios con rol "Administrador" pueden agregar,
 * editar o eliminar usuarios. Operador/Supervisor/Editor solo pueden ver
 * la lista en modo lectura. (Nota: esto es solo UI; la protección real
 * debe reforzarse también en el backend/API).
 */

document.addEventListener('DOMContentLoaded', () => {
  // Common Layout
  window.utils.initCommonLayout('users');

  // Restricción de rol: solo Administrador puede modificar usuarios
  const currentUserRole = (window.AUTH_USER && window.AUTH_USER.role) || '';
  const isAdmin = currentUserRole === 'Administrador';

  // State
  let users = [];
  let filteredUsers = [];
  let isLoaded = false; // evita mostrar "sin resultados" mientras se espera a Django
  let currentViewMode = window.storage.getViewPref('users_view', 'grid');

  // DOM Elements
  const searchInput = document.getElementById('userSearchInput');
  const searchClearBtn = document.getElementById('userSearchClearBtn');
  const filterRole = document.getElementById('userFilterRole');
  const filterStatus = document.getElementById('userFilterStatus');
  const btnResetFilters = document.getElementById('btnResetUserFilters');
  const btnEmptyReset = document.getElementById('btnEmptyUserReset');

  const btnGridView = document.getElementById('btnUserGridView');
  const btnListView = document.getElementById('btnUserListView');
  const gridContainer = document.getElementById('userGridContainer');
  const listContainer = document.getElementById('userListContainer');
  const tableBody = document.getElementById('userTableBody');
  const emptyState = document.getElementById('userEmptyState');

  const btnOpenAddUser = document.getElementById('btnOpenAddUser');
  const userModal = document.getElementById('userModal');
  const userModalTitle = document.getElementById('userModalTitle');
  const userForm = document.getElementById('userForm');
  const modalUserId = document.getElementById('modalUserId');
  const modalUserName = document.getElementById('modalUserName');
  const modalUserEmail = document.getElementById('modalUserEmail');
  const modalUserPassword = document.getElementById('modalUserPassword');
  const modalUserRole = document.getElementById('modalUserRole');
  const modalUserStatus = document.getElementById('modalUserStatus');

  const modalUserNameError = document.getElementById('modalUserNameError');
  const modalUserEmailError = document.getElementById('modalUserEmailError');
  const modalUserPasswordError = document.getElementById('modalUserPasswordError');
  const modalUserPasswordRequiredStar = document.getElementById('modalUserPasswordRequiredStar');

  // KPIs
  const kpiTotalUsers = document.getElementById('kpiTotalUsers');
  const kpiActiveUsers = document.getElementById('kpiActiveUsers');
  const kpiAdminCount = document.getElementById('kpiAdminCount');
  const kpiStaffCount = document.getElementById('kpiStaffCount');

  // Los ids ahora son números (Django) pero dataset/inputs los devuelven como texto.
  const sameId = (a, b) => String(a) === String(b);

  // Init
  init();

  async function init() {
    applyViewMode(currentViewMode);
    setupEventListeners();
    await loadUsers();

    // Si no es Administrador, oculta el botón de crear usuario
    if (!isAdmin && btnOpenAddUser) {
      btnOpenAddUser.style.display = 'none';
    }
  }

  async function loadUsers() {
    try {
      users = await window.storage.getUsers();
    } catch (err) {
      users = [];
      window.utils.showToast('Error', err.message || 'No se pudieron cargar los usuarios.', 'danger');
    } finally {
      isLoaded = true;
    }
    applyFilters();
    updateKPIs();
  }

  /* --- KPIs --- */
  function updateKPIs() {
    const total = users.length;
    const active = users.filter(u => u.status === 'Activo').length;
    const admins = users.filter(u => u.role === 'Administrador').length;
    const staff = users.filter(u => u.role === 'Supervisor' || u.role === 'Operador').length;

    if (kpiTotalUsers) kpiTotalUsers.textContent = total;
    if (kpiActiveUsers) kpiActiveUsers.textContent = active;
    if (kpiAdminCount) kpiAdminCount.textContent = admins;
    if (kpiStaffCount) kpiStaffCount.textContent = staff;

    const navBadge = document.getElementById('navUserBadge');
    if (navBadge) navBadge.textContent = total;
  }

  /* --- View Mode Switcher --- */
  function applyViewMode(mode) {
    currentViewMode = mode;
    window.storage.saveViewPref('users_view', mode);

    if (mode === 'grid') {
      btnGridView.classList.add('active');
      btnListView.classList.remove('active');
      gridContainer.style.display = 'grid';
      listContainer.style.display = 'none';
    } else {
      btnListView.classList.add('active');
      btnGridView.classList.remove('active');
      gridContainer.style.display = 'none';
      listContainer.style.display = 'block';
    }
  }

  /* --- Search & Filters --- */
  function applyFilters() {
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const role = (filterRole ? filterRole.value : '').trim();
    const status = (filterStatus ? filterStatus.value : '').trim();

    if (searchClearBtn) {
      searchClearBtn.classList.toggle('active', query.length > 0);
    }

    filteredUsers = users.filter(u => {
      const uName = (u.name || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      const uRole = (u.role || '').toLowerCase();
      const uStatus = (u.status || '').toLowerCase();

      const matchesQuery = !query ||
        uName.includes(query) ||
        uEmail.includes(query) ||
        uRole.includes(query) ||
        uStatus.includes(query);

      const matchesRole = !role || (u.role && u.role.toLowerCase() === role.toLowerCase());
      const matchesStatus = !status || (u.status && u.status.toLowerCase() === status.toLowerCase());

      return matchesQuery && matchesRole && matchesStatus;
    });

    renderUsers();
  }

  /* --- Render Users --- */
  function renderUsers() {
    if (!isLoaded) return; // todavía esperando la respuesta de Django

    if (filteredUsers.length === 0) {
      emptyState.style.display = 'block';
      gridContainer.style.display = 'none';
      listContainer.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    if (currentViewMode === 'grid') {
      gridContainer.style.display = 'grid';
      listContainer.style.display = 'none';
    } else {
      gridContainer.style.display = 'none';
      listContainer.style.display = 'block';
    }

    // Helper to get initials
    const getInitials = (name) => {
      return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    };

    // Helper for role classes
    const getRoleClass = (role) => {
      switch (role) {
        case 'Administrador': return 'role-admin';
        case 'Supervisor': return 'role-supervisor';
        case 'Editor': return 'role-editor';
        default: return 'role-operador';
      }
    };

    // Helper for status classes
    const getStatusBadge = (status) => {
      if (status === 'Activo') return '<span class="badge badge-success"><span class="badge-dot"></span>Activo</span>';
      if (status === 'Inactivo') return '<span class="badge badge-neutral"><span class="badge-dot"></span>Inactivo</span>';
      return '<span class="badge badge-danger"><span class="badge-dot"></span>Suspendido</span>';
    };

    // 1. Grid View
    gridContainer.innerHTML = filteredUsers.map(u => {
      const initials = getInitials(u.name);
      const bg = u.avatarBg || '#059669';

      // Las acciones de editar/eliminar solo se muestran a Administrador
      const actionsHtml = isAdmin ? `
          <div class="ucard-actions">
            <button type="button" class="btn-icon btn-edit-user" data-id="${u.id}" title="Editar usuario">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn-icon btn-icon-danger btn-delete-user" data-id="${u.id}" title="Eliminar usuario">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        ` : '';

      return `
        <div class="user-card" data-id="${u.id}">
          <div class="ucard-top">
            <div class="ucard-avatar" style="background-color: ${bg};">
              ${initials}
            </div>
            ${getStatusBadge(u.status)}
          </div>

          <div class="ucard-info">
            <h3 class="ucard-name">${window.utils.escapeHtml(u.name)}</h3>
            <div class="ucard-email">
              <i class="fa-regular fa-envelope"></i>
              <span>${window.utils.escapeHtml(u.email)}</span>
            </div>
            <span class="role-badge ${getRoleClass(u.role)}">
              <i class="fa-solid fa-id-badge" style="margin-right: 0.35rem;"></i>
              ${window.utils.escapeHtml(u.role)}
            </span>
          </div>

          <div class="ucard-meta">
            <span><i class="fa-regular fa-calendar-check"></i> Registro</span>
            <strong>${window.utils.formatDate(u.registrationDate)}</strong>
          </div>

          ${actionsHtml}
        </div>
      `;
    }).join('');

    // 2. List View
    tableBody.innerHTML = filteredUsers.map(u => {
      const initials = getInitials(u.name);
      const bg = u.avatarBg || '#059669';

      // Las acciones de editar/eliminar solo se muestran a Administrador
      const actionsHtml = isAdmin ? `
            <div class="table-actions">
              <button type="button" class="btn-icon btn-sm btn-edit-user" data-id="${u.id}" title="Editar">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button type="button" class="btn-icon btn-sm btn-icon-danger btn-delete-user" data-id="${u.id}" title="Eliminar">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
        ` : '<span style="color: var(--text-secondary); font-size: 0.85rem;">Sin acceso</span>';

      return `
        <tr data-id="${u.id}">
          <td>
            <div class="user-table-cell">
              <div class="user-mini-avatar" style="background-color: ${bg};">${initials}</div>
              <div>
                <strong>${window.utils.escapeHtml(u.name)}</strong>
              </div>
            </div>
          </td>
          <td>${window.utils.escapeHtml(u.email)}</td>
          <td>
            <span class="role-badge ${getRoleClass(u.role)}">${window.utils.escapeHtml(u.role)}</span>
          </td>
          <td>${getStatusBadge(u.status)}</td>
          <td>${window.utils.formatDate(u.registrationDate)}</td>
          <td>
            ${actionsHtml}
          </td>
        </tr>
      `;
    }).join('');
  }

  /* --- Add / Edit User Modal --- */
  function openAddModal() {
    if (!isAdmin) {
      window.utils.showToast('Acceso denegado', 'No tienes permisos para agregar usuarios.', 'danger');
      return;
    }

    userForm.reset();
    modalUserId.value = '';
    clearValidation();

    userModalTitle.innerHTML = `
      <i class="fa-solid fa-user-plus" style="color: var(--primary-color);"></i>
      <span>Registrar nuevo usuario</span>
    `;
    modalUserRole.value = 'Operador';
    modalUserStatus.value = 'Activo';

    // Password es obligatoria al crear
    modalUserPassword.setAttribute('required', 'required');
    modalUserPassword.placeholder = 'Ingresa una contraseña';
    if (modalUserPasswordRequiredStar) modalUserPasswordRequiredStar.style.display = 'inline';

    window.utils.openModal('userModal');
  }

  function openEditModal(id) {
    if (!isAdmin) {
      window.utils.showToast('Acceso denegado', 'No tienes permisos para editar usuarios.', 'danger');
      return;
    }

    const user = users.find(u => sameId(u.id, id));
    if (!user) return;

    userForm.reset();
    clearValidation();

    modalUserId.value = user.id;
    modalUserName.value = user.name;
    modalUserEmail.value = user.email;
    modalUserRole.value = user.role;
    modalUserStatus.value = user.status;

    // Password es opcional al editar (vacío = no cambiarla)
    modalUserPassword.removeAttribute('required');
    modalUserPassword.value = '';
    modalUserPassword.placeholder = 'Dejar en blanco para no cambiarla';
    if (modalUserPasswordRequiredStar) modalUserPasswordRequiredStar.style.display = 'none';

    userModalTitle.innerHTML = `
      <i class="fa-solid fa-user-pen" style="color: var(--primary-color);"></i>
      <span>Editar usuario: ${window.utils.escapeHtml(user.name)}</span>
    `;

    window.utils.openModal('userModal');
  }

  function clearValidation() {
    modalUserNameError.classList.remove('visible');
    modalUserEmailError.classList.remove('visible');
    modalUserName.classList.remove('is-invalid');
    modalUserEmail.classList.remove('is-invalid');

    if (modalUserPasswordError) modalUserPasswordError.classList.remove('visible');
    if (modalUserPassword) modalUserPassword.classList.remove('is-invalid');
  }

  /* --- Form Submit (with duplicate email validation) --- */
  async function handleUserFormSubmit(e) {
    e.preventDefault();

    if (!isAdmin) {
      window.utils.showToast('Acceso denegado', 'No tienes permisos para guardar cambios de usuarios.', 'danger');
      return;
    }

    const id = modalUserId.value;
    const isEditing = !!id;
    const name = modalUserName.value.trim();
    const email = modalUserEmail.value.trim().toLowerCase();
    const password = modalUserPassword.value; // sin trim: no forzar formato de contraseña
    const role = modalUserRole.value;
    const status = modalUserStatus.value;

    let isValid = true;

    // Validate name
    if (name.length < 3) {
      modalUserName.classList.add('is-invalid');
      modalUserNameError.classList.add('visible');
      isValid = false;
    } else {
      modalUserName.classList.remove('is-invalid');
      modalUserNameError.classList.remove('visible');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      modalUserEmail.classList.add('is-invalid');
      modalUserEmailError.textContent = 'Ingresa un correo electrónico corporativo válido.';
      modalUserEmailError.classList.add('visible');
      isValid = false;
    } else {
      // Validate duplicate email
      const isDuplicate = users.some(u => !sameId(u.id, id) && u.email.toLowerCase() === email);
      if (isDuplicate) {
        modalUserEmail.classList.add('is-invalid');
        modalUserEmailError.textContent = 'Este correo ya pertenece a otro usuario registrado.';
        modalUserEmailError.classList.add('visible');
        isValid = false;
      } else {
        modalUserEmail.classList.remove('is-invalid');
        modalUserEmailError.classList.remove('visible');
      }
    }

    // Validate password:
    // - Al crear: obligatoria, mínimo 6 caracteres.
    // - Al editar: opcional, pero si se escribe algo, mínimo 6 caracteres.
    if (!isEditing) {
      if (password.length < 6) {
        modalUserPassword.classList.add('is-invalid');
        modalUserPasswordError.classList.add('visible');
        isValid = false;
      } else {
        modalUserPassword.classList.remove('is-invalid');
        modalUserPasswordError.classList.remove('visible');
      }
    } else {
      if (password.length > 0 && password.length < 6) {
        modalUserPassword.classList.add('is-invalid');
        modalUserPasswordError.classList.add('visible');
        isValid = false;
      } else {
        modalUserPassword.classList.remove('is-invalid');
        modalUserPasswordError.classList.remove('visible');
      }
    }

    if (!isValid) return;

    // Payload base (sin password todavía)
    const payload = { name, email, role, status };

    // Solo se envía password si el usuario escribió algo (nunca se manda vacía)
    if (password.length > 0) {
      payload.password = password;
    }

    // Evita doble envío mientras Django responde
    const submitBtn = userForm.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (isEditing) {
        // Update
        await window.storage.updateUser(id, payload);
        window.utils.showToast('Usuario actualizado', `Los datos de "${name}" han sido actualizados.`, 'success');
      } else {
        // Create
        await window.storage.addUser(payload);
        window.utils.showToast('Usuario registrado', `"${name}" fue agregado al equipo de Ibafex.`, 'success');
      }

      window.utils.closeModal('userModal');
      await loadUsers();

    } catch (err) {
      window.utils.showToast('Error', err.message || 'No se pudo guardar el usuario.', 'danger');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  /* --- Delete User with Confirmation --- */
  function deleteUser(id) {
    if (!isAdmin) {
      window.utils.showToast('Acceso denegado', 'No tienes permisos para eliminar usuarios.', 'danger');
      return;
    }

    const user = users.find(u => sameId(u.id, id));
    const userName = user ? user.name : 'este usuario';

    window.utils.confirmAction({
      title: 'Eliminar usuario',
      message: `¿Estás seguro de que deseas eliminar permanentemente a "${userName}"? Perderá el acceso al panel inmediatamente.`,
      confirmText: 'Sí, eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.storage.deleteUser(id);
          window.utils.showToast('Usuario eliminado', `"${userName}" ha sido eliminado del sistema.`, 'info');
          await loadUsers();
        } catch (err) {
          window.utils.showToast('Error', err.message || 'No se pudo eliminar el usuario.', 'danger');
        }
      }
    });
  }

  /* --- Event Listeners --- */
  function setupEventListeners() {
    // Search & filters
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        applyFilters();
        searchInput.focus();
      });
    }

    if (filterRole) filterRole.addEventListener('change', applyFilters);
    if (filterStatus) filterStatus.addEventListener('change', applyFilters);

    const resetFn = () => {
      if (searchInput) searchInput.value = '';
      if (filterRole) filterRole.value = '';
      if (filterStatus) filterStatus.value = '';
      applyFilters();
    };

    if (btnResetFilters) btnResetFilters.addEventListener('click', resetFn);
    if (btnEmptyReset) btnEmptyReset.addEventListener('click', resetFn);

    // View toggles
    btnGridView.addEventListener('click', () => applyViewMode('grid'));
    btnListView.addEventListener('click', () => applyViewMode('list'));

    // Open add modal
    btnOpenAddUser.addEventListener('click', openAddModal);

    // Form submit
    userForm.addEventListener('submit', handleUserFormSubmit);

    // Action clicks (edit, delete)
    const handleActionClick = (e) => {
      const editBtn = e.target.closest('.btn-edit-user');
      if (editBtn) {
        openEditModal(editBtn.dataset.id);
        return;
      }

      const deleteBtn = e.target.closest('.btn-delete-user');
      if (deleteBtn) {
        deleteUser(deleteBtn.dataset.id);
        return;
      }
    };

    gridContainer.addEventListener('click', handleActionClick);
    tableBody.addEventListener('click', handleActionClick);
  }


  const btnTogglePassword = document.getElementById('btnTogglePassword');

if (btnTogglePassword) {
  btnTogglePassword.addEventListener('click', () => {
    const isPassword = modalUserPassword.type === 'password';
    modalUserPassword.type = isPassword ? 'text' : 'password';

    const icon = btnTogglePassword.querySelector('i');
    icon.classList.toggle('fa-eye', !isPassword);
    icon.classList.toggle('fa-eye-slash', isPassword);

    btnTogglePassword.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
    btnTogglePassword.title = isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';
  });
}

});