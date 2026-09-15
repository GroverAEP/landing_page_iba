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
"""

import io
from functools import lru_cache
from types import SimpleNamespace

import requests

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    Image as RLImage, HRFlowable, PageBreak, Flowable,
)
from PIL import Image as PILImage, ImageDraw, ImageFont


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
# Con menos tarjetas por página, cada una se agranda para aprovechar
# todo el espacio disponible (imagen más grande, textos más grandes y
# más aire entre tarjetas).
# ------------------------------------------------------------------
COLUMNAS = 3
FILAS_POR_PAGINA = 3
PRODUCTOS_POR_PAGINA = COLUMNAS * FILAS_POR_PAGINA

# Ancho útil de A4 (210mm) menos márgenes izq/der (12mm cada uno) = 186mm.
# Repartido en 3 columnas iguales: 62mm cada una.
ANCHO_COLUMNA_MM = 62
ANCHO_TARJETA_MM = 54  # deja ~4mm de padding a cada lado dentro de la columna

# Alto BASE de la imagen. Este es el punto de partida — cuando sobra
# espacio en la página (grilla no llena, o página con más aire del
# esperado), ese sobrante ya no se deja como aire en blanco debajo de
# la tarjeta: se usa para agrandar la imagen por encima de este valor
# base (ver _calcular_altura_fila_pts). Por eso ya no se trata como una
# constante fija en el resto del módulo, sino como un valor por defecto
# que cada página puede superar.
ALTO_IMG_MM = 27

# Tope máximo de cuánto se puede agrandar la imagen respecto del alto
# base. Sin este tope, una última página con muy pocos productos (p.
# ej. 1 o 2) tendría tanto sobrante que la imagen se estiraría de forma
# desproporcionada respecto del resto de las tarjetas del catálogo.
ALTO_IMG_MM_MAX = ALTO_IMG_MM * 1.6

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
# Precio por unidad: +2pt respecto del original (9 -> 11) a pedido.
_estilo_precio_unidad = ParagraphStyle(
    "precio_unidad_pdf", fontName="Helvetica", fontSize=11,
    textColor=GRIS_SEC, spaceAfter=1.5,
)
# Precio por bulto/paquete: +2pt respecto del original (10.2 -> 12.2) a pedido.
_estilo_precio_bulto = ParagraphStyle(
    "precio_bulto_pdf", fontName="Helvetica-Bold", fontSize=12.2,
    textColor=VERDE_OSCURO,
)
_estilo_badge = ParagraphStyle(
    "badge_pdf", fontName="Helvetica-Bold", fontSize=8,
    textColor=BLANCO, alignment=1,  # 1 = centrado
)


# Ancho interior real disponible para el texto de cada tarjeta: el ancho
# de la tarjeta menos NADA de padding extra, porque el padding de la
# tarjeta (PADDING_TARJETA_PTS) ya se aplica por fuera, a nivel de la
# tabla que envuelve toda la tarjeta (_tarjeta_con_borde) — no por cada
# Paragraph individual. Así que el Paragraph recibe exactamente
# ANCHO_TARJETA_MM de ancho disponible.
ANCHO_TEXTO_DISPONIBLE_PTS = ANCHO_TARJETA_MM * mm


def _truncar_a_ancho(texto, font_name, font_size, max_width_pts=None):
    """
    Corta el texto a una sola línea con '…' si su ancho renderizado (con
    la fuente y tamaño reales que va a usar el Paragraph) excede
    max_width_pts.

    Antes se truncaba por CANTIDAD DE CARACTERES (max_caracteres fijo,
    ej. 26). El problema: ese límite se calibró "a ojo" y no tiene en
    cuenta que letras anchas (mayúsculas, negrita) ocupan más espacio
    que letras angostas — un texto de 26 caracteres en Helvetica-Bold
    puede no entrar en una sola línea, mientras que uno de 26 caracteres
    en Helvetica normal sobra espacio de más. Esto generaba dos
    problemas:
      1) En el peor caso (el texto de referencia "M"*26 que se usa para
         medir la altura máxima de una tarjeta, ver _altura_tarjeta_pts),
         el Paragraph terminaba envolviendo a 2 líneas en vez de 1,
         haciendo que la altura "peor caso" fuera mucho mayor a la de
         cualquier tarjeta real — y esa altura de más es exactamente el
         espacio en blanco que quedaba de sobra debajo de cada fila real
         (y, en la última fila de la página, como un bloque de espacio
         vacío antes del pie de página).
      2) Con datos reales, un nombre de producto que SÍ cabía en el
         límite de caracteres pero con letras anchas podía igual
         envolver a 2 líneas y romper la altura constante de la
         tarjeta.

    Truncar por ANCHO REAL (con stringWidth, la misma métrica que usa
    internamente reportlab para decidir si envuelve el texto) garantiza
    que el texto entra siempre en una sola línea — tanto en el caso de
    referencia (usado para medir el peor caso) como en los datos reales
    — así que la altura medida como "peor caso" ya no se sobreestima y
    el espacio en blanco de más desaparece.
    """
    if not texto:
        return ""

    if max_width_pts is None:
        max_width_pts = ANCHO_TEXTO_DISPONIBLE_PTS

    if stringWidth(texto, font_name, font_size) <= max_width_pts:
        return texto

    elipsis = "…"
    # Recorta de a un carácter hasta que "texto recortado + …" entre en
    # el ancho disponible. Los textos de catálogo son cortos (nombres,
    # marcas, categorías), así que este recorte lineal es más que
    # suficiente en costo.
    for i in range(len(texto) - 1, 0, -1):
        candidato = texto[:i].rstrip() + elipsis
        if stringWidth(candidato, font_name, font_size) <= max_width_pts:
            return candidato

    return elipsis


def _a_rgb_sobre_blanco(imagen_pil):
    """
    Convierte cualquier imagen (incluyendo PNG con transparencia) a RGB
    componiéndola sobre un fondo blanco. Sin esto, un logo con fondo
    transparente aparecería con fondo negro al guardarlo como JPEG.
    """
    if imagen_pil.mode in ("RGBA", "LA") or (imagen_pil.mode == "P" and "transparency" in imagen_pil.info):
        imagen_pil = imagen_pil.convert("RGBA")
        fondo = PILImage.new("RGB", imagen_pil.size, (255, 255, 255))
        fondo.paste(imagen_pil, mask=imagen_pil.split()[-1])
        return fondo
    return imagen_pil.convert("RGB")


def _obtener_logo(logo_url):
    """
    Descarga o lee el logo del negocio.

    Se usa una vez en el encabezado del PDF (grande). Ya NO se usa por
    cada tarjeta de producto: a pedido, se quitó la insignia circular
    del logo superpuesta sobre la foto de cada producto (ver
    _tarjeta_producto / generar_pdf_productos más abajo).

    Soporta dos casos:
      - URL absoluta (http/https), p. ej. una imagen en Cloudinary: se
        descarga con requests, igual que las imágenes de producto.
      - Ruta de un archivo estático local, p. ej. static("img/logo.png")
        (que devuelve algo como "/static/img/logo.png"): se resuelve con
        los finders de staticfiles y se lee directo del disco, sin pasar
        por HTTP.

    Devuelve los BYTES del logo ya convertido a JPEG (no un buffer), para
    poder crear un io.BytesIO nuevo cada vez que se necesite sin pisar la
    posición de lectura de las demás veces que se usa dentro del mismo
    PDF. Devuelve None si no hay logo_url o no se pudo obtener la imagen
    (para que el PDF nunca se rompa por esto).
    """
    if not logo_url:
        return None

    try:
        if logo_url.startswith("http://") or logo_url.startswith("https://"):
            respuesta = requests.get(logo_url, timeout=6)
            respuesta.raise_for_status()
            imagen_pil = PILImage.open(io.BytesIO(respuesta.content))
        else:
            # Ruta relativa tipo "/static/img/logo.png" -> resolver a
            # ruta absoluta en disco con los finders de staticfiles.
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
    Descarga la imagen del producto (Cloudinary) y la deja lista para
    reportlab. Si no tiene imagen o falla la descarga, devuelve el
    placeholder "NOT AVAILABLE" generado al vuelo, para que el catálogo
    no se rompa.
    """
    if producto.image:
        try:
            respuesta = requests.get(producto.image.url, timeout=6)
            respuesta.raise_for_status()
            imagen_pil = PILImage.open(io.BytesIO(respuesta.content)).convert("RGB")
            buffer = io.BytesIO()
            imagen_pil.save(buffer, format="JPEG", quality=85)
            buffer.seek(0)
            return buffer
        except Exception:
            pass  # cae al placeholder de abajo

    return _imagen_placeholder()


