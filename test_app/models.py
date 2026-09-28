from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import models
from django.conf import settings

COLOR_POR_ROL = {
    "Administrador": "#059669",  # verde
    "Supervisor": "#8b5cf6",     # morado
    "Editor": "#3b82f6",         # azul
    "Operador": "#f59e0b",       # naranja
}

COLOR_DEFAULT = "#6b7280"  # gris, por si aparece un rol no mapeado

class PerfilUsuario(models.Model):
    ROLES = [
        ("Admin", "Administrador"),
        ("Administrador", "Administrador"),
        ("Operador", "Operador"),
        ("Supervisor", "Supervisor"),
    ]
    ESTADOS = [
        ("Activo", "Activo"),
        ("Inactivo", "Inactivo"),
        ("Suspendido", "Suspendido"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="perfil"
    )
    role = models.CharField(max_length=20, choices=ROLES, default="Operador")
    status = models.CharField(max_length=12, choices=ESTADOS, default="Activo")
    avatar_bg = models.CharField(max_length=7, default="#059669")

    def __str__(self):
        return f"Perfil de {self.user}"


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def crear_perfil_usuario(sender, instance, created, **kwargs):
    if created:
        PerfilUsuario.objects.get_or_create(user=instance)