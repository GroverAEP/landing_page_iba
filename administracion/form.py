from django import forms
from products.models import Producto, Categoria, UnidadMedida


class ProductoForm(forms.ModelForm):
    # Campos de texto libre: el usuario puede escribir una categoría/unidad
    # nueva o elegir una existente (sugerida via <datalist> en el HTML).
    categoria_texto = forms.CharField(
        label="Categoría",
        widget=forms.TextInput(attrs={
            'placeholder': 'Escribe o elige una categoría',
            'list': 'lista-categorias',
            'autocomplete': 'off',
        })
    )
    unidad_texto = forms.CharField(
        label="Unidad de medida",
        widget=forms.TextInput(attrs={
            'placeholder': 'Ej. kg, unidad, litro',
            'list': 'lista-unidades',
            'autocomplete': 'off',
        })
    )
    unidad_paquete_texto = forms.CharField(
        label="Unidad de paquete",
        required=False,
        widget=forms.TextInput(attrs={
            'placeholder': 'Ej. caja, paquete (opcional)',
            'list': 'lista-unidades',
            'autocomplete': 'off',
        })
    )

    class Meta:
        model = Producto
        # 'category', 'unit_of_measure' y 'bulk_unit_of_measure' quedan fuera:
        # se resuelven a mano en save() a partir de los campos _texto de arriba.
        fields = [
            'image', 'brand', 'name',
            'unit_price',
            'bulk_price',
            'product_of_stock',
        ]
        widgets = {
            'brand': forms.TextInput(attrs={'placeholder': 'Ej. Nike'}),
            'name': forms.TextInput(attrs={'placeholder': 'Nombre del producto'}),
            'unit_price': forms.NumberInput(attrs={'step': '0.01'}),
            'bulk_price': forms.NumberInput(attrs={'step': '0.01'}),
            'image': forms.ClearableFileInput(attrs={'accept': '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # En modo "editar", precargamos los campos de texto con los
        # nombres actuales de categoría/unidad del producto.
        if self.instance and self.instance.pk:
            self.fields['categoria_texto'].initial = self.instance.category.name
            self.fields['unidad_texto'].initial = self.instance.unit_of_measure.name
            if self.instance.bulk_unit_of_measure:
                self.fields['unidad_paquete_texto'].initial = self.instance.bulk_unit_of_measure.name

    def clean_image(self):
        imagen = self.cleaned_data.get('image')
        # Solo validamos si es un archivo nuevo subido (tiene 'size';
        # si es un valor ya existente de Cloudinary, no tiene ese atributo igual).
        if imagen and hasattr(imagen, 'size'):
            limite_mb = 10
            if imagen.size > limite_mb * 1024 * 1024:
                raise forms.ValidationError(
                    f"La imagen pesa {imagen.size / (1024*1024):.1f}MB. "
                    f"El máximo permitido es {limite_mb}MB."
                )

            extensiones_permitidas = ('.png', '.jpg', '.jpeg', '.svg')
            nombre = imagen.name.lower()
            if not nombre.endswith(extensiones_permitidas):
                raise forms.ValidationError(
                    "Formato no permitido. Solo se aceptan imágenes PNG, JPG o SVG."
                )
        return imagen

    def clean_categoria_texto(self):
        return self.cleaned_data['categoria_texto'].strip()

    def clean_unidad_texto(self):
        return self.cleaned_data['unidad_texto'].strip()

    def clean_unidad_paquete_texto(self):
        return self.cleaned_data['unidad_paquete_texto'].strip()

    def save(self, commit=True):
        producto = super().save(commit=False)

        categoria_nombre = self.cleaned_data['categoria_texto']
        categoria, _ = Categoria.objects.get_or_create(
            name__iexact=categoria_nombre,
            defaults={'name': categoria_nombre}
        )
        producto.category = categoria

        unidad_nombre = self.cleaned_data['unidad_texto']
        unidad, _ = UnidadMedida.objects.get_or_create(
            name__iexact=unidad_nombre,
            defaults={'name': unidad_nombre}
        )
        producto.unit_of_measure = unidad

        unidad_paquete_nombre = self.cleaned_data.get('unidad_paquete_texto')
        if unidad_paquete_nombre:
            unidad_paquete, _ = UnidadMedida.objects.get_or_create(
                name__iexact=unidad_paquete_nombre,
                defaults={'name': unidad_paquete_nombre}
            )
            producto.bulk_unit_of_measure = unidad_paquete
        else:
            producto.bulk_unit_of_measure = None

        if commit:
            producto.save()
        return producto


class ImportarCSVForm(forms.Form):
    archivo_csv = forms.FileField(label="Archivo CSV")