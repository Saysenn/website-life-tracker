# Project brief

Everything asked for while building Life Tracker, in the order it was asked. Kept so the rules survive the conversation.

## Standing rules

These were given once and apply to everything.

**Code**

* Plain JavaScript. No TypeScript anywhere
* Clean, maintainable, scalable, easy to read
* Avoid heavy comments
* Do not overcomplicate
* Secure

**Writing**

* Never use the `-` symbol in titles, descriptions or placeholders
* Wording should match the rest of the site

**Design**

* Modern, and must not look like AI made it
* Minimalist
* Beige white theme
* No thick borders. No line designs
* Small fonts. Base 8px on mobile, 10px on large screens
* Responsive sidebar
* Tooltips on buttons when hovered
* Optimistic updates, skeleton loaders, toasts and notifications
* Make the UI and UX the best it can be

## What the app tracks

Companies grouped into groups. Each company has a name, website, group, payment type, payment method, billing currency, DigiRDP account email and notes. Each company has three services, domain, hosting and RDP, each with a start date and an end date, and the RDP also carries a price.

The DigiRDP account email is stored without a password.

Group, payment type and payment method use a searchable dropdown that also accepts a new value typed in.

Picking a group fills in that group's default payment type and method.

## Status rules

Worked out across several messages, final version:

* **Active** while it is further away than the reminder window
* **Renewal** once it enters the reminder window, so it follows the reminder days in Settings
* **Suspended** for 6 days after an RDP renewal date passes, emailing every one of those days
* **Rebuy** from the 7th day, meaning the renewal was missed and it has to be bought again
* **Renewed** on the day it is renewed
* Domain and hosting have no suspension. They go from Renewal straight to **Ended**
* Plus **Not started**, **Not set** and **Closed**

An archived service must not be counted in its group's totals.

## Money rules

* Only RDP renewals have a price. Domain and hosting are just tracked life, no provider and no price
* Provider, price and currency live in Settings, and any company can override them
* Each company has its own currency, GBP, USD or EUR, so the USDT conversion is accurate
* USDT rates come from a live exchange rate service, per currency
* Gas fees differ per network. TRON 2.22 EUR, ETH 0.74 EUR
* Gas is never added into the USDT total. Each network is paid in its own token, so it is shown separately per network

## Feature requests in order

1. Make it a complete Next.js app to host on Vercel. Auto email notification for RDP, domain and hosting expiry. Simple one person auth, admin and a password. SQLite database. Gmail SMTP
2. Side panel preview when a row is selected, with full CRUD in it
3. Proper dashboard and a responsive sidebar
4. Drag a company onto another group to move it. Every group completely separated on one page as its own table
5. Vercel cron for the email
6. A Status column, automatic. Three tables per group for domain, hosting and RDP
7. Turn those into tabs per group, opening on RDP, because one long list is too much
8. Previous company name tracker. Renaming keeps the old names with the date they changed, shown when the company is opened
9. Typing the company name builds a website suggestion, for example `redhorizonresourcinglimited.co.uk`, so the wrong part can be deleted or the TLD swapped
10. An Actions column. One action means renewed today. The other closes it so it stops renewing and moves to an Archive page, grouped by group and by service
11. Tooltips on buttons
12. Renewal, Suspended and Rebuy semantics, with the grace period set in Settings
13. Conversion rate shown per tab in each group, so the monthly cost per group is visible
14. Settings panel for renewal prices, with the RDP price and its USDT value
15. Dashboard showing this month's RDP renewal cost in USDT and raw, a graph per group, and an estimate over 3 or 6 months. Remove unnecessary cards, add graphs and animations
16. A second sidebar just for Settings, on its own page
17. The dashboard must show what is still to pay this month, not fixed totals. It has to say how much was already spent per group and how much is left, this month and further out
18. A Preview page with a tab per group, listing the RDPs due in the next 7 days, 2 weeks or 30 days, with the raw price per currency, the USDT to send, and the gas needed. Suspended and ended are included automatically
19. Clicking a group in the sidebar opens a modal listing that group's companies with renew and close actions, and a totals footer for spent, remaining and gas
20. Simplify the dashboard, it was too confusing. Keep a pie chart, a bar graph and a line graph
21. Fix dashboard spacing and alignment
22. Tidy the group modal. Align it, fix the font sizes, keep it minimalist, put the month total on its own line with the raw value, and give the totals their own box rather than full width
23. The button tooltip must not appear by itself when the modal opens
24. The donut circle has to be bigger, it was clamping the text inside it
25. Hovering a dot on the line chart must show a breakdown, and that breakdown must be per group
26. Clicking any of the three dashboard cards opens a modal showing the same breakdown that used to appear on hover. Not a redirect, and not a copy of the group modal
27. On the Preview page, replace 30 days with This month, meaning everything due for renewal in the current month
28. A Payment list button on the Preview page. A modal listing, per group, each company with how much and when it ends, then Total USDT needed and Total fee needed. Simple enough to photograph with a phone

## Email rules

* One digest at **12:00** Dubai time every day
* On a day an RDP expires, also **15:00** and **18:00** Dubai time
* Each email covers what expires today, what is overdue, what is already in the 6 day grace period, and what is coming up in the next 7 or 14 days depending on the Settings window
* A reminder goes out every day of the grace period while an RDP is suspended
* The link in the email must open the live site

## Hosting rules

* Hosted on Vercel, on the **free plan**, with no intention of subscribing. Every feature has to work within it
* SQLite locally, Turso in production, because a Vercel function cannot keep a file
* Since the free plan only triggers one cron a day, GitHub Actions fires the three daily times and the route ignores repeats
