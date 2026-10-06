import sys
import os

# Add the parent directory so Flask can find templates/ and static/
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

# Tell Flask where templates and static folders are
os.chdir(BASE)

from app import app
