"""
Vistas relacionadas al historial de catálogos PDF.

Se apoyan en:
  - PDFGenerationJob / CatalogoPDF  (products/models.py)
  - PDFGeneradorService             (products/services/pdf_generador_service.py)

Ajusta los imports según dónde vivan realmente estos módulos en tu proyecto.
"""

import threading

from django.contrib.auth.decorators import login_required
from django.db.models import Avg, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from products.models import PDFGenerationJob, Producto, ConfiguracionPDF  # ajustar import según tu app
from test_app.utils.generated_service import PDFGeneradorService  # ajustar import
from django.http import FileResponse, Http404, JsonResponse
from django.urls import reverse

LIMITE_HISTORIAL_BYTES = 180 * 1024  # 180 KB   
DIAS_EXPIRACION_PDF = 7  # 👈 nuevo, junto a LIMITE_HISTORIAL_BYTES


from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
import json
from products.models import ConfiguracionPDF  # ajustar import según tu proyecto

@login_required
@require_POST
def actualizar_configuracion_pdf(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "message": "JSON inválido."}, status=400)

    dias_expiracion = payload.get("pdf_expiry_days")
    limite_mb = payload.get("pdf_limit_mb")

    try:
        dias_expiracion = int(dias_expiracion)
        limite_mb = int(limite_mb)
        if dias_expiracion < 1 or limite_mb < 1:
            raise ValueError
    except (TypeError, ValueError):
        return JsonResponse(
            {"success": False, "message": "Los valores deben ser números enteros mayores a 0."},
            status=400,
        )

    config = ConfiguracionPDF.obtener()
    config.dias_expiracion = dias_expiracion
    config.limite_historial_mb = limite_mb  # ajustar nombre exacto del campo si es distinto
    config.save()

    return JsonResponse({
        "success": True,
        "dias_expiracion": config.dias_expiracion,
        "limite_historial_mb": config.limite_historial_mb,
    })








from datetime import timedelta
from django.utils import timezone
def _limpiar_catalogos_expirados():
    """
    Borra (archivo + registro) los catálogos completados hace más de
    DIAS_EXPIRACION_PDF días que nunca fueron descargados/guardados.
    """
    config = ConfiguracionPDF.obtener()
    limite_fecha = timezone.now() - timedelta(days=config.dias_expiracion)
    expirados = PDFGenerationJob.objects.filter(
        status=PDFGenerationJob.Estado.COMPLETED,
        descargado=False,
        completed_at__lt=limite_fecha,
    )

    for job in expirados:
        if job.file:
            job.file.delete(save=False)
        job.delete()

def _formatear_tamano(total_bytes):
    """Misma lógica que PDFGenerationJob.tamano_legible pero para un total agregado."""
    if not total_bytes:
        return "0"
    mb = total_bytes / (1024 * 1024)
    return f"{mb:.1f} MB" if mb >= 1 else f"{total_bytes / 1024:.0f} KB"


# ----------------------------------------------------------------------
# Listado (ya existía; se agregan los agregados para los KPIs del HTML)
# ----------------------------------------------------------------------
@method_decorator(require_GET, name="dispatch")
class ListaGeneracionesView(View):
    def get(self, request):
            _limpiar_catalogos_expirados()
            config = ConfiguracionPDF.obtener()

            jobs = PDFGenerationJob.objects.filter(
                status=PDFGenerationJob.Estado.COMPLETED
            ).order_by("-completed_at")

            aggregates = jobs.aggregate(
                total_bytes=Sum("tamano_bytes"),
                avg_products=Avg("total_products"),
            )

            context = {
                "jobs": jobs,
                "tamano_total_legible": _formatear_tamano(aggregates["total_bytes"]),
                "promedio_productos": (
                    round(aggregates["avg_products"]) if aggregates["avg_products"] else None
                ),
                "dias_expiracion": config.dias_expiracion,  # 👈 nuevo
            }
            return render(request, "django_app/listpdfs.html", context)


    
