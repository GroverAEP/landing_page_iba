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

import csv
import io
from django.contrib import messages
from django.shortcuts import get_object_or_404
 
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .form import ProductoForm, ImportarCSVForm
from products.models import Producto, Categoria, UnidadMedida






 
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
    productos = Producto.objects.select_related('category').all().order_by('-date_added')

    disponibles = productos.filter(product_of_stock=True).count()
    agotados = productos.filter(product_of_stock=False).count()

    return render(request, 'panel.html', {
        'productos': productos,
        'disponibles': disponibles,
        'agotados': agotados,
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

from products.models import Producto  # 👈 ajusta el import a tu modelo real
from .utils import generar_pdf_productos  # 👈 ajusta la ruta si lo guardas en otro lado


 
# --- Descargar catálogo de productos en PDF ---
@user_passes_test(es_administrador, login_url='login')
def descargar_productos_pdf(request):
    logo_url = static("img/logo.png")
    
    productos = Producto.objects.select_related(
        'category', 'unit_of_measure', 'bulk_unit_of_measure'
    ).all()
 
    buffer = generar_pdf_productos(productos,logo_url=logo_url if logo_url else None, fecha_generacion=timezone.now())
 
    response = HttpResponse(buffer.read(), content_type='application/pdf')
    nombre_archivo = f"catalogo_productos_{timezone.now().strftime('%Y%m%d_%H%M')}.pdf"
    response['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
    return response



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
