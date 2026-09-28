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
