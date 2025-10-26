from django.contrib import admin
from .models import Producto, Categoria, UnidadMedida, VisitCounter

# === ACCIONES PERSONALIZADAS ===
def marcar_como_agotados(modeladmin, request, queryset):
    queryset.update(product_of_stock=False)
    modeladmin.message_user(request, "Los productos seleccionados han sido marcados como agotados.")

def marcar_como_disponibles(modeladmin, request, queryset):
    queryset.update(product_of_stock=True)
    modeladmin.message_user(request, "Los productos seleccionados han sido marcados como disponibles.")


# === ADMIN PRODUCTO ===
class ProductoAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'category', 'unit_price', 'unit_of_measure', 'bulk_price', 'bulk_unit_of_measure', 'product_of_stock')
    search_fields = ('name', 'brand', 'category__name')
    list_filter = ('category', 'product_of_stock')

    fieldsets = (
        (None, {
            'fields': ('name', 'brand', 'category', 'unit_price', 'unit_of_measure', 'bulk_price', 'bulk_unit_of_measure', 'image')
        }),
        ('Disponibilidad', {
            'fields': ('product_of_stock',),
            'classes': ('collapse',),
        }),
    )

    exclude = ('date_added',)
    actions = [marcar_como_agotados, marcar_como_disponibles]


# === ADMIN CATEGORÍA ===
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)


# === ADMIN UNIDAD DE MEDIDA ===
class UnidadMedidadAdmin(admin.ModelAdmin):
    list_display = ('name',)


# === ADMIN CONTADOR DE VISITAS ===
@admin.register(VisitCounter)
class VisitCounterAdmin(admin.ModelAdmin):
    list_display = ('page_name', 'visits')


# === REGISTROS ===
admin.site.register(Producto, ProductoAdmin)
admin.site.register(Categoria, CategoriaAdmin)
admin.site.register(UnidadMedida, UnidadMedidadAdmin)
