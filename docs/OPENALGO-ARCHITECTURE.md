# EquityPro — Multi-Broker Integration Architecture
## Inspired by OpenAlgo's Adapter Pattern, Built for Multi-Tenant Scale

---

## 1. Why Not Self-Host OpenAlgo?

OpenAlgo is designed as **1 user = 1 instance**. For 1000 concurrent users, that means 1000 separate OpenAlgo processes — the compute cost is unsustainable. Instead, we build a **multi-tenant broker adapter layer** inside EquityPro, inspired by OpenAlgo's unified API design but supporting many users on a single server.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        EQUITYPRO SERVER                              │
│                                                                      │
│  ┌─────────────────────┐    ┌──────────────────────────────────────┐ │
│  │  Node.js (Port 3000)│    │  Python/FastAPI (Port 8100)          │ │
│  │                     │    │                                      │ │
│  │  • Auth (JWT/OAuth) │    │  ┌─────────────────────────────────┐ │ │
│  │  • Broker Routes    │    │  │  Broker Session Manager         │ │ │
│  │  • Credential Store │    │  │                                 │ │ │
│  │  • OAuth Callbacks  │    │  │  user_123 ──→ FyersAdapter     │ │ │
│  │  • WebSocket Proxy  │    │  │  user_456 ──→ ZerodhaAdapter   │ │ │
│  │                     │    │  │  user_789 ──→ AngelOneAdapter  │ │ │
│  └──────────┬──────────┘    │  │  user_xxx ──→ UpstoxAdapter    │ │ │
│             │               │  │                                 │ │ │
│             │ JWT verify    │  │  Shared symbol dedup:           │ │ │
│             │ + proxy       │  │  (fyers, RELIANCE) → 3 users   │ │ │
│             │               │  │  (zerodha, NIFTY) → 5 users    │ │ │
│             ▼               │  └──────────────┬──────────────────┘ │ │
│  ┌──────────────────────┐   │                 │                    │ │
│  │  WebSocket Endpoint  │   │                 ▼                    │ │
│  │  /ws/depth/{symbol}  │◄──┤─── Redis Pub/Sub ◄──────────────────┘ │
│  │  (per-user routing)  │   │    depth:{symbol}                     │
│  └──────────────────────┘   │                                      │ │
│                              │  ┌──────────────────────────────────┐ │
│  Anonymous users ────────────┤  │  Global Fallback Ingester       │ │
│  (no broker connected)       │  │  (existing depth_ingester.py)   │ │
│                              │  │  Single admin-managed Fyers     │ │
│                              │  │  token for shared data          │ │
│                              │  └──────────────────────────────────┘ │
│                              │                                      │
│                              └──────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL (External: 13.205.4.69)                             │ │
│  │  • users table (auth)                                          │ │
│  │  • broker_connections table (encrypted credentials + tokens)   │ │
│  │  • ohlc_daily, ohlc_1hour, ltp_live (market data)            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Redis (localhost:6379)                                         │ │
│  │  • depth:{symbol} pub/sub channels                            │ │
│  │  • cache:depth:{symbol} snapshots                             │ │
│  │  • broker:instruments:{broker} symbol caches                  │ │
│  │  • All existing caches (indicators, screener, etc.)           │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Supported Brokers — Auth & Data Matrix

| Feature | Fyers | Zerodha | Angel One | Upstox |
|---------|-------|---------|-----------|--------|
| **Auth Method** | OAuth2 (web redirect) | OAuth2 (request token) | Client ID + Password + TOTP | OAuth2 (web redirect) |
| **Can Auto-Refresh Token?** | No (daily user login) | No (daily user login) | **Yes** (PyOTP with stored TOTP secret) | No (daily user login) |
| **Token Expiry** | Daily ~3 AM IST | Daily ~6 AM IST | Per-session | Daily |
| **WebSocket Library** | `fyers_apiv3` FyersTbtSocket | `kiteconnect` KiteTicker | `smartapi-python` SmartWebSocket | Upstox V3 Stream (Protobuf) |
| **Depth Levels** | **50** | 20 | 20 | 5 |
| **Max Symbols/Connection** | 5 (3 conns = 15 total) | 3000 instruments | TBD | TBD |
| **Real-Time Depth** | Yes | Yes | Yes | Yes |
| **Options Chain** | Via NSE scraper (existing) | Kite API | SmartAPI | Upstox API |
| **Python Package** | `fyers-apiv3>=3.1.11` | `kiteconnect` | `smartapi-python` + `pyotp` | `upstox-python-sdk` + `protobuf` |

