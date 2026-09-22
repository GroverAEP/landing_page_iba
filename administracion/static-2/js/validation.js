/**
 * validation.js
 * Validadores reutilizables. Los mensajes que ve el usuario están en
 * español; los nombres de función están en inglés.
 */

const Validators = {
  required(value) {
    if (value === undefined || value === null) return "Este campo es obligatorio.";
    if (typeof value === "string" && value.trim() === "") return "Este campo es obligatorio.";
    return null;
  },
  email(value) {
    if (!value) return null;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value) ? null : "Ingresa un correo electrónico válido.";
  },
  minLength(min) {
    return (value) => (value && value.length < min ? `Debe tener al menos ${min} caracteres.` : null);
  },
  nonNegativeNumber(value) {
    if (value === "" || value === undefined || value === null) return null;
    const n = Number(value);
    if (Number.isNaN(n)) return "Ingresa un valor numérico válido.";
    if (n < 0) return "El valor no puede ser negativo.";
    return null;
  },
  positiveInteger(value) {
    if (value === "" || value === undefined || value === null) return null;
    const n = Number(value);
    if (Number.isNaN(n) || !Number.isInteger(n)) return "Ingresa un número entero.";
    if (n <= 0) return "El valor debe ser mayor que 0.";
    return null;
  },
  matches(otherValue, message) {
    return (value) => (value === otherValue ? null : message);
  },
  imageFile(file, { maxSizeMb = 5, allowed = ["image/jpeg", "image/png", "image/webp"] } = {}) {
    if (!file) return null;
    if (!allowed.includes(file.type)) return "La imagen debe estar en un formato válido (JPG, PNG o WebP).";
    if (file.size > maxSizeMb * 1024 * 1024) return `La imagen no debe superar los ${maxSizeMb} MB.`;
    return null;
  },
};

/**
 * Ejecuta una lista de reglas sobre un valor y devuelve el primer error.
 * rules: array de funciones (value) => string|null
 */
function runValidators(value, rules) {
  for (const rule of rules) {
    const error = rule(value);
    if (error) return error;
  }
  return null;
}

/**
 * Aplica/limpia el estado visual de error sobre un <div class="field">.
 * Espera dentro: .field-input|.field-select y .field-error
 */
function setFieldError(fieldEl, message) {
  const input = fieldEl.querySelector(".field-input, .field-select");
  const errorEl = fieldEl.querySelector(".field-error");
  if (message) {
    fieldEl.classList.add("is-invalid");
    if (input) input.classList.add("has-error");
    if (errorEl) errorEl.textContent = message;
    if (input) input.setAttribute("aria-invalid", "true");
  } else {
    fieldEl.classList.remove("is-invalid");
    if (input) input.classList.remove("has-error");
    if (input) input.removeAttribute("aria-invalid");
  }
}

/**
 * Valida un formulario completo dado un mapa { fieldName: { el, rules, getValue } }
 * Devuelve true si todo es válido.
 */
function validateForm(fieldsMap) {
  let isValid = true;
  for (const name in fieldsMap) {
    const { el, rules, getValue } = fieldsMap[name];
    const value = getValue ? getValue() : el.querySelector(".field-input, .field-select")?.value;
    const error = runValidators(value, rules);
    setFieldError(el, error);
    if (error) isValid = false;
  }
  return isValid;
}
