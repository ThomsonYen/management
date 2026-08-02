"""Create or update the app user: python scripts/create_user.py <username>"""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from main import SessionLocal, User, _password_hasher  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python scripts/create_user.py <username>")
        sys.exit(1)
    username = sys.argv[1]

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
            action = "updated"
        else:
            db.add(User(username=username, password_hash=_password_hasher.hash(password)))
            action = "created"
        db.commit()
    print(f"User {username!r} {action}.")


if __name__ == "__main__":
    main()
