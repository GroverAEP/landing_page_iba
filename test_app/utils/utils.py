"""
Lógica de generación del catálogo de productos en PDF.

UBICACIÓN SUGERIDA:
    administracion/utils_pdf.py
(o, si prefieres una carpeta de servicios: administracion/services/pdf_productos.py
 — en ese caso ajusta el import en views.py acorde a la ruta que elijas)

Este módulo NO sabe nada de Django requests/responses — solo recibe una
lista de productos y devuelve un buffer con el PDF ya armado. Así se
puede probar de forma aislada y reutilizar desde cualquier vista o
comando de management, sin duplicar código.

------------------------------------------------------------------
CAMBIOS respecto de la versión anterior (para catálogos grandes,
hasta 1000 productos, sin que la RAM crezca sin control):

1) Cada página del catálogo se construye y renderiza como un PDF
   independiente (su propio SimpleDocTemplate + buffer), y todas las
   páginas se combinan al final con pypdf. Antes, TODAS las tarjetas
   (con sus imágenes ya descargadas en memoria) se acumulaban en una
   sola lista `story` que recién se liberaba cuando `doc.build()`
   terminaba de procesar el catálogo completo — es decir, no se
   liberaba nada hasta el final, sin importar cuántos productos
   hubiera. Ahora, apenas se termina de renderizar una página (9
   productos), sus imágenes y flowables quedan libres para el
   recolector de basura antes de pasar a la siguiente.

2) Las imágenes descargadas de Cloudinary se reducen a un tamaño
   pequeño (thumbnail) ANTES de insertarlas en la tarjeta, en vez de
   guardar la imagen a resolución original. Esto reduce tanto la RAM
   usada durante la generación como el peso final del PDF — antes,
   con 1000 productos, cada imagen a resolución original podía pesar
   varias veces más de lo necesario para el tamaño en el que termina
   dibujada dentro de la tarjeta.
------------------------------------------------------------------
"""

import gc
import hashlib
import io
from functools import lru_cache
from types import SimpleNamespace

import requests
from pypdf import PdfReader, PdfWriter

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    Image as RLImage, HRFlowable, Flowable,
)
from PIL import Image as PILImage, ImageDraw, ImageFont
import requests
from io import BytesIO

# ------------------------------------------------------------------
# Estilos y colores (mismos tonos de marca usados en el resto del panel)
# ------------------------------------------------------------------
VERDE_OSCURO = HexColor("#0B7A10")
ROJO = HexColor("#DC3646")
GRIS_TEXTO = HexColor("#444444")
GRIS_SEC = HexColor("#777777")
GRIS_BORDE = HexColor("#E3E4E1")
BLANCO = HexColor("#FFFFFF")

# Tonos del placeholder "NOT AVAILABLE" (mismo estilo que las tarjetas
# de producto sin imagen en el catálogo web).
PLACEHOLDER_FONDO_RGB = (246, 246, 244)
PLACEHOLDER_TRAZO_RGB = (176, 178, 173)

# ------------------------------------------------------------------
# Datos de contacto del negocio, mostrados en el encabezado del PDF.
# ------------------------------------------------------------------
CORREO_NEGOCIO = "ibafex.ha@gmail.com"
TELEFONO_NEGOCIO = "+51 919 294 944"
PAIS_NEGOCIO = "Perú"

# ------------------------------------------------------------------
# Grilla: 3 columnas x 3 filas = 9 productos por página, simétrica.
# ------------------------------------------------------------------
COLUMNAS = 3
FILAS_POR_PAGINA = 3
PRODUCTOS_POR_PAGINA = COLUMNAS * FILAS_POR_PAGINA

ANCHO_COLUMNA_MM = 62
ANCHO_TARJETA_MM = 54

ALTO_IMG_MM = 27
ALTO_IMG_MM_MAX = ALTO_IMG_MM * 1.6

