"""
views/productos.py
Equivalente a: storage.getProducts(), addProduct(), updateProduct(),
deleteProduct(), deleteProducts().
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import user_passes_test
from django.contrib import messages
from django.db.models import Q
from django.core.paginator import Paginator

from products.models import Producto, Categoria
from .forms import ProductoForm


def es_administrador(user):
    return user.is_authenticated and user.is_staff


# storage.getProducts() + los filtros que ya tenías en panel_admin
@user_passes_test(es_administrador, login_url='login')
def panel_admin(request):
    query = request.GET.get('q', '').strip()
    categoria_id = request.GET.get('categoria', '').strip()
    disponible = request.GET.get('disponible', '').strip()

    productos = Producto.objects.select_related('category').all().order_by('-date_added')

    if query:
        productos = productos.filter(
            Q(name__icontains=query) |
            Q(brand__icontains=query) |
            Q(category__name__icontains=query)
        )

    if categoria_id:
        productos = productos.filter(category__id=categoria_id)

    if disponible == '1':
        productos = productos.filter(product_of_stock=True)
    elif disponible == '0':
        productos = productos.filter(product_of_stock=False)

    disponibles = productos.filter(product_of_stock=True).count()
    agotados = productos.filter(product_of_stock=False).count()
    categorias = Categoria.objects.all().order_by('name')

    paginator = Paginator(productos, 20)
    page_obj = paginator.get_page(request.GET.get('page'))

    return render(request, 'django_app/panel.html', {
        'productos': page_obj,
        'disponibles': disponibles,
        'agotados': agotados,
        'query': query,
        'categoria_id': categoria_id,
        'disponible': disponible,
        'categorias': categorias,
    })


# storage.addProduct(productData)
@user_passes_test(es_administrador, login_url='login')
def producto_crear(request):
    if request.method == 'POST':
        form = ProductoForm(request.POST)
        if form.is_valid():
            producto = form.save()
            messages.success(request, f'Producto "{producto.name}" creado correctamente.')
            return redirect('panel_admin')
    else:
        form = ProductoForm()
    return render(request, 'productos/producto_form.html', {'form': form, 'modo': 'crear'})


# storage.updateProduct(id, updatedData)
@user_passes_test(es_administrador, login_url='login')
def producto_editar(request, pk):
    producto = get_object_or_404(Producto, pk=pk)
    if request.method == 'POST':
        form = ProductoForm(request.POST, instance=producto)
        if form.is_valid():
            form.save()
            messages.success(request, 'Producto actualizado correctamente.')
            return redirect('panel_admin')
    else:
        form = ProductoForm(instance=producto)
    return render(request, 'productos/producto_form.html', {'form': form, 'modo': 'editar', 'producto': producto})


# storage.deleteProduct(id)
@user_passes_test(es_administrador, login_url='login')
def producto_eliminar(request, pk):
    producto = get_object_or_404(Producto, pk=pk)
    if request.method == 'POST':
        nombre = producto.name
        producto.delete()
        messages.success(request, f'Producto "{nombre}" eliminado.')
        return redirect('panel_admin')
    return render(request, 'productos/producto_confirmar_eliminar.html', {'producto': producto})


# storage.deleteProducts(ids) -> eliminación masiva
@user_passes_test(es_administrador, login_url='login')
def productos_eliminar_masivo(request):
    if request.method == 'POST':
        ids = request.POST.getlist('ids')
        eliminados, _ = Producto.objects.filter(id__in=ids).delete()
        messages.success(request, f'{eliminados} producto(s) eliminado(s).')
    return redirect('panel_admin')