### What's Possible vs Not

| Capability | Status |
|-----------|--------|
| Automated daily token refresh | **Only Angel One** (TOTP automatable via PyOTP) |
| OAuth brokers daily re-auth | Requires 2-click user action (button → broker login → callback) |
| SMS OTP brokers | Not supported — none of the 4 major brokers require it |
| Sharing data across users | Same symbol on same broker = shared subscription (1 WS, N users) |
| Cross-broker symbol mapping | Possible — each broker has downloadable instrument master |
| Order placement | **Out of scope** — data feeds only in v1 |

---

## 4. User Flow: Connecting a Broker

### OAuth Brokers (Fyers, Zerodha, Upstox)

```
User clicks "Connect Fyers" on Broker Settings page
  → Frontend: GET /api/broker/oauth/fyers/redirect
  → Backend generates OAuth URL with app credentials + redirect_uri
  → Frontend redirects user to Fyers login page
  → User logs in on Fyers (their own account)
  → Fyers redirects to /broker/callback/fyers?auth_code=XXX
  → Frontend sends auth_code to POST /api/broker/connections/fyers/callback
  → Backend exchanges auth_code for access_token via Fyers API
  → Backend encrypts token (AES-256-GCM) and stores in broker_connections table
  → Status: "Connected" with expiry timestamp
  → User opens Order Book → depth data flows from their Fyers session
```

### TOTP Broker (Angel One)

```
User clicks "Connect Angel One" on Broker Settings page
  → Dialog opens with fields: Client ID, Password, TOTP Secret
  → User enters credentials from their Angel One account
  → Frontend: POST /api/broker/connections/angelone { clientId, password, totpSecret }
  → Backend encrypts ALL credentials and stores in broker_connections table
  → Backend immediately authenticates: SmartConnect.generateSession(clientId, password, PyOTP.now())
  → Stores session token (encrypted) with expiry
  → Status: "Connected"
  → Token refresh cron auto-regenerates session using stored TOTP secret
  → User NEVER needs to re-authenticate (fully automated)
```

### Daily Re-Authentication (OAuth Brokers)

```
Token expired (detected by frontend polling /api/broker/connections)
  → Frontend shows banner: "Your Fyers connection expired. [Reconnect →]"
  → User clicks Reconnect → same OAuth flow as initial connect
  → 2 clicks total (Reconnect button → broker login page → auto-callback)
```

---

## 5. Database Schema

### New Table: `broker_connections`

```sql
CREATE TABLE broker_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    broker_name VARCHAR(20) NOT NULL,
    -- CHECK: ('fyers', 'zerodha', 'angelone', 'upstox')

    -- Encrypted JSON: { api_key, api_secret, totp_secret, client_id, password, ... }
    -- Varies per broker. Encrypted with AES-256-GCM.
    credentials_encrypted TEXT NOT NULL,

    -- Current active session token (encrypted). Refreshed daily.
    session_token_encrypted TEXT,
    token_expiry TIMESTAMPTZ,

    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    last_auth_at TIMESTAMPTZ,
    last_auth_error TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, broker_name)
);
```

### Credentials Stored Per Broker (Encrypted)

| Broker | Stored Fields |
|--------|--------------|
| Fyers | `{ app_id, access_token }` (token refreshed via OAuth) |
| Zerodha | `{ api_key, api_secret, access_token }` (token refreshed via OAuth) |
| Angel One | `{ client_id, password, totp_secret, api_key }` (auto-refresh via TOTP) |
| Upstox | `{ api_key, api_secret, access_token }` (token refreshed via OAuth) |

---

## 6. Broker Adapter Interface (Python)