# ------------------------------------------------------------------
# Tamaño máximo (en píxeles, sobre el lado más largo) al que se reduce
# toda imagen de producto descargada, ANTES de guardarla como JPEG e
# insertarla en la tarjeta.
#
# La tarjeta dibuja la imagen, como máximo, a ALTO_IMG_MM_MAX de alto
# (~43mm) x ANCHO_TARJETA_MM de ancho (54mm). A 300dpi (buena calidad
# de impresión) eso son ~640px de lado más largo. 600px da margen de
# sobra sin cargar con resolución que después se descarta al escalar
# dentro del PDF — que es RAM y peso de archivo tirados a la basura,
# multiplicados por hasta 1000 productos.
# ------------------------------------------------------------------
MAX_LADO_IMG_DESCARGADA_PX = 600

_estilo_marca = ParagraphStyle(
    "marca_pdf", fontName="Helvetica-Bold", fontSize=8.5,
    textColor=GRIS_SEC, spaceAfter=1.5, leading=10.2,
)
_estilo_nombre = ParagraphStyle(
    "nombre_pdf", fontName="Helvetica-Bold", fontSize=13,
    textColor=GRIS_TEXTO, leading=13.2, spaceAfter=1.5,
)
_estilo_categoria = ParagraphStyle(
    "categoria_pdf", fontName="Helvetica-Oblique", fontSize=8.5,
    textColor=GRIS_SEC, leading=10.2, spaceAfter=1.5,
)
_estilo_precio_unidad = ParagraphStyle(
    "precio_unidad_pdf", fontName="Helvetica", fontSize=11,
    textColor=GRIS_SEC, spaceAfter=1.5,
)
_estilo_precio_bulto = ParagraphStyle(
    "precio_bulto_pdf", fontName="Helvetica-Bold", fontSize=12.2,
    textColor=VERDE_OSCURO,
)
_estilo_badge = ParagraphStyle(
    "badge_pdf", fontName="Helvetica-Bold", fontSize=8,
    textColor=BLANCO, alignment=1,
)

ANCHO_TEXTO_DISPONIBLE_PTS = ANCHO_TARJETA_MM * mm


def _truncar_a_ancho(texto, font_name, font_size, max_width_pts=None):
    """
    Corta el texto a una sola línea con '…' si su ancho renderizado
    excede max_width_pts. Ver docstring original: se mide por ancho
    real (stringWidth), no por cantidad de caracteres, para que la
    tarjeta nunca envuelva a una segunda línea inesperadamente.
    """
    if not texto:
        return ""

    if max_width_pts is None:
        max_width_pts = ANCHO_TEXTO_DISPONIBLE_PTS

    if stringWidth(texto, font_name, font_size) <= max_width_pts:
        return texto

    elipsis = "…"
    for i in range(len(texto) - 1, 0, -1):
        candidato = texto[:i].rstrip() + elipsis
        if stringWidth(candidato, font_name, font_size) <= max_width_pts:
            return candidato

    return elipsis


def _a_rgb_sobre_blanco(imagen_pil):
    """
    Convierte cualquier imagen (incluyendo PNG con transparencia) a RGB
    componiéndola sobre un fondo blanco.
    """
    if imagen_pil.mode in ("RGBA", "LA") or (imagen_pil.mode == "P" and "transparency" in imagen_pil.info):
        imagen_pil = imagen_pil.convert("RGBA")
        fondo = PILImage.new("RGB", imagen_pil.size, (255, 255, 255))
        fondo.paste(imagen_pil, mask=imagen_pil.split()[-1])
        return fondo
    return imagen_pil.convert("RGB")


def _obtener_logo(logo_url):
    """
    Descarga o lee el logo del negocio. Se usa una sola vez en el
    encabezado del PDF (grande). Devuelve bytes JPEG, o None si no hay
    logo_url o falló la descarga.
    """
    if not logo_url:
        return None

    try:
        if logo_url.startswith("http://") or logo_url.startswith("https://"):
            respuesta = requests.get(logo_url, timeout=6)
            respuesta.raise_for_status()
            imagen_pil = PILImage.open(io.BytesIO(respuesta.content))
        else:
            from django.contrib.staticfiles import finders

            ruta_relativa = logo_url.split("?")[0].lstrip("/")
            if ruta_relativa.startswith("static/"):
                ruta_relativa = ruta_relativa[len("static/"):]

            ruta_absoluta = finders.find(ruta_relativa)
            if not ruta_absoluta:
                return None

            imagen_pil = PILImage.open(ruta_absoluta)

        imagen_pil = _a_rgb_sobre_blanco(imagen_pil)
        buffer = io.BytesIO()
        imagen_pil.save(buffer, format="JPEG", quality=90)
        return buffer.getvalue()
    except Exception:
        return None


