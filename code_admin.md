# LISTAR — ver todos los usuarios en formato tabla
python admin_crud.py listar

# CREAR — usuario normal
python admin_crud.py crear nuevo_usuario --email correo@ejemplo.com --password miClave123

# CREAR — como staff (puede entrar al panel)
python admin_crud.py crear nuevo_admin --email admin2@ejemplo.com --password "" --staff
# (con --password "" te pide la contraseña oculta al escribir, sin mostrarla en pantalla)

# CREAR — como superusuario completo
python admin_crud.py crear super_nuevo --email super@ejemplo.com --password "" --superuser

# ACTUALIZAR — cambiar contraseña (te la pide oculta)
python admin_crud.py actualizar admin --password

# ACTUALIZAR — cambiar email
python admin_crud.py actualizar admin --email nuevo@correo.com

# ACTUALIZAR — quitarle o darle el rol de staff/superuser
python admin_crud.py actualizar admin --staff off
python admin_crud.py actualizar admin --superuser on

# ACTUALIZAR — desactivar cuenta sin borrarla (no podrá loguearse)
python admin_crud.py actualizar admin --activo off

# ELIMINAR
python admin_crud.py eliminar admin
python admin_crud.py eliminar admin --forzar