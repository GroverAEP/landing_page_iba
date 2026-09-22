"""
Vistas API para el catálogo de Categorías y Unidades de Medida.
Sigue el mismo patrón que view/api.py (JsonResponse, sin DRF).

Requiere que products/models.py tenga los modelos Categoria y UnidadMedida
(ya definidos por ti):

    class Categoria(models.Model):
        name = models.CharField(max_length=255, unique=True)

    class UnidadMedida(models.Model):
        name = models.CharField(max_length=255, unique=True)
"""
import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from products.models import Categoria, UnidadMedida


def _serialize_categoria(c):
    return {'id': c.id, 'name': c.name}


def _serialize_unidad(u):
    return {'id': u.id, 'name': u.name}


def _parse_json_body(request):
    try:
        return json.loads(request.body or '{}'), None
    except json.JSONDecodeError:
        return None, JsonResponse({'error': 'JSON inválido.'}, status=400)


# ─────────────────────────────────────────────────────────────
# Categorías
# ─────────────────────────────────────────────────────────────

@login_required
@require_http_methods(['GET', 'POST'])
def categorias_list_create(request):
    if request.method == 'GET':
        qs = Categoria.objects.all().order_by('name')
        return JsonResponse([_serialize_categoria(c) for c in qs], safe=False)

    data, error = _parse_json_body(request)
    if error:
        return error

    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'El nombre de la categoría es obligatorio.'}, status=400)

    if Categoria.objects.filter(name__iexact=name).exists():
        return JsonResponse({'error': 'Ya existe una categoría con ese nombre.'}, status=400)

    categoria = Categoria.objects.create(name=name)
    return JsonResponse(_serialize_categoria(categoria), status=201)


@login_required
@require_http_methods(['PATCH', 'PUT', 'DELETE'])
def categoria_detail(request, pk):
    try:
        categoria = Categoria.objects.get(pk=pk)
    except Categoria.DoesNotExist:
        return JsonResponse({'error': 'Categoría no encontrada.'}, status=404)

    if request.method == 'DELETE':
        categoria.delete()
        return JsonResponse({'deleted': True})

    data, error = _parse_json_body(request)
    if error:
        return error

    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'El nombre de la categoría es obligatorio.'}, status=400)

    if Categoria.objects.filter(name__iexact=name).exclude(pk=pk).exists():
        return JsonResponse({'error': 'Ya existe una categoría con ese nombre.'}, status=400)

    categoria.name = name
    categoria.save()
    return JsonResponse(_serialize_categoria(categoria))


# ─────────────────────────────────────────────────────────────
# Unidades de Medida
# ─────────────────────────────────────────────────────────────

@login_required
@require_http_methods(['GET', 'POST'])
def unidades_list_create(request):
    if request.method == 'GET':
        qs = UnidadMedida.objects.all().order_by('name')
        return JsonResponse([_serialize_unidad(u) for u in qs], safe=False)

    data, error = _parse_json_body(request)
    if error:
        return error

    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'El nombre de la unidad de medida es obligatorio.'}, status=400)

    if UnidadMedida.objects.filter(name__iexact=name).exists():
        return JsonResponse({'error': 'Ya existe una unidad de medida con ese nombre.'}, status=400)

    unidad = UnidadMedida.objects.create(name=name)
    return JsonResponse(_serialize_unidad(unidad), status=201)


@login_required
@require_http_methods(['PATCH', 'PUT', 'DELETE'])
def unidad_detail(request, pk):
    try:
        unidad = UnidadMedida.objects.get(pk=pk)
    except UnidadMedida.DoesNotExist:
        return JsonResponse({'error': 'Unidad de medida no encontrada.'}, status=404)

    if request.method == 'DELETE':
        unidad.delete()
        return JsonResponse({'deleted': True})

    data, error = _parse_json_body(request)
    if error:
        return error

    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'El nombre de la unidad de medida es obligatorio.'}, status=400)

    if UnidadMedida.objects.filter(name__iexact=name).exclude(pk=pk).exists():
        return JsonResponse({'error': 'Ya existe una unidad de medida con ese nombre.'}, status=400)

    unidad.name = name
    unidad.save()
    return JsonResponse(_serialize_unidad(unidad))