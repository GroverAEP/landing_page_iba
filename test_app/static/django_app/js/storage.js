/**
 * Ibafex Admin - Storage Service (puente a Django)
 *
 * Productos: ahora vienen de Django vía fetch (API JSON), NO de localStorage.
 * Users / Visits / Settings / ViewPrefs / AuthUser: se mantienen igual que
 * en la versión original, en localStorage, hasta que también se migren.
 *
 * ⚠️ CAMBIO IMPORTANTE PARA dashboard.js:
 * Antes: const productos = storage.getProducts();       // síncrono
 * Ahora: const productos = await storage.getProducts();  // asíncrono
 * Cualquier función que llame a getProducts/addProduct/updateProduct/
 * deleteProduct/deleteProducts debe ser "async" y usar "await".
 */

const STORAGE_KEYS = {
  PRODUCTS: 'ibafex_products',           // ya no se usa para leer productos (vienen de Django),
  PRODUCTS_SCHEMA: 'ibafex_products_schema', // se deja solo por compatibilidad con código viejo
  USERS: 'ibafex_users',
  VISITS: 'ibafex_visits',
  SETTINGS: 'ibafex_settings',
  VIEW_PREFS: 'ibafex_view_preferences',
  AUTH_USER: 'ibafex_auth_user'
};

// Bump this number whenever the product structure changes (se conserva por compatibilidad).
const PRODUCTS_SCHEMA_VERSION = 2;

// Base de la API de Django. Ajusta si tu app no está montada en la raíz del sitio.
const API_BASE = '/administracion/api';

/* Seed Data (se conserva tal cual; ya no se usa para poblar productos, solo como referencia) */
const DEFAULT_PRODUCTS = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80',
    brand: 'Hacienda El Paraíso',
    category: 'Café',
    name: 'Café Especial Arábica Huila',
    unit_price: 34.50,
    unit_of_measure: 'kg',
    bulk_price: 810.00,
    bulk_unit_of_measure: 'saco',
    date_added: '2026-08-10T00:00:00',
    product_of_stock: true
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1548848221-0c2e497ed557?w=600&auto=format&fit=crop&q=80',
    brand: 'AgroCacao del Pacífico',
    category: 'Cacao',
    name: 'Cacao Fino de Aroma Tumaco',
    unit_price: 28.00,
    unit_of_measure: 'kg',
    bulk_price: 650.00,
    bulk_unit_of_measure: 'saco',
    date_added: '2026-08-14T00:00:00',
    product_of_stock: true
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
    brand: 'Frutales de Sonsón',
    category: 'Frutas',
    name: 'Aguacate Hass Calidad Export',
    unit_price: 19.80,
    unit_of_measure: 'caja',
    bulk_price: null,
    bulk_unit_of_measure: null,
    date_added: '2026-08-20T00:00:00',
    product_of_stock: true
  },
  {
    id: 4,
    image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&auto=format&fit=crop&q=80',
    brand: 'Apícola Los Andes',
    category: 'Apicultura',
    name: 'Miel Multifloral Silvestre',
    unit_price: 14.25,
    unit_of_measure: 'L',
    bulk_price: 130.00,
    bulk_unit_of_measure: 'bidón',
    date_added: '2026-07-28T00:00:00',
    product_of_stock: false
  },
  {
    id: 5,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80',
    brand: 'Cooperativa Sur Andina',
    category: 'Granos',
    name: 'Quinua Real Andina Blanca',
    unit_price: 11.50,
    unit_of_measure: 'kg',
    bulk_price: 260.00,
    bulk_unit_of_measure: 'saco',
    date_added: '2026-09-02T00:00:00',
    product_of_stock: true
  },
  {
    id: 6,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
    brand: 'Trapiche La Esperanza',
    category: 'Derivados',
    name: 'Panela Pulverizada Bio',
    unit_price: 6.75,
    unit_of_measure: 'kg',
    bulk_price: 155.00,
    bulk_unit_of_measure: 'saco',
    date_added: '2026-08-05T00:00:00',
    product_of_stock: true
  },
  {
    id: 7,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80',
    brand: 'BioAmazonas Labs',
    category: 'Derivados',
    name: 'Aceite de Sacha Inchi Prensado en Frío',
    unit_price: 42.00,
    unit_of_measure: 'L',
    bulk_price: null,
    bulk_unit_of_measure: null,
    date_added: '2026-09-12T00:00:00',
    product_of_stock: false
  },
  {
    id: 8,
    image: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&auto=format&fit=crop&q=80',
    brand: 'Granos del Oriente',
    category: 'Granos',
    name: 'Fríjol Rojo Radical Seleccionado',
    unit_price: 8.90,
    unit_of_measure: 'kg',
    bulk_price: 200.00,
    bulk_unit_of_measure: 'saco',
    date_added: '2026-07-15T00:00:00',
    product_of_stock: false
  },
  {
    id: 9,
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&auto=format&fit=crop&q=80',
    brand: 'Agropecuaria El Sol',
    category: 'Frutas',
    name: 'Mango Tommy Atkins de Selección',
    unit_price: 16.50,
    unit_of_measure: 'caja',
    bulk_price: null,
    bulk_unit_of_measure: null,
    date_added: '2026-09-08T00:00:00',
    product_of_stock: true
  },
  {
    id: 10,
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    brand: 'Finca Santa Elena',
    category: 'Café',
    name: 'Café Geisha Edición Especial',
    unit_price: 65.00,
    unit_of_measure: 'kg',
    bulk_price: null,
    bulk_unit_of_measure: null,
    date_added: '2026-09-18T00:00:00',
    product_of_stock: false
  }
];

