from django.shortcuts import render
from django.core.paginator import Paginator
from .models import Producto, Categoria
from urllib.parse import quote_plus
from django.http import JsonResponse
# Create your views here.

def catalog_products(request):
    # Obtener todos los productos
    products = Producto.objects.all()
    # Obtener solo las categorías que tienen productos asignados
    categories = Categoria.objects.filter(producto__isnull=False).distinct()  # Filtrar categorías con productos
    
    # Filtrar los productos si hay una consulta de búsqueda (por nombre o marca)
    query = request.GET.get('q', '').strip()  # Obtener el valor de búsqueda del parámetro 'q'
    if query:
        products = products.filter(name__icontains=query) | products.filter(brand__icontains=query)
    
    # Filtrar productos por categoría seleccionada si es necesario
    category_id = request.GET.get('category')
    if category_id:
        products = products.filter(category_id=category_id)  # Filtrar productos por categoría seleccionada

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
    
    return render(request, "shop-grid.html", {
        "page_obj": page_obj,  # Paginación de productos
        "total_products": products.count(),  # Total de productos
        "categories": categories,  # Las categorías disponibles
        "query":query,
    })
