"""
forms.py
ProductoForm reemplaza la validación manual de addProduct/updateProduct.
PerfilUsuarioForm + UserForm reemplazan addUser/updateUser (incluida la
validación de email duplicado que storage.js hacía a mano).
ConfiguracionSitioForm reemplaza saveSettings.
"""
from django import forms
from django.contrib.auth import get_user_model
from .models import Producto, PerfilUsuario, ConfiguracionSitio

User = get_user_model()


class ProductoForm(forms.ModelForm):
    class Meta:
        model = Producto
        fields = [
            'image', 'brand', 'category', 'name',
            'unit_price', 'unit_of_measure',
            'bulk_price', 'bulk_unit_of_measure',
            'product_of_stock',
        ]
        widgets = {
            'image': forms.URLInput(attrs={'class': 'form-control'}),
            'brand': forms.TextInput(attrs={'class': 'form-control'}),
            'category': forms.Select(attrs={'class': 'form-select'}),
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'unit_price': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01'}),
            'unit_of_measure': forms.Select(attrs={'class': 'form-select'}),
            'bulk_price': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01'}),
            'bulk_unit_of_measure': forms.TextInput(attrs={'class': 'form-control'}),
        }


class UserForm(forms.ModelForm):
    """Datos base de auth.User: nombre, email, username."""
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'username']
        widgets = {
            'first_name': forms.TextInput(attrs={'class': 'form-control'}),
            'last_name': forms.TextInput(attrs={'class': 'form-control'}),
            'email': forms.EmailInput(attrs={'class': 'form-control'}),
            'username': forms.TextInput(attrs={'class': 'form-control'}),
        }

    def __init__(self, *args, **kwargs):
        # Se pasa la instancia actual para excluirla de la validación de email duplicado,
        # igual que hacía updateUser(id, ...) en storage.js con "u.id !== id"
        self.instance_id = kwargs.pop('instance_id', None)
        super().__init__(*args, **kwargs)

    def clean_email(self):
        email = self.cleaned_data['email'].strip().lower()
        qs = User.objects.filter(email__iexact=email)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            # Mismo mensaje de error que storage.js
            raise forms.ValidationError('El correo electrónico ya está registrado.')
        return email


class PerfilUsuarioForm(forms.ModelForm):
    class Meta:
        model = PerfilUsuario
        fields = ['role', 'status']
        widgets = {
            'role': forms.Select(attrs={'class': 'form-select'}),
            'status': forms.Select(attrs={'class': 'form-select'}),
        }


class ConfiguracionSitioForm(forms.ModelForm):
    class Meta:
        model = ConfiguracionSitio
        fields = [
            'company_name', 'company_logo', 'accent_color',
            'theme', 'language', 'date_format',
        ]
        widgets = {
            'company_name': forms.TextInput(attrs={'class': 'form-control'}),
            'accent_color': forms.TextInput(attrs={'class': 'form-control', 'type': 'color'}),
            'theme': forms.Select(attrs={'class': 'form-select'}),
            'language': forms.Select(attrs={'class': 'form-select'}),
            'date_format': forms.TextInput(attrs={'class': 'form-control'}),
        }