from django.shortcuts import render
from django.core.paginator import Paginator
from .models import Producto, Categoria
from django.db.models import Q
# Create your views here.
import unicodedata

def normalize(text):
    if text is None:
        return ""
    return ''.join(
        c for c in unicodedata.normalize('NFD', text)
        if unicodedata.category(c) != 'Mn'
    ).lower()
    
def catalog_products(request):
    # Obtener todos los productos
    products = Producto.objects.all()
    products_total_count = products.count()
    # Obtener solo las categorías que tienen productos asignados
    categories = Categoria.objects.filter(producto__isnull=False).distinct()  # Filtrar categorías con productos
    # Filtrar los productos si hay una consulta de búsqueda (por nombre o marca)
    query = request.GET.get('q', '').strip()  # Obtener el valor de búsqueda del parámetro 'q'
    # Si la consulta de búsqueda no está vacía, aplicamos los filtros
    if query:
        words = query.split()
        q_objects = Q()
        for word in words:
            normalized_word = normalize(word)
            q_objects |= (
                Q(name__icontains=normalized_word) |
                Q(brand__icontains=normalized_word) |
                Q(category__name__icontains=normalized_word)
            )
        products = Producto.objects.filter(q_objects)
    
    selected_category = None
    # Filtrar productos por categoría seleccionada si es necesario
    category_id = request.GET.get('category')
    if category_id:
        products = products.filter(category_id=category_id)  # Filtrar productos por categoría seleccionada
        try:
            selected_category = Categoria.objects.get(id=category_id)
        except Categoria.DoesNotExist:
            selected_category = None
    
    # Ordenar los productos por precio si se pasa el parámetro 'order_by_price'
    order_by = request.GET.get('order_by_price')
    if order_by == 'barato':
        products = products.order_by('bulk_price')  # Ordenar de menor a mayor precio
    elif order_by == 'caro':
        products = products.order_by('-bulk_price')  # Ordenar de mayor a menor precio
    
    # Paginación: 16 productos por página
    paginator = Paginator(products, 16)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Obtener todos los parámetros GET excepto 'page'
    params = request.GET.copy()
    if 'page' in params:
        params.pop('page')

    querystring = params.urlencode()
    
    return render(request, "shop-grid.html", {
        "page_obj": page_obj,  # Paginación de productos
        "total_products_filter": len(products),  # Total de productos
        "products_total_count": products_total_count,
        "categories": categories,  # Las categorías disponibles
        "query":query,
        "querystring": querystring,  # <-- Aquí agregamos esta variable
        "selected_category": selected_category,
    })