```python
# services/brokers/base.py

class BrokerAdapter(ABC):
    broker_name: str
    max_symbols_per_connection: int
    depth_levels: int  # 50, 20, or 5

    @abstractmethod
    async def authenticate(self, credentials: Dict) -> Dict:
        """Exchange stored credentials for session token.
        Returns: { session_token, expiry_iso }"""

    @abstractmethod
    async def connect_depth(self, session_token: str,
                            on_depth: Callable[[UnifiedDepthData], Awaitable]) -> None:
        """Open WebSocket and stream depth. Calls on_depth for each update."""

    @abstractmethod
    async def subscribe(self, symbols: List[str]) -> None

    @abstractmethod
    async def unsubscribe(self, symbols: List[str]) -> None

    @abstractmethod
    async def disconnect(self) -> None

    @abstractmethod
    def normalize_symbol(self, internal_symbol: str) -> str:
        """Convert NSE:RELIANCE-EQ to broker-specific format."""
```

### UnifiedDepthData (Normalized Across All Brokers)

```python
@dataclass
class UnifiedDepthData:
    symbol: str             # Internal: NSE:RELIANCE-EQ
    timestamp_ns: int
    bid_prices: List[float] # Padded to 50 levels (zeros if broker has fewer)
    ask_prices: List[float]
    bid_qty: List[int]
    ask_qty: List[int]
    bid_orders: List[int]
    ask_orders: List[int]
    total_buy_qty: int
    total_sell_qty: int
    depth_levels: int       # Actual: 50 (Fyers), 20 (Zerodha/Angel), 5 (Upstox)
```

---

## 7. Shared Broker Pool Manager (Multi-Tenant)

The key optimization: **one broker connection serves ALL users on that broker**, because market data is exchange-level (not personalized).

```python
# services/broker_pool_manager.py

class SharedBrokerPool:
    """
    ONE pool per broker. ONE WebSocket connection per broker.
    All users on that broker share the connection.

    Pool Leader = the user whose token is currently being used.
    Auto-rotates if leader's token expires.
    """
    broker_name: str
    adapter: BrokerAdapter                    # Single connection
    pool_leader_id: str                       # User whose token powers the connection
    pool_leader_expiry: datetime              # When to rotate
    subscribed_symbols: Set[str]              # Currently subscribed
    symbol_watchers: Dict[str, Set[str]]      # symbol → {user_ids watching}
    available_tokens: Dict[str, str]          # user_id → encrypted_session_token

class BrokerPoolManager:
    """
    Manages one SharedBrokerPool per broker.
    Routes user requests to the appropriate pool.
    """
    pools: Dict[str, SharedBrokerPool]  # broker_name → pool

    async def user_subscribe(user_id, broker_name, symbol) → bool:
        """
        1. Get or create SharedBrokerPool for this broker
        2. If pool has no active connection: elect this user as pool leader
        3. Add user to symbol_watchers[symbol]
        4. If symbol not yet subscribed: adapter.subscribe([symbol])
        5. Data flows: adapter → Redis pub/sub → ALL watchers
        """

    async def user_unsubscribe(user_id, symbol) → None:
        """
        1. Remove user from watchers set
        2. If no watchers left for symbol: adapter.unsubscribe([symbol])
        """

    async def rotate_leader(broker_name) → bool:
        """
        Called when pool leader's token expires.
        1. Find another user on same broker with valid token
        2. Reconnect adapter with new token
        3. Re-subscribe all active symbols
        4. If no valid tokens: mark pool as expired, notify all users
        """
```

### Why This Scales to 1000 Users

```
300 Fyers users watching NIFTY, BANKNIFTY, RELIANCE
  → 1 Fyers SharedBrokerPool
  → 1 WebSocket connection (pool leader's token)
  → 3 symbol subscriptions
  → Data → Redis → 300 browser WebSocket clients
  → RAM: 5 MB (connection) + 300 × 50 KB (clients) = 20 MB total

350 Zerodha users watching NIFTY, BANKNIFTY, HDFCBANK, INFY
  → 1 Zerodha SharedBrokerPool
  → 1 WebSocket connection
  → 4 symbol subscriptions
  → Data → Redis → 350 browser clients
  → RAM: 5 MB + 350 × 50 KB = 22 MB total

TOTAL for 1000 users: ~60-80 MB (server has 38 GB)
```

