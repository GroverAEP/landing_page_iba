/**
 * Ibafex Admin - Settings Logic
 * Brand customization, logo file upload preview, accent colors, theme switching, admin profile
 * + Gestión de Categorías y Unidades de Medida (CRUD directo contra Django, sin pasar
 *   por el botón "Guardar cambios": cada alta/baja se refleja de inmediato en la BD).
 *
 * NOTA: todas las referencias a elementos del DOM están guardadas con chequeo `if (el)`
 * antes de usarlas. Esto permite que, si en el futuro se comenta/quita alguna card del
 * HTML (marca/logo, categorías, unidades), el resto del script SIGA funcionando en vez
 * de romperse entero en el primer elemento null.
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
  const sidebarLogo = document.getElementById('sidebarLogo');

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


  //COnfiguracion para los limites del pdf en el storage
  const settingPdfLimitMb = document.getElementById('settingPdfLimitMb');
  const settingPdfExpiryDays = document.getElementById('settingPdfExpiryDays');

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


  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    }


  async function guardarConfiguracionPdf(pdfLimitMb, pdfExpiryDays) {
    const response = await fetch('/administracion/api/configuracion-pdf/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken'),
      },
      body: JSON.stringify({
        pdf_limit_mb: pdfLimitMb,
        pdf_expiry_days: pdfExpiryDays,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'No se pudo guardar la configuración de PDF.');
    }
    return data;
  }

  




  function populateSettings() {
    //Configuracion de limites del pdfs
    if (settingPdfLimitMb) settingPdfLimitMb.value = currentSettings.pdfLimitMb || 5;
    if (settingPdfExpiryDays) settingPdfExpiryDays.value = currentSettings.pdfExpiryDays || 7;


    // Company Name (solo si la card de marca existe en el HTML)
    if (settingCompanyName) {
      settingCompanyName.value = currentSettings.companyName || 'Ibafex';
    }
    

    // Logo (solo si la card de marca existe en el HTML)
    if (logoPreviewImg) {
      if (currentSettings.companyLogo) {
        logoPreviewImg.src = currentSettings.companyLogo;
        uploadedLogoBase64 = currentSettings.companyLogo;
      } else {
        const defaultLogo = logoPreviewImg.getAttribute('data-default-src') || '../../assets/img/logo.svg';
        logoPreviewImg.src = defaultLogo;
        uploadedLogoBase64 = '';
      }
    }

    // Theme Choice
    if (themeRadioDark && themeRadioLight) {
      if (currentSettings.theme === 'dark') {
        themeRadioDark.checked = true;
      } else {
        themeRadioLight.checked = true;
      }
    }

    // Accent Color
    selectedAccentColor = currentSettings.accentColor || '#059669';
    if (settingAccentColor) settingAccentColor.value = selectedAccentColor;
    if (customColorCode) customColorCode.textContent = selectedAccentColor.toUpperCase();
    highlightActiveSwatch(selectedAccentColor);

    // Language & Date Format
    if (settingLanguage) settingLanguage.value = currentSettings.language || 'es';
    if (settingDateFormat) settingDateFormat.value = currentSettings.dateFormat || 'DD/MM/YYYY';

    // Admin Profile
    if (currentSettings.admin) {
      if (settingAdminName) settingAdminName.value = currentSettings.admin.name || '';
      if (settingAdminEmail) settingAdminEmail.value = currentSettings.admin.email || '';
      if (settingAdminRole) settingAdminRole.value = currentSettings.admin.role || '';
      if (settingAdminPhone) settingAdminPhone.value = currentSettings.admin.phone || '';
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
      if (logoPreviewImg) logoPreviewImg.src = uploadedLogoBase64;

      // Update sidebar logo immediately for preview
      if (sidebarLogo) sidebarLogo.src = uploadedLogoBase64;

      window.utils.showToast('Logo cargado', 'Vista previa del logo actualizada. Guarda los cambios para conservarlo.', 'info');
    };
    reader.readAsDataURL(file);
  }


  
  function restoreDefaultLogo() {
    uploadedLogoBase64 = '';
    const defaultLogo =
      (logoPreviewImg && logoPreviewImg.getAttribute('data-default-src')) ||
      (sidebarLogo && sidebarLogo.getAttribute('data-default-src')) ||
      '../../assets/img/logo.svg';

    if (logoPreviewImg) logoPreviewImg.src = defaultLogo;
    if (sidebarLogo) sidebarLogo.src = defaultLogo;
    if (settingLogoInput) settingLogoInput.value = '';
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
    if (settingAccentColor) settingAccentColor.value = colorHex;
    if (customColorCode) customColorCode.textContent = colorHex.toUpperCase();
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
    if (!categoryChipList) return; // card comentada/ausente en el HTML
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
    if (!newCategoryInput || !btnAddCategory) return;
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
    if (!unitChipList) return; // card comentada/ausente en el HTML
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
    if (!newUnitInput || !btnAddUnit) return;
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
  async function handleFormSubmit(e) {
    e.preventDefault();

    const companyName = settingCompanyName ? settingCompanyName.value.trim() : (currentSettings.companyName || 'Ibafex');
    const adminName = settingAdminName ? settingAdminName.value.trim() : '';
    const adminEmail = settingAdminEmail ? settingAdminEmail.value.trim().toLowerCase() : '';
    const adminRole = settingAdminRole ? settingAdminRole.value.trim() : '';
    const adminPhone = settingAdminPhone ? settingAdminPhone.value.trim() : '';
    const checkedTheme = document.querySelector('input[name="themeChoice"]:checked');
    const theme = checkedTheme ? checkedTheme.value : 'light';
    const language = settingLanguage ? settingLanguage.value : 'es';
    const dateFormat = settingDateFormat ? settingDateFormat.value : 'DD/MM/YYYY';
    const pdfLimitMb = settingPdfLimitMb ? Number(settingPdfLimitMb.value) : 5;
    const pdfExpiryDays = settingPdfExpiryDays ? Number(settingPdfExpiryDays.value) : 7;
    // ...

    // Validate Company Name (solo si el campo existe en el HTML)
    if (settingCompanyName && !companyName) {
      window.utils.showToast('Campo requerido', 'Por favor, escribe el nombre de la empresa.', 'warning');
      settingCompanyName.focus();
      return;
    }

    if (!adminName || !adminEmail) {
      window.utils.showToast('Datos incompletos', 'Nombre y correo del administrador son obligatorios.', 'warning');
      return;
    }

    // Password validation (if user entered new password)
    const newPass = settingNewPassword ? settingNewPassword.value : '';
    const confirmPass = settingConfirmPassword ? settingConfirmPassword.value : '';

    if (newPass || confirmPass) {
      if (newPass.length < 8 || newPass !== confirmPass) {
        if (settingsPasswordError) settingsPasswordError.classList.add('visible');
        window.utils.showToast('Contraseña inválida', 'La nueva contraseña debe tener mínimo 8 caracteres y coincidir en ambos campos.', 'danger');
        return;
      }
    }
    if (settingsPasswordError) settingsPasswordError.classList.remove('visible');

    // Button feedback
    const originalBtnHtml = btnSaveSettings ? btnSaveSettings.innerHTML : '';
    if (btnSaveSettings) {
      btnSaveSettings.disabled = true;
      btnSaveSettings.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    }

    // Guardar límite/expiración de PDFs en el backend (ConfiguracionPDF real en BD)
    try {
      await guardarConfiguracionPdf(pdfLimitMb, pdfExpiryDays);
    } catch (err) {
      window.utils.showToast('Error', err.message || 'No se pudo guardar la configuración de PDF.', 'danger');
      if (btnSaveSettings) {
        btnSaveSettings.disabled = false;
        btnSaveSettings.innerHTML = originalBtnHtml;
      }
      return;
    }

    // Construct settings payload
    const updatedSettings = {
      companyName,
      companyLogo: uploadedLogoBase64,
      accentColor: selectedAccentColor,
      theme,
      language,
      dateFormat,
      pdfLimitMb,
      pdfExpiryDays,
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
      if (settingCurrentPassword) settingCurrentPassword.value = '';
      if (settingNewPassword) settingNewPassword.value = '';
      if (settingConfirmPassword) settingConfirmPassword.value = '';

      if (btnSaveSettings) {
        btnSaveSettings.disabled = false;
        btnSaveSettings.innerHTML = '<i class="fa-solid fa-check"></i> ¡Cambios guardados!';
      }

      window.utils.showToast('Configuración guardada', 'Las preferencias han sido persistidas exitosamente en localStorage.', 'success');

      setTimeout(() => {
        if (btnSaveSettings) btnSaveSettings.innerHTML = originalBtnHtml;
      }, 2500);
    }, 450);
  }

  /* --- Event Listeners --- */
  function setupEventListeners() {
    // Logo Upload (solo si la card de marca existe en el HTML)
    if (settingLogoInput) settingLogoInput.addEventListener('change', handleLogoUpload);
    if (btnRestoreDefaultLogo) btnRestoreDefaultLogo.addEventListener('click', restoreDefaultLogo);

    // Live theme selection
    if (themeRadioLight) themeRadioLight.addEventListener('change', () => applyThemePreview('light'));
    if (themeRadioDark) themeRadioDark.addEventListener('change', () => applyThemePreview('dark'));

    // Color swatches click
    colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        applyAccentColorPreview(swatch.dataset.color);
      });
    });

    // Custom color picker input
    if (settingAccentColor) {
      settingAccentColor.addEventListener('input', (e) => {
        applyAccentColorPreview(e.target.value);
      });
    }

    // Save form
    if (settingsForm) settingsForm.addEventListener('submit', handleFormSubmit);

    // Categorías (solo si la card existe en el HTML)
    if (btnAddCategory) btnAddCategory.addEventListener('click', handleAddCategory);
    if (newCategoryInput) {
      newCategoryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddCategory();
        }
      });
    }

    // Unidades de Medida (solo si la card existe en el HTML)
    if (btnAddUnit) btnAddUnit.addEventListener('click', handleAddUnit);
    if (newUnitInput) {
      newUnitInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddUnit();
        }
      });
    }
  }
});