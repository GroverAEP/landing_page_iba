from django.shortcuts import render
from django.core.paginator import Paginator
from .models import Producto, Categoria
from urllib.parse import quote_plus
from django.db.models import Q
# Create your views here.
import unicodedata
from urllib.parse import urlencode

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
    # Obtener solo las categorías que tienen productos asignados
    categories = Categoria.objects.filter(producto__isnull=False).distinct()  # Filtrar categorías con productos
    
    # Filtrar los productos si hay una consulta de búsqueda (por nombre o marca)
    query = request.GET.get('q', '').strip()  # Obtener el valor de búsqueda del parámetro 'q'
    
    # Si la consulta de búsqueda no está vacía, aplicamos los filtros
    if query:
        words = query.split()
        normalized_words = [normalize(word) for word in words]

        filtered_products = []

        for product in products:
            name = normalize(product.name)
            brand = normalize(product.brand)
            category = normalize(product.category.name)

            # Verificamos si alguna de las palabras aparece en alguno de los campos
            any_word_matches = False
            for word in normalized_words:
                if word in name or word in brand or word in category:
                    any_word_matches = True
                    break

            # Si alguna palabra coincide, añadimos el producto
            if any_word_matches:
                filtered_products.append(product)

        products = filtered_products
    
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
    
    # Paginación: 12 productos por página
    paginator = Paginator(products, 12)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Obtener todos los parámetros GET excepto 'page'
    params = request.GET.copy()
    if 'page' in params:
        params.pop('page')

    querystring = params.urlencode()
    
    return render(request, "shop-grid.html", {
        "page_obj": page_obj,  # Paginación de productos
        "total_products": len(products),  # Total de productos
        "categories": categories,  # Las categorías disponibles
        "query":query,
        "querystring": querystring,  # <-- Aquí agregamos esta variable
    })
