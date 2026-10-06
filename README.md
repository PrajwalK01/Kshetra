# Area Planner

A mobile-first web app for digitizing your team's site-survey → zoning → team-assignment workflow.
Instead of physically dividing a place (like a park) and doing it on paper, the admin draws zones
and pins directly on a map, assigns each zone to a team, and team members log in to see only their
own work and update its status.

## Two roles

- **Admin** — draws zone outlines and drop-pins on the map, assigns each zone to a team, adds/removes
  team member logins, and can edit or delete anything.
- **Member (team)** — logs in and sees only the zones assigned to their team (plus pins inside those
  zones). They can update a zone's status (Not started / In progress / Done) but can't draw or delete.

## Stack

- **Backend:** Python (Flask, Flask-SQLAlchemy, Flask-Login), SQLite database — no external services needed.
- **Frontend:** plain HTML/CSS/JS + Leaflet.js (OpenStreetMap tiles, free, no API key) + Leaflet.draw for
  polygon drawing.
- **Mobile-first:** the sidebar becomes a slide-out drawer on small screens (tap the ☰ icon).

## Run it locally

```bash
cd zone-planner
python3 -m venv venv
source venv/bin/activate        # on Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 app.py
```

Then open **http://127.0.0.1:5000** in your browser.

The first run automatically creates the database (`zoneplanner.db`) and seeds three demo accounts:

| Role   | Username | Password  | Team   |
|--------|----------|-----------|--------|
| Admin  | admin    | admin123  | —      |
| Member | team_a   | team123   | Team A |
| Member | team_b   | team123   | Team B |

**Change these passwords (and `SECRET_KEY` in `app.py`) before using this for real work.**

## How to use it

1. Log in as `admin`.
2. Pick **Draw zone**, click points on the map to trace the outline of a place, double-click to finish.
3. Name the zone, type a team name (e.g. `Team A`), pick a color, save.
4. Optionally use **Drop pin** to mark a specific spot (like one home or hazard).
5. Under **Team members**, add a login for each team (username + password + team name) so they can
   sign in and see only their assigned zones.
6. Log out and log in as that team member to see the read-only, status-update view.

## Project structure

```
zone-planner/
  app.py                  Flask app: models, auth, REST API, page routes
  requirements.txt
  templates/
    login.html
    admin.html             Admin dashboard (drawing tools + member management)
    user.html               Member dashboard (view + status updates)
  static/
    css/style.css          Shared, mobile-first styling
    js/admin.js             Map logic for admin
    js/user.js              Map logic for members
```

## Notes / next steps

- Zones and pins are stored as simple lat/lng coordinates in SQLite — good for one team's scale;
  move to PostgreSQL if this grows across many teams/regions.
- There's no password-reset flow yet — an admin re-adding a member with a new password is the
  current workaround.
- Consider adding photo uploads per zone/pin if you want visual proof of "before/after" work.
