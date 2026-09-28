"""
views/api_productos.py

API JSON pensada como reemplazo 1:1 de los métodos de storage.js:
  getProducts()        -> GET    /api/productos/
  addProduct(data)     -> POST   /api/productos/
  updateProduct(id, d) -> PUT    /api/productos/<id>/
  deleteProduct(id)    -> DELETE /api/productos/<id>/
  deleteProducts(ids)  -> POST   /api/productos/eliminar-masivo/

El JSON de entrada/salida usa las MISMAS claves que ya usaba storage.js
(image, brand, category, name, unit_price, unit_of_measure, bulk_price,
bulk_unit_of_measure, product_of_stock, date_added) para que el "puente"
en el nuevo storage.js sea casi transparente para dashboard.js.

category se recibe/devuelve como STRING (nombre), no como id, porque así
es como lo maneja el <select id="productCategory"> del modal. Internamente
se resuelve a un objeto Categoria (o se crea si no existe).
"""
import json

from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods
from django.db.models import Q

from products.models import Producto, Categoria , UnidadMedida
import json
import traceback
from django.core.exceptions import ValidationError

def es_administrador(user):
    return user.is_authenticated and user.is_staff


def _serializar(p: Producto) -> dict:
    """Convierte un Producto a exactamente la forma que storage.js manejaba."""
    return {
        'id': p.id,
        'image': p.image.url if p.image else '',
        'brand': p.brand,
        'category': p.category.name,
        'name': p.name,
        'unit_price': float(p.unit_price),
        'unit_of_measure': str(p.unit_of_measure) if p.unit_of_measure else None,
        'bulk_price': float(p.bulk_price) if p.bulk_price is not None else None,
        'bulk_unit_of_measure': str(p.bulk_unit_of_measure) if p.bulk_unit_of_measure else None,
        'date_added': p.date_added.isoformat(),
        'product_of_stock': p.product_of_stock,
        'is_visible': p.is_visible,   # 👈 agregar
    }


def _to_bool(value) -> bool:
    """El front manda 'true'/'false' como string (value de un <select>)."""
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() == 'true'


def _resolver_categoria(nombre: str) -> Categoria:
    nombre = (nombre or '').strip()
    categoria, _ = Categoria.objects.get_or_create(name=nombre)
    return categoria


def _aplicar_datos(producto: Producto, data: dict, archivo_imagen,es_creacion: bool):
    if 'name' in data:
        producto.name = (data.get('name') or '').strip()
    if 'brand' in data:
        producto.brand = (data.get('brand') or '').strip()
    if 'category' in data:
        producto.category = _resolver_categoria(data.get('category'))
    if 'unit_price' in data:
        producto.unit_price = data.get('unit_price') or 0
    if 'unit_of_measure' in data:
        producto.unit_of_measure = _resolver_unidad(data.get('unit_of_measure'))
    if 'bulk_price' in data:
        bulk_price = data.get('bulk_price')
        producto.bulk_price = bulk_price if bulk_price not in ('', None) else None
    if 'bulk_unit_of_measure' in data:
        bulk_unit = data.get('bulk_unit_of_measure')
        producto.bulk_unit_of_measure = _resolver_unidad(bulk_unit) if bulk_unit not in ('', None) else None
    if 'image' in data:
        producto.image = data.get('image') or ''

    if archivo_imagen:
        producto.image = archivo_imagen

    if 'product_of_stock' in data:
        producto.product_of_stock = _to_bool(data.get('product_of_stock'))

    if 'is_visible' in data:                          # 👈 agregar
        producto.is_visible = _to_bool(data.get('is_visible'))


def _resolver_unidad(nombre: str):
    nombre = (nombre or '').strip()
    unidad, _ = UnidadMedida.objects.get_or_create(name=nombre)
    return unidad
