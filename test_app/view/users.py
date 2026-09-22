# views.py
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from ..utils.serializers import UsuarioSerializer

User = get_user_model()


# LISTAR usuarios del panel (GET)  |  CREAR usuario (POST)
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def user_create_list(request):
    if request.method == "GET":
        usuarios = User.objects.filter(is_staff=True).select_related("perfil").order_by("username")
        return Response(UsuarioSerializer(usuarios, many=True).data)

    serializer = UsuarioSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# DETALLE / ACTUALIZAR / ELIMINAR  (GET, PATCH, DELETE)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def user_details(request, pk):
    usuario = get_object_or_404(User, pk=pk, is_staff=True)

    if request.method == "GET":
        return Response(UsuarioSerializer(usuario).data)

    if request.method == "DELETE":
        if usuario == request.user:
            return Response(
                {"detail": "No puedes eliminarte a ti mismo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        usuario.delete()
        return Response({"deleted": True}, status=status.HTTP_200_OK)

    # PATCH
    serializer = UsuarioSerializer(usuario, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)