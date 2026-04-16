# APEX — Predictive Maintenance System

> **Phase 3 (Complete & Production-Ready Pipeline)**
> Built by: **Azhx-088** & **hemchudesh12**

APEX is a comprehensive predictive maintenance system for turbofan engines built on the NASA CMAPSS FD001 dataset. This repository contains the **complete implementation** across the entire stack — data pipeline, CNN-BiLSTM deep learning model, high-performance FastAPI backend, continuous sensor simulator, and a beautifully designed, real-time React/Vite dashboard.

---

## 🌟 Key Features

- **CNN-BiLSTM Architecture**: Robust spatial-temporal feature extraction capturing long-term degradation dependencies.
- **Monte Carlo Dropout**: Uncertainty quantification (Confidence Intervals / Standard Deviation) so operators know exactly how reliable the prediction is.
- **High-Performance FastAPI Backend**: Handles real-time ingestion, continuous inference, and `<10ms` WebSocket broadcasting.
- **Continuous Staggered Simulator**: Simulates high-frequency telemetry across an entire engine fleet (1x to 100x speeds) continuously looping through degradation lifecycles (HEALTHY → CRITICAL).
- **Time-Aware UI Dashboard**: Modern, glassmorphism-based UI in React/Zustand that visualizes RUL (Remaining Useful Life) mapped to physical time (days/months) in real-time. Includes active maintenance queues and similar historical failure sparklines.

---

## 🛠️ Stack & Architecture

- **Machine Learning**: PyTorch, pandas, scikit-learn
- **Backend API**: FastAPI, Uvicorn, WebSockets (Pydantic schemas)
- **Frontend App**: React 18, Vite, TypeScript, Zustand, Recharts, Radix UI
- **Data Simulator**: Asynchronous Python telemetry HTTP client

### Flow Architecture

```
NASA FD001 Data ──► Simulator (Continuous) ───[ HTTP POST /ingest ]──► FastAPI Backend (Ring Buffer)
                                                                                  │
     React Dashboard ◄──[ WebSocket /stream (1-15 Hz) ]── MCDropoutPredictor ◄── CNNBiLSTMRul (PyTorch)
```

---

## 🚀 Setup & Installation

### 1. Backend & ML Environment (Python)

```bash
# Create a virtual environment
python -m venv .venv

# Activate it
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt
```

### 2. Frontend Environment (Node)

Requires Node.js 18+

```bash
cd frontend
npm install
```

### 3. Data Setup

Drop the CMAPSS FD001 files in `data/raw/` (ignored by version control):

```
data/raw/
├── train_FD001.txt
├── test_FD001.txt
└── RUL_FD001.txt
```

---

## 🏃‍♂️ Running the System

To see the system in action, start the three core processes in separate terminal windows.

**1. Start the Backend API:**
```bash
# From project root
uvicorn src.api.main:app --host 0.0.0.0 --port 8000
```

**2. Start the Continuous Simulator:**
```bash
# From project root
# Simulates engines 1-5, starting base rate 1 cy/s
python -m src.simulator.replay --engines 1 2 3 4 5 --rate 1
```

**3. Start the Dashboard:**
```bash
# From frontend/ directory
npm run dev
# The UI will be available at http://localhost:5173
```

---

## 🔧 Core Mechanics

- **Real-Time Speed Scaling**: Change the speed from 1x to 100x in the dashboard. The simulator dynamically polls the setting, adjusts its emit rate, and the backend adaptive broadcast layer scales WebSocket throughput natively to keep the UI buttery smooth.
- **Staggered Fleet Decay**: The simulator initializes engines at different phases of their lifecycle automatically. You will see a realistic distribution of healthy and failing machines instantly.

---

> *APEX Predictive Maintenance Pipeline — TR-018-APEX Repository*
> *Authors: Azhx-088 & hemchudesh12*
