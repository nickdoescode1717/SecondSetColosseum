# Development Startup Guide

This guide helps you start all SecondSet services without port conflicts.

## Port Allocation

| Service | Port | URL |
|---------|------|-----|
| **Coordinator Service** | 3000 | http://localhost:3000 |
| **Web Application** | 3002 | http://localhost:3002 |
| **PostgreSQL** | 5432 | localhost:5432 |
| **Redis** | 6379 | localhost:6379 |
| **Expo Dev Server** | 8081 | http://localhost:8081 |

## Prerequisites

Before starting any service, ensure you have:

1. **PostgreSQL** running on port 5432
   - Database: `secondset` (for Web App)
   - Database: `secondset_coordinator` (for Coordinator)

2. **Redis** running on port 6379
   ```bash
   # Start Redis (if using Docker)
   docker run -d -p 6379:6379 redis:latest

   # Or if installed locally
   redis-server
   ```

## Starting Services (Recommended Order)

### 1. Start Coordinator Service (Port 3000)

```bash
cd secondset-mobile-signer/coordinator
npm install
npm run dev
```

**Expected Output:**
```
✅ Coordinator server running on port 3000
   Health check: http://localhost:3000/health
   WebSocket: ws://localhost:3000/ws
```

**Health Check:**
```bash
curl http://localhost:3000/health
```

---

### 2. Start Web Application (Port 3002)

```bash
cd SecondSet/SecondSet/secondset
npm install
npm run dev
```

**Expected Output:**
```
▲ Next.js 16.x.x
- Local:        http://localhost:3002
- Ready in XXXms
```

**Access:** http://localhost:3002

---

### 3. Start Mobile Signer App (Port 8081)

```bash
cd secondset-mobile-signer/mobile-signer
npm install
npm start
```

**Expected Output:**
```
Metro waiting on exp://localhost:8081
```

**Controls:**
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Press `w` for Web (not recommended for production testing)

---

## Troubleshooting Port Conflicts

### Error: "Port 3000 is already in use"

**Option 1: Stop the conflicting process**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9
```

**Option 2: Verify service configuration**
- Coordinator should use PORT=3000 (check `.env` file)
- Web App should use PORT=3002 (check `.env` and `package.json`)

### Error: "Port 3002 is already in use"

This means the Web App port is occupied. Either:
1. Stop the conflicting process (see commands above)
2. Or change Web App port in both files:
   - `.env`: Change `PORT=3002` and `NEXTAUTH_URL`
   - `package.json`: Change `-p 3002` in scripts

### Database Connection Errors

**Coordinator Database:**
```bash
# Create database if it doesn't exist
createdb secondset_coordinator

# Run migration
psql -U postgres -d secondset_coordinator -f secondset-mobile-signer/coordinator/migrations/001_initial_schema.sql
```

**Web App Database:**
```bash
# Create database if it doesn't exist
createdb secondset

# Run Prisma migrations
cd SecondSet/SecondSet/secondset
npx prisma migrate dev
npx prisma db seed  # Seed with test data
```

## Environment Variable Checklist

### Coordinator (`secondset-mobile-signer/coordinator/.env`)
- ✅ `PORT=3000`
- ✅ `DATABASE_URL=postgresql://postgres:password@localhost:5432/secondset_coordinator`
- ✅ `WEBAPP_WEBHOOK_URL=http://localhost:3002/api/coordinator/webhook`
- ✅ `COORDINATOR_API_KEY` matches Web App's `COORDINATOR_API_KEY`
- ✅ `COORDINATOR_WEBHOOK_SECRET` matches Web App's `COORDINATOR_WEBHOOK_SECRET`

### Web App (`SecondSet/SecondSet/secondset/.env`)
- ✅ `PORT=3002`
- ✅ `NEXTAUTH_URL=http://localhost:3002`
- ✅ `DATABASE_URL=postgresql://postgres:password@localhost:5432/secondset?schema=public`
- ✅ `COORDINATOR_API_URL=http://localhost:3000/api`
- ✅ `COORDINATOR_API_KEY` matches Coordinator's `COORDINATOR_API_KEY`
- ✅ `COORDINATOR_WEBHOOK_SECRET` matches Coordinator's `COORDINATOR_WEBHOOK_SECRET`

## Quick Test: Full Integration

Once all services are running, test the full flow:

### 1. Access Web App
Navigate to http://localhost:3002 and log in with seed credentials:
- Email: `admin@acme.com`
- Password: `password123`

### 2. Check Coordinator Health
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "..."
}
```

### 3. Test Keygen Ceremony (Wallet Creation)
1. In Web App, navigate to Organization Settings → Vaults
2. Click "Create Wallet"
3. QR code should appear (proves Web App ↔ Coordinator integration)
4. Open Mobile App on 3 devices/simulators
5. Scan QR code with each device
6. Watch ceremony complete

### 4. Verify Integration
- Coordinator logs should show: `✅ Created keygen session: <session_id>`
- Mobile apps should connect via WebSocket
- Web app should receive webhook and save wallet address

## Service URLs Reference

| Service | URL | Purpose |
|---------|-----|---------|
| Web App UI | http://localhost:3002 | Main application interface |
| Coordinator API | http://localhost:3000/api | REST API for session creation |
| Coordinator Health | http://localhost:3000/health | Service health check |
| Coordinator WebSocket | ws://localhost:3000/ws | Real-time ceremony coordination |
| Expo Dev Tools | http://localhost:8081 | Mobile app dev menu |

## Stopping Services

```bash
# Stop all running processes
# Press Ctrl+C in each terminal window

# Or force kill by port
kill $(lsof -ti:3000)  # Coordinator
kill $(lsof -ti:3002)  # Web App
kill $(lsof -ti:8081)  # Expo
```

## Notes

- **Redis**: Both Coordinator and Web App can share the same Redis instance (port 6379)
- **PostgreSQL**: Services use separate databases on the same PostgreSQL instance
- **Development Only**: Use `TEST_SIGNER_PRIVATE_KEY` fallback when Coordinator is not running (Web App will sign transactions locally)
