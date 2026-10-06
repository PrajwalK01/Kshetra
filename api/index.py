import sys
import os

# Root of the project (one level above api/)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# Change working directory so Flask finds templates/ and static/
os.chdir(ROOT)

from flask import send_from_directory
from app import app

# Explicitly serve static files — required on Vercel
@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(os.path.join(ROOT, "static"), filename)
