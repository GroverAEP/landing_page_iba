from products import views
from django.urls import path
# from .views import search_products

urlpatterns = [
    
    path("catalog/products/", views.catalog_products , name="catalog_products"),
    path('search/', views.catalog_products, name='search_products'),
    
] 
