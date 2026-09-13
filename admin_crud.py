#!/usr/bin/env python
"""
CRUD standalone para gestionar usuarios admin, sin pasar por manage.py.

UBICACIÓN: en la raíz del proyecto, junto a manage.py.

USO (parado en la raíz del proyecto, con el venv activado):

    Listar todos los usuarios:
        python admin_crud.py listar

    Crear un usuario nuevo:
        python admin_crud.py crear nuevo_admin --email correo@ejemplo.com --password ""
        python admin_crud.py crear nuevo_admin --email correo@ejemplo.com --password "" --staff
        python admin_crud.py crear nuevo_admin --email correo@ejemplo.com --password "" --superuser

    Actualizar un usuario existente:
        python admin_crud.py actualizar admin --password ""
        python admin_crud.py actualizar admin --email nuevo@correo.com
        python admin_crud.py actualizar admin --staff on
        python admin_crud.py actualizar admin --superuser off
        python admin_crud.py actualizar admin --activo off

    Eliminar un usuario:
        python admin_crud.py eliminar admin
        python admin_crud.py eliminar admin --forzar

Si tu módulo de settings NO se llama "ibafex.settings", cambia
DJANGO_SETTINGS_MODULE más abajo (revisa el valor en tu manage.py).
"""

import os
import sys
import argparse
import getpass
import django

# --- Configuración: ajusta esto si tu settings module tiene otro nombre ---
DJANGO_SETTINGS_MODULE = "landing_page.settings"# ---------------------------------------------------------------------

os.environ.setdefault("DJANGO_SETTINGS_MODULE", DJANGO_SETTINGS_MODULE)

try:
    django.setup()
except Exception as e:
    print(f"❌ No se pudo inicializar Django: {e}")
    print(f"   Revisa que DJANGO_SETTINGS_MODULE = '{DJANGO_SETTINGS_MODULE}' sea correcto,")
    print("   y que estés ejecutando este script desde la raíz del proyecto (junto a manage.py).")
    sys.exit(1)

from django.contrib.auth import get_user_model  # noqa: E402
from django.db import IntegrityError  # noqa: E402

User = get_user_model()


# ---------------------------------------------------------------------
# LISTAR
# ---------------------------------------------------------------------
def listar_usuarios():
    usuarios = User.objects.all().order_by('id').values(
        'id', 'username', 'email', 'is_staff', 'is_superuser', 'is_active'
    )
    if not usuarios:
        print("No hay usuarios registrados en el sistema.")
        return
    print(f"{'ID':<4} {'Username':<20} {'Email':<28} {'Staff':<7} {'Super':<7} {'Activo'}")
    print("-" * 80)
    for u in usuarios:
        print(f"{u['id']:<4} {u['username']:<20} {u['email'] or '-':<28} "
              f"{str(u['is_staff']):<7} {str(u['is_superuser']):<7} {u['is_active']}")


# ---------------------------------------------------------------------
# CREAR
# ---------------------------------------------------------------------
def crear_usuario(username, email, password, staff, superuser):
    if User.objects.filter(username=username).exists():
        print(f'❌ Ya existe un usuario con username "{username}".')
        return

    if not password:
        password = getpass.getpass("Contraseña para el nuevo usuario: ")
        password_confirm = getpass.getpass("Confirma la contraseña: ")
        if password != password_confirm:
            print("❌ Las contraseñas no coinciden. Operación cancelada.")
            return

    try:
        if superuser:
            user = User.objects.create_superuser(username=username, email=email or '', password=password)
        else:
            user = User.objects.create_user(username=username, email=email or '', password=password)
            if staff:
                user.is_staff = True
                user.save()
    except IntegrityError as e:
        print(f"❌ Error al crear el usuario: {e}")
        return

    print(f'✅ Usuario "{user.username}" creado. staff={user.is_staff} superuser={user.is_superuser}')


