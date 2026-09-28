from django.urls import path
from . import views
from .view import api, panel, users,visites ,catalog,pdfs
app_name = 'django_app'

urlpatterns = [
    # --- Rutas base del sitio ---
    # REDIRECCIONAMIENTO
    path('', panel.index_view, name='index'),
    # 'signin/' ahora apunta a la vista real con autenticación (views.signin_view),
    # ya no a panel.signin_view (que quedó sin usar acá; podés borrarla si no la
    # necesitás en otro lado).

    # Api Session
    path('signin/', views.signin_view, name='signin'),
    path('singin/', views.signin_view, name='singin'),  # Compatibilidad con ruta original (typo)

    # Api Panel
    path('dashboard/', panel.dashboard_view, name='dashboard'),
    path('users/', panel.users_view, name='users'),
    path('views/', panel.views_view, name='views'),
    path('settings/', panel.settings_view, name='settings'),


    # CERRAR SESION
    path('logout/', views.logout_view, name='logout'),

    # --- API JSON para dashboard.js ---
    path('api/productos/', api.api_productos, name='api_productos'),
    path('api/productos/eliminar-masivo/', api.api_productos_eliminar_masivo, name='api_productos_eliminar_masivo'),
    path('api/productos/<int:pk>/', api.api_producto_detalle, name='api_producto_detalle'),

    # Api Usuarios
    path("api/usuarios/", users.user_create_list),
    path("api/usuarios/<int:pk>/", users.user_details),
    path('api/visitas/resumen/', visites.visitas_resumen_view, name='visitas_resumen'),  #

    # ... dentro de urlpatterns, junto a las otras rutas api/ ...
    path('api/categorias/', catalog.categorias_list_create, name='api_categorias'),
    path('api/categorias/<int:pk>/', catalog.categoria_detail, name='api_categoria_detalle'),
    path('api/unidades/', catalog.unidades_list_create, name='api_unidades'),
    path('api/unidades/<int:pk>/', catalog.unidad_detail, name='api_unidad_detalle'),

    # Api  Catalogos
    path(
        "catalogos-pdf/",
        pdfs.ListaGeneracionesView.as_view(),
        name="reports",
    ),
    path(
        "catalogos-pdf/generar/",
        pdfs.GenerarCatalogoPDFView.as_view(),
        name="generar_catalogo_pdf",
    ),
    path(
        "catalogos-pdf/<int:job_id>/estado/",
        pdfs.estado_catalogo_pdf,
        name="estado_catalogo_pdf",
    ),
    path(
        "catalogos-pdf/<int:job_id>/descargar/",
        pdfs.descargar_catalogo_pdf,
        name="descargar_catalogo_pdf",
    ),
    path(
        "catalogos-pdf/<int:job_id>/eliminar/",
        pdfs.eliminar_catalogo_pdf,
        name="eliminar_catalogo_pdf",
    ),

    # Api Visitas
    path('api/visitas/comparar/', visites.visitas_comparar_view, name='visitas_comparar'),

    # Api de configuraciones 
    path('api/configuracion-pdf/', pdfs.actualizar_configuracion_pdf, name='actualizar_configuracion_pdf'),

    # Api Recuperar contraseña
    path('recuperar-password/', views.recuperar_password, name='recuperar_password'),
    path('resetear-password/<uidb64>/<token>/', views.resetear_password, name='resetear_password'),  # 👈 esta es la que falta



]