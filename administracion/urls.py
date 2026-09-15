from django.urls import path
from . import views


urlpatterns = [
    path('', views.login_admin, name='login'),
    path('panel/', views.panel_admin, name='panel'),
    path('logout/', views.logout_admin, name='logout'),
    path('recuperar-password/', views.recuperar_password, name='recuperar_password'),
    path('panel/exportar/', views.exportar_productos, name='exportar_productos'),
    path('panel/descargar-producto-pdf/', views.descargar_productos_pdf, name= 'descargar_productos_pdf' ),
path('resetear-password/<uidb64>/<token>/', views.resetear_password, name='resetear_password'),  # 👈 esta es la que falta

    path('producto/nuevo/', views.crear_producto, name='crear_producto'),
    path('producto/<int:producto_id>/editar/', views.editar_producto, name='editar_producto'),
    path('producto/<int:producto_id>/eliminar/', views.eliminar_producto, name='eliminar_producto'),
    path('productos/importar/', views.importar_productos_csv, name='importar_productos'),

    path('visitas/', views.visitas, name='visitas'),

    ]