def _obtener_imagen_producto(producto):
    """
    Descarga la imagen del producto (Cloudinary), la reduce a un
    tamaño pequeño (MAX_LADO_IMG_DESCARGADA_PX) y la deja lista para
    reportlab. Si no tiene imagen o falla la descarga, devuelve el
    placeholder "NOT AVAILABLE".

    El resize ocurre ACÁ, apenas se descarga — antes de que la imagen
    quede referenciada por ningún flowable — así nunca se retiene en
    memoria más peso del que el PDF final va a necesitar.

        
    Descarga la imagen del producto (Cloudinary) ya redimensionada por
    Cloudinary del lado del servidor, y la deja lista para reportlab.
    Si no tiene imagen o falla la descarga, devuelve el placeholder
    "NOT AVAILABLE".
    """
    if producto.image:
        try:
            # En vez de producto.image.url (la original, pesada),
            # pedimos a Cloudinary la versión ya reducida:
            url_reducida = CloudinaryImage(producto.image.public_id).build_url(
                width=MAX_LADO_IMG_DESCARGADA_PX,
                height=MAX_LADO_IMG_DESCARGADA_PX,
                crop="limit",       # redimensiona sin recortar (mantiene proporción)
                quality="auto",
                fetch_format="auto",
            )

            respuesta = requests.get(url_reducida, timeout=6)
            respuesta.raise_for_status()

            imagen_pil = PILImage.open(io.BytesIO(respuesta.content))
            imagen_pil = _a_rgb_sobre_blanco(imagen_pil)

            # Este thumbnail ahora es casi un no-op (por las dudas,
            # si Cloudinary devolvió algo más grande de lo pedido)
            if max(imagen_pil.size) > MAX_LADO_IMG_DESCARGADA_PX:
                imagen_pil.thumbnail(
                    (MAX_LADO_IMG_DESCARGADA_PX, MAX_LADO_IMG_DESCARGADA_PX),
                    PILImage.LANCZOS,
                )

            buffer = io.BytesIO()
            imagen_pil.save(buffer, format="JPEG", quality=82, optimize=True)
            buffer.seek(0)
            return buffer
        except Exception:
            pass  # cae al placeholder de abajo

    return _imagen_placeholder()


@lru_cache(maxsize=1)
def _bytes_placeholder(ancho_px=440, alto_px=340):
    """
    Dibuja (con PIL) el ícono de "imagen no disponible" del catálogo
    web. Se cachea porque es siempre igual — no depende del producto.
    """
    imagen = PILImage.new("RGB", (ancho_px, alto_px), color=PLACEHOLDER_FONDO_RGB)
    dibujo = ImageDraw.Draw(imagen)
    trazo = PLACEHOLDER_TRAZO_RGB

    icono_lado = int(min(ancho_px, alto_px) * 0.48)
    cx = ancho_px // 2
    cy = int(alto_px * 0.42)
    x0, y0 = cx - icono_lado // 2, cy - icono_lado // 2
    x1, y1 = cx + icono_lado // 2, cy + icono_lado // 2
    grosor = max(2, icono_lado // 22)

    dibujo.rounded_rectangle([x0, y0, x1, y1], radius=icono_lado * 0.08,
                              outline=trazo, width=grosor)

    radio_sol = icono_lado * 0.11
    sol_cx, sol_cy = x0 + icono_lado * 0.28, y0 + icono_lado * 0.28
    dibujo.ellipse(
        [sol_cx - radio_sol, sol_cy - radio_sol, sol_cx + radio_sol, sol_cy + radio_sol],
        outline=trazo, width=grosor,
    )

    m1 = (x0 + icono_lado * 0.10, y1 - icono_lado * 0.10)
    m2 = (x0 + icono_lado * 0.45, y1 - icono_lado * 0.48)
    m3 = (x0 + icono_lado * 0.80, y1 - icono_lado * 0.10)
    dibujo.line([m1, m2, m3], fill=trazo, width=grosor, joint="curve")

    dibujo.line([x0, y1, x1, y0], fill=trazo, width=grosor)

    texto = "NOT AVAILABLE"
    tamano_fuente = max(10, int(icono_lado * 0.115))
    fuente = None
    for nombre_fuente in ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "Arial.ttf"):
        try:
            fuente = ImageFont.truetype(nombre_fuente, tamano_fuente)
            break
        except Exception:
            continue
    if fuente is None:
        fuente = ImageFont.load_default()

    caja_texto = dibujo.textbbox((0, 0), texto, font=fuente)
    ancho_texto = caja_texto[2] - caja_texto[0]
    dibujo.text(
        (cx - ancho_texto / 2, y1 + icono_lado * 0.14), texto,
        fill=trazo, font=fuente,
    )

    buffer = io.BytesIO()
    imagen.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def _imagen_placeholder():
    """Devuelve un buffer nuevo con el ícono "NOT AVAILABLE" ya dibujado."""
    return io.BytesIO(_bytes_placeholder())


