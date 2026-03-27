# GaadiCheck

Vehicle QC & Delivery Management — built on Next.js 14 + Supabase + Vercel.

---

## Setup (5 minutes)

### 1. Clone and install

```bash
cd gaadicheck
npm install
```

### 2. Create environment file

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in your Supabase dashboard → Settings → API.

### 3. Run SQL setup

Open `supabase_setup.sql` and run it in your Supabase SQL Editor.
This creates:
- `car_qc_records` table
- `app_settings` table
- `qc-photos` storage bucket

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables when prompted, or in Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Or connect your GitHub repo in Vercel dashboard — auto-deploys on every push.

---

## Project structure

```
src/
├── app/
│   ├── login/          — Email + password login
│   └── (app)/
│       ├── dashboard/  — Manager overview + today's deliveries
│       ├── stock/      — Match stock table with search + filters
│       ├── delivery/   — Delivery schedule (today / upcoming / unscheduled)
│       ├── qc/         — QC checklist form with photos
│       └── settings/   — Yard management + employee list
├── components/
│   ├── layout/         — Sidebar, Header
│   ├── delivery/       — DeliveryModal
│   └── whatsapp/       — WhatsAppPanel
├── lib/
│   ├── supabase/       — Browser + server clients
│   ├── auth-context.tsx — Employee/role/location context
│   └── utils.ts        — Date helpers, WhatsApp builder
└── types/index.ts      — All TypeScript types
```

---

## Role access

| Role code   | Pages visible                                    |
|-------------|--------------------------------------------------|
| PDIQCMGR    | Dashboard, Stock, Delivery, QC, Settings         |
| TECHNICIAN  | Stock (own location), Delivery, QC               |
| DRIVER      | Delivery (own location only)                     |

---

## Data sources

| Data              | Source                                       |
|-------------------|----------------------------------------------|
| Vehicle stock     | `matched_stock_customers` (read only)        |
| Delivery dates    | `booking.delivery_date` via `crm_opty_id`   |
| QC results        | `car_qc_records` (written by this app)       |
| QC status sync    | `booking.qc_check_status` (also updated)    |
| Employee/auth     | `employees` + `auth.users`                   |
| Location filter   | `employees.location_id` → `locations.name`  |
| Yard numbers      | `app_settings` key = 'yards'                 |
