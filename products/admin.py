from django.contrib import admin
from .models import Producto, Categoria, UnidadMedida, VisitCounter,PDFGenerationJob,CatalogoPDF
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



# Acción personalizada para ocultar productos
def marcar_como_no_visibles(modeladmin, request, queryset):
    queryset.update(is_visible=False)
    modeladmin.message_user(
        request,
        "Los productos seleccionados fueron ocultados del catálogo."
    )

# Acción personalizada para mostrar productos
def marcar_como_visibles(modeladmin, request, queryset):
    queryset.update(is_visible=True)
    modeladmin.message_user(
        request,
        "Los productos seleccionados ahora son visibles en el catálogo."
    )

# Personalización de la interfaz de administración para 'Producto'
class ProductoAdmin(admin.ModelAdmin):

    list_display = (
        'id',
        'name',
        'category',
        'unit_price',
        'unit_of_measure',
        'bulk_price',
        'bulk_unit_of_measure',
        'product_of_stock',
        'is_visible'
    )

    search_fields = (
        'name',
        'brand',
        'category__name'
    )

    list_filter = (
        'category',
        'product_of_stock',
        'is_visible'
    )

    fieldsets = (
        (None, {
            'fields': (
                'name',
                'brand',
                'category',
                'unit_price',
                'unit_of_measure',
                'bulk_price',
                'bulk_unit_of_measure',
                'image'
            )
        }),

        ('Disponibilidad', {
            'fields': (
                'product_of_stock',
                'is_visible'
            ),
            'classes': ('collapse',),
        }),
    )

    exclude = ('date_added',)

    def num_product(self, obj):
        return f"Producto {obj.pk}"

    num_product.short_description = "ID Producto"
    num_product.admin_order_field = "pk"

    actions = [
        marcar_como_agotados,
        marcar_como_disponibles,
        marcar_como_visibles,
        marcar_como_no_visibles,
    ]
    
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



@admin.register(PDFGenerationJob)
class PDFGenerationJobAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'status',
        'progress',
        'processed_products',
        'total_products',
        'tamano_legible',
        'created_at',
        'completed_at',
    )
    list_filter = ('status', 'created_at')
    readonly_fields = (
        'status',
        'total_products',
        'processed_products',
        'progress',
        'file',
        'tamano_bytes',
        'error_message',
        'created_at',
        'started_at',
        'completed_at',
    )
    ordering = ('-created_at',)

    # Es un registro histórico generado por el sistema: no se crea ni edita a mano
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(CatalogoPDF)
class CatalogoPDFAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'productos_hash',
        'total_productos',
        'generado_en',
    )
    readonly_fields = (
        'archivo',
        'productos_hash',
        'total_productos',
        'generado_en',
    )
    ordering = ('-generado_en',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False