# LNC Research Archives

A secure academic thesis and capstone repository system for **Laguna Northwestern College**. Students submit thesis documents for administrator and teacher approved theses are publicly discoverable and can be requested via a gated email workflow that delivers the PDF directly to the requester upon approval.

> **Live deployment:** [https://ethesis.onrender.com](https://ethesis.onrender.com)

---

## Features

### For Students
- Upload thesis / capstone / research documents (PDF, max 20 MB)
- Track submission status (Pending → Approved / Rejected)
- Edit or delete a submission while it is still **Pending**
- Request the full PDF of any approved thesis via email

### For Teachers (Advisers)
- View and action the pending thesis queue for theses they advise
- Approve or reject submissions with an optional reason
- Revoke approval and return a thesis to Pending status

### For Administrators
- Full pending-thesis management queue
- User management — view, change roles, and delete accounts
- Account request approval — review, approve (with a generated password), or reject new user registrations
- Password reset approval — process "Forgot Password" requests by issuing a secure, time-limited reset link
- Analytics & Reports — thesis status breakdown and file-request statistics
- Email settings — configure SMTP fallback credentials

### File Request Workflow
1. A logged-in user clicks **"Request Thesis via Email"** on an approved thesis and provides a justification (minimum 20 characters).
2. The system sends a notification email to both the thesis **Author** and all **Administrators**, each containing a unique, role-specific approval link (valid 7 days).
3. Clicking either party's link marks the request as **fulfilled**, sets a **48-hour download expiry**, and emails the requester a secure proxy download link.
4. The other party immediately receives a sync notification email stating who approved the request and that the file has been dispatched.

### Security
- All thesis PDFs stored in **Cloudinary** (restricted cloud storage, never in the public web directory)
- File delivery is proxied server-side using short-lived Cloudinary signed URLs — the raw storage URL is never exposed to the browser
- Download links expire after **48 hours**
- Helmet CSP, MongoDB sanitisation, rate limiting, bcrypt password hashing (12 rounds), HTTPS-only cookies in production
- Sessions stored in MongoDB via `connect-mongo`

### Real-time
- In-app notification feed with Socket.IO (new thesis submitted, approved, rejected; file request approved)
- Admin navbar badge counters update instantly via WebSocket

---

## User Roles

| Role | Key Permissions |
|------|----------------|
| **Student** | Upload/edit pending thesis · Request thesis files via email · Browse approved archives |
| **Teacher** | Approve/reject/revoke advised thesis · Access pending thesis queue |
| **Admin** | Full thesis management · User & account request management · Reports · Email settings |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Templating | EJS |
| Database | MongoDB Atlas + Mongoose |
| File Storage | Cloudinary (PDFs as `raw`, profile pictures as `image`) |
| Email | Brevo HTTP API (Nodemailer/SMTP as fallback) |
| Real-time | Socket.IO |
| Security | Helmet · express-mongo-sanitize · express-rate-limit · bcryptjs · CSP nonces |
| Sessions | express-session + connect-mongo |

---

## Prerequisites

Free accounts are required on the following services:

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) | Database | 512 MB |
| [Cloudinary](https://cloudinary.com) | PDF & profile picture storage | 25 GB |
| [Brevo](https://www.brevo.com) | Transactional email delivery | 300 emails/day |

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/shid05/eThesis.git
cd eThesis
npm install
```

### 2. Set up MongoDB Atlas

1. Create a free **M0 cluster** at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Under **Database Access**, create a database user with a username and password.
3. Under **Network Access**, add `0.0.0.0/0` (all IPs) or your machine's IP.
4. Click **Connect → Drivers** and copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/eThesis
   ```

### 3. Set up Cloudinary

1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. From your **Dashboard**, copy the **Cloud Name**, **API Key**, and **API Secret**.

### 4. Set up Brevo

1. Create a free account at [brevo.com](https://www.brevo.com).
2. Verify your sender address under **Senders & IPs → Senders**.
3. Go to **SMTP & API → API Keys** and create a new key. Copy it.

### 5. Create `.env`

Create a file named `.env` in the project root (same folder as `server.js`):

```env
# ── App ────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# ── Session ────────────────────────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=replace_with_a_long_random_string

# ── Database ───────────────────────────────────────────────────────
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/eThesis

# ── Cloudinary ─────────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Brevo Email API ────────────────────────────────────────────────
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender@example.com
```

> **Never commit `.env` to Git.** It is already listed in `.gitignore`.

### 6. Run

```bash
# Development (auto-restarts on changes)
npm run dev

# Production
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Creating the First Admin Account

The system uses an approval-based registration flow — no one can self-register as Admin. To bootstrap the first administrator:

**Option A — Manual Atlas edit (recommended for production)**

1. Start the app and go to `/request-account`. Submit a request as any role.
2. In **MongoDB Atlas → Browse Collections → accountrequests**, find your request.
3. From the running app's admin panel (or directly in Atlas), approve the request to create the user.
4. In the **users** collection, locate your new account and manually change the `role` field to `"Admin"`.

**Option B — Seed script (development only)**

```bash
node seed-database.js
```

> ⚠️ **Do not run `seed-database.js` in production.** It inserts test users with known default passwords.

---

## Deployment (Render)

The app is deployed on [Render](https://render.com). To redeploy or set up your own instance:

1. Push code to GitHub (`.env` is gitignored and must never be committed).
2. Create a new **Web Service** on Render, connected to your GitHub repository.
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `node server.js`
5. Add every environment variable from the table below in **Environment → Environment Variables**.

> Render automatically redeploys on every push to `main`.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | ✅ | `production` on live server — enables HTTPS redirect, secure cookies, hidden error details |
| `PORT` | No | Port to listen on (Render sets this automatically) |
| `APP_URL` | ✅ | Full public URL with no trailing slash (e.g. `https://lncarchives.onrender.com`) — used in all email links and approval URLs |
| `SESSION_SECRET` | ✅ | Long random hex string for signing session cookies |
| `MONGO_URI` | ✅ | MongoDB Atlas connection string |
| `CLOUDINARY_CLOUD_NAME` | ✅ | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | ✅ | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | ✅ | From Cloudinary dashboard |
| `BREVO_API_KEY` | ✅ | From Brevo → SMTP & API → API Keys |
| `BREVO_SENDER_EMAIL` | ✅ | Verified sender address in Brevo |

---

## Project Structure

```
eThesis/
├── server.js                  # Entry point — Express app, Socket.IO, middleware
├── seed-database.js           # Development-only seed script
├── public/
│   ├── css/style.css          # Global stylesheet
│   ├── js/notifications.js    # Client-side Socket.IO notification handler
│   └── images/                # Static assets (favicon, logos)
├── src/
│   ├── controllers/
│   │   ├── adminController.js         # User/account/email management APIs
│   │   ├── authController.js          # Login, logout, register, password reset
│   │   ├── pageController.js          # Page rendering + profile API
│   │   ├── thesisController.js        # Upload, edit, approve, reject, revoke
│   │   └── thesisRequestController.js # File request, approval, download proxy
│   ├── middleware/
│   │   └── auth.js                    # ensureAuthenticated, ensureRole
│   ├── models/
│   │   ├── AccountRequest.js          # New account registration requests
│   │   ├── AccountRetrieval.js        # Forgot-password requests
│   │   ├── EmailSettings.js           # SMTP config (encrypted password)
│   │   ├── Notification.js            # Persistent per-user notification feed
│   │   ├── Thesis.js                  # Thesis document schema
│   │   ├── ThesisRequest.js           # File request + 48h download expiry
│   │   └── User.js                    # User accounts (bcrypt passwords)
│   ├── routes/
│   │   ├── adminRoutes.js             # /admin/* page routes
│   │   ├── authRoutes.js              # /login, /logout, /request-account, /reset-password
│   │   ├── pageRoutes.js              # Public pages + all /api/* endpoints
│   │   ├── thesisRequestRoutes.js     # File request submit/approve/download
│   │   └── thesisRoutes.js            # /thesis/* CRUD + review queue
│   ├── utils/
│   │   ├── badgeCounts.js             # Admin navbar badge counter helper
│   │   ├── cloudinary.js              # Upload, delete, signed-URL helpers
│   │   ├── emailService.js            # Brevo API / SMTP email functions
│   │   └── notificationHelper.js      # Create + emit persistent notifications
│   └── views/
│       ├── partials/                  # head.ejs · navbar.ejs · footer.ejs
│       └── *.ejs                      # One file per page
└── uploads/                   # Legacy directory (gitignored; active storage is Cloudinary)
```

---

## Developed By

**BS Information Technology — Capstone Project, 2026**  
Laguna Northwestern College – San Lorenzo Ruiz Montessori Center

| Name | Role |
|------|------|
| Franz Raschid Loyola | Developer |
| Hanz Villegas | Developer |
| Charles Darwin Garcia | Developer |
| John Michael Aquino | Developer |
| Aira Joy Francisco | Developer |

**Adviser:** Mr. Michael Rojo
