import os
import json
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

from flask import Flask, render_template, request, redirect, url_for, jsonify, flash, session
from flask_login import (
    LoginManager, UserMixin, login_user, logout_user,
    login_required, current_user
)
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------------------------------------------------------- setup --

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
SA_PATH  = os.path.join(BASE_DIR, "firebase-service-account.json")

cred = credentials.Certificate(SA_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client(database_id="ai-studio-2da1764c-19d6-4a91-b59c-589c64f70438")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "zone-planner-secret-key")

login_manager = LoginManager(app)
login_manager.login_view = "login"

# ---------------------------------------------------------------- Firestore collection paths --
# zone_planner/
#   zones/          — zone documents
#   pins/           — pin documents
#   team_members/   — member account documents

COL_ZONES   = "zones"
COL_PINS    = "pins"
COL_MEMBERS = "team_members"


# ---------------------------------------------------------------- user model (in-memory via Firestore) --

class User(UserMixin):
    def __init__(self, doc_id, data):
        self.id        = doc_id
        self.username  = data.get("username", "")
        self.password_hash = data.get("password_hash", "")
        self.role      = data.get("role", "member")       # admin | member
        self.team_name = data.get("team_name") or ""

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    @staticmethod
    def get_by_username(username):
        docs = db.collection(COL_MEMBERS)\
                 .where(filter=firestore.FieldFilter("username", "==", username))\
                 .limit(1).stream()
        for doc in docs:
            return User(doc.id, doc.to_dict())
        return None

    @staticmethod
    def get_by_id(doc_id):
        doc = db.collection(COL_MEMBERS).document(doc_id).get()
        if doc.exists:
            return User(doc.id, doc.to_dict())
        return None


@login_manager.user_loader
def load_user(user_id):
    return User.get_by_id(user_id)


def is_admin():
    return current_user.is_authenticated and current_user.role == "admin"


# ---------------------------------------------------------------- helpers --

def zone_to_dict(doc_id, data):
    return {
        "id":         doc_id,
        "name":       data.get("name", "Untitled zone"),
        "team":       data.get("team") or "",
        "color":      data.get("color", "#2f7d5a"),
        "coords":     data.get("coords", []),
        "status":     data.get("status", "not_started"),
        "created_by": data.get("created_by", ""),
    }


def pin_to_dict(doc_id, data):
    return {
        "id":         doc_id,
        "name":       data.get("name", "Untitled pin"),
        "lat":        data.get("lat", 0),
        "lng":        data.get("lng", 0),
        "zone_id":    data.get("zone_id") or None,
        "created_by": data.get("created_by", ""),
    }


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------ auth --

