/**
 * Ibafex Admin - Shared Utilities
 * UI helpers: toasts, modals, formatting, theme loader, navigation active states
 */

(function () {
  'use strict';

  /* --- DOM Ready Helper --- */
  function onReady(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  /* --- Safe HTML Escaping --- */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /* --- Currency Formatter --- */
  // function formatCurrency(amount) {
  //   const val = Number(amount) || 0;
  //   return new Intl.NumberFormat('es-CO', {
  //     style: 'currency',
  //     currency: 'USD',
  //     minimumFractionDigits: 2,
  //     maximumFractionDigits: 2
  //   }).format(val);
  // }

  function formatCurrency(value) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(value);
}

  /* --- Date Formatter --- */
  function formatDate(dateInput, customFormat) {
    if (!dateInput) return '-';
    let year, monthNum, day, monthIndex;

    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      const parts = dateInput.trim().split('-');
      year = parseInt(parts[0], 10);
      monthNum = parts[1];
      day = parts[2];
      monthIndex = parseInt(monthNum, 10) - 1;
    } else {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return dateInput;
      day = String(date.getDate()).padStart(2, '0');
      monthNum = String(date.getMonth() + 1).padStart(2, '0');
      year = date.getFullYear();
      monthIndex = date.getMonth();
    }

    const settings = window.storage ? window.storage.getSettings() : { dateFormat: 'DD/MM/YYYY' };
    const format = customFormat || settings.dateFormat || 'DD/MM/YYYY';

    const monthNames = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    if (format === 'YYYY-MM-DD') {
      return `${year}-${monthNum}-${day}`;
    } else if (format === 'DD de MMMM de YYYY') {
      return `${day} de ${monthNames[monthIndex]} de ${year}`;
    } else {
      // Default: DD/MM/YYYY
      return `${day}/${monthNum}/${year}`;
    }
  }

  /* --- Current Date for Header --- */
  function getCurrentFormattedDate() {
    const now = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const dayName = days[now.getDay()];
    const dayNumber = now.getDate();
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();

    return `${dayName}, ${dayNumber} de ${monthName} de ${year}`;
  }

  /* --- Datos del usuario autenticado ---
   * Prioridad de lectura:
   *   1) window.AUTH_USER  -> inyectado por el template de Django
   *      (fuente de verdad real, viene de request.user en el backend)
   *   2) window.storage.getAuthUser() -> capa mock/local (fallback,
   *      útil en pantallas de prototipo sin backend conectado)
   *   3) objeto por defecto, para que la UI nunca quede vacía/rota
   */
  function getCurrentUser() {
    if (window.AUTH_USER && typeof window.AUTH_USER === 'object') {
      return window.AUTH_USER;
    }
    if (window.storage && typeof window.storage.getAuthUser === 'function') {
      const stored = window.storage.getAuthUser();
      if (stored) return stored;
    }
    return { name: 'Admin', role: 'Administrador' };
  }

  /* Calcula iniciales a partir del nombre, ej: "Alejandro Morales" -> "AM" */
  function getInitials(name) {
    if (!name) return 'AD';
    const initials = String(name)
      .split(' ')
      .filter(Boolean)
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return initials || 'AD';
  }

  /* Pinta los datos del usuario actual en cualquier bloque .user-snippet
   * presente en la página (sidebar, header, etc.) */
  function renderCurrentUser() {
    const user = getCurrentUser();
    const nameEls = document.querySelectorAll('.user-info .user-name');
    const roleEls = document.querySelectorAll('.user-info .user-role');
    const avatarEls = document.querySelectorAll('.user-avatar');

    nameEls.forEach(el => { el.textContent = user.name || 'Admin'; });
    roleEls.forEach(el => { el.textContent = user.role || 'Administrador'; });
    avatarEls.forEach(el => { el.textContent = getInitials(user.name); });

    return user;
  }

  /* --- Toast Notifications --- */
  function showToast(title, message, type = 'success', duration = 3800) {
    let container = document.getElementById('ibafexToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ibafexToastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = {
      success: 'fa-solid fa-circle-check',
      danger: 'fa-solid fa-circle-xmark',
      warning: 'fa-solid fa-triangle-exclamation',
      info: 'fa-solid fa-circle-info'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="${icons[type] || icons.info} toast-icon"></i>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" type="button" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
      <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    const removeToast = () => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 250);
    };

    const timer = setTimeout(removeToast, duration);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      removeToast();
    });
  }

  /* --- Modal Utilities --- */
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Auto focus first input
    const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea, button.btn-primary');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 80);
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  /* Confirmation Dialog */
  function confirmAction({
    title = '¿Confirmar acción?',
    message = '¿Estás seguro de que deseas continuar? Esta acción no se puede deshacer.',
    confirmText = 'Eliminar',
    cancelText = 'Cancelar',
    confirmClass = 'btn-danger',
    onConfirm
  }) {
    let confirmModal = document.getElementById('globalConfirmModal');
    if (!confirmModal) {
      confirmModal = document.createElement('div');
      confirmModal.id = 'globalConfirmModal';
      confirmModal.className = 'modal-overlay';
      confirmModal.innerHTML = `
        <div class="modal" style="max-width: 440px;">
          <div class="modal-header">
            <div class="modal-title" id="globalConfirmTitle">
              <i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i>
              <span>Confirmación</span>
            </div>
            <button class="modal-close" type="button" id="globalConfirmClose">&times;</button>
          </div>
          <div class="modal-body">
            <p id="globalConfirmMessage" style="color: var(--text-secondary); line-height: 1.5; font-size: var(--font-size-sm);"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="globalConfirmCancel">Cancelar</button>
            <button type="button" class="btn ${confirmClass}" id="globalConfirmOk">Confirmar</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmModal);

      // Close events
      const closeBtn = document.getElementById('globalConfirmClose');
      const cancelBtn = document.getElementById('globalConfirmCancel');
      const backdropClose = (e) => {
        if (e.target === confirmModal) closeModal('globalConfirmModal');
      };

      closeBtn.addEventListener('click', () => closeModal('globalConfirmModal'));
      cancelBtn.addEventListener('click', () => closeModal('globalConfirmModal'));
      confirmModal.addEventListener('click', backdropClose);
    }

    // Populate data
    document.getElementById('globalConfirmTitle').innerHTML = `
      <i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger); margin-right: 0.5rem;"></i>
      <span>${escapeHtml(title)}</span>
    `;
    document.getElementById('globalConfirmMessage').textContent = message;

    const okBtn = document.getElementById('globalConfirmOk');
    okBtn.className = `btn ${confirmClass}`;
    okBtn.textContent = confirmText;

    const cancelBtn = document.getElementById('globalConfirmCancel');
    cancelBtn.textContent = cancelText;

    // Clone ok button to remove previous event listeners
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    newOkBtn.addEventListener('click', () => {
      closeModal('globalConfirmModal');
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    });

    openModal('globalConfirmModal');
  }

  /* --- Theme & Global Settings Applier --- */
  function applyThemeAndSettings() {
    if (!window.storage) {
      // Aun sin window.storage (mock) disponible, igual pintamos el
      // usuario real si Django lo inyectó en window.AUTH_USER
      renderCurrentUser();
      return;
    }
    const settings = window.storage.getSettings();

    // Theme: light / dark
    if (settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    // Custom Accent Color
    if (settings.accentColor) {
      document.documentElement.style.setProperty('--primary-color', settings.accentColor);
      document.documentElement.style.setProperty('--primary-hover', darkenColor(settings.accentColor, -12));
    }

    // Update Company Name in Titles and Logos if available
    const brandNames = document.querySelectorAll('.brand-name-text');
    brandNames.forEach(el => {
      el.textContent = settings.companyName || 'Ibafex';
    });

    // Update Company Logo if custom base64 exists, or restore default
    const logos = document.querySelectorAll('.brand-logo-img');
    logos.forEach(img => {
      if (settings.companyLogo) {
        img.src = settings.companyLogo;
      } else {
        const isSubpage = window.location.pathname.includes('/pages/') || img.src.includes('/pages/');
        const defaultLogoPath = (img.getAttribute && img.getAttribute('data-default-src')) || (isSubpage ? '../../assets/img/logo.svg' : 'assets/img/logo.svg');
        if (img.src && (img.src.startsWith('data:') || (!img.src.endsWith('logo.svg') && !img.src.includes('logo.svg')))) {
          img.src = defaultLogoPath;
        }
      }
    });

    // Update Admin Profile in Sidebar (usa la nueva función centralizada)
    renderCurrentUser();
  }

  /* Helper to darken hex color */
  function darkenColor(col, amt) {
    let usePound = false;
    if (col[0] === "#") {
      col = col.slice(1);
      usePound = true;
    }
    if (col.length === 3) {
      col = col.split('').map(c => c + c).join('');
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255;
    else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255;
    else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  }

  /* --- Initialize Navigation & Header Date --- */
  let commonLayoutBound = false;

  function initCommonLayout(activePageName) {
    // 1. Update Date in Header
    const dateBadgeText = document.querySelector('.header-date-badge span');
    if (dateBadgeText) {
      dateBadgeText.textContent = getCurrentFormattedDate();
    }

    // 2. Set active nav item
    if (activePageName) {
      const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
      navLinks.forEach(link => {
        if (link.getAttribute('data-page') === activePageName) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }

    // 3. Update nav user badge
    const navUserBadge = document.getElementById('navUserBadge');
    if (navUserBadge && window.storage) {
      const usersList = window.storage.getUsers();
      if (usersList && usersList.length !== undefined) {
        navUserBadge.textContent = usersList.length;
      }
    }

    // Prevent duplicate event listener registration
    if (commonLayoutBound) return;
    commonLayoutBound = true;

    // 4. Mobile Sidebar Toggle & Backdrop
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    const openSidebar = () => {
      if (sidebar) sidebar.classList.add('sidebar-open');
      if (backdrop) backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    };

    const closeSidebar = () => {
      if (sidebar) sidebar.classList.remove('sidebar-open');
      if (backdrop) backdrop.classList.remove('active');
      document.body.style.overflow = '';
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // 5. Logout Action — envía el formulario oculto #logoutForm (POST + CSRF)
    // que apunta al logout_view real de Django. Ya no se simula con
    // window.storage; la sesión la cierra el servidor.
    const logoutBtn = document.getElementById('btnLogout');
    const logoutForm = document.getElementById('logoutForm');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        confirmAction({
          title: 'Cerrar sesión',
          message: '¿Estás seguro de que deseas salir de tu cuenta?',
          confirmText: 'Cerrar sesión',
          confirmClass: 'btn-danger',
          onConfirm: () => {
            if (logoutForm) {
              // Submit real: Django cierra la sesión y redirige a signin,
              // que ya muestra el mensaje de éxito ("Has cerrado sesión...").
              logoutForm.submit();
            } else if (window.SIGNIN_URL) {
              // Fallback por si el form no está en el DOM por algún motivo
              window.location.href = window.SIGNIN_URL;
            }
          }
        });
      });
    }

    // 6. Global Modal close by clicking backdrop or close button
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
      }
      if (e.target.closest('[data-modal-close]')) {
        const modalId = e.target.closest('[data-modal-close]').getAttribute('data-modal-close');
        closeModal(modalId);
      }
    });

    // ESC key closes active modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) {
          activeModal.classList.remove('active');
          document.body.style.overflow = '';
        }
      }
    });
  }

  // Auto-apply theme upon DOM ready
  onReady(() => {
    applyThemeAndSettings();
  });

  // Export to global window.utils
  window.utils = {
    onReady,
    escapeHtml,
    formatCurrency,
    formatDate,
    getCurrentFormattedDate,
    getCurrentUser,
    getInitials,
    renderCurrentUser,
    showToast,
    openModal,
    closeModal,
    confirmAction,
    applyThemeAndSettings,
    initCommonLayout
  };

})();