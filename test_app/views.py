from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required


def index_view(request):
    """
    Vista raíz: redirige al inicio de sesión tal como lo hacía index.html.
    """
    return redirect('django_app:signin')


def signin_view(request):
    """
    Vista de inicio de sesión (Sign In).
    """
    return render(request, 'django_app/singin.html')


def signup_view(request):
    """
    Vista de registro (redirige a inicio de sesión como en el frontend original).
    """
    return redirect('django_app:signin')


@login_required(login_url='django_app:signin')
def dashboard_view(request):
    """
    Vista principal del panel de administración (Dashboard).
    """
    return render(request, 'django_app/dashboard.html', {'active_page': 'dashboard'})


@login_required(login_url='django_app:signin')
def users_view(request):
    """
    Vista para gestión y administración de usuarios.
    """
    return render(request, 'django_app/users.html', {'active_page': 'users'})


@login_required(login_url='django_app:signin')
def views_view(request):
    """
    Vista para análisis de métricas y visitas.
    """
    return render(request, 'django_app/views.html', {'active_page': 'views'})


@login_required(login_url='django_app:signin')
def settings_view(request):
    """
    Vista para configuración del sistema y preferencias del panel.
    """
    return render(request, 'django_app/settings.html', {'active_page': 'settings'})


from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

def signin_view(request):
    """
    Renderiza y procesa el formulario de inicio de sesión (signin.html).
    Submit normal de formulario: si falla, se vuelve a renderizar la misma
    página con un mensaje de error (usando el framework de messages de Django).
    Autenticación por USERNAME (no por email).
    """
    if request.user.is_authenticated:
        return redirect('django_app:dashboard')
 
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        remember_me = request.POST.get('rememberMe') == 'on'
 
        # --- DEBUG TEMPORAL: ver qué está llegando realmente en el POST ---
        # BORRAR esto antes de subir a producción (nunca loguear passwords reales).
        print('=' * 50)
        print('[DEBUG signin_view] POST recibido:')
        print(f'  username -> "{username}" (len={len(username)})')
        print(f'  password -> "{password}" (len={len(password)})')
        print(f'  remember_me -> {remember_me}')
        print('=' * 50)
 
        user = authenticate(request, username=username, password=password)
 
        # --- DEBUG TEMPORAL: ver qué devolvió authenticate() ---
        print(f'[DEBUG signin_view] authenticate() devolvió: {user}')
 
        if user is not None:
            perfil = getattr(user, 'perfil', None)
            print(f'[DEBUG signin_view] perfil: {perfil}, status: {getattr(perfil, "status", "N/A")}')
            print(f'[DEBUG signin_view] user.is_active: {user.is_active}')
 
            # Bloquear por estado del perfil (Inactivo / Suspendido)
            if perfil and perfil.status in ('Inactivo', 'Suspendido'):
                messages.error(
                    request,
                    f'La cuenta de {user.get_full_name() or user.username} está '
                    f'{perfil.status.lower()}. Contacta al administrador del sistema.',
                )
                return render(request, 'django_app/signin.html', {'username_value': username})
 
            # Bloquear también si el usuario está desactivado a nivel Django
            if not user.is_active:
                messages.error(
                    request,
                    f'La cuenta de {user.get_full_name() or user.username} está inactiva. '
                    'Contacta al administrador del sistema.',
                )
                return render(request, 'django_app/signin.html', {'username_value': username})
 
            login(request, user)
 
            # "Recuérdame": si no está marcado, la sesión expira al cerrar el navegador.
            if remember_me:
                request.session.set_expiry(60 * 60 * 24 * 30)  # 30 días
            else:
                request.session.set_expiry(0)
 
            return redirect('django_app:dashboard')
 
        # --- DEBUG TEMPORAL: por qué authenticate() devolvió None ---
        from django.contrib.auth import get_user_model
        User = get_user_model()
        exists = User.objects.filter(username=username).exists()
        print(f'[DEBUG signin_view] ¿Existe un usuario con username="{username}"? -> {exists}')
        if exists:
            u = User.objects.get(username=username)
            print(f'[DEBUG signin_view] user.is_active={u.is_active}, check_password={u.check_password(password)}')
 
        messages.error(
            request,
            'Usuario o contraseña incorrectos. Por favor verifica tus credenciales.',
        )
        return render(request, 'django_app/signin.html', {'username_value': username})
 
    return render(request, 'django_app/signin.html')




@login_required
@require_POST
def logout_view(request):
    logout(request)
    messages.success(request, 'Has cerrado sesión correctamente.')
    return redirect('django_app:signin')







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
 
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib import messages
import json



User = get_user_model()

 # --- Paso 1: el usuario pide el enlace con su correo ---
def recuperar_password(request):
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    enviado = False
    hubo_error = False
    error_envio = None

    if request.method == 'POST':
        email = request.POST.get('email', '').strip()
        if not email:
            hubo_error = True
        else:
            usuarios = User.objects.filter(email__iexact=email, is_active=True)
            try:
                for user in usuarios:
                    uid = urlsafe_base64_encode(force_bytes(user.pk))
                    token = default_token_generator.make_token(user)
                    enlace = request.build_absolute_uri(
                    reverse('django_app:resetear_password', kwargs={'uidb64': uid, 'token': token})
                    )
                    cuerpo_html = render_to_string('django_app/email_recuperar_password.html', {
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
                enviado = True
            except Exception as e:
                import traceback
                traceback.print_exc()
                error_envio = f"{type(e).__name__}: {e}"
                enviado = False

        if es_ajax:
            if hubo_error:
                return JsonResponse({'success': False, 'message': 'Ingresa un correo válido.'}, status=400)
            if error_envio:
                # En producción no mandes error_envio al cliente, es info interna
                return JsonResponse({'success': False, 'message': 'No se pudo enviar el correo.'}, status=500)
            return JsonResponse({'success': True})

    return render(request, 'django_app/recuperar_password.html', {
        'enviado': enviado,
        'error_envio': error_envio,
        'form': type('FormFalso', (), {'errors': hubo_error})(),
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
        return render(request, 'django_app/resetear_password.html', {
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
            return redirect('django_app:signin')
 
    return render(request, 'django_app/resetear_password.html', {
        'token_valido': True,
        'error': error,
    })