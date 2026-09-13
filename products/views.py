from django.shortcuts import render
from django.core.paginator import Paginator
from .models import Producto, Categoria
# from django.db.models import Q
import unicodedata
# Create your views here.
from .models import VisitCounter
from django.shortcuts import render
from django.utils import timezone




def normalize(text):
    if text is None:
        return ""
    return ''.join(
        c for c in unicodedata.normalize('NFD', text)
        if unicodedata.category(c) != 'Mn'
    ).lower()

def catalog_products(request):
    
    today = timezone.localdate()  # Obtiene la fecha actual sin hora
    counter, created = VisitCounter.objects.get_or_create(
        page_name="catalogo",
        date=today
    )
    counter.visits += 1
    counter.save()
    
    # Obtener todos los productos
    products = Producto.objects.all()
    products_total_count = products.count()
    # Obtener solo las categorías que tienen productos asignados
    categories = Categoria.objects.filter(producto__isnull=False).distinct()  # Filtrar categorías con productos
    # Filtrar los productos si hay una consulta de búsqueda (por nombre o marca)
    query = request.GET.get('q', '').strip()  # Obtener el valor de búsqueda del parámetro 'q'
    
    # Si la consulta de búsqueda no está vacía, aplicamos los filtros
    if query:
        normalized_query = normalize(query)
        filtered_products = []
        for product in products:
            name = normalize(product.name)
            brand = normalize(product.brand)
            category = normalize(product.category.name)

            # Buscamos la frase completa normalizada en alguno de los campos normalizados
            if (normalized_query in name or
                normalized_query in brand or
                normalized_query in category):
                filtered_products.append(product)
        products = filtered_products
        
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
        "query": query,
        "querystring": querystring,  # <-- Aquí agregamos esta variable
        "selected_category": selected_category,
    })
    
    
    
    
    
    
    
    
    
    
    
    


# AGREGAR MAS ADELANTE CUANDO SE NECESITE
# from django.shortcuts import render
# from django.core.paginator import Paginator
# from .models import Producto, Categoria, VisitCounter
# import unicodedata

# def normalize(text):
#     if text is None:
#         return ""
#     return ''.join(
#         c for c in unicodedata.normalize('NFD', text)
#         if unicodedata.category(c) != 'Mn'
#     ).lower()

# def catalog_products(request):
#     # --- 💡 NUEVO BLOQUE: Controlar visitas únicas con cookie ---
#     cookie_name = "visited_catalogo"
#     if not request.COOKIES.get(cookie_name):
#         counter, created = VisitCounter.objects.get_or_create(page_name="catalogo")
#         counter.visits += 1
#         counter.save()
#     # -------------------------------------------------------------

#     products = Producto.objects.all()
#     products_total_count = products.count()
#     categories = Categoria.objects.filter(producto__isnull=False).distinct()
#     query = request.GET.get('q', '').strip()

#     if query:
#         normalized_query = normalize(query)
#         filtered_products = []
#         for product in products:
#             name = normalize(product.name)
#             brand = normalize(product.brand)
#             category = normalize(product.category.name)
#             if (normalized_query in name or
#                 normalized_query in brand or
#                 normalized_query in category):
#                 filtered_products.append(product)
#         products = filtered_products

#     selected_category = None
#     category_id = request.GET.get('category')
#     if category_id:
#         products = products.filter(category_id=category_id)
#         try:
#             selected_category = Categoria.objects.get(id=category_id)
#         except Categoria.DoesNotExist:
#             selected_category = None

#     order_by = request.GET.get('order_by_price')
#     if order_by == 'barato':
#         products = products.order_by('bulk_price')
#     elif order_by == 'caro':
#         products = products.order_by('-bulk_price')

#     paginator = Paginator(products, 16)
#     page_number = request.GET.get('page')
#     page_obj = paginator.get_page(page_number)

#     params = request.GET.copy()
#     if 'page' in params:
#         params.pop('page')
#     querystring = params.urlencode()

#     # --- 💡 NUEVO: responder con cookie si no existía ---
#     response = render(request, "shop-grid.html", {
#         "page_obj": page_obj,
#         "total_products_filter": len(products),
#         "products_total_count": products_total_count,
#         "categories": categories,
#         "query": query,
#         "querystring": querystring,
#         "selected_category": selected_category,
#     })

#     if not request.COOKIES.get(cookie_name):
#         # La cookie dura 24 horas (puedes cambiarlo)
#         response.set_cookie(cookie_name, "true", max_age=60*60*24)
#     return response
