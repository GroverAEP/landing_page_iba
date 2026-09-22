/**
 * Ibafex Admin - Settings Logic
 * Brand customization, logo file upload preview, accent colors, theme switching, admin profile
 * + Gestión de Categorías y Unidades de Medida (CRUD directo contra Django, sin pasar
 *   por el botón "Guardar cambios": cada alta/baja se refleja de inmediato en la BD).
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize common sidebar & layout
  window.utils.initCommonLayout('settings');

  // DOM Elements
  const settingsForm = document.getElementById('settingsForm');
  const settingCompanyName = document.getElementById('settingCompanyName');
  const logoPreviewImg = document.getElementById('logoPreviewImg');
  const settingLogoInput = document.getElementById('settingLogoInput');
  const btnRestoreDefaultLogo = document.getElementById('btnRestoreDefaultLogo');

  const themeRadioLight = document.querySelector('input[name="themeChoice"][value="light"]');
  const themeRadioDark = document.querySelector('input[name="themeChoice"][value="dark"]');

  const colorSwatches = document.querySelectorAll('.color-swatch');
  const settingAccentColor = document.getElementById('settingAccentColor');
  const customColorCode = document.getElementById('customColorCode');

  const settingLanguage = document.getElementById('settingLanguage');
  const settingDateFormat = document.getElementById('settingDateFormat');

  const settingAdminName = document.getElementById('settingAdminName');
  const settingAdminEmail = document.getElementById('settingAdminEmail');
  const settingAdminRole = document.getElementById('settingAdminRole');
  const settingAdminPhone = document.getElementById('settingAdminPhone');

  const settingCurrentPassword = document.getElementById('settingCurrentPassword');
  const settingNewPassword = document.getElementById('settingNewPassword');
  const settingConfirmPassword = document.getElementById('settingConfirmPassword');
  const settingsPasswordError = document.getElementById('settingsPasswordError');

  const btnSaveSettings = document.getElementById('btnSaveSettings');

  // Categorías & Unidades DOM Elements
  const newCategoryInput = document.getElementById('newCategoryInput');
  const btnAddCategory = document.getElementById('btnAddCategory');
  const categoryChipList = document.getElementById('categoryChipList');

  const newUnitInput = document.getElementById('newUnitInput');
  const btnAddUnit = document.getElementById('btnAddUnit');
  const unitChipList = document.getElementById('unitChipList');

  // State
  let currentSettings = window.storage.getSettings();
  let uploadedLogoBase64 = currentSettings.companyLogo || '';
  let selectedAccentColor = currentSettings.accentColor || '#059669';

  // Init
  init();

  async function init() {
    populateSettings();
    setupEventListeners();
    await loadCategories();
    await loadUnits();
  }

  function populateSettings() {
    // Company Name
    settingCompanyName.value = currentSettings.companyName || 'Ibafex';

    // Logo
    if (currentSettings.companyLogo) {
      logoPreviewImg.src = currentSettings.companyLogo;
      uploadedLogoBase64 = currentSettings.companyLogo;
    } else {
      const defaultLogo = (logoPreviewImg && logoPreviewImg.getAttribute('data-default-src')) || '../../assets/img/logo.svg';
      logoPreviewImg.src = defaultLogo;
      uploadedLogoBase64 = '';
    }

    // Theme Choice
    if (currentSettings.theme === 'dark') {
      themeRadioDark.checked = true;
    } else {
      themeRadioLight.checked = true;
    }

    // Accent Color
    selectedAccentColor = currentSettings.accentColor || '#059669';
    settingAccentColor.value = selectedAccentColor;
    customColorCode.textContent = selectedAccentColor.toUpperCase();
    highlightActiveSwatch(selectedAccentColor);

    // Language & Date Format
    settingLanguage.value = currentSettings.language || 'es';
    settingDateFormat.value = currentSettings.dateFormat || 'DD/MM/YYYY';

    // Admin Profile
    if (currentSettings.admin) {
      settingAdminName.value = currentSettings.admin.name || '';
      settingAdminEmail.value = currentSettings.admin.email || '';
      settingAdminRole.value = currentSettings.admin.role || '';
      settingAdminPhone.value = currentSettings.admin.phone || '';
    }
  }

  /* --- Logo Upload with Instant Preview --- */
  function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check size (< 2MB)
    if (file.size > 2 * 1024 * 1024) {
      window.utils.showToast('Archivo muy grande', 'El logo no debe superar los 2 MB.', 'danger');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedLogoBase64 = event.target.result;
      logoPreviewImg.src = uploadedLogoBase64;

      // Update sidebar logo immediately for preview
      const sidebarLogo = document.getElementById('sidebarLogo');
      if (sidebarLogo) sidebarLogo.src = uploadedLogoBase64;

      window.utils.showToast('Logo cargado', 'Vista previa del logo actualizada. Guarda los cambios para conservarlo.', 'info');
    };
    reader.readAsDataURL(file);
  }

  function restoreDefaultLogo() {
    uploadedLogoBase64 = '';
    const defaultLogo = (logoPreviewImg && logoPreviewImg.getAttribute('data-default-src')) || 
                        (sidebarLogo && sidebarLogo.getAttribute('data-default-src')) || 
                        '../../assets/img/logo.svg';
    logoPreviewImg.src = defaultLogo;
    const sidebarLogo = document.getElementById('sidebarLogo');
    if (sidebarLogo) sidebarLogo.src = defaultLogo;
    settingLogoInput.value = '';
    window.utils.showToast('Logo restaurado', 'Se ha reestablecido el logo predeterminado de Ibafex.', 'info');
  }

  /* --- Swatches & Accent Color --- */
  function highlightActiveSwatch(colorHex) {
    colorSwatches.forEach(swatch => {
      if (swatch.dataset.color.toLowerCase() === colorHex.toLowerCase()) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
    });
  }

  function applyAccentColorPreview(colorHex) {
    selectedAccentColor = colorHex;
    settingAccentColor.value = colorHex;
    customColorCode.textContent = colorHex.toUpperCase();
    highlightActiveSwatch(colorHex);

    // Apply live to CSS variables
    document.documentElement.style.setProperty('--primary-color', colorHex);
  }

  /* --- Live Theme Switcher --- */
  function applyThemePreview(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  /* ─────────────────────────────────────────────────────────
   * Categorías de productos (CRUD contra Django, en vivo)
   * ───────────────────────────────────────────────────────── */
  async function loadCategories() {
    try {
      const categories = await window.storage.getCategories();
      renderChipList(categoryChipList, categories, {
        emptyText: 'Aún no hay categorías registradas.',
        onDelete: handleDeleteCategory
      });
    } catch (err) {
      window.utils.showToast('Error', err.message || 'No se pudieron cargar las categorías.', 'danger');
    }
  }

  async function handleAddCategory() {
    const name = newCategoryInput.value.trim();
    if (!name) {
      newCategoryInput.focus();
      return;
    }

    btnAddCategory.disabled = true;
    try {
      await window.storage.addCategory(name);
      newCategoryInput.value = '';
      await loadCategories();
      window.utils.showToast('Categoría agregada', `"${name}" fue añadida al catálogo.`, 'success');
    } catch (err) {
      window.utils.showToast('Error', err.message || 'No se pudo agregar la categoría.', 'danger');
    } finally {
      btnAddCategory.disabled = false;
    }
  }

  function handleDeleteCategory(id, name) {
    window.utils.confirmAction({
      title: 'Eliminar categoría',
      message: `¿Eliminar la categoría "${name}"? Los productos que la usen quedarán sin categoría asociada.`,
      confirmText: 'Sí, eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.storage.deleteCategory(id);
          await loadCategories();
          window.utils.showToast('Categoría eliminada', `"${name}" fue eliminada del catálogo.`, 'info');
        } catch (err) {
          window.utils.showToast('Error', err.message || 'No se pudo eliminar la categoría.', 'danger');
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
   * Unidades de Medida (CRUD contra Django, en vivo)
   * ───────────────────────────────────────────────────────── */
  async function loadUnits() {
    try {
      const units = await window.storage.getUnits();
      renderChipList(unitChipList, units, {
        emptyText: 'Aún no hay unidades de medida registradas.',
        onDelete: handleDeleteUnit
      });
    } catch (err) {
      window.utils.showToast('Error', err.message || 'No se pudieron cargar las unidades de medida.', 'danger');
    }
  }

  async function handleAddUnit() {
    const name = newUnitInput.value.trim();
    if (!name) {
      newUnitInput.focus();
      return;
    }

    btnAddUnit.disabled = true;
    try {
      await window.storage.addUnit(name);
      newUnitInput.value = '';
      await loadUnits();
      window.utils.showToast('Unidad agregada', `"${name}" fue añadida al catálogo.`, 'success');
    } catch (err) {
      window.utils.showToast('Error', err.message || 'No se pudo agregar la unidad de medida.', 'danger');
    } finally {
      btnAddUnit.disabled = false;
    }
  }

  function handleDeleteUnit(id, name) {
    window.utils.confirmAction({
      title: 'Eliminar unidad de medida',
      message: `¿Eliminar la unidad "${name}"? Los productos que la usen quedarán sin unidad asociada.`,
      confirmText: 'Sí, eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await window.storage.deleteUnit(id);
          await loadUnits();
          window.utils.showToast('Unidad eliminada', `"${name}" fue eliminada del catálogo.`, 'info');
        } catch (err) {
          window.utils.showToast('Error', err.message || 'No se pudo eliminar la unidad de medida.', 'danger');
        }
      }
    });
  }

  /* Renderiza una lista de "chips" (categoría o unidad) con botón de eliminar.
     items: [{ id, name }] */
  function renderChipList(container, items, { emptyText, onDelete }) {
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `<p class="catalog-empty-text">${window.utils.escapeHtml(emptyText)}</p>`;
      return;
    }

    container.innerHTML = items.map(item => `
      <span class="catalog-chip" data-id="${item.id}">
        <span class="catalog-chip-text">${window.utils.escapeHtml(item.name)}</span>
        <button type="button" class="catalog-chip-delete" data-id="${item.id}" data-name="${window.utils.escapeHtml(item.name)}" title="Eliminar" aria-label="Eliminar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </span>
    `).join('');

    container.querySelectorAll('.catalog-chip-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        onDelete(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  /* --- Form Submission & Persistence (configuración general, no toca categorías/unidades) --- */
  function handleFormSubmit(e) {
    e.preventDefault();

    const companyName = settingCompanyName.value.trim();
    const adminName = settingAdminName.value.trim();
    const adminEmail = settingAdminEmail.value.trim().toLowerCase();
    const adminRole = settingAdminRole.value.trim();
    const adminPhone = settingAdminPhone.value.trim();
    const theme = document.querySelector('input[name="themeChoice"]:checked').value;
    const language = settingLanguage.value;
    const dateFormat = settingDateFormat.value;

    // Validate Company Name & Admin
    if (!companyName) {
      window.utils.showToast('Campo requerido', 'Por favor, escribe el nombre de la empresa.', 'warning');
      settingCompanyName.focus();
      return;
    }

    if (!adminName || !adminEmail) {
      window.utils.showToast('Datos incompletos', 'Nombre y correo del administrador son obligatorios.', 'warning');
      return;
    }

    // Password validation (if user entered new password)
    const newPass = settingNewPassword.value;
    const confirmPass = settingConfirmPassword.value;

    if (newPass || confirmPass) {
      if (newPass.length < 8 || newPass !== confirmPass) {
        settingsPasswordError.classList.add('visible');
        window.utils.showToast('Contraseña inválida', 'La nueva contraseña debe tener mínimo 8 caracteres y coincidir en ambos campos.', 'danger');
        return;
      }
    }
    settingsPasswordError.classList.remove('visible');

    // Button feedback
    const originalBtnHtml = btnSaveSettings.innerHTML;
    btnSaveSettings.disabled = true;
    btnSaveSettings.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    // Construct settings payload
    const updatedSettings = {
      companyName,
      companyLogo: uploadedLogoBase64,
      accentColor: selectedAccentColor,
      theme,
      language,
      dateFormat,
      admin: {
        name: adminName,
        email: adminEmail,
        role: adminRole,
        phone: adminPhone
      }
    };

    setTimeout(() => {
      // Save settings in storage
      window.storage.saveSettings(updatedSettings);

      // Also update auth user session & users list
      window.storage.setAuthUser(updatedSettings.admin);

      // Re-apply theme and header date
      window.utils.applyThemeAndSettings();
      window.utils.initCommonLayout('settings');

      // Clear password fields
      settingCurrentPassword.value = '';
      settingNewPassword.value = '';
      settingConfirmPassword.value = '';

      btnSaveSettings.disabled = false;
      btnSaveSettings.innerHTML = '<i class="fa-solid fa-check"></i> ¡Cambios guardados!';

      window.utils.showToast('Configuración guardada', 'Las preferencias han sido persistidas exitosamente en localStorage.', 'success');

      setTimeout(() => {
        btnSaveSettings.innerHTML = originalBtnHtml;
      }, 2500);
    }, 450);
  }

  /* --- Event Listeners --- */
  function setupEventListeners() {
    // Logo Upload
    settingLogoInput.addEventListener('change', handleLogoUpload);
    btnRestoreDefaultLogo.addEventListener('click', restoreDefaultLogo);

    // Live theme selection
    themeRadioLight.addEventListener('change', () => applyThemePreview('light'));
    themeRadioDark.addEventListener('change', () => applyThemePreview('dark'));

    // Color swatches click
    colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        applyAccentColorPreview(swatch.dataset.color);
      });
    });

    // Custom color picker input
    settingAccentColor.addEventListener('input', (e) => {
      applyAccentColorPreview(e.target.value);
    });

    // Save form
    settingsForm.addEventListener('submit', handleFormSubmit);

    // Categorías
    btnAddCategory.addEventListener('click', handleAddCategory);
    newCategoryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCategory();
      }
    });

    // Unidades de Medida
    btnAddUnit.addEventListener('click', handleAddUnit);
    newUnitInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddUnit();
      }
    });
  }
});