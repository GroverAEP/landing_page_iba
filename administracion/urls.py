from django.urls import path
from . import views
from django.contrib.auth.views import LogoutView
from django.urls import path

from .generated_service import ListaGeneracionesView
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
    path("productos/eliminar-lote/", views.eliminar_productos_lote, name="eliminar_productos_lote"),


    #---------------------------------- Procesamiento de descarga
    path("pdf/generacion/", ListaGeneracionesView.as_view(), name="lista_generaciones"),
    path("pdf/generar/", views.GenerarPDFView.as_view(), name="generar_pdf"),
    path("pdf/generacion/<int:job_id>/", views.VistaGeneracionView.as_view(), name="vista_generacion"),
    path("pdf/progreso/<int:job_id>/", views.ProgresoPDFView.as_view(), name="progreso_pdf"),
    path("pdf/descargar/<int:job_id>/", views.DescargarPDFView.as_view(), name="descargar_pdf"),
    path("pdf/generacion/eliminar/", views.eliminar_pdfs_generados, name="eliminar_pdfs_generados"),


    #---------
    path("descargar-producto-pdf/", views.iniciar_generacion_pdf, name="iniciar_generacion_pdf"),
    path("panel/pdf-job/<int:job_id>/estado/", views.estado_generacion_pdf, name="estado_generacion_pdf"),
    path("panel/pdf-job/<int:job_id>/descargar/", views.descargar_pdf_job, name="descargar_pdf_job"),

    ]   