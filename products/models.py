from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
import os
# Create your models here.

# Crear el modelo de categorías
class Categoria(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name="Nombre de la Categoría")

    def __str__(self):
        return self.name
    
    
class Producto(models.Model):
    
    brand = models.CharField(max_length=255, verbose_name="Marca del Producto")  # Marca o fabricante del producto
    name = models.CharField(max_length=61, verbose_name="Nombre del Producto")  # Nombre del producto
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Precio")  # Precio del producto
    image = models.ImageField(upload_to='product/', verbose_name="Imagen del Producto")  # Imagen del producto
    
    # Cambiar el campo 'category' para ser una clave foránea hacia 'Categoria'
    category = models.ForeignKey(Categoria, on_delete=models.CASCADE, verbose_name="Categoría")
    
    date_added = models.DateTimeField(auto_now_add=True, verbose_name="Fecha")  # Fecha en que se añadió el producto 
    product_of_stock = models.BooleanField(default=True, verbose_name="Disponible")  # Indica si el producto es destacado o no
    
    def __str__(self):
        return self.name
    
    
# Función que elimina la imagen del producto cuando se elimina el producto
@receiver(post_delete, sender=Producto)
def delete_product_image(sender, instance, **kwargs):
    # Elimina la imagen de la carpeta del producto si existe
    if instance.image:
        if os.path.isfile(instance.image.path):
            os.remove(instance.image.path)