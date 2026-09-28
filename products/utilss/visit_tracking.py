"""
Deduplicación de visitas por IP + día.

1) Agrega el modelo PageVisitLog a tu app 'products' (models.py) y corre
   las migraciones: python manage.py makemigrations products && python manage.py migrate

2) Usa la función `registrar_visita(request, page_name)` en cualquier vista
   donde quieras contar una visita (ver ejemplo de uso al final).

No hace falta ningún job para "reiniciar el día": como la fecha es parte
de la clave única, al día siguiente esa IP puede volver a contar porque
la combinación (page_name, ip_address, fecha_nueva) no existe todavía.
"""

from datetime import date

from django.db import models
from django.db.models import F
from django.utils import timezone

from products.models import VisitCounter,PageVisitLog  # ajusta si tu VisitCounter vive en otra app



# ---------------------------------------------------------------------------
# 2. Obtener la IP real del visitante (considerando proxies / load balancers)
# ---------------------------------------------------------------------------
def get_client_ip(request):
    """
    Si tu servidor está detrás de un proxy (Nginx, Render, Heroku, Cloudflare, etc.)
    la IP real del visitante viene en X-Forwarded-For, no en REMOTE_ADDR.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        # El primer valor de la lista es la IP original del cliente
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


# ---------------------------------------------------------------------------
# 3. Registrar la visita: incrementa VisitCounter SOLO la primera vez al día
# ---------------------------------------------------------------------------
def registrar_visita(request, page_name):
    """
    Llama a esta función desde la vista de la página que quieres contar.
    Devuelve True si fue una visita nueva (se incrementó el contador),
    False si esa IP ya había visitado esa página hoy.
    """
    ip = get_client_ip(request)
    if not ip:
        return False  # no se pudo determinar la IP, no contamos nada

    today = timezone.now().date()

    _, created = PageVisitLog.objects.get_or_create(
        page_name=page_name,
        ip_address=ip,
        date=today,
    )

    if created:
        counter, _ = VisitCounter.objects.get_or_create(
            page_name=page_name,
            date=today,
        )
        # F() evita condiciones de carrera si llegan varias visitas casi al mismo tiempo
        counter.visits = F('visits') + 1
        counter.save(update_fields=['visits'])

    return created


# ---------------------------------------------------------------------------
# 4. Ejemplo de uso en una vista de producto
# ---------------------------------------------------------------------------
"""
from .visit_tracking import registrar_visita

def detalle_producto_view(request, producto_id):
    producto = get_object_or_404(Producto, id=producto_id)

    registrar_visita(request, page_name=producto.nombre)
    # o si prefieres usar una clave estable en vez del nombre visible:
    # registrar_visita(request, page_name=f"producto-{producto.id}")

    return render(request, 'productos/detalle.html', {'producto': producto})
"""