# ---------------------------------------------------------------------------
# GET  /api/productos/      -> storage.getProducts() (con filtros q/categoria/disponible)
# POST /api/productos/      -> storage.addProduct(productData)
# ---------------------------------------------------------------------------
@user_passes_test(es_administrador, login_url='login')
@require_http_methods(['GET', 'POST'])
def api_productos(request):
    if request.method == 'GET':
        query = request.GET.get('q', '').strip()
        categoria = request.GET.get('categoria', '').strip()  # nombre, no id
        disponible = request.GET.get('disponible', '').strip()

        productos = Producto.objects.select_related('category').all().order_by('-date_added')

        if query:
            productos = productos.filter(
                Q(name__icontains=query) |
                Q(brand__icontains=query) |
                Q(category__name__icontains=query)
            )
        if categoria:
            productos = productos.filter(category__name=categoria)
        if disponible == 'true':
            productos = productos.filter(product_of_stock=True)
        elif disponible == 'false':
            productos = productos.filter(product_of_stock=False)

        return JsonResponse([_serializar(p) for p in productos], safe=False)

    # POST -> crear (ahora recibe multipart/form-data, no JSON)
    data = request.POST  # campos de texto (name, brand, category, etc.)
    archivo_imagen = request.FILES.get('image')  # el archivo real, si vino uno


    # try:
    #     data = json.loads(request.body or '{}')
    # except json.JSONDecodeError:
    #     return JsonResponse({'error': 'JSON inválido.'}, status=400)

    if not data.get('name') or not data.get('brand') or not data.get('category'):
        return JsonResponse({'error': 'Nombre, marca y categoría son obligatorios.'}, status=400)

    producto = Producto()
    _aplicar_datos(producto, data, archivo_imagen, es_creacion=True)
    producto.full_clean(exclude=['id'])
    producto.save()
    return JsonResponse(_serializar(producto), status=201)

# ---------------------------------------------------------------------------
# PUT    /api/productos/<id>/  -> storage.updateProduct(id, updatedData)
# DELETE /api/productos/<id>/  -> storage.deleteProduct(id)
# ---------------------------------------------------------------------------
@user_passes_test(es_administrador, login_url='login')
@require_http_methods(['PUT', 'DELETE'])
def api_producto_detalle(request, pk):
    try:
        producto = Producto.objects.get(pk=pk)
    except Producto.DoesNotExist:
        return JsonResponse({'error': 'Producto no encontrado.'}, status=404)

    if request.method == 'DELETE':
        producto.delete()
        return JsonResponse({'deleted': True, 'id': pk})

    # PUT -> actualizar
    # try:
    #     data = json.loads(request.body or '{}')
    # except json.JSONDecodeError:
    #     return JsonResponse({'error': 'JSON inválido.'}, status=400)
    from django.http import QueryDict
    

    if request.content_type.startswith('multipart/form-data'):
        data = request.POST
        archivo_imagen = request.FILES.get('image')
    elif request.content_type.startswith('application/json'):
        try:
            data = json.loads(request.body or '{}')
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON inválido.'}, status=400)
        archivo_imagen = None
    else:
        data = QueryDict(request.body)
        archivo_imagen = None


    try:
        _aplicar_datos(producto, data, archivo_imagen, es_creacion=True)
        producto.full_clean(exclude=['id'])
        producto.save()
        return JsonResponse(_serializar(producto))
    except ValidationError as e:
        return JsonResponse({'error': e.message_dict}, status=400)
    except Exception as e:
        print(traceback.format_exc())  # queda en la terminal igual, por las dudas
        return JsonResponse({'error': str(e)}, status=500)
# ---------------------------------------------------------------------------
# POST /api/productos/eliminar-masivo/  -> storage.deleteProducts(ids)
# ---------------------------------------------------------------------------
@user_passes_test(es_administrador, login_url='login')
@require_http_methods(['POST'])
def api_productos_eliminar_masivo(request):
    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON inválido.'}, status=400)

    ids = data.get('ids', [])
    eliminados, _ = Producto.objects.filter(id__in=ids).delete()
    return JsonResponse({'deletedCount': eliminados})