# Company Daily Expense Manager

Full-stack expense tracker for money a company gives you and the expenses you pay from it.
**React + Vite + Tailwind** (client) - **Node + Express** (API) - **MongoDB Atlas** - **JWT** - **ExcelJS** - **Recharts**

## Features
- Dashboard: opening balance, money received, total expenses, remaining company balance, personal pocket money used, pending reimbursement, current-month expenses, plus 5 charts. Nothing is hard-coded; everything is calculated from your transactions.
- Add Money (any number of times), Add Expense (9 categories, Cash/Bank/UPI, bill upload, notes).
- **Payment source is tracked per expense**: Company money, Personal pocket, or Split. Expenses are never assumed to be personal just because they pass the balance. If a company-paid expense exceeds the balance the app asks how it was paid (split / fully personal / keep as company and go negative).
- Reimbursements (money paid back to you) reduce the pending reimbursement without touching the company balance.
- Transactions: search, date range, category/type/source filters, edit, delete with confirmation, latest-first sort, running balance, pagination, print. Daily, weekly, monthly and category reports.
- Duplicate-entry protection, bill viewer, backup and restore (JSON, includes bills), print, JWT auth, per-user data isolation.
- Excel export (complete history or any date range) with live formulas, see below.
- Mobile: bottom navigation. Desktop: sidebar.
- Role-based workspaces: a one-time, setup-key-protected account becomes the MongoDB-designated administrator; employee accounts are created through single-use invitations. Administrators see company-wide totals and employee spending, while employees only see their own transactions and cannot change company settings.

## Formulas
```
Total Company Money   = Opening Balance + Additional Money Received
Company Balance       = Total Company Money - Company-paid Expenses
Personal Pocket Used  = Personal-paid Expenses
Total Expenses        = Company-paid + Personal-paid
Pending Reimbursement = Personal Pocket Used - Reimbursements received
```
Example: 50,000 received; expenses 500 + 5,000 + 10,000 + 500 all from company -> balance **34,000**.
Example: 50,000 company money, 55,000 expenses (5,000 paid from pocket) -> balance **0**, personal **5,000**, reimburse **5,000**.

## Setup
Requirements: Node.js 18+ and a free MongoDB Atlas cluster.

1. **MongoDB Atlas**: create a cluster -> Database Access: add a user -> Network Access: allow your IP (or 0.0.0.0/0 for hosting) -> Connect -> Drivers -> copy the connection string.
2. **Install**
   ```bash
   npm run setup            # installs root, server and client dependencies
   cp server/.env.example server/.env
   ```
3. Edit `server/.env`: set `MONGODB_URI` (put your database user/password and keep a database name such as `expense_manager`), a long random `JWT_SECRET`, and a private random `ADMIN_SETUP_KEY` (at least 24 characters). Never share the setup key.
4. **Run in development** (API on :5000, web on :5173):
   ```bash
   npm run dev
   ```
   Open http://localhost:5173, choose "Set up administrator", enter the `ADMIN_SETUP_KEY`, then set the opening balance in Settings.
5. **Account roles:** the first account is created once using the private `ADMIN_SETUP_KEY`; its `role` and `isPrimaryAdmin` fields are stored in MongoDB, and its password is stored as a hash. After setup, public administrator setup is closed. Only the MongoDB record marked `role: "admin"` and `isPrimaryAdmin: true` can use admin access. From **Employees**, the administrator can create a single-use invitation link (valid for 7 days) and share it with an employee. Invitation links can be revoked while pending. Employees only see their own records; administrators see aggregate company totals and each employee's expenses. An existing account can join with its current password; its transaction history then becomes visible to that company's administrators.
6. **Run in production** (one server serves API + website):
   ```bash
   npm run build && npm start      # open http://localhost:5000
   ```
   Set `ALLOW_REGISTRATION=false` once your accounts exist. Uploaded bills are stored in `server/uploads` (persistent disk needed on hosts like Render/Railway; include them in backups via Settings).

If the client is hosted separately, set `VITE_API_URL` in `client/.env` and `CLIENT_ORIGIN` in `server/.env`.

## Excel export
`GET /api/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD` (both optional), from the Excel Download page, Transactions or any report.

| Sheet | Contents |
|---|---|
| Expense Summary | Opening balance, money received, company/personal expenses, remaining balance, personal money used, reimbursement - all formulas. Also explains how to add entries |
| Daily Transactions | A-J as specified, plus K Reimbursement Received, L Transaction ID, M Payment Mode, N Paid From (Company Money / Personal Pocket / Split), O Bill Attached. Row 2 is the opening / brought-forward row. `H = H(prev) + E - F`, `I = I(prev) + G`. **300 empty rows below the data already contain these formulas**, with dropdowns for Category, Payment Mode and Paid From. Totals block (SUM formulas) at the bottom |
| Category Report | `COUNTIF` and `SUMIF` per category (cover the spare rows too) |
| Monthly Report | `SUMIFS` by month + running closing balance, with 12 extra months ready |

**Adding an entry directly in Excel:** type Date, Description, Category, Paid To and the amount (Money Received, Company Expense or Personal Expense) in the next empty row. No formulas needed; everything recalculates.

Formatting: navy header rows, ₹#,##0.00 currency, DD-MM-YYYY dates, borders, frozen top row, filters, red/green balances, column widths, and `fullCalcOnLoad` so Excel recalculates when opened. For date-range exports the first row is the balance brought forward, so running balances remain correct.

## Tests
```bash
npm test
```
Covers the two spec examples, split payments, reimbursements, running ledger, validation, empty data, and Excel structure/formula references (including date-range export). The generated workbook was also recalculated in LibreOffice and edits to input cells were confirmed to flow through all four sheets.

## API (all except auth need `Authorization: Bearer <token>`)
`POST /api/auth/register|login|accept-invite` - `GET /api/auth/me` - `PUT /api/auth/settings|password`
`GET /api/admin/dashboard|employees` - `POST /api/admin/invites` - `DELETE /api/admin/invites/:id` (admin only)
`GET/POST /api/transactions` - `GET/PUT/DELETE /api/transactions/:id` - `GET /api/transactions/:id/bill`
`GET /api/reports/summary|dashboard|report` - `GET /api/export/excel` - `GET /api/backup` - `POST /api/backup/restore`

## Notes
- "This month" uses server time (UTC). Dates are stored as calendar dates, so there are no timezone shifts in entries or exports.
- The funds check compares against the current total company balance, not the balance on the entry's date.