### Pool Leader Rotation

```
User_042 (Fyers, leader) token expires at 3:00 AM
  → Cron detects expiry approaching at 1:00 AM
  → Queries broker_connections: 299 other Fyers users with valid tokens
  → Selects User_187 (latest expiry) as new leader
  → Disconnects old adapter, reconnects with User_187's token
  → Re-subscribes all active symbols
  → Zero downtime for other users (brief ~2s reconnection gap)
  → If User_187's token ALSO expired: try User_305, etc.
  → With 300 users, statistically impossible for ALL tokens to expire simultaneously
```

### Connection Lifecycle

```
User opens Order Book for RELIANCE (user has Fyers connected)
  → BrokerPoolManager.user_subscribe("user_123", "fyers", "NSE:RELIANCE-EQ")
  → Pool exists? YES → add user_123 to symbol_watchers["NSE:RELIANCE-EQ"]
  → Symbol already subscribed? YES → no broker action needed
  → User just starts receiving from Redis pub/sub channel depth:NSE:RELIANCE-EQ

User opens Order Book for WIPRO (new symbol, not yet subscribed)
  → BrokerPoolManager.user_subscribe("user_123", "fyers", "NSE:WIPRO-EQ")
  → Symbol not yet subscribed → adapter.subscribe(["NSE:WIPRO-EQ"])
  → Now pool streams RELIANCE + WIPRO

User closes Order Book
  → BrokerPoolManager.user_unsubscribe("user_123", "NSE:RELIANCE-EQ")
  → Remove from watchers. 299 others still watching → no broker action
  → If WIPRO has 0 watchers → adapter.unsubscribe after 15 min idle
```

---

## 8. Security Design

### Credential Encryption
- **Algorithm:** AES-256-GCM (same as existing API key encryption in `server/lib/key-encryption.ts`)
- **Format:** `iv:authTag:ciphertext` (hex encoded)
- **Key:** `BROKER_ENCRYPTION_KEY` env var (falls back to `JWT_SECRET`)
- **Both Node.js AND Python** need to encrypt/decrypt (matched implementation)

### What's Never Exposed
- Raw broker credentials → never sent to frontend, never logged
- Session tokens → stay server-side only
- TOTP secrets → encrypted at rest, only decrypted for authentication
- The frontend only sees: broker name, status, expiry timestamp

### Rate Limiting
- Broker OAuth callback: 5 requests/minute per user
- Broker credential submission: 3 requests/minute per user
- Prevent brute-force credential testing

---

## 9. Existing Auth System (Already Built)

The authentication system is **90% complete**. Key components:

| Component | Status | File |
|-----------|--------|------|
| JWT (access + refresh tokens) | Complete | `server/auth/jwt.ts` |
| Login/Signup/Logout endpoints | Complete | `server/routes-auth-v2.ts` |
| Google OAuth | Complete | `server/routes-oauth-google.ts` |
| Session management + revocation | Complete | `server/auth/store-v2.ts` |
| Auth middleware (requireAuth, requireAdmin, requireTier) | Complete | `server/middleware/auth.ts` |
| Account lockout (5 failed = 30min lock) | Complete | `server/routes-auth-v2.ts` |
| Password reset via OTP | Complete | `server/routes-auth-v2.ts` |
| Login/Signup pages (React) | Complete | `client/src/pages/TiphubLogin.tsx` etc. |
| AuthContext (React state) | Complete | `client/src/contexts/AuthContext.tsx` |
| AccessGuard (tier-based) | Complete | `client/src/components/AccessGuard.tsx` |
| Role hierarchy (user → mod → admin → super_admin) | Complete | `server/middleware/admin.ts` |
| Audit logging | Complete | DB: `auth_logs` table |

**What needs activation:**
- Wire JWT into WebSocket proxy (Phase 1)
- Frontend sends token with WebSocket connections (Phase 1)
- Nothing else — auth is ready to use

