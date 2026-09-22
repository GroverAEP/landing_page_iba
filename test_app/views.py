from django.shortcuts import render, redirect


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


def dashboard_view(request):
    """
    Vista principal del panel de administración (Dashboard).
    """
    return render(request, 'django_app/dashboard.html', {'active_page': 'dashboard'})


def users_view(request):
    """
    Vista para gestión y administración de usuarios.
    """
    return render(request, 'django_app/users.html', {'active_page': 'users'})


def views_view(request):
    """
    Vista para análisis de métricas y visitas.
    """
    return render(request, 'django_app/views.html', {'active_page': 'views'})


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