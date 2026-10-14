#!/usr/bin/env python3
"""Count failed last executions and overdue first schedules; unknown data stays unknown."""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timezone required')
    return parsed


def field(expression, low, high):
    values = set()
    for part in expression.split(','):
        base, _, step = part.partition('/')
        stride = int(step) if step else 1
        if stride < 1:
            raise ValueError('invalid cron step')
        if base == '*':
            start, end = low, high
        elif '-' in base:
            start, end = map(int, base.split('-'))
        else:
            start = end = int(base)
            if step:
                end = high
        if start < low or end > high or start > end:
            raise ValueError('invalid cron field')
        values.update(range(start, end + 1, stride))
    return values


def first_due(spec, created, now):
    schedule = spec['schedule'].split()
    if len(schedule) != 5:
        raise ValueError('unsupported cron expression')
    mins, hours, days, months, weekdays = [field(expr, *bounds) for expr, bounds in
        zip(schedule, [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)])]
    weekdays = {day % 7 for day in weekdays}
    zone = ZoneInfo(spec.get('timeZone', 'UTC'))
    created, now = created.astimezone(zone), now.astimezone(zone)
    day = created.date()
    checked = 0
    while day <= now.date():
        checked += 1
        if checked > 366 * 8:
            raise ValueError('first schedule outside bounded horizon')
        dom = day.day in days
        dow = (day.weekday() + 1) % 7 in weekdays
        # Standard cron: restricted day-of-month and day-of-week combine by OR.
        day_match = dom and dow if schedule[2].startswith('*') or schedule[4].startswith('*') else dom or dow
        if day.month in months and day_match:
            for hour in sorted(hours):
                for minute in sorted(mins):
                    candidate = dt.datetime.combine(day, dt.time(hour, minute), zone)
                    if created < candidate <= now:
                        return True
        day += dt.timedelta(days=1)
    return False


def main():
    items = json.load(sys.stdin).get('items', [])
    if not items:
        print('-')
        return
    now = timestamp(os.environ['HG_CRON_NOW']) if os.environ.get('HG_CRON_NOW') else dt.datetime.now(dt.timezone.utc)
    bad, unknown = 0, False
    for cron in items:
        spec, status = cron.get('spec', {}), cron.get('status', {})
        if spec.get('suspend'):
            continue
        scheduled, success = status.get('lastScheduleTime'), status.get('lastSuccessfulTime')
        try:
            if not scheduled:
                created = timestamp(cron.get('metadata', {})['creationTimestamp'])
                bad += first_due(spec, created, now)
                continue
            last = timestamp(scheduled)
            if status.get('active'):
                unknown = True  # A running latest execution cannot prove success.
                continue
            bad += not success or last > timestamp(success)
        except (ValueError, KeyError, TypeError):
            unknown = True
    print('-' if unknown else bad)


if __name__ == '__main__':
    main()
