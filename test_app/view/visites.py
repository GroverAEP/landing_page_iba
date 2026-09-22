from datetime import date

from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.http import JsonResponse
from django.utils import timezone

from products.models import VisitCounter

MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']


def _shift_month(d, delta):
    """Suma o resta 'delta' meses a una fecha (sin depender de dateutil)."""
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _month_range(period, today):
    """
    Devuelve (start, end, lista_de_primeros_dias_de_mes) según el periodo pedido.
    """
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


def visitas_resumen_view(request):
    """
    GET /api/visitas/resumen/?period=year-2026|last-6-months|year-2025

    Devuelve visitas reales agregadas por mes desde VisitCounter, más el
    top 5 de páginas del periodo. NO incluye 'uniques', 'pageViews',
    'bounceRate' ni 'avgDuration' porque el modelo actual no los registra.
    """
    period = request.GET.get('period', 'year-2026')
    today = timezone.now().date()
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
        # Meses futuros respecto a hoy: sin datos todavía -> 0
        if m > current_month_start:
            visits.append(0)
        else:
            visits.append(totals_by_month.get(key, 0))
        labels.append(MESES_ABBR[m.month - 1])

    current_month_visits = totals_by_month.get(current_month_start.strftime('%Y-%m'), 0)
    prev_month_key = _shift_month(current_month_start, -1).strftime('%Y-%m')
    prev_month_visits = totals_by_month.get(prev_month_key, 0)

    active_months_count = sum(1 for v in visits if v > 0) or 1

    top_pages_qs = (
        VisitCounter.objects
        .filter(date__gte=start, date__lte=end)
        .values('page_name')
        .annotate(total=Sum('visits'))
        .order_by('-total')[:5]
    )
    max_top_visits = max((row['total'] for row in top_pages_qs), default=0)
    top_pages = [
        {
            'page_name': row['page_name'],
            'visits': row['total'],
            'percentage': round((row['total'] / max_top_visits) * 100) if max_top_visits else 0,
        }
        for row in top_pages_qs
    ]

    return JsonResponse({
        'labels': labels,
        'visits': visits,
        'currentMonthVisits': current_month_visits,
        'prevMonthVisits': prev_month_visits,
        'activeMonthsCount': active_months_count,
        'topPages': top_pages,
    })