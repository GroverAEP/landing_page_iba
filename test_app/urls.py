from django.urls import path
from . import views
from .view import api, panel, users,visites ,catalog,pdfs
app_name = 'django_app'

urlpatterns = [
    # --- Rutas base del sitio ---
    path('', panel.index_view, name='index'),
    # 'signin/' ahora apunta a la vista real con autenticación (views.signin_view),
    # ya no a panel.signin_view (que quedó sin usar acá; podés borrarla si no la
    # necesitás en otro lado).
    path('signin/', views.signin_view, name='signin'),
    path('singin/', views.signin_view, name='singin'),  # Compatibilidad con ruta original (typo)
    path('signup/', panel.signup_view, name='signup'),
    path('dashboard/', panel.dashboard_view, name='dashboard'),
    path('users/', panel.users_view, name='users'),
    path('views/', panel.views_view, name='views'),
    path('settings/', panel.settings_view, name='settings'),

    # --- Productos  (storage: getProducts, addProduct, updateProduct, deleteProduct, deleteProducts) ---
    #path('panel/', products.panel_admin, name='panel_admin'),
    #path('panel/productos/nuevo/', products.producto_crear, name='producto_crear'),
    #path('panel/productos/<int:pk>/editar/', products.producto_editar, name='producto_editar'),
    #path('panel/productos/<int:pk>/eliminar/', products.producto_eliminar, name='producto_eliminar'),
    #path('panel/productos/eliminar-masivo/', products.productos_eliminar_masivo, name='productos_eliminar_masivo'),

    # --- Usuarios  (storage: getUsers, addUser, updateUser, deleteUser) ---
    #path('panel/usuarios/', products.usuarios_lista, name='usuarios_lista'),
    #path('panel/usuarios/nuevo/', products.usuario_crear, name='usuario_crear'),
    #path('panel/usuarios/<int:pk>/editar/', api.usuario_editar, name='usuario_editar'),
    #path('panel/usuarios/<int:pk>/eliminar/', api.usuario_eliminar, name='usuario_eliminar'),

    # --- Visitas  (storage: getVisits) ---
    #path('panel/visitas/', api.visitas_dashboard, name='visitas_dashboard'),

    # --- Configuración  (storage: getSettings, saveSettings) ---
    #path('panel/configuracion/', settings.configuracion_editar, name='configuracion_editar'),

    path('logout/', views.logout_view, name='logout'),

    # --- API JSON para dashboard.js (reemplaza localStorage por Django) ---
    path('api/productos/', api.api_productos, name='api_productos'),
    path('api/productos/eliminar-masivo/', api.api_productos_eliminar_masivo, name='api_productos_eliminar_masivo'),
    path('api/productos/<int:pk>/', api.api_producto_detalle, name='api_producto_detalle'),

    #path("api/usuarios/", users.usuarios_lista_crear, name="usuarios-lista"),
    #path("api/usuarios/<int:pk>/", views.usuario_detalle, name="usuarios-detalle"),
    #path("api/usuarios/", users.admin_lista_crear, name="admins-lista"),
    #path("superusuarios/", users.superusuarios_lista, name="admins-superusuarios"),
    #path("<int:pk>/", users.admin_detalle, name="admins-detalle"),

    path("api/usuarios/", users.user_create_list),
    path("api/usuarios/<int:pk>/", users.user_details),

    path('api/visitas/resumen/', visites.visitas_resumen_view, name='visitas_resumen'),  #




    # ... dentro de urlpatterns, junto a las otras rutas api/ ...
    path('api/categorias/', catalog.categorias_list_create, name='api_categorias'),
    path('api/categorias/<int:pk>/', catalog.categoria_detail, name='api_categoria_detalle'),
    path('api/unidades/', catalog.unidades_list_create, name='api_unidades'),
    path('api/unidades/<int:pk>/', catalog.unidad_detail, name='api_unidad_detalle'),


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


    #path('catalogos-pdf/generar/', views.GenerarCatalogoPDFView.as_view(), name='generar_catalogo_pdf'),
    #path('catalogos-pdf/<int:job_id>/estado/', views.estado_catalogo_pdf, name='estado_catalogo_pdf'),
    #path('catalogos-pdf/<int:job_id>/eliminar/', views.eliminar_catalogo_pdf, name='eliminar_catalogo_pdf'),


]