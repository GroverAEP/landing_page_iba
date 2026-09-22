/**
 * mock-data.js
 * Datos de demostración en memoria. Se reemplaza íntegramente cuando
 * Django REST Framework quede conectado; ningún otro módulo debe
 * depender de la forma interna de este archivo, solo de Api.* (api.js).
 */

const MockDB = (() => {
  const categories = ["Abarrotes", "Bebidas", "Lácteos", "Limpieza", "Cuidado personal", "Snacks"];
  const brands = ["Andina", "Costa Norte", "Sierra Fresh", "El Establo", "Puno Natural", "Marca Blanca"];
  const units = ["Unidad", "Kilogramo", "Gramo", "Litro", "Mililitro", "Metro", "Caja", "Paquete"];

  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randomPrice(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }

  const productNames = [
    "Arroz extra 5kg", "Aceite vegetal 1L", "Leche evaporada", "Detergente en polvo",
    "Papel higiénico x4", "Galletas integrales", "Fideo spaghetti 500g", "Azúcar rubia 1kg",
    "Shampoo anticaspa", "Jabón de tocador", "Atún en aceite", "Café molido 250g",
    "Yogurt natural 1L", "Mantequilla 200g", "Gaseosa 3L", "Agua mineral 625ml",
    "Salsa de tomate", "Mayonesa 500g", "Cereal de maíz", "Avena tradicional",
    "Insecticida spray", "Lejía 1L", "Toallas húmedas", "Pañales talla M",
    "Enlatado de durazno", "Harina preparada", "Vinagre blanco", "Sal de mesa",
  ];

  let products = productNames.map((name, i) => ({
    id: 1000 + i,
    name,
    brand: randomFrom(brands),
    category: randomFrom(categories),
    unitPrice: randomPrice(2.5, 45),
    unitOfMeasure: randomFrom(units),
    packagePrice: randomPrice(20, 400),
    unitsPerPackage: [6, 12, 24, 1, 10][i % 5],
    available: Math.random() > 0.18,
    visible: Math.random() > 0.12,
    image: null,
    createdAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
  }));

  let users = [
    { id: 1, username: "admin", email: "admin@ibafex.pe", role: "Administrator", status: "Active", createdAt: "2024-02-10T10:00:00Z", lastAccess: "2026-09-15T18:24:00Z" },
    { id: 2, username: "mgutierrez", email: "m.gutierrez@ibafex.pe", role: "Manager", status: "Active", createdAt: "2024-05-22T10:00:00Z", lastAccess: "2026-09-14T09:02:00Z" },
    { id: 3, username: "jrios", email: "j.rios@ibafex.pe", role: "Staff", status: "Active", createdAt: "2024-08-01T10:00:00Z", lastAccess: "2026-09-10T14:40:00Z" },
    { id: 4, username: "lcastro", email: "l.castro@ibafex.pe", role: "Staff", status: "Disabled", createdAt: "2025-01-15T10:00:00Z", lastAccess: "2026-07-02T11:11:00Z" },
    { id: 5, username: "vmendoza", email: "v.mendoza@ibafex.pe", role: "Manager", status: "Active", createdAt: "2025-03-30T10:00:00Z", lastAccess: "2026-09-16T08:55:00Z" },
  ];

  const devices = ["Desktop", "Mobile", "Tablet"];
  const browsers = ["Chrome", "Safari", "Firefox", "Edge"];
  const oss = ["Windows", "macOS", "Android", "iOS", "Linux"];
  const sources = ["Directo", "Google", "Facebook", "Instagram", "WhatsApp"];

  let visits = Array.from({ length: 60 }, (_, i) => {
    const date = new Date(Date.now() - i * 86400000 / 3);
    return {
      id: i + 1,
      date: date.toISOString().slice(0, 10),
      time: date.toISOString().slice(11, 16),
      visits: Math.floor(Math.random() * 40) + 5,
      uniqueVisitors: Math.floor(Math.random() * 25) + 3,
      device: randomFrom(devices),
      browser: randomFrom(browsers),
      os: randomFrom(oss),
      source: randomFrom(sources),
    };
  });

  function paginate(items, page = 1, pageSize = 10) {
    const total = items.length;
    const start = (page - 1) * pageSize;
    const results = items.slice(start, start + pageSize);
    return { results, count: total, page: Number(page), pageSize: Number(pageSize), totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  function sortItems(items, ordering) {
    if (!ordering) return items;
    const desc = ordering.startsWith("-");
    const field = desc ? ordering.slice(1) : ordering;
    const sorted = [...items].sort((a, b) => {
      const av = a[field], bv = b[field];
      if (typeof av === "string") return av.localeCompare(bv);
      return av - bv;
    });
    return desc ? sorted.reverse() : sorted;
  }

  return {
    // ---------------------------------------------------------- Products
    queryProducts({ search, category, availability, visibility, page = 1, pageSize = 10, ordering } = {}) {
      let items = products;
      if (search) {
        const q = search.toLowerCase();
        items = items.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q));
      }
      if (category) items = items.filter((p) => p.category === category);
      if (availability) items = items.filter((p) => (availability === "available" ? p.available : !p.available));
      if (visibility) items = items.filter((p) => (visibility === "visible" ? p.visible : !p.visible));
      items = sortItems(items, ordering);
      return paginate(items, page, pageSize);
    },
    createProduct(payload) {
      const id = Math.max(...products.map((p) => p.id)) + 1;
      const product = { id, createdAt: new Date().toISOString(), ...payload };
      products = [product, ...products];
      return product;
    },
    updateProduct(id, payload) {
      products = products.map((p) => (p.id === id ? { ...p, ...payload } : p));
      return products.find((p) => p.id === id);
    },
    deleteProduct(id) {
      products = products.filter((p) => p.id !== id);
      return { ok: true };
    },
    bulkProductAction(ids, action) {
      products = products.map((p) => {
        if (!ids.includes(p.id)) return p;
        if (action === "delete") return p; // manejado abajo
        if (action === "mark-available") return { ...p, available: true };
        if (action === "mark-unavailable") return { ...p, available: false };
        if (action === "make-visible") return { ...p, visible: true };
        if (action === "make-hidden") return { ...p, visible: false };
        return p;
      });
      if (action === "delete") products = products.filter((p) => !ids.includes(p.id));
      return { ok: true, affected: ids.length };
    },

    get categories() { return categories; },
    get brands() { return brands; },
    get units() { return units; },

    // -------------------------------------------------------------- Users
    users,
    queryUsers({ search, role, status, page = 1, pageSize = 10, ordering } = {}) {
      let items = users;
      if (search) {
        const q = search.toLowerCase();
        items = items.filter((u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
      }
      if (role) items = items.filter((u) => u.role === role);
      if (status) items = items.filter((u) => u.status === status);
      items = sortItems(items, ordering);
      return paginate(items, page, pageSize);
    },
    createUser(payload) {
      const id = Math.max(...users.map((u) => u.id)) + 1;
      const { confirmPassword, password, ...rest } = payload;
      const user = { id, createdAt: new Date().toISOString(), lastAccess: null, ...rest };
      users = [user, ...users];
      return user;
    },
    updateUser(id, payload) {
      const { confirmPassword, password, ...rest } = payload;
      users = users.map((u) => (u.id === id ? { ...u, ...rest } : u));
      return users.find((u) => u.id === id);
    },
    deleteUser(id) {
      users = users.filter((u) => u.id !== id);
      return { ok: true };
    },

    // ------------------------------------------------------------- Visits
    queryVisits({ page = 1, pageSize = 10, device, source } = {}) {
      let items = visits;
      if (device) items = items.filter((v) => v.device === device);
      if (source) items = items.filter((v) => v.source === source);
      return paginate(items, page, pageSize);
    },
    visitsSummary() {
      const total = visits.reduce((acc, v) => acc + v.visits, 0);
      const today = new Date().toISOString().slice(0, 10);
      const todayVisits = visits.filter((v) => v.date === today).reduce((a, v) => a + v.visits, 0);
      const uniqueVisitors = visits.reduce((a, v) => a + v.uniqueVisitors, 0);
      const last7 = visits.slice(0, 21);
      const byDay = {};
      last7.forEach((v) => { byDay[v.date] = (byDay[v.date] || 0) + v.visits; });
      const days = Object.keys(byDay).sort().slice(-7);
      return {
        totalVisits: total,
        todayVisits,
        uniqueVisitors,
        thisWeek: days.reduce((a, d) => a + byDay[d], 0),
        series: { labels: days, values: days.map((d) => byDay[d]) },
      };
    },

    // ---------------------------------------------------------- Dashboard
    dashboardSummary() {
      const totalProducts = products.length;
      const available = products.filter((p) => p.available).length;
      const outOfStock = totalProducts - available;
      const hidden = products.filter((p) => !p.visible).length;
      const totalVisits = visits.reduce((a, v) => a + v.visits, 0);
      return {
        totalProducts,
        available,
        outOfStock,
        hidden,
        totalCategories: categories.length,
        totalBrands: brands.length,
        totalVisits,
        recentActivity: [
          { text: `Se creó el producto "${products[0].name}".`, time: "hace 2 horas" },
          { text: "El usuario mgutierrez actualizó su perfil.", time: "hace 5 horas" },
          { text: `Se marcó "${products[3].name}" como agotado.`, time: "ayer" },
          { text: "Se descargó el catálogo en PDF.", time: "hace 2 días" },
        ],
      };
    },
  };
})();
