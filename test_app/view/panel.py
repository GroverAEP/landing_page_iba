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
