"""
Depth Data Serialization Utilities

Provides msgpack serialization/deserialization for 50-level order book depth data.
Data format matches the market_depth table schema (308 columns).

Msgpack is ~30-50% smaller than JSON, resulting in ~1.2KB per depth update.
"""

import msgpack
from typing import Dict, List, Any, Optional
from datetime import datetime
import pytz

# IST timezone for consistent timestamps
IST = pytz.timezone('Asia/Kolkata')


def pack_depth_data(
    symbol: str,
    timestamp_ns: int,
    tick_ts: int,
    snapshot: bool,
    bid_prices: List[float],
    ask_prices: List[float],
    bid_qty: List[int],
    ask_qty: List[int],
    total_buy_qty: int,
    total_sell_qty: int,
    bid_orders: Optional[List[int]] = None,
    ask_orders: Optional[List[int]] = None,
) -> bytes:
    """
    Pack depth data to msgpack bytes.

    Args:
        symbol: Fyers format symbol (e.g., 'NSE:RELIANCE-EQ')
        timestamp_ns: Timestamp in nanoseconds
        tick_ts: Exchange tick timestamp
        snapshot: True if full snapshot, False if incremental
        bid_prices: List of 50 bid prices (best to worst)
        ask_prices: List of 50 ask prices (best to worst)
        bid_qty: List of 50 bid quantities
        ask_qty: List of 50 ask quantities
        total_buy_qty: Total buy quantity across all levels
        total_sell_qty: Total sell quantity across all levels
        bid_orders: Optional list of 50 bid order counts
        ask_orders: Optional list of 50 ask order counts

    Returns:
        Msgpack serialized bytes (~1.2KB)
    """
    data = {
        's': symbol,
        't': timestamp_ns,
        'tick_ts': tick_ts,
        'snap': snapshot,
        'b': bid_prices,
        'a': ask_prices,
        'bq': bid_qty,
        'aq': ask_qty,
        'tbq': total_buy_qty,
        'tsq': total_sell_qty,
    }

    if bid_orders is not None:
        data['bo'] = bid_orders
    if ask_orders is not None:
        data['ao'] = ask_orders

    return msgpack.packb(data)


def unpack_depth_data(data: bytes) -> Dict[str, Any]:
    """
    Unpack msgpack bytes to depth data dict.

    Args:
        data: Msgpack serialized bytes

    Returns:
        Depth data dictionary with keys:
            's': symbol
            't': timestamp (nanoseconds)
            'tick_ts': exchange tick timestamp
            'snap': snapshot flag
            'b': bid prices (50 levels)
            'a': ask prices (50 levels)
            'bq': bid quantities (50 levels)
            'aq': ask quantities (50 levels)
            'bo': bid orders (50 levels, optional)
            'ao': ask orders (50 levels, optional)
            'tbq': total buy quantity
            'tsq': total sell quantity
    """
    return msgpack.unpackb(data, raw=False)


def pack_history_message(symbol: str, entries: List[Dict[str, Any]]) -> bytes:
    """
    Pack history batch message for WebSocket transmission.

    Args:
        symbol: Fyers format symbol
        entries: List of depth data dictionaries

    Returns:
        Msgpack serialized bytes
    """
    return msgpack.packb({
        'type': 'history',
        'symbol': symbol,
        'data': entries
    })


def pack_update_message(depth_data: Dict[str, Any]) -> bytes:
    """
    Pack real-time update message for WebSocket transmission.

    Args:
        depth_data: Depth data dictionary

    Returns:
        Msgpack serialized bytes
    """
    return msgpack.packb({
        'type': 'update',
        **depth_data
    })


def pack_error_message(message: str) -> bytes:
    """
    Pack error message for WebSocket transmission.

    Args:
        message: Error message string

    Returns:
        Msgpack serialized bytes
    """
    return msgpack.packb({
        'type': 'error',
        'message': message
    })


def pack_heartbeat_message() -> bytes:
    """
    Pack heartbeat message for WebSocket keep-alive.

    Returns:
        Msgpack serialized bytes
    """
    return msgpack.packb({
        'type': 'heartbeat',
        'ts': int(datetime.utcnow().timestamp() * 1000)
    })


def pack_subscribed_message(symbol: str) -> bytes:
    """
    Pack subscription confirmation message.

    Args:
        symbol: The symbol that was subscribed

    Returns:
        Msgpack serialized bytes
    """
    return msgpack.packb({
        'type': 'subscribed',
        'symbol': symbol,
        'message': f'Subscribed to {symbol}'
    })


def pack_unavailable_message(symbol: str) -> bytes:
    """
    Pack unavailable message when subscription cannot be fulfilled.

    Args:
        symbol: The symbol that could not be subscribed

    Returns:
        Msgpack serialized bytes
    """
    return msgpack.packb({
        'type': 'unavailable',
        'symbol': symbol,
        'message': 'All subscription slots are in use. Please try again later.'
    })


