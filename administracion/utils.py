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
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    Image as RLImage, HRFlowable, PageBreak,
)
from PIL import Image as PILImage


# ------------------------------------------------------------------
# Estilos y colores (mismos tonos de marca usados en el resto del panel)
# ------------------------------------------------------------------
VERDE_OSCURO = HexColor("#0B7A10")
ROJO = HexColor("#DC3646")
GRIS_TEXTO = HexColor("#444444")
GRIS_SEC = HexColor("#777777")
GRIS_BORDE = HexColor("#E3E4E1")
BLANCO = HexColor("#FFFFFF")

# ------------------------------------------------------------------
# Datos de contacto del negocio, mostrados en el encabezado del PDF.
# ------------------------------------------------------------------
CORREO_NEGOCIO = "ibafex.ha@gmail.com"
TELEFONO_NEGOCIO = "+51 919 294 944"
PAIS_NEGOCIO = "Perú"

# ------------------------------------------------------------------
# Grilla: 3 columnas x 4 filas = 12 productos por página, simétrica.
# ------------------------------------------------------------------
COLUMNAS = 3
FILAS_POR_PAGINA = 3
PRODUCTOS_POR_PAGINA = COLUMNAS * FILAS_POR_PAGINA

# Ancho útil de A4 (210mm) menos márgenes izq/der (12mm cada uno) = 186mm.
# Repartido en 3 columnas iguales: 62mm cada una.
ANCHO_COLUMNA_MM = 62
ANCHO_TARJETA_MM = 54  # deja ~4mm de padding a cada lado dentro de la columna
ALTO_IMG_MM = 30  # más baja que la original para que 4 filas quepan en una sola hoja

_estilo_marca = ParagraphStyle(
    "marca_pdf", fontName="Helvetica-Bold", fontSize=7.5,
    textColor=GRIS_SEC, spaceAfter=1, leading=9,
)
_estilo_nombre = ParagraphStyle(
    "nombre_pdf", fontName="Helvetica-Bold", fontSize=9.2,
    textColor=GRIS_TEXTO, leading=11, spaceAfter=1,
)
_estilo_categoria = ParagraphStyle(
    "categoria_pdf", fontName="Helvetica-Oblique", fontSize=7.5,
    textColor=GRIS_SEC, leading=9, spaceAfter=1,
)
_estilo_precio_unidad = ParagraphStyle(
    "precio_unidad_pdf", fontName="Helvetica", fontSize=8,
    textColor=GRIS_SEC, spaceAfter=1,
)
_estilo_precio_bulto = ParagraphStyle(
    "precio_bulto_pdf", fontName="Helvetica-Bold", fontSize=8.7,
    textColor=VERDE_OSCURO,
)
_estilo_badge = ParagraphStyle(
    "badge_pdf", fontName="Helvetica-Bold", fontSize=7,
    textColor=BLANCO, alignment=1,  # 1 = centrado
)


def _truncar_texto(texto, max_caracteres):
    """
    Corta el texto a una sola línea con '…' si excede max_caracteres.
    Esto es clave para que cada tarjeta tenga SIEMPRE la misma altura
    (un nombre largo que ocupe 2 líneas es lo que hacía crecer la fila
    y empujaba la última fila de la página a una hoja extra).
    """
    if texto and len(texto) > max_caracteres:
        return texto[:max_caracteres - 1].rstrip() + "…"
    return texto or ""


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
    Descarga o lee el logo del negocio para el encabezado del PDF.

    Soporta dos casos:
      - URL absoluta (http/https), p. ej. una imagen en Cloudinary: se
        descarga con requests, igual que las imágenes de producto.
      - Ruta de un archivo estático local, p. ej. static("img/logo.png")
        (que devuelve algo como "/static/img/logo.png"): se resuelve con
        los finders de staticfiles y se lee directo del disco, sin pasar
        por HTTP.

    Devuelve un buffer JPEG listo para reportlab, o None si no hay
    logo_url o no se pudo obtener la imagen (para que el PDF nunca se
    rompa por esto).
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
        buffer.seek(0)
        return buffer
    except Exception:
        return None


