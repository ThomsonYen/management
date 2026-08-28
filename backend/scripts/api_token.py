"""Manage API tokens (bearer auth for agents).

    python scripts/api_token.py create <name> [--scopes read,write:todos,...] [--days 90]
    python scripts/api_token.py list
    python scripts/api_token.py revoke <name|id>

The raw token is printed once on create; store it in a keychain, never in a file.
Tokens always belong to the owner account; member accounts cannot use the API.
In production run via `fly ssh console -C "python3 scripts/api_token.py ..."`.
"""

import argparse
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import (  # noqa: E402
    API_TOKEN_DEFAULT_DAYS,
    API_TOKEN_MAX_DAYS,
    API_TOKEN_PREFIX,
    API_TOKEN_SCOPES,
    ApiToken,
    SessionLocal,
    User,
    _hash_token,
)


def cmd_create(args: argparse.Namespace) -> None:
    scopes = [s.strip() for s in args.scopes.split(",") if s.strip()]
    bad = sorted(set(scopes) - set(API_TOKEN_SCOPES))
    if bad:
        sys.exit(f"Unknown scopes: {', '.join(bad)}. Valid: {', '.join(API_TOKEN_SCOPES)}")
    if not 1 <= args.days <= API_TOKEN_MAX_DAYS:
        sys.exit(f"--days must be between 1 and {API_TOKEN_MAX_DAYS}")
    raw = API_TOKEN_PREFIX + secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        # Tokens are owner-only (main._resolve_api_token rejects any other user).
        user = db.query(User).filter(User.is_active == True, User.role == "owner").order_by(User.id).first()
        if not user:
            sys.exit("No active owner account. Run scripts/create_user.py first.")
        username = user.username
        db.add(
            ApiToken(
                user_id=user.id,
                name=args.name,
                token_hash=_hash_token(raw),
                scopes=",".join(s for s in API_TOKEN_SCOPES if s in scopes),
                created_at=now.isoformat(),
                expires_at=(now + timedelta(days=args.days)).isoformat(),
            )
        )
        db.commit()
    print(f"Token {args.name!r} created for user {username!r}, expires in {args.days} days.")
    print("Store this now; it will not be shown again:")
    print(raw)


def cmd_list(_args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        rows = db.query(ApiToken).order_by(ApiToken.id).all()
    if not rows:
        print("No tokens.")
        return
    print(f"{'id':>3}  {'name':<20} {'scopes':<50} {'expires':<10} {'last used':<10} state")
    for t in rows:
        state = "revoked" if t.revoked_at else "active"
        print(
            f"{t.id:>3}  {t.name:<20} {t.scopes:<50} {t.expires_at[:10]:<10} "
            f"{(t.last_used_at or '-')[:10]:<10} {state}"
        )


def cmd_revoke(args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        q = db.query(ApiToken)
        row = q.filter(ApiToken.id == int(args.token)).first() if args.token.isdigit() else q.filter(ApiToken.name == args.token).first()
        if not row:
            sys.exit(f"No token matching {args.token!r}")
        if row.revoked_at:
            print(f"Token {row.name!r} was already revoked at {row.revoked_at}.")
            return
        row.revoked_at = datetime.now(timezone.utc).isoformat()
        db.commit()
        print(f"Token {row.name!r} (id {row.id}) revoked.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create")
    c.add_argument("name")
    c.add_argument("--scopes", default="read", help=f"comma-separated; valid: {', '.join(API_TOKEN_SCOPES)}")
    c.add_argument("--days", type=int, default=API_TOKEN_DEFAULT_DAYS)
    c.set_defaults(fn=cmd_create)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    r = sub.add_parser("revoke")
    r.add_argument("token", help="name or id")
    r.set_defaults(fn=cmd_revoke)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
