from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout
from django.contrib.auth.decorators import user_passes_test

import csv
from django.http import HttpResponse
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.templatetags.static import static
from products.models import Producto  # 👈 ajusta el import a tu modelo real

import io
from django.contrib import messages
from django.shortcuts import get_object_or_404
 
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .form import ProductoForm, ImportarCSVForm
from products.models import Producto, Categoria, UnidadMedida

from django.db.models import Q
from django.shortcuts import render




 
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.shortcuts import render, redirect
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
 
User = get_user_model()
 # --- Paso 1: el usuario pide el enlace con su correo ---
def recuperar_password(request):
    enviado = False
    hubo_error = False
    error_envio = None  # aquí guardamos el mensaje de error real, si algo falla
    print("ejecutando")
    if request.method == 'POST':
        email = request.POST.get('email', '').strip()
        if not email:
            hubo_error = True
            print("not email")
        else:
            usuarios = User.objects.filter(email__iexact=email, is_active=True)
            try:
                for user in usuarios:
                    uid = urlsafe_base64_encode(force_bytes(user.pk))
                    token = default_token_generator.make_token(user)
                    enlace = request.build_absolute_uri(
                        reverse('resetear_password', kwargs={'uidb64': uid, 'token': token})
                    )
                    cuerpo_html = render_to_string('email_recuperar_password.html', {
                        'user': user,
                        'enlace': enlace,
                    })
                    send_mail(
                        subject='Recupera tu contraseña — Panel Administrativo',
                        message=f'Ingresa a este enlace para restablecer tu contraseña: {enlace}',
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[user.email],
                        html_message=cuerpo_html,
                        fail_silently=False,
                    )
                # Por seguridad, mostramos el mismo mensaje exista o no el correo
                # en el sistema — así nadie puede usar este formulario para
                # adivinar qué correos están registrados.
                enviado = True

            except Exception as e:
                # 👇 ESTO es lo que te va a mostrar el error real en pantalla.
                # Solo para depurar — hay que quitarlo antes de subir a producción,
                # porque muestra detalles internos que no debe ver un usuario normal.
                import traceback
                print("=" * 60)
                print("ERROR AL ENVIAR EL CORREO:")
                traceback.print_exc()
                print("=" * 60)
                error_envio = f"{type(e).__name__}: {e}"
                enviado = False

    return render(request, 'recuperar_password.html', {
        'enviado': enviado,
        'error_envio': error_envio,  # se lo pasamos al template para mostrarlo temporalmente
        'form': type('FormFalso', (), {'errors': hubo_error})(),  # compatibilidad con {% if form.errors %}
    })
 
 