const DEFAULT_USERS = [
  { id: 'user-001', name: 'Alejandro Morales', email: 'admin@ibafex.com', role: 'Administrador', status: 'Activo', registrationDate: '2026-01-15', avatarBg: '#059669' },
  { id: 'user-002', name: 'Camila Restrepo', email: 'c.restrepo@ibafex.com', role: 'Supervisor', status: 'Activo', registrationDate: '2026-03-22', avatarBg: '#10b981' },
  { id: 'user-003', name: 'Mateo Cárdenas', email: 'mateo.c@ibafex.com', role: 'Editor', status: 'Activo', registrationDate: '2026-04-10', avatarBg: '#3b82f6' },
  { id: 'user-004', name: 'Valentina Osorio', email: 'v.osorio@ibafex.com', role: 'Operador', status: 'Inactivo', registrationDate: '2026-05-18', avatarBg: '#f59e0b' },
  { id: 'user-005', name: 'Carlos Andrés Vega', email: 'carlos.vega@ibafex.com', role: 'Supervisor', status: 'Activo', registrationDate: '2026-06-30', avatarBg: '#8b5cf6' },
  { id: 'user-006', name: 'Sofía Navarro', email: 's.navarro@ibafex.com', role: 'Operador', status: 'Suspendido', registrationDate: '2026-07-04', avatarBg: '#ef4444' }
];

const DEFAULT_VISITS = {
  summary: {
    total: 154820,
    currentMonth: 26410,
    previousMonth: 23120,
    growthRate: 14.2,
    dailyAverage: 880
  },
  history: [
    { year: 2026, month: 'Ene', visits: 18400, uniqueVisitors: 12200, pageViews: 42100 },
    { year: 2026, month: 'Feb', visits: 19800, uniqueVisitors: 13500, pageViews: 46200 },
    { year: 2026, month: 'Mar', visits: 21500, uniqueVisitors: 14800, pageViews: 51800 },
    { year: 2026, month: 'Abr', visits: 20900, uniqueVisitors: 14100, pageViews: 49700 },
    { year: 2026, month: 'May', visits: 22600, uniqueVisitors: 15900, pageViews: 55400 },
    { year: 2026, month: 'Jun', visits: 24100, uniqueVisitors: 16800, pageViews: 58900 },
    { year: 2026, month: 'Jul', visits: 23800, uniqueVisitors: 16400, pageViews: 57200 },
    { year: 2026, month: 'Ago', visits: 25100, uniqueVisitors: 17500, pageViews: 61300 },
    { year: 2026, month: 'Sep', visits: 26410, uniqueVisitors: 18900, pageViews: 65400 },
    { year: 2026, month: 'Oct', visits: 0, uniqueVisitors: 0, pageViews: 0 },
    { year: 2026, month: 'Nov', visits: 0, uniqueVisitors: 0, pageViews: 0 },
    { year: 2026, month: 'Dic', visits: 0, uniqueVisitors: 0, pageViews: 0 }
  ],
  topPages: [
    { path: '/catalogo-agro', name: 'Catálogo General de Productos', visits: 38400, bounceRate: '24.2%', avgDuration: '3m 42s' },
    { path: '/productores-asociados', name: 'Directorio de Productores', visits: 29150, bounceRate: '31.5%', avgDuration: '2m 58s' },
    { path: '/mercado-precios', name: 'Precios de Mercado en Tiempo Real', visits: 24800, bounceRate: '19.8%', avgDuration: '4m 15s' },
    { path: '/certificaciones-bio', name: 'Certificaciones Orgánicas y Trazabilidad', visits: 18600, bounceRate: '27.4%', avgDuration: '2m 10s' },
    { path: '/contacto-comercial', name: 'Mesa de Negocios y Exportación', visits: 14200, bounceRate: '35.0%', avgDuration: '1m 45s' }
  ]
};

