/**
 * Ibafex Admin - Sign In Page Controller
 * Handles client-side validation, theme switching, demo credential autofill,
 * and the password recovery modal. Real authentication happens server-side
 * in Django (the form submits normally to the 'signin' view).
 *
 * NOTA: el login ahora es por USERNAME, no por email.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --- DOM Elements ---
  const signinForm = document.getElementById('signinForm');
  const signinUsername = document.getElementById('signinUsername'); // antes: signinEmail
  const signinPassword = document.getElementById('signinPassword');
  const rememberMe = document.getElementById('rememberMe');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnArrow = document.querySelector('.btn-arrow');
  const btnText = document.querySelector('.btn-text');

  // Icons & Toggles
  const btnTogglePwd = document.getElementById('btnTogglePwd');
  const togglePwdIcon = document.getElementById('togglePwdIcon');
  const btnClearUsername = document.getElementById('btnClearUsername'); // antes: btnClearEmail

  // Alerts & Errors
  const signinAlert = document.getElementById('signinAlert');
  const usernameError = document.getElementById('usernameError'); // antes: emailError
  const usernameErrorText = document.getElementById('usernameErrorText'); // antes: emailErrorText
  const passwordError = document.getElementById('passwordError');
  const passwordErrorText = document.getElementById('passwordErrorText');

  // Demo buttons
  const demoButtons = document.querySelectorAll('.btn-demo-pill');

  // Theme Switcher
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeLabelText = document.getElementById('themeLabelText');

  // Password Recovery Modal
  const btnForgotPwd = document.getElementById('btnForgotPwd');
  const recoveryModal = document.getElementById('recoveryModal');
  const btnRecoveryClose = document.getElementById('btnRecoveryClose');
  const btnRecoveryCancel = document.getElementById('btnRecoveryCancel');
  const recoveryForm = document.getElementById('recoveryForm');
  const recoveryEmail = document.getElementById('recoveryEmail'); // este SÍ sigue siendo email (recuperación por correo)
  const recoveryEmailError = document.getElementById('recoveryEmailError');
  const btnRecoverySubmit = document.getElementById('btnRecoverySubmit');

  // --- Initial Setup & Theme ---
  initTheme();
  initRememberedUsername();

  // --- Event Listeners ---

  signinForm.addEventListener('submit', handleSignIn);

  signinUsername.addEventListener('input', () => {
    hideError(signinUsername, usernameError);
    hideAlert();
    toggleClearUsernameBtn();
  });

  signinPassword.addEventListener('input', () => {
    hideError(signinPassword, passwordError);
    hideAlert();
  });

  if (btnClearUsername) {
    btnClearUsername.addEventListener('click', () => {
      signinUsername.value = '';
      signinUsername.focus();
      toggleClearUsernameBtn();
    });
  }

  if (btnTogglePwd) {
    btnTogglePwd.addEventListener('click', togglePasswordVisibility);
  }

  // Demo accounts selector
  demoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      demoButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Usa data-username si existe; si el HTML aún trae data-email, cae a eso
      const username = btn.getAttribute('data-username') || btn.getAttribute('data-email');
      const role = btn.getAttribute('data-role');

      signinUsername.value = username;
      signinPassword.value = role.toLowerCase() + '123';

      hideError(signinUsername, usernameError);
      hideError(signinPassword, passwordError);
      hideAlert();
      toggleClearUsernameBtn();
    });
  });

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  if (btnForgotPwd) {
    btnForgotPwd.addEventListener('click', openRecoveryModal);
  }
  if (btnRecoveryClose) {
    btnRecoveryClose.addEventListener('click', closeRecoveryModal);
  }
  if (btnRecoveryCancel) {
    btnRecoveryCancel.addEventListener('click', closeRecoveryModal);
  }
  if (recoveryModal) {
    recoveryModal.addEventListener('click', (e) => {
      if (e.target === recoveryModal) closeRecoveryModal();
    });
  }
  if (recoveryForm) {
    recoveryForm.addEventListener('submit', handleRecoverySubmit);
  }
  if (recoveryEmail) {
    recoveryEmail.addEventListener('input', () => {
      if (recoveryEmailError) recoveryEmailError.classList.remove('visible');
      recoveryEmail.classList.remove('is-invalid');
    });
  }

  // --- Sign In: validación de cliente + submit normal a Django ---

  function handleSignIn(e) {
    const username = signinUsername.value.trim();
    const password = signinPassword.value.trim();

    let isValid = true;

    if (!username) {
      showError(signinUsername, usernameError, usernameErrorText, 'El usuario es requerido.');
      isValid = false;
    } else if (username.length < 3) {
      showError(signinUsername, usernameError, usernameErrorText, 'El usuario debe contener al menos 3 caracteres.');
      isValid = false;
    }

    if (!password) {
      showError(signinPassword, passwordError, passwordErrorText, 'La contraseña es requerida.');
      isValid = false;
    } else if (password.length < 4) {
      showError(signinPassword, passwordError, passwordErrorText, 'La contraseña debe contener al menos 4 caracteres.');
      isValid = false;
    }

    if (!isValid) {
      e.preventDefault();
      shakeElement(signinForm);
      return;
    }

    // Todo válido: se deja que el form haga su submit normal hacia Django.

    if (rememberMe && rememberMe.checked) {
      localStorage.setItem('ibafex_remembered_username', username);
    } else {
      localStorage.removeItem('ibafex_remembered_username');
    }

    setLoadingState(true);
  }

  // --- Helper Functions ---

  function showError(inputEl, containerEl, textEl, message) {
    if (inputEl) inputEl.classList.add('is-invalid');
    if (textEl) textEl.textContent = message;
    if (containerEl) containerEl.classList.add('visible');
  }

  function hideError(inputEl, containerEl) {
    if (inputEl) inputEl.classList.remove('is-invalid');
    if (containerEl) containerEl.classList.remove('visible');
  }

  function hideAlert() {
    if (signinAlert) {
      signinAlert.classList.remove('visible');
    }
  }

  function shakeElement(el) {
    el.style.animation = 'none';
    el.offsetHeight; // Trigger reflow
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => {
      el.style.animation = '';
    }, 400);
  }

  function setLoadingState(isLoading) {
    btnSubmit.disabled = isLoading;
    if (isLoading) {
      btnSpinner.style.display = 'inline-block';
      if (btnArrow) btnArrow.style.display = 'none';
      if (btnText) btnText.textContent = 'Verificando...';
    } else {
      btnSpinner.style.display = 'none';
      if (btnArrow) btnArrow.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Ingresar al Panel';
    }
  }

  function togglePasswordVisibility() {
    const isPassword = signinPassword.type === 'password';
    signinPassword.type = isPassword ? 'text' : 'password';

    if (togglePwdIcon) {
      togglePwdIcon.className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    }
    btnTogglePwd.setAttribute('title', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  }

  function toggleClearUsernameBtn() {
    if (!btnClearUsername) return;
    btnClearUsername.style.display = signinUsername.value.length > 0 ? 'inline-flex' : 'none';
  }

  function initRememberedUsername() {
    const savedUsername = localStorage.getItem('ibafex_remembered_username');
    if (savedUsername) {
      signinUsername.value = savedUsername;
      if (rememberMe) rememberMe.checked = true;
      toggleClearUsernameBtn();
    }
  }

  // --- Theme Management ---

  function initTheme() {
    let savedTheme = 'light';
    if (window.storage) {
      const settings = window.storage.getSettings();
      if (settings && settings.theme) {
        savedTheme = settings.theme;
      }
    } else {
      savedTheme = localStorage.getItem('ibafex_theme') || 'light';
    }

    applyTheme(savedTheme);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

    applyTheme(nextTheme);

    if (window.storage) {
      const settings = window.storage.getSettings();
      settings.theme = nextTheme;
      window.storage.saveSettings(settings);
    } else {
      localStorage.setItem('ibafex_theme', nextTheme);
    }
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (themeLabelText) themeLabelText.textContent = 'Oscuro';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (themeLabelText) themeLabelText.textContent = 'Claro';
    }
  }

  // --- Password Recovery Flow (esta sí sigue siendo por email) ---

  function openRecoveryModal() {
    if (!recoveryModal) return;
    recoveryModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      if (recoveryEmail) recoveryEmail.focus();
    }, 100);
  }

  function closeRecoveryModal() {
    if (!recoveryModal) return;
    recoveryModal.classList.remove('active');
    document.body.style.overflow = '';
    if (recoveryEmailError) recoveryEmailError.classList.remove('visible');
    if (recoveryEmail) recoveryEmail.classList.remove('is-invalid');
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }




async function handleRecoverySubmit(e) {
  e.preventDefault();
  const email = recoveryEmail.value.trim();

  if (!email || !validateEmail(email)) {
    if (recoveryEmail) recoveryEmail.classList.add('is-invalid');
    if (recoveryEmailError) recoveryEmailError.classList.add('visible');
    return;
  }

  btnRecoverySubmit.disabled = true;
  btnRecoverySubmit.innerHTML = '<span class="spinner-border" style="width:14px;height:14px;"></span> Enviando...';

  try {
    const body = new URLSearchParams({ email });
    const response = await fetch('/administracion/recuperar-password/', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': getCookie('csrftoken'),
      },
      body,
    });

    const data = await response.json();

    if (response.ok && data.success) {
      closeRecoveryModal();
      if (window.utils && window.utils.showToast) {
        window.utils.showToast(
          'Enlace de recuperación enviado',
          `Hemos enviado las instrucciones a ${email}. Revisa tu bandeja de entrada.`,
          'info',
          4500
        );
      }
    } else {
      if (recoveryEmail) recoveryEmail.classList.add('is-invalid');
      if (recoveryEmailError) {
        recoveryEmailError.querySelector('span').textContent =
          data.message || 'No se pudo procesar la solicitud.';
        recoveryEmailError.classList.add('visible');
      }
    }
  } catch (err) {
    console.error('Error al solicitar recuperación:', err);
  } finally {
    btnRecoverySubmit.disabled = false;
    btnRecoverySubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Enviar enlace</span>';
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}
});