

from django.urls import path
from . import views
from django.contrib.auth.views import LogoutView
from django.urls import path


urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),

    path("logout/", LogoutView.as_view(next_page="login"), name="logout"),
 
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("products/", views.ProductsView.as_view(), name="products"),
    path("visits/", views.VisitsView.as_view(), name="visits"),
    path("users/", views.UsersView.as_view(), name="users"),
    path("settings/", views.SettingsView.as_view(), name="settings"),



    ]
