"""In-process nightly backup scheduler.

Runs inside the FastAPI app. Every hour it checks:
    "is the current user-local time >= 02:00 AND no snapshot exists for
     user-local `today`?"
If yes, it runs `run_backup_once` in a worker thread.

The 'past 02:00 + missing snapshot' predicate is self-healing: backend
restarts, DST transitions, and morning starts all converge on "fire exactly
once per day." If the backend isn't running at all for a day, that day is
missed (accepted tradeoff vs. launchd).
"""
import asyncio
import datetime as dt
import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .backup import daily_snapshot_exists, load_manifest, run_backup_once, DEFAULT_MANIFEST_PATH

log = logging.getLogger("backup.scheduler")

CHECK_INTERVAL_SECONDS = 3600  # hourly tick
FIRE_HOUR_LOCAL = 2            # 02:00 in the user's timezone


def _user_now(tz_name: str) -> dt.datetime:
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        log.warning("Unknown timezone %r, falling back to system local", tz_name)
        return dt.datetime.now().astimezone()
    return dt.datetime.now(tz)


def _should_fire(now_local: dt.datetime, manifest: dict) -> bool:
    if now_local.hour < FIRE_HOUR_LOCAL:
        return False
    return not daily_snapshot_exists(manifest, now_local.date())


async def _tick(get_timezone) -> None:
    manifest = load_manifest(DEFAULT_MANIFEST_PATH)
    tz_name = get_timezone()
    now_local = _user_now(tz_name)
    if not _should_fire(now_local, manifest):
        return
    log.info("backup firing: tz=%s date=%s", tz_name, now_local.date())
    await asyncio.to_thread(run_backup_once, DEFAULT_MANIFEST_PATH, now_local.date())
    log.info("backup completed for %s", now_local.date())


async def backup_loop(get_timezone) -> None:
    """Run forever. `get_timezone` is a zero-arg callable returning an IANA tz name.

    Passing a callable (not a string) lets the scheduler pick up timezone
    changes the user makes via the settings UI without restart.
    """
    log.info("backup scheduler started")
    while True:
        try:
            await _tick(get_timezone)
        except Exception:
            log.exception("backup tick failed")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