class _ImagenConLogoFlowable(Flowable):
    """
    Flowable a medida que dibuja la imagen del producto y, si se le
    pasa un logo (logo_bytes), lo superpone como insignia circular.
    Hoy no se usa logo_bytes desde generar_pdf_productos (se pasa
    siempre None para las tarjetas de producto); se deja el soporte
    intacto por si se reactiva más adelante.
    """

    def __init__(self, imagen_bytes, logo_bytes, width, height):
        super().__init__()
        self.imagen_bytes = imagen_bytes
        self.logo_bytes = logo_bytes
        self.width = width
        self.height = height

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        canv = self.canv

        canv.drawImage(
            ImageReader(io.BytesIO(self.imagen_bytes)), 0, 0,
            width=self.width, height=self.height,
            preserveAspectRatio=True, anchor="c", mask="auto",
        )

        if not self.logo_bytes:
            return

        diametro = min(self.width, self.height) * 0.30
        margen = diametro * 0.14
        cx = self.width - margen - diametro / 2
        cy = self.height - margen - diametro / 2

        canv.saveState()
        canv.setFillColor(BLANCO)
        canv.circle(cx, cy, diametro / 2, stroke=0, fill=1)
        canv.restoreState()

        canv.saveState()
        recorte = canv.beginPath()
        recorte.circle(cx, cy, diametro / 2)
        canv.clipPath(recorte, stroke=0, fill=0)
        canv.drawImage(
            ImageReader(io.BytesIO(self.logo_bytes)),
            cx - diametro / 2, cy - diametro / 2,
            width=diametro, height=diametro,
            preserveAspectRatio=True, anchor="c", mask="auto",
        )
        canv.restoreState()

        canv.saveState()
        canv.setStrokeColor(GRIS_BORDE)
        canv.setLineWidth(0.8)
        canv.circle(cx, cy, diametro / 2, stroke=1, fill=0)
        canv.restoreState()


