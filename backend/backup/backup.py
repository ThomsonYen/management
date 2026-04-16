#!/usr/bin/env python3
"""Backup orchestrator. Reads manifest.yaml, snapshots targets to Google Drive.

See readmes/backup.md for the design.
"""
import argparse
import datetime as dt
import fnmatch
import shutil
import subprocess
import sys
from pathlib import Path

import yaml


def load_manifest(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def should_exclude(name: str, patterns: list) -> bool:
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def copy_tree(src: Path, dst: Path, exclude: list) -> None:
    if src.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return
    dst.mkdir(parents=True, exist_ok=True)
    for entry in src.iterdir():
        if should_exclude(entry.name, exclude):
            continue
        target = dst / entry.name
        if entry.is_dir():
            copy_tree(entry, target, exclude)
        else:
            shutil.copy2(entry, target)


def handler_copy(source: Path, dest: Path, target: dict) -> None:
    copy_tree(source, dest, target.get("exclude", []))


def handler_sqlite_backup(source: Path, dest: Path, target: dict) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # sqlite3 .backup uses the SQLite online backup API; safe with concurrent writers.
    subprocess.run(
        ["sqlite3", str(source), f".backup '{dest}'"],
        check=True,
    )


HANDLERS = {
    "copy": handler_copy,
    "sqlite_backup": handler_sqlite_backup,
}


def run_targets(manifest: dict, repo_root: Path, snapshot_dir: Path) -> None:
    for target in manifest["targets"]:
        source = (repo_root / target["source"]).resolve()
        dest = snapshot_dir / target["dest"]
        method = target["method"]
        handler = HANDLERS.get(method)
        if not handler:
            raise ValueError(f"unknown method: {method}")
        if not source.exists():
            print(f"[skip] {target['name']}: source missing ({source})")
            continue
        print(f"[copy] {target['name']} -> {dest.relative_to(snapshot_dir)}")
        handler(source, dest, target)


def take_daily(manifest: dict, repo_root: Path, daily_root: Path, today: dt.date) -> Path:
    final_dir = daily_root / today.isoformat()
    tmp_dir = daily_root / f"{today.isoformat()}.tmp"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    run_targets(manifest, repo_root, tmp_dir)
    if final_dir.exists():
        shutil.rmtree(final_dir)
    tmp_dir.rename(final_dir)
    return final_dir


def promote_monthly(daily_snapshot: Path, monthly_root: Path, today: dt.date) -> None:
    month_key = today.strftime("%Y-%m")
    target = monthly_root / month_key
    if target.exists():
        return
    tmp = monthly_root / f"{month_key}.tmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    shutil.copytree(daily_snapshot, tmp)
    tmp.rename(target)
    print(f"[monthly] promoted {daily_snapshot.name} -> {month_key}")


def prune_daily(daily_root: Path, today: dt.date, keep_days: int) -> None:
    # Keep the last `keep_days` snapshots inclusive of today.
    cutoff = today - dt.timedelta(days=keep_days - 1)
    for entry in daily_root.iterdir():
        if not entry.is_dir():
            continue
        try:
            d = dt.date.fromisoformat(entry.name)
        except ValueError:
            continue  # ignore .tmp and other non-date folders
        if d < cutoff:
            print(f"[prune] {entry.name}")
            shutil.rmtree(entry)


DEFAULT_MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.yaml"


def resolve_drive_root(manifest: dict) -> Path:
    return Path(manifest["drive_backup_root"]).expanduser()


def daily_snapshot_exists(manifest: dict, today: dt.date) -> bool:
    """Return True if a completed daily snapshot for `today` is already on Drive."""
    drive_root = resolve_drive_root(manifest)
    return (drive_root / "daily" / today.isoformat()).exists()


def run_backup_once(manifest_path: Path = DEFAULT_MANIFEST_PATH, today: dt.date = None) -> dict:
    """Take one snapshot. Safe to call from sync code or via asyncio.to_thread.

    `today` overrides the snapshot date (scheduler passes user-local date).
    Raises on error; returns a small dict on success.
    """
    manifest = load_manifest(manifest_path)

    repo_root = Path(manifest["repo_root"]).expanduser().resolve()
    drive_root = resolve_drive_root(manifest)
    keep_days = manifest.get("retention", {}).get("daily_keep_days", 10)

    if not drive_root.parent.exists():
        raise RuntimeError(f"Drive not mounted: {drive_root.parent}")

    daily_root = drive_root / "daily"
    monthly_root = drive_root / "monthly"
    daily_root.mkdir(parents=True, exist_ok=True)
    monthly_root.mkdir(parents=True, exist_ok=True)

    if today is None:
        today = dt.date.today()
    print(f"[start] {today} repo={repo_root} drive={drive_root}")

    snapshot = take_daily(manifest, repo_root, daily_root, today)
    promote_monthly(snapshot, monthly_root, today)
    prune_daily(daily_root, today, keep_days)

    print("[done]")
    return {"date": today.isoformat(), "snapshot": str(snapshot)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=None)
    args = parser.parse_args()
    manifest_path = Path(args.manifest) if args.manifest else DEFAULT_MANIFEST_PATH
    try:
        run_backup_once(manifest_path)
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
