# Life Tracker

Tracks domain, hosting and RDP renewals for every company, grouped the way you work, with a daily email when something is close to its end date.

Built with Next.js (App Router, plain JavaScript), Auth.js, Drizzle ORM on SQLite (Turso in production), Tailwind CSS and Nodemailer over Gmail SMTP.

## Features

* Dashboard with status counts, upcoming renewals, a 12 month renewal chart and breakdowns
* Companies page where every group is its own section with tabs for Domain, Hosting and RDP, opening on RDP
* Renaming a company keeps every previous name with the date it changed, shown in the side panel
* Automatic status per service: Active, Renewed, Renewal, Suspended, Rebuy, Ended, Not started, Not set
* Renewal starts when the first reminder is due, so it follows the reminder days you set
* After an RDP renewal date passes it shows as Suspended for the grace period, 6 days by default, then Rebuy
* Actions on every row: mark it renewed today, or close it so it stops renewing and moves to the Archive page
* End dates fill in from the start date: RDP renews 1 month later, domain and hosting end 1 year later
* One click renew moves the start date forward and sets the next end date the same way
* Drag a company onto another group to move it, with undo
* Side panel with full details, edit, delete, quick renew and move to group
* Each group has a default payment type and method that fills in when you pick the group
* RDP renewal prices with a provider and currency, set in Settings and overridable per company
* Domains and hosting are tracked for their dates only, with no prices attached
* USDT rates per currency, pulled from a public exchange rate service on demand and once a day with the cron
* Every group tab shows what that service costs, for example "£143.24 · 193.09 USDT per month"
* Dashboard splits what is already paid this month from what is still to pay, with a bar, donut and line chart
* Clicking a group in the sidebar opens it as a modal with renew and close actions and this month's totals
* Renewal preview with a tab per group, listing what falls due in 7 days, 2 weeks or 30 days
* The preview totals the raw price per currency and the USDT to send, with gas listed separately per network
* Gas fees per payment method in their own currency, since each network is paid in its own token
* Searchable dropdowns that let you add new groups, payment types and payment methods
* Daily digest by email at 12:00 Dubai time, plus 15:00 and 18:00 on a day something expires
* Each digest is grouped into Expiring today, Overdue and the next few days, with the window set in Settings
* Overdue rows say which day of the grace period they are on, or that they need rebuying
* In app notifications, optimistic updates, skeleton loaders and toasts
* Single admin login with rate limiting

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:migrate           # creates local.db
npm run dev
```

Open http://localhost:3000 and sign in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Gmail setup

1. Turn on 2 Step Verification for the Google account.
2. Create an App Password at https://myaccount.google.com/apppasswords.
3. Set `SMTP_USER` to the Gmail address and `SMTP_PASSWORD` to the App Password.
4. In the app, open Settings and press **Send test email**.

## Deploy to Vercel

Vercel functions cannot keep a SQLite file, so production uses [Turso](https://turso.tech), which is hosted SQLite. Do the steps in this order, because the database has to exist before the first build runs.

### 1. Prepare the secrets

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 24      # CRON_SECRET
```

Create a Google App Password at https://myaccount.google.com/apppasswords for `SMTP_PASSWORD`. Your normal Gmail password will not work.

### 2. Create the database

Add the Turso integration from the Vercel marketplace, which provisions the database and sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for you. Or create one with the Turso CLI and copy both values by hand.

### 3. Create the tables

`vercel-build` migrates on every deploy, but run it once yourself so you can see it succeed:

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io TURSO_AUTH_TOKEN=... npx drizzle-kit migrate
```

Pass them inline like this. Putting them in `.env.local` points local development at production data.

### 4. Set the environment variables

All of these go in the project settings, on the Production environment:

| Variable | Value |
| --- | --- |
| `ADMIN_USERNAME` | your login name |
| `ADMIN_PASSWORD` | your login password, no trailing spaces |
| `AUTH_SECRET` | from step 1, required or sign in fails |
| `APP_TIMEZONE` | `Asia/Dubai`, decides what counts as today |
| `TURSO_DATABASE_URL` | from step 2 |
| `TURSO_AUTH_TOKEN` | from step 2 |
| `SMTP_USER` | the Gmail address that sends |
| `SMTP_PASSWORD` | the App Password from step 1 |
| `NOTIFY_EMAIL` | where reminders arrive |
| `CRON_SECRET` | from step 1, Vercel sends it to the cron route |

### 5. Deploy

Import the repository and deploy. Vercel runs `vercel-build`, which applies migrations and then builds.

Environment variables never reach a deployment that already exists, so redeploy after adding or changing any of them.

### 6. Check it works

1. Sign in.
2. Add a company, reload the page, confirm it is still there. That proves Turso is connected.
3. Settings, then **Send test email**.
4. Confirm the cron route answers:
   ```bash
   curl -i -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/reminders
   ```
   A JSON body means the database and email path are live. A 500 means the tables are missing, a 401 means the secret does not match.
5. Project, then Cron Jobs, confirm the daily job is listed.

### 7. Schedule the reminders

Emails go out at **12:00** Dubai time every day, and also at **15:00** and **18:00** on a day something expires. All three call the same route, which works out which round it is from the clock and refuses to send the same round twice.

The free Vercel plan only allows one cron trigger per day, so `vercel.json` covers the 12:00 run and GitHub Actions covers all three. Both are free, and the duplicate 12:00 trigger is harmless because the route deduplicates.

Add two repository secrets under Settings, Secrets and variables, Actions:

| Secret | Value |
| --- | --- |
| `APP_URL` | `https://your-app.vercel.app`, no trailing slash |
| `CRON_SECRET` | the same value as the Vercel variable |

`.github/workflows/reminders.yml` then fires at 08:00, 11:00 and 14:00 UTC. Run it once by hand from the Actions tab to check it works.

Two things to know about GitHub schedules: they can run a few minutes late when GitHub is busy, and GitHub pauses scheduled workflows in a repository with no activity for 60 days. The Vercel cron is unaffected by both, so the daily 12:00 digest keeps arriving either way.

Vercel sends `CRON_SECRET` as a bearer token and the route rejects anything without it. The same run refreshes the USDT rates.

### When sign in fails

| What you see | Cause | Fix |
| --- | --- | --- |
| Vercel error page, no app styling | The action threw before rendering, almost always missing tables | Run step 3, then redeploy |
| Same page, tables exist | `AUTH_SECRET` is missing | Add it, then redeploy |
| Username or password is incorrect | `ADMIN_USERNAME` or `ADMIN_PASSWORD` unset, or a trailing space in the pasted password | Retype both, then redeploy |
| Too many attempts | Five failures from your IP | Wait 15 minutes |

Project, then Logs, then attempt the sign in again. The entry that appears names the real error.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Lint the project |
| `npm run db:generate` | Create a migration after editing `src/db/schema.js` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
