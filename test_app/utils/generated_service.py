"""
Servicio que encapsula toda la lógica de generación del PDF.
Las vistas ya no conocen los detalles de "cómo" se genera, solo la invocan.

Usa tus funciones reales:
  - calcular_hash_productos(productos)
  - generar_pdf_productos(productos, fecha_generacion, logo_url=None)

NOTA sobre el progreso:
generar_pdf_productos no expone ningún hook por lote, así que el
Job no puede reportar "350/1000" mientras corre -- salta de 0% a
100% cuando termina. Si más adelante quieres la barra granular,
hay que agregarle un parámetro opcional `on_batch=None` a
generar_pdf_productos (no rompe a quien ya la llama sin ese kwarg)
y avisar ahí, lote a lote. Mientras tanto, este service funciona
igual, solo que la UI de progreso se ve "saltar" al final.
"""

from datetime import datetime
from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone
from django.views import View
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_GET
from django.contrib.staticfiles import finders
from products.models import PDFGenerationJob, CatalogoPDF, Producto  # ajustar import según tu app
from .utils import generar_pdf_productos, calcular_hash_productos  # ajustar import
import os
from io import BytesIO 
import requests








class PDFGeneradorService:
    """Genera (o reutiliza del caché) el PDF de catálogo para un Job dado."""

    def __init__(self, job_id: int, productos: list[Producto]):
        self.job_id = job_id
        self.job = None
        self.productos = productos

    # ------------------------------------------------------------------
    # Punto de entrada público
    # ------------------------------------------------------------------
    def ejecutar(self):
        self.job = PDFGenerationJob.objects.get(id=self.job_id)
        self._marcar_inicio()

        try:
            hash_actual = calcular_hash_productos(self.productos)
            catalogo = CatalogoPDF.objects.order_by("-generado_en").first()

            if catalogo and catalogo.productos_hash == hash_actual:
                # Caché vigente: no hay que regenerar nada, solo referenciar
                # el mismo archivo. Igual queda registrado como Job para
                # que el historial refleje que se sirvió este catálogo.
                self._marcar_completado_desde_cache(catalogo)

            else:
                self._generar_y_marcar_completado(self.productos, hash_actual, catalogo)

        except Exception as exc:
            self._marcar_fallido(exc)

    # ------------------------------------------------------------------
    # Pasos internos
    # ------------------------------------------------------------------
    def _marcar_inicio(self):
        self.job.status = PDFGenerationJob.Estado.PROCESSING
        self.job.started_at = timezone.now()
        self.job.total_products = self.job.total_products or 0
        self.job.save(update_fields=["status", "started_at", "total_products"])

    def _generar_y_marcar_completado(self, productos, hash_actual, catalogo):
        total = len(productos)
        self.job.total_products = total
        self.job.save(update_fields=["total_products"])

        def reportar_avance(procesados, total_productos):
            self.job.actualizar_progreso(procesados, total_productos)

        buffer = generar_pdf_productos(
            productos,
            fecha_generacion=timezone.now(),
            logo_url=os.path.join(settings.BASE_DIR, "static", "img", "logo.png"),
            on_batch=reportar_avance,
            batch_size=10,
        )

        contenido = buffer.getvalue()
        tamano = len(contenido)  # 👈 calculado en memoria, no depende de Cloudinary

        self.job.file.save("catalogo.pdf", ContentFile(contenido), save=False)
        self.job.tamano_bytes = tamano
        self.job.status = PDFGenerationJob.Estado.COMPLETED
        self.job.completed_at = timezone.now()
        self.job.progress = 100
        self.job.processed_products = total
        self.job.save()

        if catalogo is None:
            catalogo = CatalogoPDF()
        catalogo.archivo.save("catalogo.pdf", ContentFile(contenido), save=False)
        catalogo.productos_hash = hash_actual
        catalogo.total_productos = total
        catalogo.tamano_bytes = tamano  # 👈 se guarda acá para reusarlo después
        catalogo.save()

        self._limpiar_catalogos_antiguos(mantener=3)

    def _marcar_completado_desde_cache(self, catalogo):
        self.job.file.name = catalogo.archivo.name
        self.job.tamano_bytes = catalogo.tamano_bytes  # 👈 ya no llama a catalogo.archivo.size
        self.job.total_products = catalogo.total_productos
        self.job.processed_products = catalogo.total_productos
        self.job.status = PDFGenerationJob.Estado.COMPLETED
        self.job.completed_at = timezone.now()
        self.job.progress = 100
        self.job.save()
    # ------------------------------------------------------------------
    def _limpiar_catalogos_antiguos(self, mantener: int = 3):
        """Borra del storage y de la DB los CatalogoPDF más viejos,
        dejando como máximo `mantener` registros (y sus archivos)."""
        ids_a_conservar = (
            CatalogoPDF.objects.order_by("-generado_en")
            .values_list("id", flat=True)[:mantener]
        )
        antiguos = CatalogoPDF.objects.exclude(id__in=list(ids_a_conservar))

        for viejo in antiguos:
            if viejo.archivo:
                viejo.archivo.delete(save=False)
        antiguos.delete()

    def _marcar_fallido(self, exc: Exception):
        self.job.status = PDFGenerationJob.Estado.FAILED
        self.job.error_message = str(exc)
        self.job.completed_at = timezone.now()
        self.job.save(update_fields=["status", "error_message", "completed_at"])


 
@method_decorator(require_GET, name="dispatch")
class ListaGeneracionesView(View):
    def get(self, request):
        jobs = PDFGenerationJob.objects.filter(
            status=PDFGenerationJob.Estado.COMPLETED
        ).order_by("-completed_at")
 
        return render(request, "lista_generaciones.html", {"jobs": jobs})
 
