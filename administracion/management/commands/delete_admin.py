"""
Management command para eliminar o degradar un administrador desde la consola.

INSTALACIÓN:
Copia este archivo a: <tu_app>/management/commands/eliminar_admin.py
(crea las carpetas 'management/' y 'management/commands/' si no existen,
cada una con un archivo vacío '__init__.py' dentro).

USO:
    python manage.py eliminar_admin admin              # borra la cuenta completa
    python manage.py eliminar_admin admin --degradar    # solo le quita is_staff/is_superuser
    python manage.py eliminar_admin admin --forzar      # sin pedir confirmación
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Elimina o degrada (quita rol de admin) a un usuario por su username."

    def add_arguments(self, parser):
        parser.add_argument('username', type=str, help='Username del usuario a eliminar/degradar')
        parser.add_argument(
            '--degradar',
            action='store_true',
            help='En vez de borrar la cuenta, solo le quita is_staff e is_superuser.',
        )
        parser.add_argument(
            '--forzar',
            action='store_true',
            help='No pedir confirmación antes de ejecutar la acción.',
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options['username']

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f'No existe ningún usuario con username "{username}".')

        total_admins = User.objects.filter(is_superuser=True).count()
        if user.is_superuser and total_admins <= 1:
            self.stdout.write(self.style.WARNING(
                f'"{username}" es el ÚNICO superusuario del sistema. '
                'Si continúas, te quedarás sin ningún admin.'
            ))

        accion = 'degradar (quitar rol de admin a)' if options['degradar'] else 'ELIMINAR por completo'

        if not options['forzar']:
            confirmacion = input(f'¿Seguro que quieres {accion} al usuario "{username}"? [s/N]: ')
            if confirmacion.strip().lower() not in ('s', 'si', 'sí', 'y', 'yes'):
                self.stdout.write(self.style.NOTICE('Operación cancelada.'))
                return

        if options['degradar']:
            user.is_staff = False
            user.is_superuser = False
            user.save()
            self.stdout.write(self.style.SUCCESS(
                f'Usuario "{username}" degradado: ya no es staff ni superusuario (la cuenta sigue existiendo).'
            ))
        else:
            user.delete()
            self.stdout.write(self.style.SUCCESS(f'Usuario "{username}" eliminado por completo.'))