# --- Paso 2: el usuario abre el enlace del correo y define la nueva contraseña ---
def resetear_password(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None
 
    token_valido = user is not None and default_token_generator.check_token(user, token)
 
    if not token_valido:
        return render(request, 'resetear_password.html', {
            'token_valido': False,
        })
 
    error = None
 
    if request.method == 'POST':
        password1 = request.POST.get('password1', '')
        password2 = request.POST.get('password2', '')
 
        if not password1 or not password2:
            error = 'Completa ambos campos.'
        elif password1 != password2:
            error = 'Las contraseñas no coinciden.'
        elif len(password1) < 8:
            error = 'La contraseña debe tener al menos 8 caracteres.'
        else:
            user.set_password(password1)
            user.save()
            messages.success(request, 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.')
            return redirect('login')
 
    return render(request, 'resetear_password.html', {
        'token_valido': True,
        'error': error,
    })





















def es_administrador(user):
    """Solo permite el acceso a usuarios logueados con rol de staff/admin."""
    return user.is_authenticated and user.is_staff


 
# --- Crear producto ---
@user_passes_test(es_administrador, login_url='login')
def crear_producto(request):
    if request.method == 'POST':
        form = ProductoForm(request.POST, request.FILES)
        if form.is_valid():
            form.save()
            messages.success(request, 'Producto creado correctamente.')
            return redirect('panel')
    else:
        form = ProductoForm()
 
    return render(request, 'producto_form.html', {
        'form': form,
        'modo': 'crear',
        'categorias': Categoria.objects.all(),
        'unidades': UnidadMedida.objects.all(),
    })
 
 
# --- Editar producto ---
@user_passes_test(es_administrador, login_url='login')
def editar_producto(request, producto_id):
    producto = get_object_or_404(Producto, id=producto_id)
    if request.method == 'POST':
        form = ProductoForm(request.POST, request.FILES, instance=producto)
        if form.is_valid():
            form.save()
            messages.success(request, 'Producto actualizado correctamente.')
            return redirect('panel')
    else:
        form = ProductoForm(instance=producto)
 
    return render(request, 'producto_form.html', {
        'form': form,
        'modo': 'editar',
        'producto': producto,
        'categorias': Categoria.objects.all(),
        'unidades': UnidadMedida.objects.all(),
    })
 
 
# --- Eliminar producto ---
@user_passes_test(es_administrador, login_url='login')
def eliminar_producto(request, producto_id):
    producto = get_object_or_404(Producto, id=producto_id)
    if request.method == 'POST':
        producto.delete()
        messages.success(request, 'Producto eliminado.')
        return redirect('panel')
    return render(request, 'confirmar_eliminar.html', {'producto': producto})
 
# --- Importar varios productos desde CSV ---
@user_passes_test(es_administrador, login_url='login')
def importar_productos_csv(request):
    if request.method == 'POST':
        form = ImportarCSVForm(request.POST, request.FILES)
        if form.is_valid():
            archivo = request.FILES['archivo_csv']
            data = archivo.read().decode('utf-8-sig')

            try:
                separador = csv.Sniffer().sniff(data.splitlines()[0], delimiters=',;').delimiter
            except (csv.Error, IndexError):
                separador = ','

            lector = csv.DictReader(io.StringIO(data), delimiter=separador)

            if lector.fieldnames:
                lector.fieldnames = [
                    (campo or '').strip().lower() for campo in lector.fieldnames
                ]

            # Coincide con los encabezados reales que genera exportar_productos()
            columnas_esperadas = {'nombre', 'marca', 'categoría', 'precio unitario', 'unidad de medida'}
            columnas_encontradas = set(lector.fieldnames or [])

            creados = 0
            errores = []

            if not columnas_esperadas.issubset(columnas_encontradas):
                faltantes = columnas_esperadas - columnas_encontradas
                messages.error(
                    request,
                    'El archivo no tiene el formato esperado. '
                    f'Faltan las columnas: {", ".join(sorted(faltantes))}. '
                    f'Columnas encontradas: {", ".join(sorted(columnas_encontradas)) or "ninguna"}.'
                )
                return render(request, 'importar_csv.html', {'form': form})

            for i, fila in enumerate(lector, start=2):
                try:
                    nombre_categoria = (fila.get('categoría') or '').strip()
                    nombre_unidad = (fila.get('unidad de medida') or '').strip()

                    if not nombre_categoria or not nombre_unidad:
                        raise ValueError('Faltan datos de categoría o unidad.')

                    categoria, _ = Categoria.objects.get_or_create(
                        name__iexact=nombre_categoria,
                        defaults={'name': nombre_categoria}
                    )
                    unidad, _ = UnidadMedida.objects.get_or_create(
                        name__iexact=nombre_unidad,
                        defaults={'name': nombre_unidad}
                    )

                    # --- Campos opcionales de paquete ---
                    precio_paquete = (fila.get('precio por paquete') or '').strip()
                    nombre_unidad_paquete = (fila.get('unidad de paquete') or '').strip()

                    unidad_paquete = None
                    if nombre_unidad_paquete:
                        unidad_paquete, _ = UnidadMedida.objects.get_or_create(
                            name__iexact=nombre_unidad_paquete,
                            defaults={'name': nombre_unidad_paquete}
                        )

                    Producto.objects.create(
                        name=(fila.get('nombre') or '').strip(),
                        brand=(fila.get('marca') or '').strip(),
                        category=categoria,
                        unit_price=(fila.get('precio unitario') or '').strip(),
                        unit_of_measure=unidad,
                        bulk_price=precio_paquete or None,
                        bulk_unit_of_measure=unidad_paquete,
                        product_of_stock=(fila.get('disponible', 'sí') or 'sí').strip().lower() in ('si', 'sí', 'true', '1'),
                    )
                    creados += 1
                except Exception as e:
                    errores.append(f"Fila {i}: {e}")

            if creados:
                messages.success(request, f'{creados} productos importados correctamente.')
            if errores:
                messages.warning(request, f'{len(errores)} filas con errores: ' + ' | '.join(errores[:5]))

            if creados == 0 and not errores:
                messages.warning(request, 'El archivo no tenía filas para importar.')

            return redirect('panel')
    else:
        form = ImportarCSVForm()
    return render(request, 'importar_csv.html', {'form': form})



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

    return render(request, 'panel.html', {
        'productos': productos,
        'disponibles': disponibles,
        'agotados': agotados,
        'query': query,
        'categoria_id': categoria_id,
        'disponible': disponible,
        'categorias': categorias,
    })



# --- Exportar productos a CSV ---
@user_passes_test(es_administrador, login_url='login')
def exportar_productos(request):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="productos.csv"'
    

    writer = csv.writer(response)
    writer.writerow([
        'ID', 'Nombre', 'Marca', 'Categoría',
        'Precio unitario', 'Unidad de medida',
        'Precio por paquete', 'Unidad de paquete',
        'Disponible',
    ])

    for p in Producto.objects.select_related('category', 'unit_of_measure', 'bulk_unit_of_measure').all():
        writer.writerow([
            p.id,
            p.name,
            p.brand,
            p.category.name,
            p.unit_price,
            p.unit_of_measure.name if p.unit_of_measure else '',
            p.bulk_price if p.bulk_price else '',
            p.bulk_unit_of_measure.name if p.bulk_unit_of_measure else '',
            'Sí' if p.product_of_stock else 'No',
        ])

    return response







from django.http import HttpResponse
from django.utils import timezone

from products.models import Producto , CatalogoPDF  # 👈 ajusta el import a tu modelo real

from .utils import generar_pdf_productos  # 👈 ajusta la ruta si lo guardas en otro lado

from django.core.files.base import ContentFile
from django.http import FileResponse
from django.utils import timezone
import hashlib


 
# --- Descargar catálogo de productos en PDF ---
 
# Ajusta estos imports a tus rutas reales.
# from .models import CatalogoPDF, Producto
# from .utils_pdf import generar_pdf_productos, calcular_hash_productos

from django.contrib.auth.decorators import user_passes_test
from django.http import FileResponse
 
from products.models import PDFGenerationJob, Producto
from .generated_service import PDFGeneradorService
 

@user_passes_test(es_administrador, login_url='login')
def descargar_productos_pdf(request):
    productos = list(
        Producto.objects.select_related(
            "category", "unit_of_measure", "bulk_unit_of_measure",
        ).all().iterator(chunk_size=200)
    )

    job = PDFGenerationJob.objects.create(
        status=PDFGenerationJob.Estado.PENDING,
        total_products=len(productos),
    )

    PDFGeneradorService(job.id, productos).ejecutar()
    job.refresh_from_db()

    if job.status != PDFGenerationJob.Estado.COMPLETED:
        raise Exception(job.error_message or "No se pudo generar el PDF.")

    return FileResponse(
        job.file.open("rb"),
        as_attachment=True,
        filename="catalogo.pdf",
    )

def calcular_hash_productos(productos):
    """Hash del estado actual del catálogo, para saber si el PDF cacheado sigue vigente."""
    partes = sorted(
        f"{p.id}:{p.unit_price}:{p.bulk_price}:{p.product_of_stock}:{p.image.url if p.image else ''}"
        for p in productos
    )
    crudo = "|".join(partes).encode("utf-8")
    return hashlib.sha256(crudo).hexdigest()



def logout_admin(request):
    logout(request)
    return redirect('login')






def login_admin(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None and user.is_staff:
            login(request, user)
            return redirect('panel')
        return render(request, 'login.html', {'form': {'errors': True}})
    return render(request, 'login.html')

# En administracion/views.py
from django.db.models import Sum
from products.models import VisitCounter  # importas desde la otra app

def visitas(request):
    visitas = VisitCounter.objects.all().order_by('-date')
    total_visitas = visitas.aggregate(total=Sum('visits'))['total'] or 0

    context = {
        'visitas': visitas,
        'total_visitas': total_visitas,
    }
    return render(request, 'visitas.html', context)



"""
Views de la app "panel" (IBafex Admin).
 
Estas vistas solo se encargan de renderizar las plantillas del panel
(templates/dashboard/, templates/products/, etc.). Toda la lógica de datos
(listar, crear, editar, eliminar productos/usuarios/visitas) la resuelve
el frontend vía JavaScript (static/js/api.js) contra los endpoints de
Django REST Framework documentados en ese mismo archivo
(/api/products/, /api/users/, /api/visits/, /api/dashboard/summary/,
/api/auth/login/, /api/auth/logout/, etc.).
 
Por eso aquí no hay lógica de negocio: cada vista de página solo pasa
`active_page` al contexto, que es lo que usa templates/base.html para
resaltar el ítem activo en el sidebar (`{% if active_page == 'dashboard' %}`).
"""
 
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView as DjangoLoginView
from django.urls import reverse_lazy
from django.views.generic import TemplateView
 
 
class LoginView(DjangoLoginView):
    """
    Pantalla de login (auth/login.html).
 
    Nota: el <form id="login-form"> de la plantilla NO hace un POST
    tradicional de Django, sino que envía las credenciales por JS
    (Api.auth.login -> POST /api/auth/login/, ver static/js/auth.js).
    Por eso se usa la LoginView de Django solo para SERVIR la página en GET;
    si prefieres que también procese el POST de forma clásica (sin JS),
    dile a tu equipo de frontend que quite el manejo por fetch y deja que
    el <form> haga submit normal, y esta misma vista lo procesará.
    """
    template_name = "auth/login.html"
    #redirect_authenticated_user = True
 
    def get_success_url(self):
        return reverse_lazy("dashboard")
    
    
 
 
class DashboardView(LoginRequiredMixin, TemplateView):
    template_name = "dashboard/dashboard.html"
    login_url = reverse_lazy("login")
 
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_page"] = "dashboard"
        return context
 
 
class ProductsView(LoginRequiredMixin, TemplateView):
    template_name = "products/products.html"
    login_url = reverse_lazy("login")
 
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_page"] = "products"
        return context
 
 
class VisitsView(LoginRequiredMixin, TemplateView):
    template_name = "visits/visits.html"
    login_url = reverse_lazy("login")
 
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_page"] = "visits"
        return context
 
 
class UsersView(LoginRequiredMixin, TemplateView):
    template_name = "users/users.html"
    login_url = reverse_lazy("login")
 
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_page"] = "users"
        return context
 
 
class SettingsView(LoginRequiredMixin, TemplateView):
    template_name = "settings/settings.html"
    login_url = reverse_lazy("login")
 
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_page"] = "settings"
        return context







#----------------------------------------------------------------
"""
Vistas basadas en clases (CBV) que delegan toda la lógica de generación
en PDFGeneradorService (pdf_generacion_service.py).
 
Reemplaza al views.py con funciones que te pasé antes: mismas rutas,
mismos nombres de URL, ahora como clases delgadas.
"""
 
import threading
 
from django.http import JsonResponse, Http404, FileResponse
from django.shortcuts import render, get_object_or_404
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.http import require_POST, require_GET
 
from products.models import PDFGenerationJob  # ajustar import según tu app
from .generated_service import PDFGeneradorService
 
 
# ---------------------------------------------------------------------------
# 1. Crear el Job y devolver su ID de inmediato
# ---------------------------------------------------------------------------
@method_decorator(require_POST, name="dispatch")
class GenerarPDFView(View):
    def post(self, request):
        total = Producto.objects.count()
 
        job = PDFGenerationJob.objects.create(
            status=PDFGenerationJob.Estado.PENDING,
            total_products=total,
        )
 
        # Placeholder: cuando tengamos Celery, esto se cambia por
        # PDFGeneradorService.ejecutar_async.delay(job.id) (un @shared_task)
        hilo = threading.Thread(
            target=lambda: PDFGeneradorService(job.id).ejecutar(),
            daemon=True,
        )
        hilo.start()
 
        return JsonResponse({"job_id": job.id})
 
 
# ---------------------------------------------------------------------------
# 2. Endpoint de progreso, consumido por el JS de generacion.html
# ---------------------------------------------------------------------------
@method_decorator(require_GET, name="dispatch")
class ProgresoPDFView(View):
    def get(self, request, job_id):
        job = get_object_or_404(PDFGenerationJob, id=job_id)
 
        return JsonResponse({
            "status": job.status,
            "processed": job.processed_products,
            "total": job.total_products,
            "progress": job.progress,
            "error_message": job.error_message,
        })
 
 
# ---------------------------------------------------------------------------
# 3. Descarga: solo si el job está 'completed'
# ---------------------------------------------------------------------------
@method_decorator(require_GET, name="dispatch")
class DescargarPDFView(View):
    def get(self, request, job_id):
        job = get_object_or_404(PDFGenerationJob, id=job_id)
 
        if job.status != PDFGenerationJob.Estado.COMPLETED or not job.file:
            raise Http404("El PDF todavía no está listo.")
 
        return FileResponse(
            job.file.open("rb"),
            as_attachment=True,
            filename=f"catalogo_{job.id}.pdf",
        )
 
 
# ---------------------------------------------------------------------------
# 4. Pantalla de progreso (generacion.html)
# ---------------------------------------------------------------------------
@method_decorator(require_GET, name="dispatch")
class VistaGeneracionView(View):
    def get(self, request, job_id):
        job = get_object_or_404(PDFGenerationJob, id=job_id)
        return render(request, "lista_generaciones.html", {"job_id": job.id})
 
















import threading
from django.db import connections


# ✅ debe ser:
from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from django.urls import reverse


def _ejecutar_en_segundo_plano(job_id, productos):
    try:
        PDFGeneradorService(job_id, productos).ejecutar()
    finally:
        # Cierra las conexiones de DB abiertas en este hilo para no dejarlas colgadas
        connections.close_all()


from django.views.decorators.http import require_http_methods

@user_passes_test(es_administrador, login_url='login')
@require_http_methods(["GET", "POST"])
def iniciar_generacion_pdf(request):
    """
    GET  -> genera el PDF con TODO el catálogo (botón principal).
    POST -> genera el PDF solo con los productos seleccionados
            (lista de ids en 'seleccionados').
    """
    ids_seleccionados = request.POST.getlist("seleccionados") if request.method == "POST" else []

    productos_qs = Producto.objects.select_related(
        "category", "unit_of_measure", "bulk_unit_of_measure",
    )
    if ids_seleccionados:
        productos_qs = productos_qs.filter(id__in=ids_seleccionados)

    productos = list(productos_qs)

    job = PDFGenerationJob.objects.create(
        status=PDFGenerationJob.Estado.PENDING,
        total_products=len(productos),
    )

    hilo = threading.Thread(
        target=_ejecutar_en_segundo_plano,
        args=(job.id, productos),
        daemon=True,
    )
    hilo.start()

    return JsonResponse({"job_id": job.id})



@user_passes_test(es_administrador, login_url='login')
def estado_generacion_pdf(request, job_id):
    job = get_object_or_404(PDFGenerationJob, id=job_id)

    data = {
        "status": job.status,
        "progress": job.progress,
        "processed": job.processed_products,
        "total": job.total_products,
    }

    if job.status == PDFGenerationJob.Estado.COMPLETED:
        data["download_url"] = reverse("descargar_pdf_job", args=[job.id])
    elif job.status == PDFGenerationJob.Estado.FAILED:
        data["error"] = job.error_message

    return JsonResponse(data)


@user_passes_test(es_administrador, login_url='login')
def descargar_pdf_job(request, job_id):
    job = get_object_or_404(
        PDFGenerationJob, id=job_id, status=PDFGenerationJob.Estado.COMPLETED
    )
    return FileResponse(
        job.file.open("rb"), as_attachment=True, filename="catalogo.pdf"
    )





@method_decorator(require_GET, name="dispatch")
class ListaGeneracionesView(View):
    def get(self, request):
        jobs = PDFGenerationJob.objects.filter(
            status=PDFGenerationJob.Estado.COMPLETED
        ).order_by("-completed_at")

        # Filtro por día exacto (?dia=2026-09-17)
        dia = request.GET.get("dia", "")
        if dia:
            fecha = parse_date(dia)
            if fecha:
                jobs = jobs.filter(completed_at__date=fecha)

        # Filtro por mes (?mes=2026-09)
        mes = request.GET.get("mes", "")
        if mes:
            try:
                anio_str, mes_str = mes.split("-")
                jobs = jobs.filter(
                    completed_at__year=int(anio_str),
                    completed_at__month=int(mes_str),
                )
            except (ValueError, AttributeError):
                pass

        # Meses distintos que existen en el historial, para armar el filtro
        meses_disponibles = (
            PDFGenerationJob.objects.filter(status=PDFGenerationJob.Estado.COMPLETED)
            .exclude(completed_at__isnull=True)
            .dates("completed_at", "month", order="DESC")
        )

        return render(request, "lista_generaciones.html", {
            "jobs": jobs,
            "meses_disponibles": meses_disponibles,
            "dia_seleccionado": dia,
            "mes_seleccionado": mes,
        })


@user_passes_test(es_administrador, login_url='login')
@require_POST
def eliminar_pdfs_generados(request):
    ids = request.POST.getlist("seleccionados")

    if not ids:
        messages.warning(request, "No seleccionaste ningún PDF para eliminar.")
        return redirect("lista_generaciones")

    jobs = PDFGenerationJob.objects.filter(id__in=ids)
    cantidad = jobs.count()

    for job in jobs:
        if job.file:
            job.file.delete(save=False)  # borra el archivo físico del storage
    jobs.delete()  # borra los registros

    messages.success(request, f"Se eliminaron {cantidad} PDF(s) correctamente.")
    return redirect("lista_generaciones")


@user_passes_test(es_administrador, login_url='login')
@require_POST
def eliminar_productos_lote(request):
    ids = request.POST.getlist("seleccionados")

    if not ids:
        messages.warning(request, "No seleccionaste ningún producto para eliminar.")
        return redirect("panel")

    productos = Producto.objects.filter(id__in=ids)
    cantidad = productos.count()
    productos.delete()

    messages.success(request, f"Se eliminaron {cantidad} producto(s) correctamente.")
    return redirect("panel")