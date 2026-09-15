from django.contrib import admin
from .models import Producto, Categoria, UnidadMedida, VisitCounter
from django.utils.translation import gettext_lazy as _
from .utils import generar_pdf_productos
from django.http import HttpResponse
from django.utils import timezone

# Acción personalizada para marcar varios productos como agotados
def marcar_como_agotados(modeladmin, request, queryset):
    queryset.update(product_of_stock=False)
    modeladmin.message_user(request, "Los productos seleccionados han sido marcados como agotados.")

# Acción personalizada para marcar varios productos como disponibles
def marcar_como_disponibles(modeladmin, request, queryset):
    queryset.update(product_of_stock=True)
    modeladmin.message_user(request, "Los productos seleccionados han sido marcados como disponibles.")

def descargar_pdf_productos(modeladmin, request, queryset):
    buffer = generar_pdf_productos(
        queryset,
        logo_url=None,
        fecha_generacion=timezone.now()
    )
    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = 'attachment; filename="productos.pdf"'
    return response
descargar_pdf_productos.short_description = "Descargar PDF de productos seleccionados"


# Personalización de la interfaz de administración para 'Producto'
class ProductoAdmin(admin.ModelAdmin):
    # Mostrar las columnas en la lista de productos
    list_display = ('id', 'name', 'category', 'unit_price', 'unit_of_measure', 'bulk_price', 'bulk_unit_of_measure', 'product_of_stock')

    # Filtro de búsqueda en la lista
    search_fields = ('name', 'brand', 'category__name')

    # Agregar filtros laterales para una mejor navegación
    list_filter = ('category', 'product_of_stock')

    # Personalización de las etiquetas en la interfaz
    fieldsets = (
        (None, {
            'fields': ('name', 'brand', 'category', 'unit_price', 'unit_of_measure', 'bulk_price', 'bulk_unit_of_measure', 'image')
        }),
        ('Disponibilidad', {
            'fields': ('product_of_stock',),
            'classes': ('collapse',),
        }),
    )

    # Excluir el campo 'date_added' del formulario en el admin
    exclude = ('date_added',)
    
    # Función personalizada para mostrar un número incremental de producto
    def num_product(self, obj):
        # El número de producto es el índice + 1
        return f"Producto {obj.pk}"
    num_product.short_description = 'ID Producto'  # Título de la columna

    # Hacer que la columna 'ID Producto' sea ordenable (por pk)
    num_product.admin_order_field = 'pk'  # Ordenar por el campo 'pk' (ID del producto)

    # Acciones personalizadas en lote
    actions = [marcar_como_agotados, marcar_como_disponibles,descargar_pdf_productos]  # Agregar las acciones aquí
    
# Registrar los modelos 'Producto' y 'Categoria' en el admin
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ('name',)  # Mostrar solo el nombre de la categoría
    search_fields = ('name',)  # Permite buscar por nombre de la categoría

class UnidadMedidadAdmin(admin.ModelAdmin):
    list_dispaly = ('name')


class MonthListFilter(admin.SimpleListFilter):
    title = _('Mes')
    parameter_name = 'month'

    def lookups(self, request, model_admin):
        # Devuelve los meses que existen en la tabla
        months = VisitCounter.objects.dates('date', 'month', order='DESC')
        return [(m.month, m.strftime('%B %Y')) for m in months]

    def queryset(self, request, queryset):
        if self.value():
            month = int(self.value())
            return queryset.filter(date__month=month)
        return queryset

@admin.register(VisitCounter)
class VisitCounterAdmin(admin.ModelAdmin):
    list_display = ('page_name', 'date', 'visits')
    list_filter = (MonthListFilter, 'page_name')  # Filtro por mes y página
    readonly_fields = ('page_name', 'visits', 'date')

    # Evitar cambios manuales
    def has_add_permission(self, request):
        return False
    def has_delete_permission(self, request, obj=None):
        return False
    def has_change_permission(self, request, obj=None):
        return False

    
# Registro del modelo 'Producto' con la clase 'ProductoAdmin'
admin.site.register(Producto, ProductoAdmin)
admin.site.register(Categoria, CategoriaAdmin)
admin.site.register(UnidadMedida, UnidadMedidadAdmin)

