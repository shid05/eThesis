# LNC Research Archives

A secure academic thesis repository system for Laguna Northwestern College. Students can upload thesis submissions, administrators and teachers manage approvals, and users can request access to thesis files via email.

---

## Prerequisites

Before running this project, you need free accounts on the following services:

| Service | Purpose | Free Tier |
|---|---|---|
| [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) | Database | 512 MB free |
| [Cloudinary](https://cloudinary.com) | Thesis file & profile picture storage | 25 GB free |
| [Brevo](https://www.brevo.com) | Sending email notifications | 300 emails/day free |

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd eThesis
npm install
```

---

### 2. Set up MongoDB Atlas

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and create a free account.
2. Create a new **free cluster** (M0).
3. Under **Database Access**, create a user with a username and password.
4. Under **Network Access**, add `0.0.0.0/0` (allow all IPs) or your server's IP.
5. Click **Connect → Drivers** and copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/ethesis?retryWrites=true&w=majority
   ```
6. Replace `<username>` and `<password>` with the credentials you created.

---

### 3. Set up Cloudinary

1. Go to [cloudinary.com](https://cloudinary.com) and create a free account.
2. From your **Dashboard**, copy:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

---

### 4. Set up Brevo (email sending)

1. Go to [brevo.com](https://www.brevo.com) and create a free account.
2. Verify your sender email address under **Senders & IPs → Senders**.
3. Go to **SMTP & API → API Keys** and create a new API key.
4. Copy the API key.

---

### 5. Create your `.env` file

Create a file named `.env` in the root of the project (same folder as `server.js`):

```env
# ── App ─────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# ── Session ─────────────────────────────────────────────────────
# Use any long random string. Example: open a terminal and run:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=replace_this_with_a_long_random_string

# ── Database ─────────────────────────────────────────────────────
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/ethesis?retryWrites=true&w=majority

# ── Cloudinary ───────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Brevo Email API ──────────────────────────────────────────────
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender@example.com
```

> **Never commit `.env` to Git.** It is already listed in `.gitignore`.

---

### 6. Run the app

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Creating the first Admin account

The system uses an approval-based registration flow — users request accounts and an Admin approves them. To bootstrap the first Admin:

1. Run the app and go to `/request-account`.
2. Submit a request with role **Teacher** or **Student** (Admin cannot self-register for security).
3. Open **MongoDB Atlas → Browse Collections → accountrequests** and find your request.
4. In the `users` collection (after approval), manually change your `role` field to `"Admin"` using the Atlas UI.

Or, use the seed script once for development:

```bash
node seed-database.js
```

> **Do not run `seed-database.js` in production.** It creates test users with default passwords.

---

## Deployment (Render / Railway / Fly.io)

1. Push your code to GitHub (without `.env`).
2. Create a new **Web Service** on your chosen platform.
3. Set the **Start Command** to `node server.js`.
4. Add all environment variables from your `.env` file in the platform's dashboard.
5. Set `NODE_ENV=production` and update `APP_URL` to your live domain (e.g. `https://yourapp.onrender.com`).

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Port to listen on (default: `3000`) |
| `APP_URL` | Yes | Full public URL of the app (no trailing slash) |
| `SESSION_SECRET` | Yes | Long random string for signing session cookies |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `CLOUDINARY_CLOUD_NAME` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Yes | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Yes | From Cloudinary dashboard |
| `BREVO_API_KEY` | Yes | From Brevo API Keys page |
| `BREVO_SENDER_EMAIL` | Yes | Verified sender email in Brevo |

---

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Templating**: EJS
- **File Storage**: Cloudinary
- **Email**: Brevo API (Nodemailer as fallback)
- **Real-time**: Socket.IO
- **Security**: Helmet, express-mongo-sanitize, express-rate-limit, CSP nonces, bcryptjs