def _tarjeta_producto(producto, imagen_buffer, logo_bytes=None, alto_img_mm=ALTO_IMG_MM):
    """Arma el bloque visual (lista de flowables) para un producto."""
    elementos = []

    img = _ImagenConLogoFlowable(
        imagen_bytes=imagen_buffer.getvalue(),
        logo_bytes=logo_bytes,
        width=ANCHO_TARJETA_MM * mm,
        height=alto_img_mm * mm,
    )

    if not producto.product_of_stock:
        celda_badge = Table(
            [[Paragraph("¡AGOTADO!", _estilo_badge)]],
            colWidths=[24 * mm], rowHeights=[6 * mm],
        )
        celda_badge.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), ROJO),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
    else:
        celda_badge = Spacer(1, 6 * mm)

    contenido_imagen = [[celda_badge], [img]]

    tabla_imagen = Table(contenido_imagen, colWidths=[ANCHO_TARJETA_MM * mm])
    tabla_imagen.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
    ]))

    elementos.append(tabla_imagen)
    elementos.append(Spacer(1, 3))
    elementos.append(Paragraph(
        _truncar_a_ancho(producto.brand or "-", "Helvetica-Bold", 8.5), _estilo_marca,
    ))
    elementos.append(Paragraph(
        _truncar_a_ancho(producto.name, "Helvetica-Bold", 11), _estilo_nombre,
    ))
    elementos.append(Paragraph(
        _truncar_a_ancho(
            producto.category.name if producto.category else "Sin categoría",
            "Helvetica-Oblique", 8.5,
        ),
        _estilo_categoria,
    ))

    unidad_nombre = producto.unit_of_measure.name if producto.unit_of_measure else ""
    elementos.append(Paragraph(
        _truncar_a_ancho(
            f"S/ {producto.unit_price} x {unidad_nombre}".strip(), "Helvetica", 11,
        ),
        _estilo_precio_unidad,
    ))

    if producto.bulk_price and producto.bulk_unit_of_measure:
        elementos.append(Paragraph(
            _truncar_a_ancho(
                f"S/ {producto.bulk_price} x {producto.bulk_unit_of_measure.name}",
                "Helvetica-Bold", 12.2,
            ),
            _estilo_precio_bulto,
        ))
    else:
        elementos.append(Spacer(1, 6))

    return elementos


PADDING_TARJETA_PTS = 6
PADDING_FILA_SUPERIOR_PTS = 4
PADDING_FILA_INFERIOR_PTS = 7

COLOR_BORDE_TARJETA = HexColor("#DADBD7")
GROSOR_BORDE_TARJETA = 0.6
RADIO_ESQUINA_TARJETA_PTS = 5


def _tarjeta_con_borde(elementos):
    """Envuelve el contenido de una tarjeta en un recuadro con esquinas redondeadas."""
    ancho_con_padding = (ANCHO_TARJETA_MM * mm) + (2 * PADDING_TARJETA_PTS)
    tabla = Table([[elementos]], colWidths=[ancho_con_padding])
    tabla.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), GROSOR_BORDE_TARJETA, COLOR_BORDE_TARJETA),
        ("ROUNDEDCORNERS", [RADIO_ESQUINA_TARJETA_PTS] * 4),
        ("LEFTPADDING", (0, 0), (-1, -1), PADDING_TARJETA_PTS),
        ("RIGHTPADDING", (0, 0), (-1, -1), PADDING_TARJETA_PTS),
        ("TOPPADDING", (0, 0), (-1, -1), PADDING_TARJETA_PTS),
        ("BOTTOMPADDING", (0, 0), (-1, -1), PADDING_TARJETA_PTS + 2),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tabla


def _estilo_tabla_fila():
    return TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), PADDING_FILA_SUPERIOR_PTS),
        ("BOTTOMPADDING", (0, 0), (-1, -1), PADDING_FILA_INFERIOR_PTS),
    ])


@lru_cache(maxsize=None)
def _altura_tarjeta_pts(alto_img_mm):
    """
    Mide (con .wrap()) la altura real máxima que puede llegar a ocupar
    una tarjeta, para un alto de imagen dado. Se cachea por valor de
    alto_img_mm porque _calcular_altura_fila_pts prueba varios
    candidatos de alto de imagen por página.
    """
    producto_referencia = SimpleNamespace(
        image=None,
        brand="M" * 60,
        name="N" * 60,
        category=SimpleNamespace(name="C" * 60),
        unit_of_measure=SimpleNamespace(name="unidad"),
        unit_price=9999.99,
        bulk_price=9999.99,
        bulk_unit_of_measure=SimpleNamespace(name="paquete"),
        product_of_stock=False,
    )
    elementos = _tarjeta_producto(
        producto_referencia, _imagen_placeholder(), alto_img_mm=alto_img_mm
    )
    tarjeta = _tarjeta_con_borde(elementos)
    ancho_disponible = (ANCHO_TARJETA_MM * mm) + (2 * PADDING_TARJETA_PTS)
    _, altura = tarjeta.wrap(ancho_disponible, 1000 * mm)
    return altura