---

## 10. Implementation Phases

| Phase | Scope | Estimate |
|-------|-------|----------|
| **1. Activate Auth on WebSocket** | JWT in WS proxy, user identity plumbing | 1-2 days |
| **2. Broker Connections DB + UI** | Migration, encryption, CRUD API, settings page, OAuth flow | 3-4 days |
| **3. Broker Adapters** | Fyers (extract from existing), Zerodha, Angel One, Upstox | 5-6 days |
| **4. Multi-Tenant Depth Routing** | Session manager, per-user routing, credential decrypt in Python | 4-5 days |
| **5. Polish** | Token refresh cron, LRU eviction, idle cleanup, admin health | 2-3 days |
| **Total** | | **~15-20 days** |

---

## 11. File Map (What Gets Created/Modified)

### New Files (18)

```
migrations/024_broker_connections.sql          # DB schema
server/lib/broker-encryption.ts                # AES-256-GCM for credentials
server/db/broker-store.ts                      # CRUD operations
server/routes-broker.ts                        # API endpoints
server/cron/broker-token-refresh.ts            # Daily token refresh

client/src/pages/BrokerSettings.tsx            # UI: broker connection cards
client/src/pages/BrokerCallback.tsx             # OAuth callback handler
client/src/hooks/use-broker-connections.ts      # React Query hooks

services/brokers/__init__.py                   # Package init
services/brokers/base.py                       # Abstract adapter + UnifiedDepthData
services/brokers/fyers_adapter.py              # Fyers TBT wrapper
services/brokers/zerodha_adapter.py            # Kite Connect wrapper
services/brokers/angelone_adapter.py           # SmartAPI + PyOTP wrapper
services/brokers/upstox_adapter.py             # Upstox V3 + Protobuf wrapper
services/brokers/symbol_map.py                 # Cross-broker symbol normalization
services/brokers/depth_normalizer.py           # Unified depth format
services/brokers/credential_decrypt.py         # Python-side AES decryption
services/broker_session_manager.py             # Multi-tenant orchestration
```

### Modified Files (7)

```
server/index.ts                                # JWT verify in WS upgrade
main.py                                        # Per-user routing in WS handler
client/src/hooks/useDepthWebSocket.ts          # Send JWT with WS
client/src/App.tsx                             # Broker callback route
client/src/components/layout/Sidebar.tsx       # "Broker Settings" nav item
.env                                           # Broker app credentials
pyproject.toml                                 # New Python dependencies
```

---

## 12. Can This Handle 1000 Concurrent Users?

### YES — Here's Why

**Critical Insight: Market depth data is exchange-level, NOT personalized.** NIFTY's 50-level order book is identical whether fetched from User A's Fyers token or User B's Fyers token. This means we DON'T need 1000 broker connections — we share aggressively.

### The Math (1000 Users, 80% Same Symbols)

**Assumptions:**
- 1000 users, broker distribution: 300 Fyers, 350 Zerodha, 200 Angel One, 150 Upstox
- 80% watching the same 15-20 popular symbols (NIFTY, BANKNIFTY, RELIANCE, HDFCBANK, etc.)
- 20% watching unique symbols (~50-100 additional unique symbols)

**Without Sharing (Naive — 1 connection per user):**

| Resource | Cost |
|----------|------|
| Broker WebSocket connections | 1,000 |
| RAM (2-5 MB per connection) | 2-5 GB |
| Broker rate limit violations | Frequent |
| Network bandwidth | Massive duplication |

**With Shared Broker Pool (Our Architecture):**

| Resource | Cost |
|----------|------|
| Fyers connections | **3-5** (15-25 symbols across 3 connections × 5 sym each) |
| Zerodha connections | **1-2** (supports 3000 instruments per connection) |
| Angel One connections | **2-3** |
| Upstox connections | **2-3** |
| **Total broker connections** | **~10-15** (not 1,000!) |
| RAM for broker connections | **50-75 MB** (not 2-5 GB) |
| Redis pub/sub channels | ~100-120 (one per unique symbol) |
| WebSocket clients (browser) | 1,000 × ~50 KB = **50 MB** |
| **Total RAM** | **~150 MB** (server has 38 GB) |

