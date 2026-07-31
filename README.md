# PostForge — Multi-Platform Social Media Post Composer & Draft Studio

PostForge is a complete, production-ready React web application designed for social media creators, marketing teams, and developers. It provides real-time multi-platform compliance validation, animated SVG character rings, live platform feed mockup previews, Base64 media attachment support, and account-scoped draft management backed by MongoDB Atlas.

---

## ⚡ Core Features

- **Multi-Platform Rules Engine**:
  - **Twitter / X**: 280 character limit, max 4 media attachments.
  - **Instagram**: 2,200 character limit, **minimum 1 photo/video required**, max 10 media, max 30 hashtags.
  - **LinkedIn**: 3,000 character limit, max 9 media attachments.
  - **Facebook**: 63,206 character limit, soft organic reach warning under 50 chars.

- **Real-Time Validation & SVG Percentage Rings**:
  - Dynamic circular SVG progress rings with color-coded transitions (emerald → amber → rose).
  - Live compliance checklist validating character counts, hashtag limits, and media rules.

- **Live Platform Feed Mockup Preview**:
  - Interactive feed preview cards with official vector SVG logos for Twitter/X, Instagram, LinkedIn, and Facebook.
  - Dynamically renders post text, formatted hashtags, uploaded photos/videos/PDFs, and user profile metadata.

- **Formatting Tools & Base64 Media Engine**:
  - Quick emoji bar and trending hashtag insertion chips.
  - File uploader converting images, videos, and PDFs into Base64 data URLs for zero-loss persistence across browser sessions and drafts.

- **MongoDB Atlas Integration & Private Draft Studio**:
  - Connected to MongoDB Atlas (`FS.FS1`).
  - **Account Isolation**: Lock screen prompt when logged out; isolated private drafts and published post history scoped to `user.email`.
  - **Resilient Fallback**: Automatic offline support (`users_fallback.json` + `localStorage`) for zero-dependency local execution.

- **Strict Apple/Vercel Light Theme Aesthetic**:
  - Rounded-3xl card containers, slate-50 background, smooth subtle borders, zero dark mode clutter.

---

## 📐 Platform Compliance Reference

| Platform | Max Chars | Min Media | Max Media | Max Hashtags | Special Rules |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Twitter / X** | 280 | 0 | 4 | 30 | Strict 280 character limit |
| **Instagram** | 2,200 | 1 | 10 | 30 | **Requires at least 1 image/video** |
| **LinkedIn** | 3,000 | 0 | 9 | 10 | Professional post length guideline |
| **Facebook** | 63,206 | 0 | 10 | 30 | Soft warning for posts under 50 chars |

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status & MongoDB Atlas connectivity check |
| `POST` | `/api/auth/login` | Authenticate user account |
| `POST` | `/api/auth/register` | Create a new user account |
| `GET` | `/api/drafts?email=:email` | Retrieve account-scoped drafts and published history |
| `POST` | `/api/drafts` | Save or update a draft or published post |
| `DELETE` | `/api/drafts?id=:id&email=:email` | Delete a draft or published post by ID |

---

## 🚀 How to Run Locally

### Method 1: Direct Zero-Build Browser Execution
Simply open `index.html` in your web browser:
```text
file:///C:/Users/pande/OneDrive/Documents/postforge/index.html
```
*No Node.js, npm, or build step required. Uses React 18, Babel standalone, and Tailwind CSS CDN.*

### Method 2: Python Backend Development Server
1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the local server:
   ```bash
   python server.py 5000
   ```
3. Open `http://localhost:5000` in your web browser.

---

## ☁️ Deploying to Vercel

PostForge is pre-configured for one-click Vercel deployment via `vercel.json` and `pyproject.toml`.

### Deployment Steps:
1. Push your project to a GitHub repository.
2. Go to **[Vercel Dashboard](https://vercel.com/new)** and import your repository.
3. Click **Deploy**. Vercel will automatically route `/api/*` requests to `api/auth.py` and serve static `index.html`.

---

## 🔑 Demo Credentials

| Email | Password | Role |
| :--- | :--- | :--- |
| `pritesh559@gmail.com` | `Pritesh123` | Demo Creator |
| `pritesh555@gmail.com` | `Pritesh123` | Demo User |
