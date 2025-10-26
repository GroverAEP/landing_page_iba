from django.db import models
# import unicodedata
from django.core.validators import MinValueValidator
from cloudinary.models import CloudinaryField

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
    image = CloudinaryField(verbose_name="Imagen del Producto")  # Cambiado a CloudinaryField
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

    class Meta:
        verbose_name = "Ver visitas"
        verbose_name_plural = "Ver visitas"

    def __str__(self):
        return f"{self.page_name} ({self.visits} visitas)"
    
    
# Función que elimina la imagen del producto cuando se elimina el producto
# @receiver(post_delete, sender=Producto)
# def delete_product_image(sender, instance, **kwargs):
#     # Elimina la imagen de la carpeta del producto si existe
#     if instance.image:
#         if os.path.isfile(instance.image.path):
#             os.remove(instance.image.path)

