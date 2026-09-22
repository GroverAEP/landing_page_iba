from django.db import models
# import unicodedata
from django.core.validators import MinValueValidator
from cloudinary.models import CloudinaryField
from django.utils import timezone

# Crear el modelo de categorías
class Categoria(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name="Nombre de la Categoría")
    # name_normalized = models.CharField(max_length=255, blank=True, editable=False)
    
    # def save(self, *args, **kwargs):
    #     self.name_normalized = self.normalize_text(self.name)
    #     super().save(*args, **kwargs)
    
    # @staticmethod
    # def normalize_text(text):
    #     import unicodedata
    #     text = text.lower()
    #     text = unicodedata.normalize('NFD', text)
    #     text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    #     return text
    
    def __str__(self):
        return self.name
    
class UnidadMedida(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name="Nombre Unidad de Medidad")

    def __str__(self):
        return self.name
    
class Producto(models.Model):
    
    # image = models.ImageField(upload_to='product/', verbose_name="Imagen del Producto")  # Imagen del producto
    image = CloudinaryField(verbose_name="Imagen del Producto", blank=True, null=True)  # Cambiado a CloudinaryField
    brand = models.CharField(max_length=255, verbose_name="Marca del Producto")  # Marca o fabricante del producto
    # brand_normalized = models.CharField(max_length=255, blank=True, editable=False)
    # Cambiar el campo 'category' para ser una clave foránea hacia 'Categoria'
    category = models.ForeignKey(Categoria, on_delete=models.CASCADE, verbose_name="Categoría")
    name = models.CharField(max_length=55, verbose_name="Nombre del Producto")  # Nombre del producto
    # name_normalized = models.CharField(max_length=100, blank=True, editable=False)
    
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name="Precio por unidad",
        validators=[MinValueValidator(0)]
    )
    unit_of_measure = models.ForeignKey(
        UnidadMedida,
        on_delete=models.CASCADE,
        verbose_name="Unidad de medida",
        related_name="productos_por_unidad"
    )

    # — Campos de paquete ahora obligatorios —
    bulk_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name="Precio por paquete",
        validators=[MinValueValidator(0)],
        blank=True,
        null=True
    )
    bulk_unit_of_measure = models.ForeignKey(
        UnidadMedida,
        on_delete=models.CASCADE,
        verbose_name="Unidad de paquete",
        related_name="productos_por_paquete",
        blank=True, 
        null=True
    )
    
    date_added = models.DateTimeField(auto_now_add=True, verbose_name="Fecha")  # Fecha en que se añadió el producto 
    product_of_stock = models.BooleanField(default=True, verbose_name="Disponible")  # Indica si el producto es destacado o no
    
    # def save(self, *args, **kwargs):
    #     self.name_normalized = self.normalize_text(self.name)
    #     self.brand_normalized = self.normalize_text(self.brand)
    #     super().save(*args, **kwargs)
    
    # @staticmethod
    # def normalize_text(text):
    #     text = text.lower()
    #     text = unicodedata.normalize('NFD', text)
    #     text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    #     return text
    
    def __str__(self):
        return self.name


    

class VisitCounter(models.Model):
    page_name = models.CharField(max_length=255, verbose_name="Página")
    visits = models.IntegerField(default=0, verbose_name="Visitas")
    date = models.DateField(default=timezone.now, verbose_name="Fecha")  # Nuevo campo

    class Meta:
        verbose_name = "Ver visitas"
        verbose_name_plural = "Ver visitas"
        unique_together = ('page_name', 'date')  # Evita duplicados por día

    def __str__(self):
        return f"{self.page_name} ({self.visits} visitas, {self.date})"


 
 
class CatalogoPDF(models.Model):
    """
    Guarda el último PDF de catálogo generado, para no reconstruirlo
    en cada request si ya hay uno vigente (ningún producto cambió
    desde la última generación).
 
    Se espera UN solo registro vigente por catálogo (por eso las vistas
    de ejemplo más abajo usan get_or_create / el más reciente). Si en
    tu caso necesitas varios catálogos (por ejemplo, uno por sucursal),
    agrega un campo que los distinga y ajusta el filtro en la vista.
    """
    archivo = models.FileField(upload_to="catalogos_pdf/")
    productos_hash = models.CharField(max_length=64, db_index=True)
    total_productos = models.PositiveIntegerField(default=0)
    generado_en = models.DateTimeField(auto_now=True)
 
    class Meta:
        verbose_name = "Catálogo PDF"
        verbose_name_plural = "Catálogos PDF"
 
    def __str__(self):
        return f"Catálogo PDF ({self.total_productos} productos) - {self.generado_en:%d/%m/%Y %H:%M}"
 





# Función que elimina la imagen del producto cuando se elimina el producto
# @receiver(post_delete, sender=Producto)
# def delete_product_image(sender, instance, **kwargs):
#     # Elimina la imagen de la carpeta del producto si existe
#     if instance.image:
#         if os.path.isfile(instance.image.path):
#             os.remove(instance.image.path)



"""
Agregar esto a tu models.py (o a un archivo aparte, p.ej. pdf_jobs/models.py,
e importarlo donde corresponda).

Este modelo NO reemplaza a CatalogoPDF: son complementarios.

- PDFGenerationJob  -> registra el PROCESO de una generación (mientras corre):
                       estado, cuántos productos van, cuándo empezó/terminó, error.
- CatalogoPDF       -> registra el RESULTADO final vigente (el archivo ya listo,
                       con su hash, tamaño, fecha y cantidad de productos).

Cuando un Job termina en 'completed', se crea (o actualiza) el CatalogoPDF
correspondiente a partir de ese resultado.
"""

from django.db import models


class PDFGenerationJob(models.Model):

    class Estado(models.TextChoices):
        PENDING = "pending", "Pendiente"
        PROCESSING = "processing", "Procesando"
        COMPLETED = "completed", "Completado"
        FAILED = "failed", "Fallido"

    status = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.PENDING,
        db_index=True,
    )

    total_products = models.PositiveIntegerField(default=0)
    processed_products = models.PositiveIntegerField(default=0)
    progress = models.PositiveSmallIntegerField(default=0)  # 0-100

    file = models.FileField(upload_to="catalogos_pdf/jobs/", null=True, blank=True)
    tamano_bytes = models.PositiveIntegerField(null=True, blank=True)

    error_message = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Trabajo de generación de PDF"
        verbose_name_plural = "Trabajos de generación de PDF"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Job {self.id} ({self.status}) - {self.processed_products}/{self.total_products}"

    @property
    def tamano_legible(self):
        """Ej: 3.4 MB — para mostrar en el historial sin abrir el archivo."""
        if not self.tamano_bytes:
            return "-"
        mb = self.tamano_bytes / (1024 * 1024)
        return f"{mb:.1f} MB" if mb >= 1 else f"{self.tamano_bytes / 1024:.0f} KB"

    def actualizar_progreso(self, procesados: int, total: int):
        """Actualiza processed_products y recalcula progress (%)."""
        self.processed_products = procesados
        self.total_products = total
        self.progress = int((procesados / total) * 100) if total else 0
        self.save(update_fields=["processed_products", "total_products", "progress"])