# ---------------------------------------------------------------------
# ACTUALIZAR
# ---------------------------------------------------------------------
def actualizar_usuario(username, email, password, staff, superuser, activo):
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        print(f'❌ No existe ningún usuario con username "{username}".')
        listar_usuarios()
        return

    cambios = []

    if email is not None:
        user.email = email
        cambios.append(f"email={email}")

    if password is not None:
        if password == "":
            password = getpass.getpass("Nueva contraseña: ")
            password_confirm = getpass.getpass("Confirma la nueva contraseña: ")
            if password != password_confirm:
                print("❌ Las contraseñas no coinciden. No se actualizó nada.")
                return
        user.set_password(password)
        cambios.append("password=(actualizada)")

    if staff is not None:
        nuevo_valor = staff == "on"
        user.is_staff = nuevo_valor
        cambios.append(f"is_staff={nuevo_valor}")

    if superuser is not None:
        nuevo_valor = superuser == "on"
        if not nuevo_valor and user.is_superuser:
            total_admins = User.objects.filter(is_superuser=True).count()
            if total_admins <= 1:
                print(f'⚠️  "{username}" es el ÚNICO superusuario del sistema.')
                confirmacion = input("¿Seguro que quieres quitarle el superuser? [s/N]: ")
                if confirmacion.strip().lower() not in ('s', 'si', 'sí', 'y', 'yes'):
                    print("Cambio de superuser cancelado (el resto de cambios, si hay, sí se aplican).")
                    nuevo_valor = user.is_superuser  # no lo tocamos
        user.is_superuser = nuevo_valor
        cambios.append(f"is_superuser={nuevo_valor}")

    if activo is not None:
        user.is_active = activo == "on"
        cambios.append(f"is_active={user.is_active}")

    if not cambios:
        print("No indicaste ningún cambio. Usa --email, --password, --staff, --superuser o --activo.")
        return

    user.save()
    print(f'✅ Usuario "{username}" actualizado: ' + ", ".join(cambios))


# ---------------------------------------------------------------------
# ELIMINAR
# ---------------------------------------------------------------------
def eliminar_usuario(username, forzar):
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        print(f'❌ No existe ningún usuario con username "{username}".')
        listar_usuarios()
        return

    total_admins = User.objects.filter(is_superuser=True).count()
    if user.is_superuser and total_admins <= 1:
        print(f'⚠️  "{username}" es el ÚNICO superusuario del sistema.')
        print("   Si continúas, te quedarás sin ningún admin.")

    if not forzar:
        confirmacion = input(f'¿Seguro que quieres ELIMINAR al usuario "{username}"? [s/N]: ')
        if confirmacion.strip().lower() not in ('s', 'si', 'sí', 'y', 'yes'):
            print("Operación cancelada.")
            return

    user.delete()
    print(f'✅ Usuario "{username}" eliminado por completo.')


# ---------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="CRUD de usuarios admin (standalone, sin manage.py).")
    subparsers = parser.add_subparsers(dest="comando", required=True)

    subparsers.add_parser("listar", help="Lista todos los usuarios.")

    p_crear = subparsers.add_parser("crear", help="Crea un usuario nuevo.")
    p_crear.add_argument("username")
    p_crear.add_argument("--email", default="")
    p_crear.add_argument("--password", default="", help='Si se omite o se deja "", se pide de forma oculta.')
    p_crear.add_argument("--staff", action="store_true", help="Marca al usuario como staff (ignorado si --superuser).")
    p_crear.add_argument("--superuser", action="store_true", help="Crea el usuario como superusuario (implica staff).")

    p_actualizar = subparsers.add_parser("actualizar", help="Actualiza un usuario existente.")
    p_actualizar.add_argument("username")
    p_actualizar.add_argument("--email", default=None)
    p_actualizar.add_argument("--password", nargs="?", const="", default=None,
                               help='Si se usa sin valor, se pide de forma oculta.')
    p_actualizar.add_argument("--staff", choices=["on", "off"], default=None)
    p_actualizar.add_argument("--superuser", choices=["on", "off"], default=None)
    p_actualizar.add_argument("--activo", choices=["on", "off"], default=None)

    p_eliminar = subparsers.add_parser("eliminar", help="Elimina un usuario por completo.")
    p_eliminar.add_argument("username")
    p_eliminar.add_argument("--forzar", action="store_true", help="No pedir confirmación.")

    args = parser.parse_args()

    if args.comando == "listar":
        listar_usuarios()
    elif args.comando == "crear":
        crear_usuario(args.username, args.email, args.password, args.staff, args.superuser)
    elif args.comando == "actualizar":
        actualizar_usuario(args.username, args.email, args.password, args.staff, args.superuser, args.activo)
    elif args.comando == "eliminar":
        eliminar_usuario(args.username, args.forzar)


if __name__ == "__main__":
    main()