def _obtener_imagen_producto(producto):
    """
    Descarga la imagen del producto (Cloudinary) y la deja lista para
    reportlab. Si no tiene imagen o falla la descarga, devuelve un
    placeholder gris generado al vuelo, para que el catálogo no se rompa.
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


def _imagen_placeholder():
    """Genera (sin depender de un producto) el rectángulo gris de relleno."""
    imagen_placeholder = PILImage.new("RGB", (300, 230), color=(238, 238, 236))
    buffer = io.BytesIO()
    imagen_placeholder.save(buffer, format="JPEG")
    buffer.seek(0)
    return buffer


def _tarjeta_producto(producto, imagen_buffer):
    """Arma el bloque visual (lista de flowables) para un producto."""
    elementos = []

    img = RLImage(imagen_buffer, width=ANCHO_TARJETA_MM * mm, height=ALTO_IMG_MM * mm)

    # La fila del badge SIEMPRE existe (con o sin stock) y con la misma
    # altura, para que la tarjeta tenga una altura constante y no empuje
    # el resto de la grilla cuando un producto está agotado.
    if not producto.product_of_stock:
        celda_badge = Table(
            [[Paragraph("¡AGOTADO!", _estilo_badge)]],
            colWidths=[22 * mm], rowHeights=[5 * mm],
        )
        celda_badge.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), ROJO),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
    else:
        celda_badge = Spacer(1, 5 * mm)

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
    elementos.append(Spacer(1, 2))
    elementos.append(Paragraph(_truncar_texto(producto.brand or "-", 26), _estilo_marca))
    elementos.append(Paragraph(_truncar_texto(producto.name, 26), _estilo_nombre))
    elementos.append(Paragraph(
        _truncar_texto(producto.category.name if producto.category else "Sin categoría", 30),
        _estilo_categoria,
    ))

    unidad_nombre = producto.unit_of_measure.name if producto.unit_of_measure else ""
    elementos.append(Paragraph(
        _truncar_texto(f"S/ {producto.unit_price} x {unidad_nombre}".strip(), 30),
        _estilo_precio_unidad,
    ))

    if producto.bulk_price and producto.bulk_unit_of_measure:
        elementos.append(Paragraph(
            _truncar_texto(f"S/ {producto.bulk_price} x {producto.bulk_unit_of_measure.name}", 30),
            _estilo_precio_bulto,
        ))
    else:
        elementos.append(Spacer(1, 4))

    return elementos


PADDING_TARJETA_PTS = 6

# Padding propio de la celda de cada fila de la grilla (por fuera de la
# tarjeta). Se define acá, como constante compartida, porque el cálculo
# de altura de fila (ver _calcular_altura_fila_pts) TIENE que saber
# cuánto espacio extra agrega esto, o subestima la altura real y el
# contenido termina desbordándose sobre la fila de abajo / el footer.
PADDING_FILA_SUPERIOR_PTS = 4
PADDING_FILA_INFERIOR_PTS = 8


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


@lru_cache(maxsize=1)
def _altura_maxima_tarjeta_pts():
    """
    Mide (con .wrap(), no "a ojo") la altura real que puede llegar a
    ocupar UNA tarjeta, en su variante más alta posible:
      - producto agotado (agrega la fila del badge rojo) — aunque esto
        no cambia la altura porque el espacio del badge siempre está
        reservado, se incluye por prolijidad/consistencia.
      - con precio por bulto (agrega una línea extra de texto, que es
        más alta que el Spacer que se usa cuando no hay precio bulto).

    Este valor es el "peor caso" real de cuánto mide una tarjeta
    (imagen + textos + padding del borde). Usarlo como base para la
    altura de fila es lo que evita que una tarjeta se dibuje encima de
    la fila siguiente o se salga por debajo del pie de página: antes,
    la altura de fila se calculaba dividiendo el espacio disponible en
    partes iguales SIN comprobar si eso alcanzaba para el contenido
    real, así que cuando el contenido real era un poco más alto que lo
    "adivinado", ReportLab lo dibujaba igual y se solapaba con lo de
    abajo en vez de respetar el límite de la celda.
    """
    producto_referencia = SimpleNamespace(
        image=None,
        brand="M" * 26,
        name="N" * 26,
        category=SimpleNamespace(name="C" * 30),
        unit_of_measure=SimpleNamespace(name="unidad"),
        unit_price=9999.99,
        bulk_price=9999.99,
        bulk_unit_of_measure=SimpleNamespace(name="paquete"),
        product_of_stock=False,
    )
    elementos = _tarjeta_producto(producto_referencia, _imagen_placeholder())
    tarjeta = _tarjeta_con_borde(elementos)
    ancho_disponible = (ANCHO_TARJETA_MM * mm) + (2 * PADDING_TARJETA_PTS)
    _, altura = tarjeta.wrap(ancho_disponible, 1000 * mm)
    return altura


def _calcular_altura_fila_pts(espacio_filas_disponible_pts, filas_en_esta_pagina):
    """
    Calcula la altura a usar para cada fila de la grilla EN UNA PÁGINA
    ESPECÍFICA.

    Recibe `filas_en_esta_pagina` (no siempre es FILAS_POR_PAGINA) porque
    la última página puede tener menos filas que una página completa —
    por ejemplo, si sobran solo 3 productos, esa hoja tiene 1 sola fila.
    Si el "aire extra" se repartiera asumiendo siempre una grilla llena
    (como se hacía antes), esa única fila se quedaría arriba con todo el
    resto de la hoja en blanco. Al repartir el sobrante entre las filas
    que REALMENTE va a haber en esa página, esa fila se estira y ocupa
    todo el alto disponible, en vez de dejar la hoja con pinta de
    incompleta.

    A diferencia de la versión anterior (que repartía el espacio
    disponible en partes iguales sin verificar nada), acá se parte
    SIEMPRE de la altura real medida de una tarjeta (peor caso) más el
    padding propio de la fila. Ese es el piso mínimo: nunca se usa una
    altura de fila menor a la que la tarjeta necesita para no
    solaparse con la fila de abajo.

    Si sobra espacio en la página respecto de ese piso mínimo, el
    sobrante se reparte por igual entre las filas de esa página como
    aire extra debajo de cada tarjeta. Si no sobra nada (o el contenido
    real es más alto de lo esperado), se usa directamente la altura
    mínima necesaria: en el peor de los casos, ReportLab moverá lo que
    no entre a la página siguiente, pero nunca lo dibuja superpuesto ni
    invadiendo el pie de página.
    """
    altura_minima_fila_pts = (
        _altura_maxima_tarjeta_pts()
        + PADDING_FILA_SUPERIOR_PTS
        + PADDING_FILA_INFERIOR_PTS
    )
    altura_minima_total_pts = altura_minima_fila_pts * filas_en_esta_pagina

    if altura_minima_total_pts <= espacio_filas_disponible_pts:
        sobrante_pts = espacio_filas_disponible_pts - altura_minima_total_pts
        return altura_minima_fila_pts + (sobrante_pts / filas_en_esta_pagina)

    return altura_minima_fila_pts


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
                  falla la descarga, el encabezado se arma sin logo.

    Devuelve:
        io.BytesIO con el PDF ya construido, listo para leer.

    La grilla es de 3 columnas x 4 filas (12 productos por página).
    Cada página se cierra explícitamente con un salto de página para
    que la distribución sea siempre simétrica, incluso cuando la
    última página no se llena por completo (las celdas sobrantes
    quedan vacías en lugar de correrse hacia la izquierda).

    La altura de cada fila se recalcula por separado para la página 1
    (que lleva el logo/título/fecha arriba) y para la página 2 en
    adelante (que no lleva header y por lo tanto puede aprovechar todo
    el alto de la hoja). En ambos casos nunca se usa una altura menor a
    la que la tarjeta más alta necesita, para que ningún borde se
    solape con la fila de abajo ni invada el pie de página.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=10 * mm, bottomMargin=12 * mm,
        leftMargin=12 * mm, rightMargin=12 * mm,
    )

    story = []

    # ---------------- Encabezado ----------------
    titulo = Paragraph(
        "Catálogo de Productos",
        ParagraphStyle("titulo_pdf", fontName="Helvetica-Bold", fontSize=20, textColor=VERDE_OSCURO),
    )

    _estilo_contacto = ParagraphStyle(
        "contacto_pdf", fontName="Helvetica", fontSize=8,
        textColor=GRIS_SEC, alignment=TA_RIGHT, leading=10,
    )
    contacto_correo = Paragraph(f"Correo: {CORREO_NEGOCIO}", _estilo_contacto)
    contacto_telefono = Paragraph(f"Teléfono: {TELEFONO_NEGOCIO}", _estilo_contacto)
    contacto_pais = Paragraph(f"País: {PAIS_NEGOCIO}", _estilo_contacto)

    fecha = Paragraph(
        f"Generado el {fecha_generacion.strftime('%d/%m/%Y %H:%M')}",
        ParagraphStyle("fecha_pdf", fontName="Helvetica", fontSize=9, textColor=GRIS_SEC, alignment=TA_RIGHT),
    )
    total = Paragraph(
        f"<b>{len(productos)}</b> productos en total",
        ParagraphStyle("total_pdf", fontName="Helvetica", fontSize=9, textColor=GRIS_SEC, alignment=TA_RIGHT),
    )

    # ---- Logo del negocio (opcional) ----
    LOGO_ALTO_MM = 16
    logo_buffer = _obtener_logo(logo_url)
    logo_img = None
    if logo_buffer:
        logo_img = RLImage(logo_buffer, width=LOGO_ALTO_MM * mm, height=LOGO_ALTO_MM * mm)
        logo_img.hAlign = "LEFT"

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

    # ---------------- Grilla de productos (3 columnas x 4 filas) ----------------
    # La altura de cada fila se calcula para que las 4 filas ocupen, en la
    # medida de lo posible, el alto completo de la página — pero SIN bajar
    # nunca de la altura real que necesita una tarjeta (ver
    # _calcular_altura_fila_pts). Eso es lo que evita que una tarjeta se
    # dibuje encima de la fila siguiente o invada el pie de página.
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
        # si sobran 3 productos). Se calcula ANTES de definir la altura
        # de fila, porque el sobrante de espacio se reparte entre estas
        # filas y no entre las FILAS_POR_PAGINA de una grilla llena —
        # así esa página no queda con un montón de espacio en blanco
        # abajo, sino que sus filas se estiran para llenar la hoja.
        filas_en_esta_pagina = max(1, -(-len(bloque) // COLUMNAS))

        espacio_filas_pts = (
            espacio_filas_pagina_1_pts if indice_pagina == 0
            else espacio_filas_paginas_siguientes_pts
        )
        altura_fila_pts = _calcular_altura_fila_pts(espacio_filas_pts, filas_en_esta_pagina)

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
                celdas.append(_tarjeta_con_borde(_tarjeta_producto(producto, imagen_buffer)))

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