@app.route("/", methods=["GET"])
def index():
    if current_user.is_authenticated:
        return redirect(url_for("admin_dashboard") if current_user.role == "admin" else url_for("user_dashboard"))
    return render_template("home.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("admin_dashboard") if current_user.role == "admin" else url_for("user_dashboard"))
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = User.get_by_username(username)
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for("admin_dashboard") if user.role == "admin" else url_for("user_dashboard"))
        flash("Incorrect username or password.")
    return render_template("login.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("index"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("admin_dashboard") if current_user.role == "admin" else url_for("user_dashboard"))

    username    = ""
    team_name   = ""

    if request.method == "POST":
        username        = request.form.get("username", "").strip()
        team_name       = request.form.get("team_name", "").strip()
        password        = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        # Validation
        if not username or not password:
            flash("Username and password are required.")
        elif len(username) < 3:
            flash("Username must be at least 3 characters.")
        elif len(password) < 6:
            flash("Password must be at least 6 characters.")
        elif password != confirm_password:
            flash("Passwords do not match.")
        elif password.lower() == username.lower():
            flash("Password cannot be the same as the username.")
        elif User.get_by_username(username):
            flash("That username is already taken.")
        else:
            # Duplicate password check
            dup = False
            for doc in db.collection(COL_MEMBERS).stream():
                existing_hash = doc.to_dict().get("password_hash", "")
                if existing_hash and check_password_hash(existing_hash, password):
                    dup = True
                    break
            if dup:
                flash("That password is already used by another account. Please choose a different one.")
            else:
                doc_ref = db.collection(COL_MEMBERS).document()
                doc_ref.set({
                    "username":      username,
                    "password_hash": generate_password_hash(password),
                    "role":          "member",
                    "team_name":     team_name or None,
                    "created_at":    now_iso(),
                })
                flash("Account created! You can now sign in.", "success")
                return redirect(url_for("login"))

    return render_template("signup.html", username=username, team_name=team_name)


# ----------------------------------------------------------------- pages --

@app.route("/admin")
@login_required
def admin_dashboard():
    if not is_admin():
        return redirect(url_for("user_dashboard"))
    # Collect distinct team names from team_members
    docs = db.collection(COL_MEMBERS).where(filter=firestore.FieldFilter("role", "==", "member")).stream()
    teams = sorted({d.to_dict().get("team_name", "") for d in docs if d.to_dict().get("team_name")})
    return render_template("admin.html", teams=teams)


@app.route("/app")
@login_required
def user_dashboard():
    if is_admin():
        return redirect(url_for("admin_dashboard"))
    return render_template("user.html")


# --------------------------------------------------------------- API: zones --

@app.route("/api/zones", methods=["GET"])
def list_zones():
    """Public GET — everyone can read zones."""
    if current_user.is_authenticated and is_admin():
        docs = db.collection(COL_ZONES).order_by("created_at", direction=firestore.Query.DESCENDING).stream()
        return jsonify([zone_to_dict(d.id, d.to_dict()) for d in docs])
    elif current_user.is_authenticated:
        docs = db.collection(COL_ZONES)\
                 .where(filter=firestore.FieldFilter("team", "==", current_user.team_name))\
                 .order_by("created_at", direction=firestore.Query.DESCENDING).stream()
        return jsonify([zone_to_dict(d.id, d.to_dict()) for d in docs])
    else:
        docs = db.collection(COL_ZONES).order_by("created_at", direction=firestore.Query.DESCENDING).stream()
        return jsonify([zone_to_dict(d.id, d.to_dict()) for d in docs])


@app.route("/api/zones", methods=["POST"])
@login_required
def create_zone():
    if not is_admin():
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(force=True)
    coords = data.get("coords") or []
    if len(coords) < 3:
        return jsonify({"error": "A zone requires at least 3 points."}), 400
    doc_ref = db.collection(COL_ZONES).document()
    payload = {
        "name":       (data.get("name") or "Untitled Zone").strip(),
        "team":       (data.get("team") or "").strip(),
        "color":      data.get("color") or "#2f7d5a",
        "coords":     coords,
        "status":     "not_started",
        "created_by": current_user.username,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    doc_ref.set(payload)
    return jsonify(zone_to_dict(doc_ref.id, payload)), 201


@app.route("/api/zones/<zone_id>", methods=["PATCH"])
@login_required
def update_zone(zone_id):
    ref = db.collection(COL_ZONES).document(zone_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify({"error": "Zone not found."}), 404
    data = request.get_json(force=True)
    updates = {"updated_at": now_iso()}
    if is_admin():
        if "name"   in data: updates["name"]   = (data["name"] or "").strip()
        if "team"   in data: updates["team"]   = (data["team"] or "").strip()
        if "color"  in data: updates["color"]  = data["color"]
        if "status" in data: updates["status"] = data["status"]
    else:
        z = doc.to_dict()
        if z.get("team") != current_user.team_name:
            return jsonify({"error": "forbidden"}), 403
        if "status" in data: updates["status"] = data["status"]
    ref.update(updates)
    updated = ref.get().to_dict()
    return jsonify(zone_to_dict(zone_id, updated))


@app.route("/api/zones/<zone_id>", methods=["DELETE"])
@login_required
def delete_zone(zone_id):
    if not is_admin():
        return jsonify({"error": "forbidden"}), 403
    ref = db.collection(COL_ZONES).document(zone_id)
    if not ref.get().exists:
        return jsonify({"error": "Zone not found."}), 404
    # Unlink any pins belonging to this zone
    pin_docs = db.collection(COL_PINS).where(filter=firestore.FieldFilter("zone_id", "==", zone_id)).stream()
    for p in pin_docs:
        db.collection(COL_PINS).document(p.id).update({"zone_id": None})
    ref.delete()
    return "", 204


# --------------------------------------------------------------- API: pins --

@app.route("/api/pins", methods=["GET"])
def list_pins():
    """Public GET — everyone can read pins."""
    if current_user.is_authenticated and is_admin():
        docs = db.collection(COL_PINS).order_by("created_at", direction=firestore.Query.DESCENDING).stream()
        return jsonify([pin_to_dict(d.id, d.to_dict()) for d in docs])
    elif current_user.is_authenticated:
        # Only pins linked to this member's team zones
        zone_docs = db.collection(COL_ZONES).where(filter=firestore.FieldFilter("team", "==", current_user.team_name)).stream()
        team_zone_ids = [z.id for z in zone_docs]
        if not team_zone_ids:
            return jsonify([])
        pin_docs = db.collection(COL_PINS).where(filter=firestore.FieldFilter("zone_id", "in", team_zone_ids)).stream()
        return jsonify([pin_to_dict(d.id, d.to_dict()) for d in pin_docs])
    else:
        docs = db.collection(COL_PINS).order_by("created_at", direction=firestore.Query.DESCENDING).stream()
        return jsonify([pin_to_dict(d.id, d.to_dict()) for d in docs])


@app.route("/api/pins", methods=["POST"])
@login_required
def create_pin():
    if not is_admin():
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(force=True)
    doc_ref = db.collection(COL_PINS).document()
    payload = {
        "name":       (data.get("name") or "Untitled Pin").strip(),
        "lat":        float(data["lat"]),
        "lng":        float(data["lng"]),
        "zone_id":    data.get("zone_id") or None,
        "created_by": current_user.username,
        "created_at": now_iso(),
    }
    doc_ref.set(payload)
    return jsonify(pin_to_dict(doc_ref.id, payload)), 201


@app.route("/api/pins/<pin_id>", methods=["DELETE"])
@login_required
def delete_pin(pin_id):
    if not is_admin():
        return jsonify({"error": "forbidden"}), 403
    ref = db.collection(COL_PINS).document(pin_id)
    if not ref.get().exists:
        return jsonify({"error": "Pin not found."}), 404
    ref.delete()
    return "", 204


# ------------------------------------------------------------ API: members --

@app.route("/api/members", methods=["GET"])
@login_required
def list_members():
    if not is_admin():
        return jsonify({"error": "forbidden"}), 403
    # Return ALL users (both admin and member) so admin can see the full team
    docs = db.collection(COL_MEMBERS).stream()
    return jsonify([
        {
            "id":        d.id,
            "username":  d.to_dict().get("username"),
            "team_name": d.to_dict().get("team_name"),
            "role":      d.to_dict().get("role", "member"),
        }
        for d in docs
    ])


@app.route("/api/members", methods=["POST"])
@login_required
def create_member():
    if not is_admin():
        return jsonify({"error": "forbidden"}), 403
    data      = request.get_json(force=True)
    username  = (data.get("username") or "").strip()
    password  = (data.get("password") or "").strip()
    team_name = (data.get("team_name") or "").strip()
    role      = (data.get("role") or "member").strip().lower()

    # Validate role value
    if role not in ("admin", "member"):
        return jsonify({"error": "Role must be 'admin' or 'member'."}), 400

    # Basic field validation
    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400
    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    # Password must not equal username (case-insensitive)
    if password.lower() == username.lower():
        return jsonify({"error": "Password cannot be the same as the username."}), 400

    # Duplicate username check
    if User.get_by_username(username):
        return jsonify({"error": "That username is already taken."}), 400

    # Duplicate password check — scan all existing members
    all_docs = db.collection(COL_MEMBERS).stream()
    for doc in all_docs:
        existing_hash = doc.to_dict().get("password_hash", "")
        if existing_hash and check_password_hash(existing_hash, password):
            return jsonify({"error": "That password is already used by another account. Please choose a different one."}), 400

    doc_ref = db.collection(COL_MEMBERS).document()
    payload = {
        "username":      username,
        "password_hash": generate_password_hash(password),
        "role":          role,
        "team_name":     team_name or None,
        "created_at":    now_iso(),
    }
    doc_ref.set(payload)
    return jsonify({
        "id":        doc_ref.id,
        "username":  username,
        "team_name": team_name,
        "role":      role,
    }), 201


@app.route("/api/members/<member_id>", methods=["DELETE"])
@login_required
def delete_member(member_id):
    if not is_admin():
        return jsonify({"error": "forbidden"}), 403
    ref = db.collection(COL_MEMBERS).document(member_id)
    doc = ref.get()
    if not doc.exists:
        return jsonify({"error": "Member not found."}), 404
    if doc.to_dict().get("role") == "admin":
        return jsonify({"error": "Cannot delete an admin account."}), 400
    ref.delete()
    return "", 204


# ------------------------------------------------------------------- seed --

def seed():
    """Create default admin and demo members if they don't exist."""
    if not User.get_by_username("admin"):
        doc_ref = db.collection(COL_MEMBERS).document()
        doc_ref.set({
            "username":      "admin",
            "password_hash": generate_password_hash("admin123"),
            "role":          "admin",
            "team_name":     None,
            "created_at":    now_iso(),
        })
        print("✓ Seeded admin account")

    if not User.get_by_username("team_a"):
        doc_ref = db.collection(COL_MEMBERS).document()
        doc_ref.set({
            "username":      "team_a",
            "password_hash": generate_password_hash("team123"),
            "role":          "member",
            "team_name":     "Team Alpha",
            "created_at":    now_iso(),
        })
        print("✓ Seeded team_a account")

    if not User.get_by_username("team_b"):
        doc_ref = db.collection(COL_MEMBERS).document()
        doc_ref.set({
            "username":      "team_b",
            "password_hash": generate_password_hash("team123"),
            "role":          "member",
            "team_name":     "Team Bravo",
            "created_at":    now_iso(),
        })
        print("✓ Seeded team_b account")


if __name__ == "__main__":
    seed()
    app.run(debug=True, host="0.0.0.0", port=5000)
