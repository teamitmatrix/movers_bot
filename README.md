# Vanturo Movers Bot

Vanturo Movers Bot is a Next.js 14 application for a US moving company. It combines a public landing page, an AI-powered quote and booking chat, MongoDB-backed order storage, and a protected admin dashboard for reviewing and updating move orders.

## Features

- Public landing page for Vanturo with service sections, trust messaging, pricing hints, legal pages, and responsive navigation.
- AI chat assistant for collecting move details, generating quotes, and creating bookings.
- OpenAI primary and fallback model support.
- MongoDB persistence for conversations, admins, and orders.
- Protected admin login with NextAuth credentials auth.
- Admin dashboard for reviewing orders and updating move status.
- Mobile-responsive UI for both public and admin experiences.

## Tech Stack

- Next.js 14.2.35 with the App Router
- React 18 + TypeScript
- Tailwind CSS
- MongoDB + Mongoose
- NextAuth v4 credentials authentication
- OpenAI SDK

## Project Structure

```text
src/
	app/
		api/
			auth/[...nextauth]/route.ts
			chat/route.ts
			orders/route.ts
			orders/[id]/route.ts
			sessions/route.ts
			sessions/[sessionId]/route.ts
		dashboard/
			orders/[id]/page.tsx
			page.tsx
		login/page.tsx
		page.tsx
		privacy-policy/page.tsx
		terms-of-service/page.tsx
	components/
		chat/
		dashboard/
		landing/
		legal/
		orders/
		shared/
	lib/
	models/
scripts/
	seed-admin.js
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in real values.

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL_PRIMARY=gpt-5-mini
OPENAI_MODEL_FALLBACK=gpt-5-nano
MONGODB_URI=mongodb://localhost:27017/vanturo
NEXTAUTH_SECRET=your_long_random_secret
NEXTAUTH_URL=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
```

Notes:

- `OPENAI_MODEL_PRIMARY` and `OPENAI_MODEL_FALLBACK` are both supported by the chat route.
- `NEXTAUTH_URL` must match the actual origin you are using in development.
- If port `3000` is taken, Next.js may start on another port such as `3001` or `3002`. Update `NEXTAUTH_URL` accordingly.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the app in your browser:

- Public site: `http://localhost:3000`
- Admin login: `http://localhost:3000/login`

If Next.js chooses a different port, use that port for both the browser URL and `NEXTAUTH_URL`.

## Admin Setup

The app supports admin authentication in two ways:

- direct environment credential fallback using `ADMIN_USERNAME` and `ADMIN_PASSWORD`
- database-backed credentials stored in MongoDB

To seed an admin user into MongoDB:

```bash
npm run seed:admin
```

Important:

- `scripts/seed-admin.js` reads `process.env` directly.
- It does not automatically load `.env.local`.
- In PowerShell, set the needed environment variables in the shell before running the script if they are not already available in the session.

Example PowerShell flow:

```powershell
$env:MONGODB_URI="mongodb://127.0.0.1:27017/vanturo"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="your_password"
npm run seed:admin
```

## Main Routes

- `/` - landing page
- `/login` - admin sign-in page
- `/dashboard` - protected admin orders dashboard
- `/dashboard/orders/[id]` - protected order details page
- `/privacy-policy` - privacy policy page
- `/terms-of-service` - terms of service page

## API Routes

- `POST /api/chat` - AI quote and booking flow
- `GET /api/orders` - list admin orders
- `POST /api/orders` - create an order from the admin side
- `GET /api/orders/[id]` - fetch a single order
- `PATCH /api/orders/[id]` - update order status
- `POST /api/auth/[...nextauth]` - NextAuth credentials login
- `GET /api/sessions` and `GET /api/sessions/[sessionId]` - chat session persistence support

## Chat Behavior

The AI assistant is tuned for a short, form-like booking flow. It:

- collects pickup ZIP, dropoff ZIP, and item list before pricing
- uses tool calls for quote calculation and order creation
- supports FAQ-style cached answers for common questions
- limits demo sessions to a fixed number of user messages
- uses a fallback OpenAI model if the primary model fails

## Scripts

- `npm run dev` - start the Next.js dev server
- `npm run build` - build for production
- `npm run start` - run the production server
- `npm run lint` - run linting
- `npm run seed:admin` - create or update the admin account in MongoDB

## Authentication and Access Control

- Admin routes under `/dashboard` are protected by `middleware.ts`.
- Unauthenticated users are redirected to `/login`.
- The admin dashboard includes logout controls and links back to the main site.

## Troubleshooting

### Login redirects to the wrong port

Make sure `NEXTAUTH_URL` matches the real development origin, for example:

```env
NEXTAUTH_URL=http://localhost:3002
```

Then restart the dev server.

### MongoDB connection errors

Verify that `MONGODB_URI` starts with `mongodb://` or `mongodb+srv://` and points to a running MongoDB instance.

### Seed script says env vars are missing

That script does not auto-load `.env.local`. Export the variables in your terminal session before running `npm run seed:admin`.

### Sticky or fixed element warnings in DevTools

You may see Next.js scroll warnings when switching device modes in DevTools while sticky or fixed UI is present. If normal navigation and scrolling behave correctly, those warnings are usually not a functional issue.

## Current Branding

- Brand: Vanturo
- Visual direction: trustworthy logistics/service business
- Primary palette centers on deep blue, white, slate, and orange CTA accents