const DEFAULT_SETTINGS = {
  companyName: 'Ibafex',
  companyLogo: '',
  accentColor: '#059669',
  theme: 'light',
  language: 'es',
  dateFormat: 'DD/MM/YYYY',
  admin: {
    name: 'Alejandro Morales',
    email: 'admin@ibafex.com',
    role: 'Director de Operaciones',
    phone: '+57 312 456 7890'
  }
};

/** Lee el csrftoken que Django deja en una cookie (requiere {% csrf_token %} en el HTML, o CSRF_COOKIE_HTTPONLY=False, que es el default). */
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken(),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.error || JSON.stringify(body);
    } catch (_) { /* respuesta sin JSON */ }
    throw new Error(detail || `Error ${response.status} en ${url}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

/**
 * Storage Engine Implementation
 */
class StorageService {
  constructor() {
    this.initDefaults();
  }

  initDefaults() {
    // Productos: YA NO se siembran en localStorage, vienen de Django.
    // Users/Visits/Settings siguen en localStorage por ahora.
        localStorage.removeItem(STORAGE_KEYS.USERS); // limpia usuarios viejos del navegador
    //if (!this.getItem(STORAGE_KEYS.USERS)) this.setItem(STORAGE_KEYS.USERS, DEFAULT_USERS);
    if (!this.getItem(STORAGE_KEYS.VISITS)) this.setItem(STORAGE_KEYS.VISITS, DEFAULT_VISITS);
    if (!this.getItem(STORAGE_KEYS.SETTINGS)) this.setItem(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }

  getItem(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return null;
    }
  }

  setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error writing ${key} to localStorage:`, e);
      return false;
    }
  }

    /* --- Products Methods (ahora hablan con Django) --- */

  /**
   * @param {Object} [filters] opcional: { q, categoria, disponible } igual que los
   * query params que ya soporta el panel_admin de Django.
   */
  async getProducts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.categoria) params.set('categoria', filters.categoria);
    if (filters.disponible !== undefined && filters.disponible !== '') {
      params.set('disponible', String(filters.disponible));
    }
    const qs = params.toString();
    return apiFetch(`${API_BASE}/productos/${qs ? `?${qs}` : ''}`);
  }

  async addProduct(productPayload, imageFile) {
    const formData = new FormData();
    formData.append('name', productPayload.name);
    formData.append('brand', productPayload.brand);
    formData.append('category', productPayload.category);
    formData.append('unit_price', productPayload.unit_price);
    formData.append('is_visible', productPayload.is_visible); // 👈 nuevo
    formData.append('unit_of_measure', productPayload.unit_of_measure);
    if (productPayload.bulk_price != null) formData.append('bulk_price', productPayload.bulk_price);
    if (productPayload.bulk_unit_of_measure) formData.append('bulk_unit_of_measure', productPayload.bulk_unit_of_measure);
    formData.append('product_of_stock', productPayload.product_of_stock);

    if (imageFile) {
      formData.append('image', imageFile); // el File real, no base64
    }

    const res = await fetch(`${API_BASE}/productos/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': getCsrfToken()
        // OJO: NO pongas Content-Type manualmente, el navegador lo arma solo con el boundary correcto
      },
      body: formData
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body.error || JSON.stringify(body);
      } catch (_) { /* respuesta sin JSON */ }
      throw new Error(detail || `Error ${res.status} al crear producto`);
    }

    return res.json();
  }

  async updateProduct(id, updatedData, imageFile) {
  // Sin imagen nueva: PUT normal en JSON, como antes.
  if (!imageFile) {
    return apiFetch(`${API_BASE}/productos/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(updatedData)
    });
  }

  // Con imagen nueva: multipart/form-data, mismos campos que addProduct
  const formData = new FormData();
      formData.append('name', updatedData.name);
      formData.append('brand', updatedData.brand);
      formData.append('category', updatedData.category);
      formData.append('unit_price', updatedData.unit_price);
      formData.append('is_visible', updatedData.is_visible); // 👈 nuevo
      formData.append('unit_of_measure', updatedData.unit_of_measure);
      if (updatedData.bulk_price != null) formData.append('bulk_price', updatedData.bulk_price);
      if (updatedData.bulk_unit_of_measure) formData.append('bulk_unit_of_measure', updatedData.bulk_unit_of_measure);
      formData.append('product_of_stock', updatedData.product_of_stock);
      formData.append('image', imageFile);

      const res = await fetch(`${API_BASE}/productos/${id}/`, {
        method: 'PUT',
        headers: {
          'X-CSRFToken': getCsrfToken()
        },
        body: formData
      });

      if (!res.ok) {
        let detail = '';
        try {
          const body = await res.json();
          detail = body.error || JSON.stringify(body);
        } catch (_) { /* respuesta sin JSON */ }
        throw new Error(detail || `Error ${res.status} al actualizar producto`);
      }

      return res.json();
    }
  async deleteProduct(id) {
    const result = await apiFetch(`${API_BASE}/productos/${id}/`, { method: 'DELETE' });
    return !!(result && result.deleted);
  }

  async deleteProducts(ids) {
    const result = await apiFetch(`${API_BASE}/productos/eliminar-masivo/`, {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    return result ? result.deletedCount : 0;
  }

  /* --- Users Methods --- */
  getUsers() {
    return this.getItem(STORAGE_KEYS.USERS) || [];
  }

  saveUsers(users) {
    return this.setItem(STORAGE_KEYS.USERS, users);
  }

  /* --- Visits Methods --- */
  getVisits() {
    return this.getItem(STORAGE_KEYS.VISITS) || DEFAULT_VISITS;
  }

  saveVisits(visits) {
    return this.setItem(STORAGE_KEYS.VISITS, visits);
  }

  /* --- Settings Methods --- */
  getSettings() {
    return this.getItem(STORAGE_KEYS.SETTINGS) || DEFAULT_SETTINGS;
  }

  saveSettings(settings) {
    return this.setItem(STORAGE_KEYS.SETTINGS, settings);
  }

  /* --- View Preferences --- */
  getViewPref(pageKey, defaultView = 'grid') {
    const prefs = this.getItem(STORAGE_KEYS.VIEW_PREFS) || {};
    return prefs[pageKey] || defaultView;
  }

  saveViewPref(pageKey, viewMode) {
    const prefs = this.getItem(STORAGE_KEYS.VIEW_PREFS) || {};
    prefs[pageKey] = viewMode;
    this.setItem(STORAGE_KEYS.VIEW_PREFS, prefs);
  }

/* ─────────────────────────────────────────────────────────────
 * EDICIÓN 2 — reemplaza getUsers() y saveUsers() por esto
 * ───────────────────────────────────────────────────────────── */
 
  /* --- Users Methods (ahora hablan con Django) --- */
 
  async getUsers() {
    return apiFetch(`${API_BASE}/usuarios/`);
  }
 
  async addUser(userData) {
    return apiFetch(`${API_BASE}/usuarios/`, {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }
 
  // Usa PATCH: solo cambia los campos que le envíes (ej. { status: 'Suspendido' }).
  async updateUser(id, updatedData) {
    return apiFetch(`${API_BASE}/usuarios/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updatedData)
    });
  }
 
  async deleteUser(id) {
    const result = await apiFetch(`${API_BASE}/usuarios/${id}/`, { method: 'DELETE' });
    return !!(result && result.deleted);
  }
 
  // Ya no existe guardar toda la lista de golpe. Falla a propósito para detectar
  // en dashboard.js los sitios que todavía la usan.
  saveUsers() {
    throw new Error('saveUsers() ya no existe: usa addUser / updateUser / deleteUser.');
  }
  /* --- Auth User Methods --- */
  getAuthUser() {
    return this.getItem(STORAGE_KEYS.AUTH_USER);
  }

  setAuthUser(userData) {
    return this.setItem(STORAGE_KEYS.AUTH_USER, userData);
  }

  clearAuthUser() {
    localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
  }

    /* --- Categorías Methods --- */
  async getCategories() {
    return apiFetch(`${API_BASE}/categorias/`);
  }
 
  async addCategory(name) {
    return apiFetch(`${API_BASE}/categorias/`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }
 
  async updateCategory(id, name) {
    return apiFetch(`${API_BASE}/categorias/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
  }
 
  async deleteCategory(id) {
    const result = await apiFetch(`${API_BASE}/categorias/${id}/`, { method: 'DELETE' });
    return !!(result && result.deleted);
  }
 
  /* --- Unidades de Medida Methods --- */
  async getUnits() {
    return apiFetch(`${API_BASE}/unidades/`);
  }
 
  async addUnit(name) {
    return apiFetch(`${API_BASE}/unidades/`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }
 
  async updateUnit(id, name) {
    return apiFetch(`${API_BASE}/unidades/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
  }
 
  async deleteUnit(id) {
    const result = await apiFetch(`${API_BASE}/unidades/${id}/`, { method: 'DELETE' });
    return !!(result && result.deleted);
  }
 

}

// Global Singleton Instance
window.storage = new StorageService();