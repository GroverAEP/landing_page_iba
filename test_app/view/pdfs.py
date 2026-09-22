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

from products.models import PDFGenerationJob, Producto  # ajustar import según tu app
from test_app.utils.generated_service import PDFGeneradorService  # ajustar import
from django.http import FileResponse, Http404, JsonResponse
from django.urls import reverse

def _formatear_tamano(total_bytes):
    """Misma lógica que PDFGenerationJob.tamano_legible pero para un total agregado."""
    if not total_bytes:
        return "—"
    mb = total_bytes / (1024 * 1024)
    return f"{mb:.1f} MB" if mb >= 1 else f"{total_bytes / 1024:.0f} KB"


# ----------------------------------------------------------------------
# Listado (ya existía; se agregan los agregados para los KPIs del HTML)
# ----------------------------------------------------------------------
@method_decorator(require_GET, name="dispatch")
class ListaGeneracionesView(View):
    def get(self, request):
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
        }
        return render(request, "django_app/listpdfs.html", context)

# ----------------------------------------------------------------------
# Descargar el PDF de un job (lee el archivo del disco y lo sirve directo,
# sin depender de MEDIA_URL/MEDIA_ROOT en urls.py)
# ----------------------------------------------------------------------
@require_GET
def descargar_catalogo_pdf(request, job_id):
    job = get_object_or_404(PDFGenerationJob, id=job_id)

    if job.status != PDFGenerationJob.Estado.COMPLETED or not job.file:
        raise Http404("El archivo aún no está disponible.")

    nombre_descarga = f"Ibafex_Catalogo_{job.id}.pdf"
    return FileResponse(
        job.file.open("rb"),
        as_attachment=True,
        filename=nombre_descarga,
    )





# ----------------------------------------------------------------------
# Generar un catálogo nuevo (botón "Generar nuevo catálogo")
# ----------------------------------------------------------------------
import json

@method_decorator([login_required, require_POST], name="dispatch")
class GenerarCatalogoPDFView(View):
    def post(self, request):
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