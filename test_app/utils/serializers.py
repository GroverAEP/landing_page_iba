from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.models import Group
from django.utils.text import slugify
from rest_framework import serializers

from ..models import PerfilUsuario, COLOR_POR_ROL, COLOR_DEFAULT

User = get_user_model()


class UsuarioSerializer(serializers.ModelSerializer):
    name = serializers.CharField(write_only=True, required=False)
    registrationDate = serializers.DateTimeField(source="date_joined", read_only=True, format="%Y-%m-%d")
    role = serializers.ChoiceField(choices=PerfilUsuario.ROLES, source="perfil.role")
    status = serializers.ChoiceField(choices=PerfilUsuario.ESTADOS, source="perfil.status")
    avatarBg = serializers.CharField(source="perfil.avatar_bg", required=False)
    password = serializers.CharField(write_only=True, required=False)

    # 'username' ahora SÍ es un campo real del serializer. required=False porque,
    # si no lo mandan, lo generamos automáticamente a partir del email en create().
    # Al declararlo así, ModelSerializer conserva el UniqueValidator automático
    # (porque el campo del modelo tiene unique=True), así que un choque real de
    # nombre de usuario ahora sí se atrapa en is_valid() con un 400, no en el INSERT.
    username = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = ["id", "username", "name", "email", "role", "status", "registrationDate", "avatarBg", "password"]

    def to_representation(self, instance):
        """Para el GET: mostramos 'name' combinando first_name + last_name."""
        data = super().to_representation(instance)
        data["name"] = instance.get_full_name() or instance.username
        return data

    def create(self, validated_data):
        perfil_data = validated_data.pop("perfil", {})
        password = validated_data.pop("password", None)
        name = validated_data.pop("name", "")

        first_name, last_name = self._split_name(name)

        # Si no mandaron username explícito, lo generamos a partir del email
        # (o del nombre si no hay email), garantizando que sea único.
        if not validated_data.get("username"):
            validated_data["username"] = self._generate_unique_username(
                base=validated_data.get("email") or name
            )

        # Si no viene avatar_bg, lo calculamos según el rol
        rol = perfil_data.get("role", "Operador")
        perfil_data.setdefault("avatar_bg", COLOR_POR_ROL.get(rol, COLOR_DEFAULT))

        user = User.objects.create(
            is_staff=True,
            first_name=first_name,
            last_name=last_name,
            **validated_data
        )
        if password:
            user.set_password(password)
            user.save()

        PerfilUsuario.objects.update_or_create(user=user, defaults=perfil_data)
        return user

    def update(self, instance, validated_data):
        perfil_data = validated_data.pop("perfil", {})
        password = validated_data.pop("password", None)
        name = validated_data.pop("name", None)

        if name is not None:
            first_name, last_name = self._split_name(name)
            instance.first_name = first_name
            instance.last_name = last_name

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()

        if perfil_data:
            perfil, _ = PerfilUsuario.objects.get_or_create(user=instance)

            # Si el admin cambia el rol y no manda un color explícito, actualiza el color también
            if "role" in perfil_data and "avatar_bg" not in perfil_data:
                perfil_data["avatar_bg"] = COLOR_POR_ROL.get(perfil_data["role"], COLOR_DEFAULT)

            for attr, value in perfil_data.items():
                setattr(perfil, attr, value)
            perfil.save()
        return instance

    @staticmethod
    def _split_name(full_name):
        """Divide 'Sofía Navarro' en first_name='Sofía', last_name='Navarro'."""
        parts = full_name.strip().split(" ", 1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""
        return first_name, last_name

    @staticmethod
    def _generate_unique_username(base):
        """
        Genera un username único a partir de un email o nombre.
        'sofia.navarro@ibafex.com' -> 'sofia.navarro'
        Si ya existe, le agrega un sufijo numérico: 'sofia.navarro2', 'sofia.navarro3'...
        """
        raw = (base or "usuario").split("@")[0]
        slug = slugify(raw).replace("-", ".") or "usuario"

        username = slug
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{slug}{suffix}"

        return username