/**
 * api.js
 * Capa reutilizable de acceso a datos.
 *
 * Hoy: sirve datos mock desde memoria para poder demostrar la interfaz
 * sin backend.
 * Mañana: basta reemplazar el contenido de cada método por un fetch()
 * real contra Django REST Framework. Las firmas (parámetros de entrada,
 * forma de la respuesta) ya están pensadas para encajar con endpoints
 * REST estándar, por lo que las pantallas no deberían necesitar cambios.
 */

const API_CONFIG = {
  useMock: true,
  baseUrl: "/api",
};

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Wrapper central de fetch. Añade headers comunes y normaliza errores.
 * Cuando useMock es false, todos los módulos (products.js, users.js...)
 * ya llaman a este método, así que conectar el backend real es un
 * cambio en un solo lugar.
 */
async function apiRequest(path, { method = "GET", body, params } = {}) {
  let url = `${API_CONFIG.baseUrl}${path}`;
  if (params) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    if (query) url += `?${query}`;
  }

  const options = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  };
  if (body instanceof FormData) {
    delete options.headers["Content-Type"];
    options.body = body;
  } else if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    throw new ApiError("No se pudo conectar con el servidor.", 0, networkError);
  }

  if (!response.ok) {
    let details = null;
    try { details = await response.json(); } catch (_) { /* sin cuerpo JSON */ }
    throw new ApiError(
      "La solicitud no pudo completarse.",
      response.status,
      details
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

/** Simula latencia de red para que los estados de carga se vean reales en la demo. */
function mockDelay(ms = 450) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Api: punto único de entrada usado por el resto de módulos.
 * Cada método documenta el endpoint real equivalente en DRF.
 */
const Api = {
  // ---------------------------------------------------------------- Auth
  auth: {
    // POST /api/auth/login/
    async login({ username, password }) {
      if (API_CONFIG.useMock) {
        await mockDelay(700);
        const user = MockDB.users.find((u) => u.username === username);
        if (!user || password !== "demo1234") {
          throw new ApiError("Las credenciales ingresadas no son válidas.", 401);
        }
        return { token: "mock-token", user };
      }
      return apiRequest("/auth/login/", { method: "POST", body: { username, password } });
    },
    // POST /api/auth/password-reset/
    async requestPasswordReset({ email }) {
      if (API_CONFIG.useMock) {
        await mockDelay(700);
        return { ok: true };
      }
      return apiRequest("/auth/password-reset/", { method: "POST", body: { email } });
    },
    // POST /api/auth/logout/
    async logout() {
      if (API_CONFIG.useMock) { await mockDelay(300); return { ok: true }; }
      return apiRequest("/auth/logout/", { method: "POST" });
    },
  },

  // ------------------------------------------------------------ Products
  products: {
    // GET /api/products/?search=&category=&availability=&visibility=&page=&page_size=&ordering=
    async list(params = {}) {
      if (API_CONFIG.useMock) {
        await mockDelay();
        return MockDB.queryProducts(params);
      }
      return apiRequest("/products/", { params });
    },
    // POST /api/products/
    async create(payload) {
      if (API_CONFIG.useMock) { await mockDelay(600); return MockDB.createProduct(payload); }
      return apiRequest("/products/", { method: "POST", body: payload });
    },
    // PATCH /api/products/{id}/
    async update(id, payload) {
      if (API_CONFIG.useMock) { await mockDelay(600); return MockDB.updateProduct(id, payload); }
      return apiRequest(`/products/${id}/`, { method: "PATCH", body: payload });
    },
    // DELETE /api/products/{id}/
    async remove(id) {
      if (API_CONFIG.useMock) { await mockDelay(500); return MockDB.deleteProduct(id); }
      return apiRequest(`/products/${id}/`, { method: "DELETE" });
    },
    // POST /api/products/bulk/
    async bulkAction(ids, action) {
      if (API_CONFIG.useMock) { await mockDelay(600); return MockDB.bulkProductAction(ids, action); }
      return apiRequest("/products/bulk/", { method: "POST", body: { ids, action } });
    },
    // GET /api/products/catalog/pdf/
    async downloadCatalogPdf() {
      if (API_CONFIG.useMock) { await mockDelay(900); return { ok: true, filename: "catalogo-ibafex.pdf" }; }
      return apiRequest("/products/catalog/pdf/");
    },
  },

  // --------------------------------------------------------------- Users
  users: {
    async list(params = {}) {
      if (API_CONFIG.useMock) { await mockDelay(); return MockDB.queryUsers(params); }
      return apiRequest("/users/", { params });
    },
    async create(payload) {
      if (API_CONFIG.useMock) { await mockDelay(600); return MockDB.createUser(payload); }
      return apiRequest("/users/", { method: "POST", body: payload });
    },
    async update(id, payload) {
      if (API_CONFIG.useMock) { await mockDelay(600); return MockDB.updateUser(id, payload); }
      return apiRequest(`/users/${id}/`, { method: "PATCH", body: payload });
    },
    async remove(id) {
      if (API_CONFIG.useMock) { await mockDelay(500); return MockDB.deleteUser(id); }
      return apiRequest(`/users/${id}/`, { method: "DELETE" });
    },
  },

  // -------------------------------------------------------------- Visits
  visits: {
    // GET /api/visits/?date_from=&date_to=&device=&source=
    async list(params = {}) {
      if (API_CONFIG.useMock) { await mockDelay(); return MockDB.queryVisits(params); }
      return apiRequest("/visits/", { params });
    },
    async summary(params = {}) {
      if (API_CONFIG.useMock) { await mockDelay(); return MockDB.visitsSummary(params); }
      return apiRequest("/visits/summary/", { params });
    },
  },

  // ------------------------------------------------------------ Dashboard
  dashboard: {
    // GET /api/dashboard/summary/
    async summary() {
      if (API_CONFIG.useMock) { await mockDelay(); return MockDB.dashboardSummary(); }
      return apiRequest("/dashboard/summary/");
    },
  },
};
