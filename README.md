# Kshetra — Zone Planner

A mobile-first field zone management app built with Flask and Firebase Firestore.

## Features
- Draw zones on a live map
- Drop pins
- Admin and member roles
- Live location tracking
- Public view + login for team members

## Deploy to Vercel

### 1. Push to GitHub
Make sure your code is pushed to GitHub (firebase-service-account.json must NOT be committed).

### 2. Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New Project**
3. Import your **Kshetra** repo
4. Framework preset: **Other**
5. Click **Deploy**

### 3. Add Environment Variables
In your Vercel project → **Settings → Environment Variables**, add:

| Key | Value |
|-----|-------|
| `SECRET_KEY` | any random string e.g. `kshetra-secret-2024` |
| `FIREBASE_CREDENTIALS` | paste the **entire content** of `firebase-service-account.json` as one line |

### 4. Redeploy
After adding env vars, go to **Deployments → Redeploy**.

## Run Locally

```bash
pip install -r requirements.txt
python app.py
```

Default admin login: `admin` / `admin123`
