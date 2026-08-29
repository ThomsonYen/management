"""Create or update a login.

    python scripts/create_user.py <username>                 # first user → the workspace owner
    python scripts/create_user.py <username> --person-id N   # a member linked to persons row N

Prompts for the password. An existing username gets its password reset and is
re-enabled. The supported way to add members is the invite flow in the app
(People → App access → Invite); this script is the escape hatch.
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import Person, SessionLocal, User, _password_hasher  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("username")
    ap.add_argument("--person-id", type=int, default=None, help="link a new member account to this persons row")
    args = ap.parse_args()
    username = args.username

    password = getpass.getpass(f"Password for {username!r}: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.password_hash = _password_hasher.hash(password)
            user.is_active = True
            action = f"updated ({user.role})"
        else:
            has_owner = db.query(User).filter(User.role == "owner").first() is not None
            if not has_owner:
                if args.person_id is not None:
                    print("The first user is the owner and is not linked to a person; drop --person-id.")
                    sys.exit(1)
                db.add(User(username=username, password_hash=_password_hasher.hash(password), role="owner"))
                action = "created as the owner"
            else:
                if args.person_id is None:
                    print("An owner already exists. Members must be linked to a person: pass --person-id N "
                          "(or use the invite flow in the app).")
                    sys.exit(1)
                person = db.query(Person).get(args.person_id)
                if person is None or person.deleted_at is not None:
                    print(f"No active person with id {args.person_id}.")
                    sys.exit(1)
                if db.query(User).filter(User.person_id == person.id).first() is not None:
                    print(f"Person {person.name!r} already has an account.")
                    sys.exit(1)
                db.add(User(username=username, password_hash=_password_hasher.hash(password), role="member",
                            person_id=person.id, access_level="edit", see_attended_meetings=False))
                action = f"created as a member linked to {person.name!r}"
        db.commit()
    print(f"User {username!r} {action}.")


if __name__ == "__main__":
    main()