### How Sharing Works: Shared Broker Pool

Instead of per-user broker sessions, we use a **Shared Broker Pool** pattern:

```
Fyers Shared Pool (1 connection, pool leader's token)
  ├── Subscribed: [NIFTY, BANKNIFTY, RELIANCE, HDFCBANK, TCS, ...]
  ├── user_001 watches [NIFTY, RELIANCE]        ← gets data from shared pool
  ├── user_002 watches [NIFTY, BANKNIFTY]       ← same pool, same connection
  ├── user_003 watches [RELIANCE, BANKNIFTY]    ← same pool
  └── ... 297 more users                         ← all piggyback on Redis pub/sub

Zerodha Shared Pool (1 connection, pool leader's token)
  ├── Subscribed: [NIFTY, BANKNIFTY, RELIANCE, INFY, WIPRO, ...]
  ├── user_301 watches [NIFTY]
  └── ... 349 more users

(Same for Angel One + Upstox)
```

**Pool Leader Selection:**
1. First authenticated user on a broker becomes the pool leader
2. Their token is used for the shared WebSocket connection
3. If their token expires: automatically rotate to next user with valid token
4. With 300 Fyers users, there are always many valid tokens → near-zero downtime

**Data Flow:**
```
Pool Leader's Token → Broker WebSocket → depth_ingester → Redis pub/sub
                                                             ↓
                                              ┌──── WebSocket Client (user_001)
                                              ├──── WebSocket Client (user_002)
                                              ├──── WebSocket Client (user_003)
                                              └──── ... (1000 clients)
```

### Options Visualizer at Scale

Options chain data is also exchange-level (NSE publishes one chain for everyone):

| Data Source | Symbols | Update Frequency | Sharing |
|-------------|---------|-----------------|---------|
| NSE scraper (existing) | NIFTY, BANKNIFTY | Every 5 seconds | Shared (1 scraper → Redis cache → all users) |
| Broker options API | Individual stocks (RELIANCE, etc.) | On-demand | Shared per broker (1 API call → Redis cache → all users) |

With 80% overlap: if 800 users request RELIANCE options chain, we make **1 API call** (using pool leader's token), cache in Redis for 55 seconds, serve to all 800 from cache. Zero per-user overhead.

### Actual Bottleneck Analysis

| Component | Limit | 1000 Users Status |
|-----------|-------|-------------------|
| Broker WebSocket connections | ~10-15 total | **No issue** |
| Redis pub/sub throughput | ~100K msg/s | **No issue** (depth updates ~100/s) |
| WebSocket clients (browser) | CPU-bound serialization | **Manageable** on 4 vCPU |
| RAM | 38 GB available | **150 MB used** — 0.4% |
| PostgreSQL (external) | Network latency | **No issue** (cached in Redis) |
| **CPU (4 vCPU)** | **THE bottleneck** | **OK at 1000, tight at 2000+** |

### Scaling Beyond 1000

| Users | Server Spec | Architecture Change Needed |
|-------|-------------|--------------------------|
| 500 | 4 vCPU / 8 GB | None — works as-is |
| 1,000 | 4 vCPU / 38 GB | Shared Broker Pool (this document) |
| 2,000 | 8 vCPU / 38 GB | Same architecture, just more CPU |
| 5,000 | 16 vCPU / 64 GB | Add second Node.js process (PM2 cluster mode) |
| 10,000+ | Load balancer + 2-3 servers | Horizontal scaling, shared Redis/PostgreSQL |

### Summary

The architecture handles 1000 users because:
1. **80% symbol overlap** → ~10-15 broker connections (not 1000)
2. **Redis pub/sub** fans out to unlimited WebSocket clients
3. **Shared Broker Pool** with automatic leader rotation — no single point of failure
4. **38 GB RAM** is overkill — only ~150 MB needed for 1000 users
5. **Options data cached** in Redis — 1 API call serves hundreds of users
6. **4 vCPU is the only bottleneck** — upgrade to 8 vCPU for comfortable 2000 user headroom
