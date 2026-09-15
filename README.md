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
* Daily reminder digest by email, sent 30, 14, 7, 3, 1 and 0 days before an end date (configurable)
* A reminder goes out every day of the grace period while a service is suspended
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

Vercel functions cannot keep a SQLite file, so production uses [Turso](https://turso.tech), which is hosted SQLite.

1. Create a Turso database and copy its URL and auth token (or add the Turso integration from the Vercel marketplace).
2. Import the repository in Vercel.
3. Add these environment variables: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_SECRET`, `APP_TIMEZONE`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SMTP_USER`, `SMTP_PASSWORD`, `NOTIFY_EMAIL`, `CRON_SECRET`.
4. Deploy. The `vercel-build` script runs the database migrations before building.

The reminder cron is defined in `vercel.json` and calls `/api/cron/reminders` every day at 05:00 UTC (09:00 in Dubai). Vercel sends `CRON_SECRET` as a bearer token, and the route rejects any request without it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Lint the project |
| `npm run db:generate` | Create a migration after editing `src/db/schema.js` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
