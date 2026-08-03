# CardioAI — AI-Based Cardiovascular Disease Prediction Website

Full-stack clinical decision support prototype: patients check cardiac risk from
personal, medical-history, wearable, and lifestyle data; doctors review results
and issue clinical recommendations; administrators manage users, records, and
the AI model.

## Architecture

```
React + Tailwind (frontend/)  ──►  Node.js + Express + MongoDB (server/, port 8000)
                                        │  auth (JWT), profiles, records, uploads,
                                        │  recommendations engine, PDF reports,
                                        │  dashboards, progress tracking, admin
                                        ▼
                              Python ML microservice (src/ml_service.py, port 8001)
                                   scikit-learn + SHAP (predict + explain)
```

- **Frontend**: React 19 + Tailwind CSS 4 (Vite build served by the Node server).
- **Backend**: Node.js (Express + Mongoose). MongoDB via `MONGODB_URI`
  (Atlas/local); without it, a persistent local MongoDB starts automatically
  (`mongodb-memory-server`, data in `data/mongo`).
- **AI**: scikit-learn pipeline + SHAP explanations, served by FastAPI
  internally on port 8001. The Node backend is the only public API.

## Use cases implemented

| Actor | Use cases |
|---|---|
| Patient | Register, Login/Logout, Manage Profile (incl. medical history & medications), Enter Health Information, Sync Wearable Data (simulated ECG/HR/HRV/BP/SpO₂/RR/temp), Upload ECG/Medical Report, View Dashboard (alerts, daily reminders), View AI Prediction Results (→ Predict CVD Risk → SHAP Explanation), Personalized Wellness Recommendations, Progress Tracking (risk, BP, HR, weight, steps, sleep trends), View Health History, Download Prediction Report (PDF) |
| Doctor | Login/Logout, View Patient Records (AI predictions auto-included), Review Prediction Results, Generate Clinical Recommendation, Download Prediction Report |
| Administrator | Login/Logout, Manage Users (verify doctors, block, delete), Manage Patient Records, Manage AI Model (retrain, reload, Low/Medium/High risk thresholds), Generate System Reports, Monitor Website Activity |

## Model inputs (27 features)

- **Personal**: age, gender, height, weight (BMI derived)
- **Medical history**: prior heart disease, hypertension, diabetes, high
  cholesterol, family history, current medications
- **Wearable vitals**: resting HR, HRV, blood pressure, SpO₂, respiratory rate,
  body temperature (ECG rhythm shown from the simulated device feed)
- **Blood work**: cholesterol level, glucose level
- **Lifestyle**: daily steps, sleep duration/quality, stress level, exercise
  frequency, smoking, alcohol, physical activity

**Output**: risk probability, Low/Medium/High risk level (admin-tunable
thresholds), alert status (Normal / High Risk), SHAP key factors, and
personalized wellness recommendations (🥗 diet / 🏃 exercise / 😴 sleep /
🚭 lifestyle / 💧 daily reminders), with a prompt to consult a doctor promptly
for high-risk results.

## Training data

Base dataset: Kaggle "Cardiovascular Disease dataset" (`data/cardio_train.csv`,
70k rows). It has no medical-history/wearable/lifestyle columns, so
`src/augment.py` synthesizes them with clinically plausible, seeded
correlations (a documented prototype technique — swap in a real extended
dataset when available). `src/train_extended.py` compares random forest vs.
gradient boosting on ROC-AUC (logistic regression is excluded: it amplifies the
dataset's smoking/age confound into misleading SHAP values) and saves
`models/cvd_model_extended.joblib` (test ROC-AUC ≈ 0.92 on the augmented set).

## Run locally

Day-to-day it works like any Node application:

```bash
npm start        # starts MongoDB + Python ML service + web server on :8000
```

`npm start` boots everything: the local MongoDB, the Python ML microservice
(auto-spawned as a child process from `.venv`, reused if already running), and
the Express server. Stop with Ctrl-C — the ML child process is cleaned up too.

One-time setup on a fresh machine:

```bash
# Python side (model training + ML service)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Node side (installs server + frontend deps, builds the frontend)
npm run setup

# Data + model: place cardio_train.csv at data/cardio_train.csv, then:
python -m src.augment
python -m src.train_extended
```

Other root scripts: `npm run build` (rebuild frontend), `npm run dev`
(server with auto-reload). Env vars: `MONGODB_URI` (real MongoDB/Atlas),
`ML_PYTHON` (Python interpreter for the ML service), `SKIP_ML_SPAWN=1`
(manage the ML service yourself).

Open http://127.0.0.1:8000 — demo accounts:

| Role | Email | Password |
|---|---|---|
| Patient | patient@cvd-demo.com | patient123 |
| Doctor | doctor@cvd-demo.com | doctor123 |
| Admin | admin@cvd-demo.com | admin123 |

## MongoDB Atlas (cloud database)

By default the app runs a local MongoDB (data in `data/mongo`). To use
MongoDB Atlas instead:

1. **Create a cluster** — sign in at https://cloud.mongodb.com, create a free
   M0 cluster (pick a region near you).
2. **Create a database user** — Security → Database Access → Add New Database
   User (username + password, "Read and write to any database").
3. **Allow your IP** — Security → Network Access → Add IP Address → "Add My
   Current IP Address" (or 0.0.0.0/0 for development only).
4. **Get the connection string** — Database → Connect → Drivers → copy the
   `mongodb+srv://…` string and insert your user and password.
5. **Configure the app**:

   ```bash
   cp server/.env.example server/.env
   # edit server/.env and set:
   # MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

6. **Migrate your existing local data** (optional — while the app is running
   on the local DB):

   ```bash
   cd server
   npm run migrate:atlas -- "mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net"
   ```

   Re-runnable: documents are upserted by id, nothing is duplicated.

7. **Restart** — `npm start` now connects to Atlas (watch for
   `[db] Connected to MongoDB (MONGODB_URI)` in the log). Remove
   `MONGODB_URI` from `server/.env` to switch back to the local DB.

## Layout

```
frontend/            React + Tailwind SPA (Vite; dist/ served by Node)
server/              Node.js + Express + Mongoose backend (public API, port 8000)
  src/routes/        auth, patient, doctor, admin
  src/recommendations.js  wellness rules engine + wearable simulator
  src/pdf.js         PDF report generation (pdfkit)
src/                 Python ML: preprocessing, augment, train_extended, ml_service
models/              trained pipeline artifacts
data/                cardio_train.csv, cardio_extended.csv, mongo/, uploads/
api/                 (legacy FastAPI app backend, superseded by server/)
```

## Disclaimer

All outputs are general wellness recommendations generated by a machine
learning prototype and do not replace professional medical advice. High-risk
predictions direct the user to consult a doctor promptly.
