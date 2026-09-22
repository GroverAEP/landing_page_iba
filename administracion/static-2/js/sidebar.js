/**
 * sidebar.js
 * Comportamiento común del sidebar y el header para todas las páginas
 * administrativas (dashboard, products, visits, users, settings).
 */

function initShell() {
  const sidebar = document.querySelector(".sidebar");
  const appMain = document.querySelector(".app-main");
  const collapseBtn = document.querySelector(".sidebar-collapse-btn");
  const menuBtn = document.querySelector(".header-menu-btn");
  let overlay = document.querySelector(".sidebar-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    document.body.appendChild(overlay);
  }

  // Preferencia de colapso persistida solo para esta sesión de navegador.
  const collapsed = sessionStorage.getItem("ibafex.sidebarCollapsed") === "1";
  if (collapsed && window.innerWidth >= 1024) {
    sidebar?.classList.add("is-collapsed");
    appMain?.classList.add("sidebar-collapsed");
  }

  collapseBtn?.addEventListener("click", () => {
    const isCollapsed = sidebar.classList.toggle("is-collapsed");
    appMain.classList.toggle("sidebar-collapsed", isCollapsed);
    sessionStorage.setItem("ibafex.sidebarCollapsed", isCollapsed ? "1" : "0");
  });

  function openDrawer() {
    sidebar?.classList.add("is-mobile-open");
    overlay.classList.add("is-open");
  }
  function closeDrawer() {
    sidebar?.classList.remove("is-mobile-open");
    overlay.classList.remove("is-open");
  }

  menuBtn?.addEventListener("click", openDrawer);
  overlay.addEventListener("click", closeDrawer);

  sidebar?.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      if (window.innerWidth < 1024) closeDrawer();
    });
  });

  // Fecha dinámica en el header.
  const dateEl = document.querySelector("[data-current-date]");
  if (dateEl) {
    const formatted = new Date().toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    dateEl.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  // Menú de usuario.
  const userMenuBtn = document.querySelector("[data-user-menu-trigger]");
  const userMenu = document.querySelector("[data-user-menu]");
  if (userMenuBtn && userMenu) {
    userMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userMenu.classList.toggle("is-open");
    });
    document.addEventListener("click", () => userMenu.classList.remove("is-open"));
  }

  // Logout con confirmación.
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await ModalManager.confirmAction({
        title: "Cerrar sesión",
        description: "¿Está seguro de que desea cerrar sesión?",
        confirmLabel: "Cerrar sesión",
        cancelLabel: "Cancelar",
        danger: true,
      });
      if (!ok) return;
      try {
        await Api.auth.logout();
        Notify.info("Sesión cerrada correctamente.");
        setTimeout(() => { window.location.href = "/login/"; }, 400);
      } catch (err) {
        Notify.error("No se pudo cerrar la sesión. Inténtalo nuevamente.");
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", initShell);
