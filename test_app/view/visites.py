"""
Backend actualizado para /api/visitas/resumen/ (ahora soporta ?granularity=daily)
y nuevo endpoint /api/visitas/comparar/ para comparar 2 meses.

Agrega esta línea a tus urls.py, junto a la que ya tienes:

    path('api/visitas/comparar/', visites.visitas_comparar_view, name='visitas_comparar'),
"""

from datetime import date, timedelta

from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.http import JsonResponse
from django.utils import timezone

from products.models import VisitCounter

MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']


def _shift_month(d, delta):
    """Suma o resta 'delta' meses a una fecha (usa día 1 del mes resultante)."""
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _month_range(period, today):
    """Devuelve (start, end, lista_de_primeros_dias_de_mes) según el periodo pedido."""
    if period == 'year-2025':
        year = 2025
        start = date(year, 1, 1)
        end = date(year, 12, 31)
        months = [date(year, m, 1) for m in range(1, 13)]

    elif period == 'last-6-months':
        current_month_start = date(today.year, today.month, 1)
        months = [_shift_month(current_month_start, -i) for i in range(5, -1, -1)]
        start = months[0]
        end = date(today.year, today.month, 1)

    else:  # 'year-2026' (o cualquier valor no reconocido) -> año en curso
        year = today.year
        start = date(year, 1, 1)
        end = date(year, 12, 31)
        months = [date(year, m, 1) for m in range(1, 13)]

    return start, end, months


def _top_pages(start, end, limit=5):
    """Top N páginas por visitas en el rango [start, end] (end inclusive)."""
    qs = (
        VisitCounter.objects
        .filter(date__gte=start, date__lte=end)
        .values('page_name')
        .annotate(total=Sum('visits'))
        .order_by('-total')[:limit]
    )
    max_top = max((row['total'] for row in qs), default=0)
    return [
        {
            'page_name': row['page_name'],
            'visits': row['total'],
            'percentage': round((row['total'] / max_top) * 100) if max_top else 0,
        }
        for row in qs
    ]


def visitas_resumen_view(request):
    """
    GET /api/visitas/resumen/?period=year-2026|last-6-months|year-2025&granularity=monthly|daily

    granularity=monthly (default): agrupa por mes según 'period'.
    granularity=daily: ignora 'period' y devuelve los últimos 30 días, día por día.
    """
    granularity = request.GET.get('granularity', 'monthly')
    today = timezone.now().date()

    if granularity == 'daily':
        return _visitas_resumen_diario(today)

    period = request.GET.get('period', 'year-2026')
    start, end, months = _month_range(period, today)

    qs = (
        VisitCounter.objects
        .filter(date__gte=start, date__lte=end)
        .annotate(month=TruncMonth('date'))
        .values('month')
        .annotate(total=Sum('visits'))
    )
    totals_by_month = {row['month'].strftime('%Y-%m'): (row['total'] or 0) for row in qs}

    current_month_start = date(today.year, today.month, 1)

    labels = []
    visits = []
    for m in months:
        key = m.strftime('%Y-%m')
        if m > current_month_start:
            visits.append(0)
        else:
            visits.append(totals_by_month.get(key, 0))
        labels.append(MESES_ABBR[m.month - 1])

    current_month_visits = totals_by_month.get(current_month_start.strftime('%Y-%m'), 0)
    prev_month_key = _shift_month(current_month_start, -1).strftime('%Y-%m')
    prev_month_visits = totals_by_month.get(prev_month_key, 0)

    active_months_count = sum(1 for v in visits if v > 0) or 1

    return JsonResponse({
        'labels': labels,
        'visits': visits,
        'currentMonthVisits': current_month_visits,
        'prevMonthVisits': prev_month_visits,
        'activeMonthsCount': active_months_count,
        'topPages': _top_pages(start, end),
    })


def _visitas_resumen_diario(today):
    """Últimos 30 días, día por día."""
    start = today - timedelta(days=29)

    qs = (
        VisitCounter.objects
        .filter(date__gte=start, date__lte=today)
        .values('date')
        .annotate(total=Sum('visits'))
    )
    totals_by_day = {row['date']: (row['total'] or 0) for row in qs}

    labels = []
    visits = []
    d = start
    while d <= today:
        labels.append(f"{d.day:02d} {MESES_ABBR[d.month - 1]}")
        visits.append(totals_by_day.get(d, 0))
        d += timedelta(days=1)

    current_month_visits = totals_by_day.get(today, 0)
    yesterday = today - timedelta(days=1)
    prev_month_visits = totals_by_day.get(yesterday, 0)  # "vs. día anterior" en modo diario

    # activeMonthsCount se reutiliza aquí como "días activos" en el período (para el promedio diario en JS)
    active_days_count = sum(1 for v in visits if v > 0) or 1

    return JsonResponse({
        'labels': labels,
        'visits': visits,
        'currentMonthVisits': current_month_visits,
        'prevMonthVisits': prev_month_visits,
        'activeMonthsCount': active_days_count,
        'topPages': _top_pages(start, today),
    })


def visitas_comparar_view(request):
    """
    GET /api/visitas/comparar/?month_a=YYYY-MM&month_b=YYYY-MM

    Devuelve el total y top 5 páginas de cada mes, más el % de variación
    de month_a a month_b.
    """
    month_a_raw = request.GET.get('month_a')
    month_b_raw = request.GET.get('month_b')

    def parse_month(value):
        try:
            y, m = value.split('-')
            return int(y), int(m)
        except (ValueError, AttributeError, TypeError):
            return None

    parsed_a = parse_month(month_a_raw)
    parsed_b = parse_month(month_b_raw)

    if not parsed_a or not parsed_b:
        return JsonResponse(
            {'error': 'Debes indicar month_a y month_b en formato YYYY-MM'},
            status=400,
        )

    def month_summary(year, month):
        start = date(year, month, 1)
        end = _shift_month(start, 1) - timedelta(days=1)
        total = (
            VisitCounter.objects
            .filter(date__gte=start, date__lte=end)
            .aggregate(t=Sum('visits'))['t'] or 0
        )
        return {
            'label': f"{MESES_ABBR[month - 1]} {year}",
            'total': total,
            'topPages': _top_pages(start, end),
        }

    summary_a = month_summary(*parsed_a)
    summary_b = month_summary(*parsed_b)

    if summary_a['total'] > 0:
        growth = round(((summary_b['total'] - summary_a['total']) / summary_a['total']) * 100, 1)
    elif summary_b['total'] > 0:
        growth = 100.0
    else:
        growth = 0.0

    return JsonResponse({
        'month_a': summary_a,
        'month_b': summary_b,
        'growthPercent': growth,
    })