def _calcular_altura_fila_pts(espacio_filas_disponible_pts, filas_en_esta_pagina):
    """
    Calcula, para una página específica, (a) la altura de fila a usar y
    (b) el alto de imagen (en mm) que le corresponde a esa fila. El
    sobrante de espacio (si la grilla no llena la página) se traduce
    primero en una imagen más grande (hasta ALTO_IMG_MM_MAX) y, si aun
    así sobra, en aire extra entre tarjetas.
    """
    altura_base_pts = (
        _altura_tarjeta_pts(ALTO_IMG_MM)
        + PADDING_FILA_SUPERIOR_PTS
        + PADDING_FILA_INFERIOR_PTS
    )
    altura_base_total_pts = altura_base_pts * filas_en_esta_pagina

    if altura_base_total_pts > espacio_filas_disponible_pts:
        return altura_base_pts, ALTO_IMG_MM

    sobrante_pts = espacio_filas_disponible_pts - altura_base_total_pts
    sobrante_por_fila_pts = sobrante_pts / filas_en_esta_pagina

    alto_img_candidato_mm = min(
        ALTO_IMG_MM + (sobrante_por_fila_pts / mm),
        ALTO_IMG_MM_MAX,
    )

    altura_fila_pts = (
        _altura_tarjeta_pts(alto_img_candidato_mm)
        + PADDING_FILA_SUPERIOR_PTS
        + PADDING_FILA_INFERIOR_PTS
    )

    sobrante_restante_pts = espacio_filas_disponible_pts - (altura_fila_pts * filas_en_esta_pagina)
    if sobrante_restante_pts > 0:
        altura_fila_pts += sobrante_restante_pts / filas_en_esta_pagina

    return altura_fila_pts, alto_img_candidato_mm


# ------------------------------------------------------------------
# Caché: hash barato del estado actual de los productos, para que la
# capa de arriba (views.py) pueda decidir "¿existe un PDF actualizado?"
# sin tener que regenerar el catálogo para comparar.
# ------------------------------------------------------------------
def calcular_hash_productos(productos):
    partes = sorted(
        f"{p.unit_price}:{p.bulk_price}:{p.product_of_stock}"
        for p in productos
    )
    crudo = "|".join(partes).encode("utf-8")
    
    # DEBUG temporal
    import logging
    logging.warning("PARTES HASH: %s", partes)
    
    return hashlib.sha256(crudo).hexdigest()



def _construir_encabezado(logo_bytes, fecha_generacion, total_productos):
    """
    Arma los flowables del encabezado (logo + título + datos de
    contacto + fecha + total). Se separa en su propia función porque
    solo se necesita una vez, para la página 1.
    """
    titulo = Paragraph(
        "Catálogo de Productos",
        ParagraphStyle("titulo_pdf", fontName="Helvetica-Bold", fontSize=20, textColor=VERDE_OSCURO),
    )

    _estilo_contacto = ParagraphStyle(
        "contacto_pdf", fontName="Helvetica", fontSize=11,
        textColor=GRIS_SEC, alignment=TA_RIGHT, leading=12,
    )
    contacto_correo = Paragraph(f"Correo: {CORREO_NEGOCIO}", _estilo_contacto)
    contacto_telefono = Paragraph(f"Teléfono: {TELEFONO_NEGOCIO}", _estilo_contacto)
    contacto_pais = Paragraph(f"País: {PAIS_NEGOCIO}", _estilo_contacto)

    fecha = Paragraph(
        f"Generado el {fecha_generacion.strftime('%d/%m/%Y %H:%M')}",
        ParagraphStyle("fecha_pdf", fontName="Helvetica", fontSize=11, textColor=GRIS_SEC, alignment=TA_RIGHT),
    )
    total = Paragraph(
        f"<b>{total_productos}</b> productos en total",
        ParagraphStyle("total_pdf", fontName="Helvetica", fontSize=11, textColor=GRIS_SEC, alignment=TA_RIGHT),
    )

    LOGO_ALTO_MM = 24
    logo_img = None
    if logo_bytes:
        ancho_px, alto_px = PILImage.open(io.BytesIO(logo_bytes)).size
        proporcion = ancho_px / alto_px if alto_px else 1
        logo_ancho_mm = LOGO_ALTO_MM * proporcion
        logo_img = RLImage(
            io.BytesIO(logo_bytes),
            width=logo_ancho_mm * mm,
            height=LOGO_ALTO_MM * mm,
        )

    columna_izquierda = ([logo_img, Spacer(1, 6), titulo] if logo_img else [titulo])
    columna_derecha = [
        contacto_correo, contacto_telefono, contacto_pais,
        Spacer(1, 6),
        fecha, Spacer(1, 2), total,
    ]

    tabla_header = Table([[columna_izquierda, columna_derecha]], colWidths=[100 * mm, 76 * mm])
    tabla_header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    separador = HRFlowable(width="100%", color=GRIS_BORDE, thickness=0.8)

    return [tabla_header, Spacer(1, 8), separador, Spacer(1, 12)]