# ----------------------------------------------------------------------
# Descargar el PDF de un job (lee el archivo del disco y lo sirve directo,
# sin depender de MEDIA_URL/MEDIA_ROOT en urls.py)
# ----------------------------------------------------------------------
import cloudinary.utils
import urllib.request
from django.http import Http404, FileResponse, HttpResponse
@require_GET
def descargar_catalogo_pdf(request, job_id):
    job = get_object_or_404(PDFGenerationJob, id=job_id)

    if job.status != PDFGenerationJob.Estado.COMPLETED or not job.file:
        raise Http404("El archivo aún no está disponible.")


    if not job.descargado:               # 👈 nuevo
        job.descargado = True
        job.save(update_fields=["descargado"])

    nombre_descarga = f"Ibafex_Catalogo_{job.id}.pdf"



    signed_url, _ = cloudinary.utils.cloudinary_url(
        job.file.name,
        resource_type="raw",
        sign_url=True,
    )

    # 👇 TEMPORAL: sin try/except, para ver el error real en pantalla
    print(f"[DEBUG] Intentando descargar desde: {signed_url}")
    with urllib.request.urlopen(signed_url) as remote_file:
        pdf_bytes = remote_file.read()

    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{nombre_descarga}"'
    return response




# ----------------------------------------------------------------------
# Generar un catálogo nuevo (botón "Generar nuevo catálogo")
# ----------------------------------------------------------------------
import json

@method_decorator([login_required, require_POST], name="dispatch")
class GenerarCatalogoPDFView(View):
    def post(self, request):
        config = ConfiguracionPDF.obtener()
        limite_bytes = config.limite_historial_mb * 1024 * 1024

        tamano_actual = (
            PDFGenerationJob.objects.filter(
                status=PDFGenerationJob.Estado.COMPLETED
            ).aggregate(total=Sum("tamano_bytes"))["total"]
            or 0
        )

        # --- Límite de espacio ocupado por el historial ---
        tamano_actual = (
            PDFGenerationJob.objects.filter(
                status=PDFGenerationJob.Estado.COMPLETED
            ).aggregate(total=Sum("tamano_bytes"))["total"]
            or 0
        )

        if tamano_actual >= limite_bytes:
            return JsonResponse(
                {
                    "error": (
                        f"El historial de catálogos ya ocupa "
                        f"{_formatear_tamano(tamano_actual)}, superando el límite de "
                        f"{_formatear_tamano(limite_bytes)}. "
                        "Eliminá catálogos antiguos antes de generar uno nuevo."
                    ),
                    "limit_reached": True,          # 👈 agregar
                    "tamano_actual": tamano_actual,  # 👈 agregar
                    "limite_bytes": limite_bytes,  # 👈 agregar
                },
                status=400,
            )
        # --- fin del límite ---

        try:
            payload = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            payload = {}

        product_ids = payload.get("product_ids") or []

        if product_ids:
            productos = list(Producto.objects.filter(id__in=product_ids))
            if not productos:
                return JsonResponse(
                    {"error": "Los productos seleccionados ya no existen."},
                    status=400,
                )
        else:
            productos = list(Producto.objects.all())

        if not productos:
            return JsonResponse(
                {"error": "No hay productos en el catálogo para generar el PDF."},
                status=400,
            )

        job = PDFGenerationJob.objects.create(total_products=len(productos))

        def _run():
            PDFGeneradorService(job.id, productos).ejecutar()

        threading.Thread(target=_run, daemon=True).start()

        return JsonResponse({"job_id": job.id, "status": job.status}, status=202)


# ----------------------------------------------------------------------
# Consultar progreso (polling desde el frontend mientras el job corre)
# ----------------------------------------------------------------------
@require_GET
def estado_catalogo_pdf(request, job_id):
    job = get_object_or_404(PDFGenerationJob, id=job_id)

    file_url = None
    if job.status == PDFGenerationJob.Estado.COMPLETED and job.file:
        file_url = request.build_absolute_uri(
            reverse("django_app:descargar_catalogo_pdf", args=[job.id])
        )

    return JsonResponse({
        "id": job.id,
        "status": job.status,
        "status_display": job.get_status_display(),
        "progress": job.progress,
        "processed_products": job.processed_products,
        "total_products": job.total_products,
        "error_message": job.error_message,
        "file_url": file_url,
        "tamano_legible": job.tamano_legible,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    })


# ----------------------------------------------------------------------
# Eliminar un catálogo del historial (botón de la papelera)
# ----------------------------------------------------------------------
@login_required
@require_http_methods(["DELETE", "POST"])
def eliminar_catalogo_pdf(request, job_id):
    job = get_object_or_404(PDFGenerationJob, id=job_id)

    if job.file:
        job.file.delete(save=False)  # borra el archivo físico del storage
    job.delete()

    return JsonResponse({"deleted": True, "id": job_id})