import datetime as dt

from django.conf import settings

from .models import Event

MIN_FREE_BLOCK_MINUTES = 15


def _merge_busy_blocks(blocks):
    if not blocks:
        return []
    blocks = sorted(blocks, key=lambda b: b[0])
    merged = [blocks[0]]
    for start, end in blocks[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def get_free_busy_blocks(owner, horizon_start: dt.datetime, horizon_end: dt.datetime):
    """Returns (busy_blocks, free_blocks) as lists of (start, end) datetime tuples,
    computed against the daily WORK_DAY_START_HOUR/WORK_DAY_END_HOUR window."""
    events = Event.objects.filter(
        owner=owner, end_time__gte=horizon_start, start_time__lte=horizon_end
    ).order_by("start_time")

    busy = _merge_busy_blocks([(e.start_time, e.end_time) for e in events])

    work_start_hour = settings.WORK_DAY_START_HOUR
    work_end_hour = settings.WORK_DAY_END_HOUR

    free_blocks = []
    day = horizon_start.date()
    while dt.datetime.combine(day, dt.time.min, tzinfo=horizon_start.tzinfo) <= horizon_end:
        day_start = max(
            dt.datetime.combine(day, dt.time(hour=work_start_hour), tzinfo=horizon_start.tzinfo),
            horizon_start,
        )
        day_end = min(
            dt.datetime.combine(day, dt.time(hour=work_end_hour), tzinfo=horizon_start.tzinfo),
            horizon_end,
        )
        if day_end > day_start:
            cursor = day_start
            for busy_start, busy_end in busy:
                if busy_end <= cursor or busy_start >= day_end:
                    continue
                if busy_start > cursor:
                    free_blocks.append((cursor, min(busy_start, day_end)))
                cursor = max(cursor, busy_end)
            if cursor < day_end:
                free_blocks.append((cursor, day_end))
        day += dt.timedelta(days=1)

    free_blocks = [
        (s, e) for s, e in free_blocks
        if (e - s) >= dt.timedelta(minutes=MIN_FREE_BLOCK_MINUTES)
    ]

    return busy, free_blocks
