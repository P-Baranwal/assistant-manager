# Assistant Manager (formerly Assignment Manager)

A personal, offline-capable assignment, task, and project management tool that uses a local or cloud LLM to **analyze, score, and prioritize** your work.

Originally a student-focused assignment manager, the application has evolved into a **Dual-Tier Architecture** that supports both Student and Professional workflows. Built with Svelte 5 and Vite 8, it operates entirely in the browser and keeps all your data local.

---

## 🔄 Dual-Tier Interface Modes

You can switch between the two interface modes under **Settings**:

### 1. Student Mode (Assignment Focus)
A streamlined interface tailored for student coursework, managing assignments, deadlines, and study priority strategies.

### 2. Professional Mode (Project/Kanban Focus)
A robust workspace tailored for professional project delivery:
- **Project-Based Organization:** Tasks are grouped under specific projects (or kept in an inbox if unassigned).
- **Kanban Board Dashboard:** Drag-style column layouts grouping tasks into *To Do*, *In Progress*, *Blocked*, and *Done*.
- **AI Work Breakdown Structure (WBS) Generator:** Paste a client brief or feature request and let AI decompose it into granular sub-tasks with estimated hours and impact scores.
- **ROI Priority Metric:** Tasks are ranked dynamically based on Return-on-Investment (Impact Score divided by Estimated Effort).
- **Blocker Tracking:** Mark tasks as blocked and add blocker notes. The UI down-prioritizes blocked tasks and automatically changes their status.
- **Actual Time Tracking:** Log actual hours spent against estimated hours with variance indicators.

---

## 🎯 Key Features

### 📋 Dashboard Layouts
- **Student Dashboard:** Assignments sorted by priority score, with a progress checklist bar and status stats (*Active*, *Due This Week*, *Overdue*, *Completed*).
- **Pro Dashboard:** Vertical columns for Kanban states, an inbox for unassigned tasks, and a collapsible **High-ROI Sidebar** highlighting the top 5 highest-yield items.
- **Squish View Toggle:** Quickly toggle between detailed, information-rich cards and a compact, row-based view on the dashboard.

### ⚡ AI Analysis & Input Modes
- **Add Assignment (Student):** Paste a prompt/rubric, upload a PDF (parsed locally via pdf.js), or enter details manually. AI generates calibrated difficulty, estimates, checklists, and priority.
- **Add Project & WBS (Pro):** Paste client brief, review the WBS preview table (add, edit, or delete rows manually), then save.
- **WBS Resilience:** Built-in validation, partial-save, and retry options to prevent losing drafted text if AI generation or parsing fails.
- **Priority Boost:** Add context (e.g. *"This counts for 40% of my grade"*) to trigger an LLM-calculated score adjustment.
- **Re-analyze:** Individually re-score and re-analyze any task from its detail view if settings or skills change.

### 🛡️ App Stability & UX Enhancements
- **Undo Stack for Destructive Actions:** A single-level undo system for actions like deleting assignments/tasks or marking them completed. A floating, auto-dismissing notification toast (`UndoToast`) lets you restore items or revert state changes instantly.
- **"Re-score All" Batch Re-analysis:** Button in Settings to batch re-score all active assignments/tasks using your updated skills profile and directives.
- **JSON Data Backup & Restore:** Back up your entire workspace (profiles, assignments, tasks, and projects) to a local JSON file and restore it easily with safety confirmation prompts.
- **Theme Selection:** Force Light or Dark mode, or stick to System Default, with settings persisted across browser sessions.
- **Timezone/Calendar Precision:** Calibrated local date parsing preventing date offsets in the calendar view.

---

## ⚙️ Settings & Configuration

### Context Profiling
- **Skills & Knowledge Profile:** Describe your abilities (e.g., *"Proficient in Python, weak in Calculus"*) for AI to calibrate task difficulty and time estimates relative to you.
- **Priority Presets (Student):** Choose a baseline sorting strategy (*Balanced*, *Deadline First*, *Easy First*, *Hard First*) and write optional custom plain-text sorting rules.

### AI Providers
Assistant Manager supports five pluggable provider layers with active health check verification:

| Provider | Config Needed | Model Examples |
|---|---|---|
| **Ollama** (default, local) | Base URL (default: `http://localhost:11434`) | `qwen2.5:14b`, `llama3.1:8b`, `phi4` |
| **Anthropic** | API key (`sk-ant-...`) | `claude-3-5-sonnet-20240620`, `claude-opus-20240229` |
| **OpenAI** | API key (`sk-...`) | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |
| **Google Gemini** | API key (`AIzaSy...`) | `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-2.5-pro` |
| **Groq** | API key (`gsk_...`) | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `gemma2-9b-it` |

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| **UI Framework** | [Svelte 5](https://svelte.dev) |
| **Build Tool** | [Vite 8](https://vite.dev) |
| **Styling** | Vanilla CSS (pure styling tokens, responsive, dark/light themes) |
| **Storage** | Browser `localStorage` with structured Schema Versioning & Migrations |
| **PDF Parsing** | [pdf.js](https://mozilla.github.io/pdf.js/) (loaded on-demand) |
| **Fonts** | Outfit + DM Sans via Google Fonts |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) (v18+) and npm installed.

### Running Locally
1. Clone the repository and navigate to the project directory.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
4. Open the localhost URL shown in your terminal.

### AI Setup

#### Using Ollama (Local & Offline)
1. Install [Ollama](https://ollama.com).
2. Download a model (e.g. `qwen2.5:14b`):
   ```bash
   ollama pull qwen2.5:14b
   ```
3. Go to **Settings** in the app, verify the base URL and type the model name, then hit **Save**.
4. The status indicator dot in the header will turn green once Ollama is reachable.

#### Using Cloud Providers
1. Go to **Settings** -> select your provider (Anthropic, OpenAI, Gemini, or Groq).
2. Enter your API Key and the optional model name.
3. Test the connection and save.

---

## 🔒 Data & Privacy (Threat Model)

- **Local Storage:** All app state is stored strictly in your browser's local cache. No databases or tracking scripts are used.
- **Plaintext Keys:** API keys are stored in plaintext in `localStorage`. Only use this application on trusted, secure devices.
- **No Completion:** The AI model is strictly used to evaluate and organize tasks. Your assignment details, briefs, and rubrics are sent via HTTPS or local boundaries, but are never completed for you.

---

## 🎨 Assignment Types & Color Coding

| Type | Color |
|---|---|
| Essay | Purple |
| Coding | Blue |
| Math | Amber |
| Research | Teal |
| Other | Gray |

*Difficulty Badges:* **1–3** (Green) · **4–6** (Amber) · **7–10** (Red)

---

## 🚫 Future Implementation Scope

This is designed to be a personal, single-device offline tool. The following features can be implemented in the future:
- User accounts / authentication
- Cloud-hosted databases & multi-device synchronization
- Desktop or push notifications
- External calendar integration (Google Calendar, Outlook)
- Collaborative workspace features
- Automated background re-scoring (must be triggered manually via settings)
