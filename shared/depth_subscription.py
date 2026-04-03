"""
Shared constants and message types for depth subscription management.

This module provides the communication protocol between:
- WebSocket server (main.py) - sends viewer_join/viewer_leave commands
- DepthIngester (depth_ingester.py) - manages Fyers subscriptions

Architecture:
    Client → WebSocket → Redis command → DepthIngester → Fyers TBT
               ↓              ↓                ↓
         viewer_join    request_id       subscribe
               ↑              ↓                ↓
         subscribed ← Redis response ← ack/nack
"""

import os
import re
import json
import uuid
from dataclasses import dataclass, field
from typing import Literal, Optional


# =============================================================================
# Redis Keys
# =============================================================================

# Command channel: WebSocket → DepthIngester
DEPTH_CONTROL_CHANNEL = "depth:control"

# Response channel prefix: DepthIngester → WebSocket (per-request)
DEPTH_RESPONSE_PREFIX = "depth:response:"

# Viewer tracking: symbol → viewer_count
DEPTH_VIEWERS_HASH = "depth:viewers"

# Currently subscribed symbols (for status checks)
DEPTH_SUBSCRIBED_SET = "depth:subscribed"

# Metrics counters
DEPTH_METRICS_HASH = "depth:metrics"


# =============================================================================
# Configuration (from environment)
# =============================================================================

# Max non-core (dynamic) symbol slots
# Fyers limit: 3 connections × 5 symbols = 15 total
# Core symbols: 5 (NIFTY, BANKNIFTY, RELIANCE, AQYLON, RAMASTEEL)
# Dynamic slots: 15 - 5 = 10
MAX_DYNAMIC_SLOTS = int(os.getenv("DEPTH_MAX_DYNAMIC_SLOTS", "10"))

# TTL in seconds after last viewer disconnects before unsubscribing
TTL_SECONDS = int(os.getenv("DEPTH_TTL_SECONDS", "900"))  # 15 minutes

# Timeout for subscription acknowledgment (milliseconds)
ACK_TIMEOUT_MS = int(os.getenv("DEPTH_ACK_TIMEOUT_MS", "5000"))  # 5 seconds


# =============================================================================
# Symbol Validation
# =============================================================================

# Valid symbol format: EXCHANGE:SYMBOL-SUFFIX
# Examples: NSE:RELIANCE-EQ, BSE:TCS-EQ, NSE:NIFTY25FEBFUT, NSE:SABTNL-BE
SYMBOL_PATTERN = re.compile(
    r'^(NSE|BSE):'           # Exchange prefix
    r'[A-Z0-9&]+'            # Symbol name (letters, numbers, &)
    r'(-EQ|-BE|-BZ|-X|FUT)?$' # Optional suffix
)


def validate_symbol(symbol: str) -> bool:
    """
    Validate symbol format.

    Valid formats:
        - NSE:RELIANCE-EQ (equity)
        - BSE:TCS-EQ (equity)
        - NSE:SABTNL-BE (trade-to-trade)
        - BSE:TELOGICA-X (SME)
        - NSE:NIFTY25FEBFUT (futures - no suffix)

    Returns:
        True if symbol format is valid, False otherwise.
    """
    if not symbol or not isinstance(symbol, str):
        return False
    return bool(SYMBOL_PATTERN.match(symbol.upper()))


# =============================================================================
# Message Types
# =============================================================================

@dataclass
class SubscriptionCommand:
    """
    Command sent from WebSocket server to DepthIngester.

    Actions:
        - viewer_join: Client connected to watch a symbol
        - viewer_leave: Client disconnected from a symbol

    The request_id is used to correlate with the SubscriptionResponse.
    """
    action: Literal["viewer_join", "viewer_leave"]
    symbol: str
    timestamp: float
    request_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps({
            "action": self.action,
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "request_id": self.request_id,
        })

    @classmethod
    def from_json(cls, data: str) -> "SubscriptionCommand":
        """Deserialize from JSON string."""
        d = json.loads(data)
        return cls(
            action=d["action"],
            symbol=d["symbol"],
            timestamp=d["timestamp"],
            request_id=d.get("request_id", str(uuid.uuid4())[:8]),
        )


@dataclass
class SubscriptionResponse:
    """
    Response sent from DepthIngester to WebSocket server.

    Message values:
        - "subscribed": Successfully subscribed to symbol
        - "already_subscribed": Symbol was already subscribed (success=True)
        - "unavailable": All dynamic slots are occupied (success=False)
        - "invalid_symbol": Symbol format is invalid (success=False)
    """
    request_id: str
    symbol: str
    success: bool
    message: str

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps({
            "request_id": self.request_id,
            "symbol": self.symbol,
            "success": self.success,
            "message": self.message,
        })

    @classmethod
    def from_json(cls, data: str) -> "SubscriptionResponse":
        """Deserialize from JSON string."""
        d = json.loads(data)
        return cls(
            request_id=d["request_id"],
            symbol=d["symbol"],
            success=d["success"],
            message=d["message"],
        )


# =============================================================================
# Metric Names
# =============================================================================

METRIC_EVICTIONS = "evictions"
METRIC_TTL_EXPIRATIONS = "ttl_expirations"
METRIC_SUBSCRIPTION_FAILURES = "subscription_failures"
METRIC_SUBSCRIPTIONS_TOTAL = "subscriptions_total"
