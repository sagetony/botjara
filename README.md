# WAAI — WhatsApp AI Agent for Nigerian SMEs

A production-ready WhatsApp AI agent backend that automates customer conversations, order capture, and payments for Nigerian restaurants and SMEs.

## What's Built (Week 1–4)

| Module | Status |
|--------|--------|
| Node.js + TypeScript + Express | ✅ |
| MongoDB Atlas (7 schemas) | ✅ |
| WhatsApp Cloud API webhook | ✅ |
| Message routing & tenant resolution | ✅ |
| GPT-4o-mini AI with restaurant system prompt | ✅ |
| Conversation memory (last 10 messages) | ✅ |
| Voice note transcription (Whisper) | ✅ |
| Order capture & management | ✅ |
| Paystack payment link generation | ✅ |
| Payment webhook (auto confirms orders) | ✅ |
| Owner WhatsApp notifications | ✅ |
| Human handoff (customer → owner) | ✅ |
| Menu CRUD API | ✅ |
| Delivery/pickup flow | ✅ |
| Docker + docker-compose | ✅ |

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
# Fill in all values in .env
```

### 3. Required API keys
- **MongoDB Atlas** — create free cluster at mongodb.com
- **OpenAI** — get key at platform.openai.com
- **Paystack** — get keys at paystack.com
- **Meta WhatsApp Cloud API** — set up at developers.facebook.com

### 4. Seed test data
```bash
npm run seed
```

### 5. Run in development
```bash
npm run dev
```

Server starts on `http://localhost:3000`

---

## Meta WhatsApp Setup

1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create an app → Business → WhatsApp
3. Add a phone number (test number available for free)
4. Copy your **Phone Number ID** and **Access Token** to `.env`
5. Set webhook URL to: `https://yourdomain.com/webhook/whatsapp`
6. Set verify token to match `WHATSAPP_VERIFY_TOKEN` in `.env`
7. Subscribe to `messages` webhook field

> For local testing, use [ngrok](https://ngrok.com) to expose localhost:
> ```bash
> ngrok http 3000
> # Copy the https URL and use as webhook URL in Meta
> ```

---

## API Endpoints

### Webhooks (Meta + Paystack call these)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/webhook/whatsapp` | Meta webhook verification |
| POST | `/webhook/whatsapp` | Incoming WhatsApp messages |
| POST | `/webhook/paystack` | Paystack payment events |

### Orders (Dashboard)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders?tenantId=xxx` | Get all orders |
| GET | `/api/orders/:id` | Get single order |
| PATCH | `/api/orders/:id/status` | Update order status |

### Menu (Dashboard)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/menus?tenantId=xxx` | Get full menu |
| POST | `/api/menus` | Create menu item |
| PATCH | `/api/menus/:id` | Update menu item |
| PATCH | `/api/menus/:id/toggle` | Toggle availability |
| DELETE | `/api/menus/:id` | Delete menu item |
| POST | `/api/menus/bulk-availability` | Bulk toggle |

---

## How the AI Bot Works

```
Customer message
       ↓
WhatsApp Webhook (POST /webhook/whatsapp)
       ↓
Signature Validation
       ↓
Tenant Resolution (which restaurant?)
       ↓
Customer Find/Create
       ↓
Human Handoff Check → if "HUMAN" → notify owner, pause AI
       ↓
Voice Note? → Whisper transcription
       ↓
Load conversation history (last 10 messages)
       ↓
GPT-4o-mini with restaurant system prompt
       ↓
Send reply to customer
       ↓
Payment link mention detected? → Paystack link generated + sent
```

---

## How Payments Work

```
AI says "I'll send you a payment link"
       ↓
System detects payment trigger phrase
       ↓
Finds latest unpaid order for this conversation
       ↓
Calls Paystack /transaction/initialize
       ↓
Sends Paystack URL to customer in chat
       ↓
Customer pays (card/bank transfer/USSD)
       ↓
Paystack fires webhook to POST /webhook/paystack
       ↓
Order status → paid
       ↓
Customer gets confirmation message
       ↓
Owner gets WhatsApp notification
```

---

## Docker Deployment

```bash
# Build and run with Docker
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

---

## Project Structure

```
src/
├── config/          # DB, Redis connections
├── modules/
│   ├── ai/          # GPT integration, action extractor
│   ├── customers/   # Customer model
│   ├── menus/       # Menu model, service, routes
│   ├── messaging/   # Message processor, WhatsApp sender, handoff
│   ├── notifications/ # Owner + customer notifications
│   ├── orders/      # Order model, service, routes
│   ├── payments/    # Paystack service, webhook routes
│   ├── tenants/     # Restaurant/tenant model
│   ├── voice/       # Whisper transcription
│   └── webhook/     # WhatsApp webhook controller
└── utils/           # Logger
scripts/
└── seed.ts          # Test data seeder
```

---

## Next: Week 5 (Dashboard)

The Next.js owner dashboard will consume the `/api/orders` and `/api/menus` endpoints built here. Real-time order feed, status management, menu editor, revenue view.