def pack_pending_message(symbol: str) -> bytes:
    """
    Pack pending message while waiting for subscription.

    Args:
        symbol: The symbol being subscribed

    Returns:
        Msgpack serialized bytes
    """
    return msgpack.packb({
        'type': 'pending',
        'symbol': symbol,
        'message': f'Subscribing to {symbol}...'
    })


def transform_fyers_depth(message) -> Dict[str, Any]:
    """
    Transform Fyers TBT depth message to internal format.

    Args:
        message: Fyers depth update message object with attributes:
            - timestamp: Exchange timestamp
            - snapshot: True if full snapshot
            - tbq: Total buy quantity
            - tsq: Total sell quantity
            - bidprice: List of 50 bid prices
            - askprice: List of 50 ask prices
            - bidqty: List of 50 bid quantities
            - askqty: List of 50 ask quantities
            - bidordn: List of 50 bid order counts
            - askordn: List of 50 ask order counts

    Returns:
        Internal depth data dictionary
    """
    return {
        's': getattr(message, 'symbol', ''),
        't': int(datetime.now(IST).timestamp() * 1e9),  # Current time in nanoseconds (IST)
        'tick_ts': getattr(message, 'timestamp', 0),
        'snap': getattr(message, 'snapshot', False),
        'b': list(getattr(message, 'bidprice', [0.0] * 50)),
        'a': list(getattr(message, 'askprice', [0.0] * 50)),
        'bq': list(getattr(message, 'bidqty', [0] * 50)),
        'aq': list(getattr(message, 'askqty', [0] * 50)),
        'bo': list(getattr(message, 'bidordn', [0] * 50)),
        'ao': list(getattr(message, 'askordn', [0] * 50)),
        'tbq': getattr(message, 'tbq', 0),
        'tsq': getattr(message, 'tsq', 0),
    }


# =============================================================================
# DATABASE CONVERSION UTILITIES (COMMENTED OUT - Enable when DB ready)
# =============================================================================

# def depth_to_db_row(depth_data: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Convert internal depth data format to market_depth table row (308 columns).
#
#     Args:
#         depth_data: Internal depth data dictionary
#
#     Returns:
#         Dictionary matching market_depth table schema
#     """
#     row = {
#         'symbol': depth_data['s'],
#         'timestamp': datetime.fromtimestamp(depth_data['t'] / 1e9),
#         'tick_ts': depth_data.get('tick_ts'),
#         'snapshot': depth_data.get('snap', False),
#         'tbq': depth_data.get('tbq'),
#         'tsq': depth_data.get('tsq'),
#     }
#
#     # Add 50 levels of bid prices
#     for i, price in enumerate(depth_data.get('b', []), 1):
#         row[f'bidprice{i}'] = price
#
#     # Add 50 levels of ask prices
#     for i, price in enumerate(depth_data.get('a', []), 1):
#         row[f'askprice{i}'] = price
#
#     # Add 50 levels of bid quantities
#     for i, qty in enumerate(depth_data.get('bq', []), 1):
#         row[f'bidqty{i}'] = qty
#
#     # Add 50 levels of ask quantities
#     for i, qty in enumerate(depth_data.get('aq', []), 1):
#         row[f'askqty{i}'] = qty
#
#     # Add 50 levels of bid orders
#     for i, orders in enumerate(depth_data.get('bo', []), 1):
#         row[f'bidorders{i}'] = orders
#
#     # Add 50 levels of ask orders
#     for i, orders in enumerate(depth_data.get('ao', []), 1):
#         row[f'askorders{i}'] = orders
#
#     return row


# def db_row_to_depth(row: Dict[str, Any]) -> Dict[str, Any]:
#     """
#     Convert market_depth table row to internal depth data format.
#
#     Args:
#         row: Database row dictionary
#
#     Returns:
#         Internal depth data dictionary
#     """
#     return {
#         's': row['symbol'],
#         't': int(row['timestamp'].timestamp() * 1e9),
#         'tick_ts': row.get('tick_ts'),
#         'snap': row.get('snapshot', False),
#         'b': [row.get(f'bidprice{i}', 0.0) for i in range(1, 51)],
#         'a': [row.get(f'askprice{i}', 0.0) for i in range(1, 51)],
#         'bq': [row.get(f'bidqty{i}', 0) for i in range(1, 51)],
#         'aq': [row.get(f'askqty{i}', 0) for i in range(1, 51)],
#         'bo': [row.get(f'bidorders{i}', 0) for i in range(1, 51)],
#         'ao': [row.get(f'askorders{i}', 0) for i in range(1, 51)],
#         'tbq': row.get('tbq', 0),
#         'tsq': row.get('tsq', 0),
#     }