def _pie_de_pagina_factory(numero_pagina_real):
    """
    Devuelve una función de callback de pie de página que SIEMPRE
    imprime `numero_pagina_real`, sin importar que cada página se
    construya en su propio SimpleDocTemplate (donde doc.page volvería
    a empezar en 1 en cada uno).
    """
    def pie_de_pagina(canvas_obj, doc_obj):
        canvas_obj.saveState()
        ancho_pagina, _ = A4
        canvas_obj.setStrokeColor(GRIS_BORDE)
        canvas_obj.setLineWidth(0.6)
        canvas_obj.line(12 * mm, 12 * mm, ancho_pagina - 12 * mm, 12 * mm)
        canvas_obj.setFont("Helvetica", 7.5)
        canvas_obj.setFillColor(GRIS_SEC)
        canvas_obj.drawString(12 * mm, 8 * mm, "Catálogo generado automáticamente")
        canvas_obj.drawRightString(ancho_pagina - 12 * mm, 8 * mm, f"Página {numero_pagina_real}")
        canvas_obj.restoreState()
    return pie_de_pagina


def generar_pdf_productos(productos, fecha_generacion, logo_url=None, on_batch=None,batch_size=10):
    """
    Punto de entrada público del módulo.

    Recibe:
        productos: lista/queryset de instancias de Producto
        fecha_generacion: datetime a mostrar en el encabezado del PDF
        logo_url: URL opcional del logo del negocio

    Devuelve:
        io.BytesIO con el PDF ya construido, listo para leer.

    Cada página (9 productos) se genera como un PDF de una sola hoja,
    independiente, y se va agregando a un `pypdf.PdfWriter` que arma el
    documento final. Esto es lo que permite soltar la RAM de cada lote
    de 9 productos (imágenes descargadas + flowables de esa página)
    antes de pasar al siguiente, en vez de retener el catálogo completo
    en memoria hasta el final.
    """
    MARGEN_TOP_MM, MARGEN_BOTTOM_MM = 10, 12
    MARGEN_LEFT_MM, MARGEN_RIGHT_MM = 12, 12
    PADDING_FRAME_PTS = 6
    MARGEN_SEGURIDAD_PTS = 4

    productos = list(productos)
    total_productos = len(productos)
    total_paginas = max(1, -(-total_productos // PRODUCTOS_POR_PAGINA))  # ceil division

    logo_bytes = _obtener_logo(logo_url)
    elementos_header = _construir_encabezado(logo_bytes, fecha_generacion, total_productos)

    ancho_disponible_pts = A4[0] - (MARGEN_LEFT_MM + MARGEN_RIGHT_MM) * mm - (2 * PADDING_FRAME_PTS)
    alto_disponible_pts = (
        A4[1] - (MARGEN_TOP_MM + MARGEN_BOTTOM_MM) * mm
        - (2 * PADDING_FRAME_PTS) - MARGEN_SEGURIDAD_PTS
    )

    altura_header_pts = 0
    for flowable in elementos_header:
        _, alto = flowable.wrap(ancho_disponible_pts, alto_disponible_pts)
        altura_header_pts += alto

    espacio_filas_pagina_1_pts = alto_disponible_pts - altura_header_pts
    espacio_filas_paginas_siguientes_pts = alto_disponible_pts

    colWidths_fila = [ANCHO_COLUMNA_MM * mm] * COLUMNAS

    writer = PdfWriter()

    for indice_pagina in range(total_paginas):
        inicio = indice_pagina * PRODUCTOS_POR_PAGINA
        bloque = productos[inicio:inicio + PRODUCTOS_POR_PAGINA]
        filas_en_esta_pagina = max(1, -(-len(bloque) // COLUMNAS))

        espacio_filas_pts = (
            espacio_filas_pagina_1_pts if indice_pagina == 0
            else espacio_filas_paginas_siguientes_pts
        )
        altura_fila_pts, alto_img_mm_pagina = _calcular_altura_fila_pts(
            espacio_filas_pts, filas_en_esta_pagina
        )

        # `story_pagina` vive solo durante esta iteración: contiene, a lo
        # sumo, los 9 productos de ESTA página (imágenes ya reducidas a
        # thumbnail). Al terminar el `build()` de más abajo y salir del
        # for, no queda ninguna referencia viva a esas imágenes.
        story_pagina = []
        if indice_pagina == 0:
            story_pagina.extend(elementos_header)

        for indice_fila in range(filas_en_esta_pagina):
            fila_productos = bloque[indice_fila * COLUMNAS:(indice_fila + 1) * COLUMNAS]
            if not fila_productos:
                break

            celdas = []
            for producto in fila_productos:
                imagen_buffer = _obtener_imagen_producto(producto)
                celdas.append(_tarjeta_con_borde(
                    _tarjeta_producto(
                        producto, imagen_buffer,
                        logo_bytes=None,
                        alto_img_mm=alto_img_mm_pagina,
                    )
                ))

            while len(celdas) < COLUMNAS:
                celdas.append("")

            tabla_fila = Table([celdas], colWidths=colWidths_fila, rowHeights=[altura_fila_pts])
            tabla_fila.setStyle(_estilo_tabla_fila())
            story_pagina.append(tabla_fila)

        buffer_pagina = io.BytesIO()
        doc_pagina = SimpleDocTemplate(
            buffer_pagina, pagesize=A4,
            topMargin=MARGEN_TOP_MM * mm, bottomMargin=MARGEN_BOTTOM_MM * mm,
            leftMargin=MARGEN_LEFT_MM * mm, rightMargin=MARGEN_RIGHT_MM * mm,
        )
        pie_de_pagina = _pie_de_pagina_factory(indice_pagina + 1)
        doc_pagina.build(story_pagina, onFirstPage=pie_de_pagina, onLaterPages=pie_de_pagina)
        buffer_pagina.seek(0)

        reader_pagina = PdfReader(buffer_pagina)
        for pagina_pdf in reader_pagina.pages:
            writer.add_page(pagina_pdf)

        # Liberar explícitamente todo lo de este lote antes de pasar al
        # siguiente: las imágenes JPEG ya quedaron "quemadas" dentro del
        # PDF de la página (buffer_pagina), así que estos objetos en
        # Python ya no hacen falta.
        del story_pagina, doc_pagina, buffer_pagina, reader_pagina
        gc.collect()

    buffer_final = io.BytesIO()
    writer.write(buffer_final)
    buffer_final.seek(0)
    return buffer_final


def descargar_imagen_reducida(producto, width=200, height=200):
    url = obtener_url_redimensionada(producto, width, height)
    if not url:
        return None
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return BytesIO(response.content)  # ahora es liviano, listo para insertar al PDF

from cloudinary import CloudinaryImage

def obtener_url_redimensionada(producto, width=200, height=200):
    if not producto.image:
        return None
    return CloudinaryImage(producto.image.public_id).build_url(
        width=width,
        height=height,
        crop="fill",       # recorta manteniendo proporción, llenando el cuadro
        quality="auto",    # Cloudinary elige la mejor compresión
        fetch_format="auto",  # elige el mejor formato (webp/jpg) automáticamente
    )