@lru_cache(maxsize=1)
def _bytes_placeholder(ancho_px=440, alto_px=340):
    """
    Dibuja (con PIL, no es una imagen estática) el ícono de "imagen no
    disponible" del catálogo web: un marco redondeado con un sol, una
    montaña y una línea diagonal cruzándolo, más el texto NOT AVAILABLE
    debajo. Se cachea porque es siempre igual — no depende del producto.

    Devuelve BYTES (no un buffer) para que cada producto sin imagen
    pueda crear su propio io.BytesIO independiente a partir del mismo
    dibujo, sin compartir (ni pisar) la posición de lectura de otros
    productos que también estén usando el placeholder en el mismo PDF.
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

    # Marco del ícono (rectángulo redondeado)
    dibujo.rounded_rectangle([x0, y0, x1, y1], radius=icono_lado * 0.08,
                              outline=trazo, width=grosor)

    # Sol: círculo pequeño arriba a la izquierda dentro del marco
    radio_sol = icono_lado * 0.11
    sol_cx, sol_cy = x0 + icono_lado * 0.28, y0 + icono_lado * 0.28
    dibujo.ellipse(
        [sol_cx - radio_sol, sol_cy - radio_sol, sol_cx + radio_sol, sol_cy + radio_sol],
        outline=trazo, width=grosor,
    )

    # Montaña: línea en forma de pico apoyada en la base del marco
    m1 = (x0 + icono_lado * 0.10, y1 - icono_lado * 0.10)
    m2 = (x0 + icono_lado * 0.45, y1 - icono_lado * 0.48)
    m3 = (x0 + icono_lado * 0.80, y1 - icono_lado * 0.10)
    dibujo.line([m1, m2, m3], fill=trazo, width=grosor, joint="curve")

    # Línea diagonal que cruza todo el ícono, de esquina a esquina
    dibujo.line([x0, y1, x1, y0], fill=trazo, width=grosor)

    # Texto "NOT AVAILABLE" debajo del ícono
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
    Flowable a medida que dibuja la imagen del producto y, si se le pasa
    un logo (logo_bytes), lo superpone como una insignia circular en la
    esquina superior derecha.

    NOTA: a pedido, ya no se llama a esta clase con logo_bytes desde
    generar_pdf_productos (se pasa siempre None para las tarjetas de
    producto), así que en la práctica hoy nunca se dibuja la insignia.
    Se deja el soporte de logo_bytes intacto por si se necesita
    reactivarlo más adelante.

    Se implementa como Flowable propio (en vez de anidar dos RLImage en
    una tabla) porque ReportLab no tiene una forma simple de "apilar"
    flowables uno encima del otro; acá se dibuja todo directo sobre el
    canvas en coordenadas relativas al propio recuadro del flowable, así
    que el logo queda realmente superpuesto sobre la foto y no ocupando
    una fila aparte que agrande la tarjeta.
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

        # Fondo blanco detrás del logo, por si tiene transparencia o no
        # cubre todo el círculo — evita que se vea la foto "por debajo".
        canv.saveState()
        canv.setFillColor(BLANCO)
        canv.circle(cx, cy, diametro / 2, stroke=0, fill=1)
        canv.restoreState()

        # Recorta el logo en forma circular.
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

        # Borde fino para separar la insignia de la foto.
        canv.saveState()
        canv.setStrokeColor(GRIS_BORDE)
        canv.setLineWidth(0.8)
        canv.circle(cx, cy, diametro / 2, stroke=1, fill=0)
        canv.restoreState()


def _tarjeta_producto(producto, imagen_buffer, logo_bytes=None, alto_img_mm=ALTO_IMG_MM):
    """
    Arma el bloque visual (lista de flowables) para un producto.

    `logo_bytes` se mantiene como parámetro (con default None) por
    compatibilidad, pero ya no se le pasa nada desde
    generar_pdf_productos: a pedido, las tarjetas de producto ya no
    llevan la insignia circular del logo del negocio.

    `alto_img_mm` ya no es siempre la constante ALTO_IMG_MM: cuando una
    página tiene espacio de sobra (grilla no llena, o simplemente sobra
    aire respecto del mínimo necesario), ese sobrante se traduce en un
    valor de alto_img_mm más grande — así la imagen crece para llenar
    el espacio en vez de dejarlo como aire en blanco debajo de la
    tarjeta (ver _calcular_altura_fila_pts).
    """
    elementos = []

    img = _ImagenConLogoFlowable(
        imagen_bytes=imagen_buffer.getvalue(),
        logo_bytes=logo_bytes,
        width=ANCHO_TARJETA_MM * mm,
        height=alto_img_mm * mm,
    )

    # La fila del badge SIEMPRE existe (con o sin stock) y con la misma
    # altura, para que la tarjeta tenga una altura constante y no empuje
    # el resto de la grilla cuando un producto está agotado.
    if not producto.product_of_stock:
        # OJO: Table usa 6pt de padding izq/der por default si no se
        # especifica — por eso se fija LEFT/RIGHTPADDING explícito acá,
        # para que "¡AGOTADO!" nunca aparezca recortado.
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
    # Tamaño de fuente actualizado a 11 (antes 9) para que coincida con
    # _estilo_precio_unidad y el truncado por ancho mida correctamente.
    elementos.append(Paragraph(
        _truncar_a_ancho(
            f"S/ {producto.unit_price} x {unidad_nombre}".strip(), "Helvetica", 11,
        ),
        _estilo_precio_unidad,
    ))

    if producto.bulk_price and producto.bulk_unit_of_measure:
        # Tamaño de fuente actualizado a 12.2 (antes 10.2) para que
        # coincida con _estilo_precio_bulto.
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


PADDING_TARJETA_PTS = 6  # tarjetas grandes: buen aire interno

# Padding propio de la celda de cada fila de la grilla (por fuera de la
# tarjeta). Se define acá, como constante compartida, porque el cálculo
# de altura de fila (ver _calcular_altura_fila_pts) TIENE que saber
# cuánto espacio extra agrega esto, o subestima la altura real y el
# contenido termina desbordándose sobre la fila de abajo / el footer.
PADDING_FILA_SUPERIOR_PTS = 4
PADDING_FILA_INFERIOR_PTS = 7


COLOR_BORDE_TARJETA = HexColor("#DADBD7")
GROSOR_BORDE_TARJETA = 0.6
RADIO_ESQUINA_TARJETA_PTS = 5


def _tarjeta_con_borde(elementos):
    """
    Envuelve el contenido de una tarjeta de producto en su propia mini
    tabla con un recuadro fino y esquinas redondeadas (look de "card" de
    catálogo), con padding interno parejo por los 4 lados para que el
    borde nunca quede pegado al texto ni a la imagen.
    """
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
    Mide (con .wrap(), no "a ojo") la altura real que puede llegar a
    ocupar UNA tarjeta, en su variante más alta posible, PARA UN alto de
    imagen dado:
      - producto agotado (agrega la fila del badge rojo) — aunque esto
        no cambia la altura porque el espacio del badge siempre está
        reservado, se incluye por prolijidad/consistencia.
      - con precio por bulto (agrega una línea extra de texto, que es
        más alta que el Spacer que se usa cuando no hay precio bulto).

    Antes esta función no recibía parámetros: medía siempre contra
    ALTO_IMG_MM fijo. Ahora se cachea por valor de alto_img_mm porque
    _calcular_altura_fila_pts necesita saber, para CADA candidato de
    alto de imagen (el base y los agrandados cuando sobra espacio),
    cuánto mide la tarjeta completa con ese alto — así puede decidir
    cuánto crecer la imagen sin que la tarjeta se pase del espacio
    disponible en la página.

    La insignia del logo ya no se dibuja en ningún caso dentro del
    recuadro de la imagen (se quitó de las tarjetas de producto), así
    que este cálculo de altura sigue midiendo sin logo_bytes, como
    antes.
    """
    # Los textos de referencia son deliberadamente más largos de lo que
    # cabría en una línea — no importa la cantidad exacta de caracteres,
    # porque _truncar_a_ancho ahora trunca por ANCHO REAL renderizado
    # (no por cantidad de caracteres), así que cualquier texto más largo
    # que el ancho disponible queda recortado a una sola línea de forma
    # consistente, tanto acá (caso de referencia) como con datos reales.
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
    (b) el alto de imagen (en mm) que le corresponde a esa fila.

    Recibe `filas_en_esta_pagina` (no siempre es FILAS_POR_PAGINA) porque
    la última página puede tener menos filas que una página completa —
    por ejemplo, si sobran solo 4 productos, esa hoja tiene 1 sola fila.

    Se parte SIEMPRE de la altura real medida de una tarjeta (peor caso)
    con el alto de imagen BASE (ALTO_IMG_MM) más el padding propio de la
    fila. Ese es el piso mínimo: nunca se usa una altura de fila menor a
    la que la tarjeta necesita para no solaparse con la fila de abajo.

    Si sobra espacio en la página respecto de ese piso mínimo, el
    sobrante YA NO se deja como aire en blanco debajo de cada tarjeta:
    se traduce en un alto de imagen mayor (limitado por
    ALTO_IMG_MM_MAX) y se vuelve a medir la altura real de la tarjeta
    con ese nuevo alto de imagen — así la parte vertical del producto
    (la foto) es la que crece para aprovechar el espacio, en vez de
    quedar un hueco vacío.

    Si aun agrandando la imagen al máximo sigue sobrando espacio, ese
    resto sí se deja como aire extra (spacing entre tarjetas), igual
    que antes.

    Devuelve una tupla (altura_fila_pts, alto_img_mm).
    """
    altura_base_pts = (
        _altura_tarjeta_pts(ALTO_IMG_MM)
        + PADDING_FILA_SUPERIOR_PTS
        + PADDING_FILA_INFERIOR_PTS
    )
    altura_base_total_pts = altura_base_pts * filas_en_esta_pagina

    if altura_base_total_pts > espacio_filas_disponible_pts:
        # No hay ni siquiera espacio para el mínimo: se usa el piso y
        # que ReportLab empuje lo que no entre a la página siguiente.
        return altura_base_pts, ALTO_IMG_MM

    sobrante_pts = espacio_filas_disponible_pts - altura_base_total_pts
    sobrante_por_fila_pts = sobrante_pts / filas_en_esta_pagina

    # Candidato: agrandar la imagen en la misma medida del sobrante,
    # limitado por el tope máximo.
    alto_img_candidato_mm = min(
        ALTO_IMG_MM + (sobrante_por_fila_pts / mm),
        ALTO_IMG_MM_MAX,
    )

    altura_fila_pts = (
        _altura_tarjeta_pts(alto_img_candidato_mm)
        + PADDING_FILA_SUPERIOR_PTS
        + PADDING_FILA_INFERIOR_PTS
    )

    # Si tras topear el alto de imagen todavía queda espacio de sobra
    # (caso de páginas con muy pocos productos), ese resto sí se reparte
    # como aire extra debajo de la tarjeta, igual que antes.
    sobrante_restante_pts = espacio_filas_disponible_pts - (altura_fila_pts * filas_en_esta_pagina)
    if sobrante_restante_pts > 0:
        altura_fila_pts += sobrante_restante_pts / filas_en_esta_pagina

    return altura_fila_pts, alto_img_candidato_mm


def generar_pdf_productos(productos, fecha_generacion, logo_url=None):
    """
    Punto de entrada público del módulo.

    Recibe:
        productos: lista/queryset de instancias de Producto
        fecha_generacion: datetime a mostrar en el encabezado del PDF
                           (se pasa desde afuera para no acoplar este
                           módulo a timezone.now() de Django).
        logo_url: URL opcional del logo del negocio (p. ej. producto.image.url
                  de un modelo Negocio/Empresa en Cloudinary). Si se omite o
                  falla la descarga, el encabezado se arma sin logo. Ya NO
                  se usa para las tarjetas de producto (ver más abajo).

    Devuelve:
        io.BytesIO con el PDF ya construido, listo para leer.

    La grilla es de 3 columnas x 3 filas (9 productos por página), con
    tarjetas al estilo del catálogo web, y un placeholder "NOT
    AVAILABLE" para los productos sin imagen. Las tarjetas de producto
    ya NO llevan la insignia circular del logo del negocio (se quitó a
    pedido); el logo solo se sigue mostrando, agrandado, en el
    encabezado. Cada página se cierra explícitamente con un salto de
    página para que la distribución sea siempre simétrica, incluso
    cuando la última página no se llena por completo (las celdas
    sobrantes quedan vacías en lugar de correrse hacia la izquierda).

    La altura de cada fila (y el alto de la foto dentro de la tarjeta)
    se recalcula por separado para la página 1 (que lleva el
    logo/título/fecha arriba) y para la página 2 en adelante (que no
    lleva header y por lo tanto puede aprovechar todo el alto de la
    hoja). En ambos casos, cuando sobra espacio respecto del mínimo que
    necesita una tarjeta, ese sobrante se usa para agrandar la foto del
    producto en vez de dejarlo como aire en blanco.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=10 * mm, bottomMargin=12 * mm,
        leftMargin=12 * mm, rightMargin=12 * mm,
    )

    story = []

    # ---------------- Logo del negocio ----------------
    # Se obtiene una sola vez como bytes "planos" (no un buffer). Ahora
    # solo se usa en el encabezado del PDF — ya no se reutiliza por cada
    # tarjeta de producto (ver _tarjeta_producto más abajo, que se llama
    # sin logo_bytes).
    logo_bytes = _obtener_logo(logo_url)

    # ---------------- Encabezado ----------------
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
        f"<b>{len(productos)}</b> productos en total",
        ParagraphStyle("total_pdf", fontName="Helvetica", fontSize=11, textColor=GRIS_SEC, alignment=TA_RIGHT),
    )

    # Logo del título agrandado a pedido (antes 16mm -> ahora 24mm).
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

    # Columna izquierda: logo (si hay) arriba del título, como un solo
    # bloque. Columna derecha: datos de contacto arriba, y debajo la
    # fecha de generación + el total de productos (estos dos últimos
    # siguen armándose 100% a partir de los parámetros de la función,
    # no están quemados).
    columna_izquierda = ([logo_img, Spacer(1, 6), titulo] if logo_img else [titulo])
    columna_derecha = [
        contacto_correo, contacto_telefono, contacto_pais,
        Spacer(1, 6),
        fecha, Spacer(1, 2), total,
    ]

    # OJO: las dos columnas van en la MISMA tabla (mismo row), con
    # VALIGN MIDDLE. Antes el logo se agregaba al story como un
    # flowable aparte, ANTES de esta tabla — entonces el "centrado"
    # solo se aplicaba entre el título y la columna derecha, pero el
    # logo seguía empujando todo hacia abajo sin formar parte del
    # cálculo. Al meter logo+título como una sola celda, ReportLab
    # centra el conjunto (logo+título) contra el conjunto (contacto+
    # fecha+total), igual que un `div` con `align-items: center`.
    tabla_header = Table([[columna_izquierda, columna_derecha]], colWidths=[100 * mm, 76 * mm])
    tabla_header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    separador = HRFlowable(width="100%", color=GRIS_BORDE, thickness=0.8)
    espaciador_1 = Spacer(1, 8)
    espaciador_2 = Spacer(1, 12)

    story.append(tabla_header)
    story.append(espaciador_1)
    story.append(separador)
    story.append(espaciador_2)

    # ---------------- Grilla de productos (3 columnas x 3 filas) ----------------
    # La altura de cada fila (y el alto de imagen dentro de la tarjeta)
    # se calcula para que las filas ocupen, en la medida de lo posible,
    # el alto completo de la página — pero SIN bajar nunca de la altura
    # real que necesita una tarjeta (ver _calcular_altura_fila_pts). Eso
    # es lo que evita que una tarjeta se dibuje encima de la fila
    # siguiente o invada el pie de página.
    # SimpleDocTemplate arma el Frame de contenido con un padding interno
    # propio (6pt por borde, además de los márgenes de la página). Si no lo
    # restamos acá, el cálculo de la altura de fila queda "justo" y la
    # última fila termina desbordándose a una página nueva.
    PADDING_FRAME_PTS = 6
    MARGEN_SEGURIDAD_PTS = 4  # colchón extra para redondeos

    ancho_disponible_pts = A4[0] - doc.leftMargin - doc.rightMargin - (2 * PADDING_FRAME_PTS)
    alto_disponible_pts = (
        A4[1] - doc.topMargin - doc.bottomMargin
        - (2 * PADDING_FRAME_PTS) - MARGEN_SEGURIDAD_PTS
    )

    elementos_header = [tabla_header, espaciador_1, separador, espaciador_2]

    altura_header_pts = 0
    for flowable in elementos_header:
        _, alto = flowable.wrap(ancho_disponible_pts, alto_disponible_pts)
        altura_header_pts += alto

    # El logo/título/fecha SOLO se agregan una vez al story, al principio
    # (ver más abajo), así que únicamente le "restan" espacio disponible a
    # la PRIMERA página. A partir de la página 2 no hay header, así que la
    # grilla puede (y debe) usar el alto completo de la página.
    espacio_filas_pagina_1_pts = alto_disponible_pts - altura_header_pts
    espacio_filas_paginas_siguientes_pts = alto_disponible_pts

    colWidths_fila = [ANCHO_COLUMNA_MM * mm] * COLUMNAS
    productos = list(productos)
    total_paginas = max(1, -(-len(productos) // PRODUCTOS_POR_PAGINA))  # ceil division

    for indice_pagina in range(total_paginas):
        inicio = indice_pagina * PRODUCTOS_POR_PAGINA
        bloque = productos[inicio:inicio + PRODUCTOS_POR_PAGINA]

        # Filas que esta página va a usar REALMENTE (la última página
        # puede tener menos que una grilla completa, p. ej. 1 sola fila
        # si sobran 4 productos o menos). Se calcula ANTES de definir la
        # altura de fila, porque el sobrante de espacio se reparte entre
        # estas filas y no entre las FILAS_POR_PAGINA de una grilla llena
        # — así esa página no queda con un montón de espacio en blanco
        # abajo, sino que sus filas (y las fotos dentro de ellas) se
        # estiran para llenar la hoja.
        filas_en_esta_pagina = max(1, -(-len(bloque) // COLUMNAS))

        espacio_filas_pts = (
            espacio_filas_pagina_1_pts if indice_pagina == 0
            else espacio_filas_paginas_siguientes_pts
        )
        altura_fila_pts, alto_img_mm_pagina = _calcular_altura_fila_pts(
            espacio_filas_pts, filas_en_esta_pagina
        )

        for indice_fila in range(filas_en_esta_pagina):
            fila_productos = bloque[indice_fila * COLUMNAS:(indice_fila + 1) * COLUMNAS]
            if not fila_productos:
                # No hay más productos: se detiene esta página (las filas
                # restantes simplemente no se dibujan, quedando el bloque
                # simétrico respecto de las celdas ya usadas).
                break

            celdas = []
            for producto in fila_productos:
                imagen_buffer = _obtener_imagen_producto(producto)
                celdas.append(_tarjeta_con_borde(
                    _tarjeta_producto(
                        producto, imagen_buffer,
                        # A pedido: ya no se pasa el logo del negocio a
                        # las tarjetas de producto (antes: logo_bytes).
                        logo_bytes=None,
                        alto_img_mm=alto_img_mm_pagina,
                    )
                ))

            # Si la fila quedó incompleta, se rellenan las celdas restantes
            # vacías para que la tabla mantenga las 3 columnas parejas.
            while len(celdas) < COLUMNAS:
                celdas.append("")

            tabla_fila = Table([celdas], colWidths=colWidths_fila, rowHeights=[altura_fila_pts])
            tabla_fila.setStyle(_estilo_tabla_fila())
            story.append(tabla_fila)

        if indice_pagina < total_paginas - 1:
            story.append(PageBreak())

    def pie_de_pagina(canvas_obj, doc_obj):
        canvas_obj.saveState()
        ancho_pagina, _ = A4
        canvas_obj.setStrokeColor(GRIS_BORDE)
        canvas_obj.setLineWidth(0.6)
        canvas_obj.line(12 * mm, 12 * mm, ancho_pagina - 12 * mm, 12 * mm)
        canvas_obj.setFont("Helvetica", 7.5)
        canvas_obj.setFillColor(GRIS_SEC)
        canvas_obj.drawString(12 * mm, 8 * mm, "Catálogo generado automáticamente")
        canvas_obj.drawRightString(ancho_pagina - 12 * mm, 8 * mm, f"Página {doc_obj.page}")
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=pie_de_pagina, onLaterPages=pie_de_pagina)
    buffer.seek(0)
    return buffer