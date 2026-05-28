"""
CSV Depth Replay Service
=========================

Replays historical depth data from CSV files to Redis for testing
the Order Book Heatmap without live Fyers connection.

Usage:
    uv run python services/csv_depth_replay.py --csv path/to/depth.csv --speed 1.0

Options:
    --csv       Path to CSV file with depth data
    --speed     Playback speed multiplier (1.0 = real-time, 10.0 = 10x faster)
    --loop      Loop the CSV file continuously
    --symbol    Override symbol name (default: from CSV)
"""

import argparse
import asyncio
import csv
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Add project root for imports
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import msgpack
import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / ('.env.production' if os.getenv('NODE_ENV') == 'production' else '.env.development'))

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DEPTH_CHANNEL_PREFIX = os.getenv("DEPTH_REDIS_CHANNEL_PREFIX", "depth")


def parse_csv_row(row: dict) -> dict:
    """Parse a CSV row into depth data format."""
    symbol = row.get("symbol", "NSE:UNKNOWN-EQ")
    timestamp_str = row.get("timestamp", "")

    # Parse timestamp
    try:
        dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
        timestamp_ns = int(dt.timestamp() * 1_000_000_000)
    except ValueError:
        timestamp_ns = int(time.time() * 1_000_000_000)

    # Extract 50 levels of bid/ask data
    bid_prices = []
    ask_prices = []
    bid_qtys = []
    ask_qtys = []
    bid_orders = []
    ask_orders = []

    for i in range(1, 51):
        bid_prices.append(float(row.get(f"bidprice{i}", 0) or 0))
        ask_prices.append(float(row.get(f"askprice{i}", 0) or 0))
        bid_qtys.append(int(float(row.get(f"bidqty{i}", 0) or 0)))
        ask_qtys.append(int(float(row.get(f"askqty{i}", 0) or 0)))
        bid_orders.append(int(float(row.get(f"bidorders{i}", 0) or 0)))
        ask_orders.append(int(float(row.get(f"askorders{i}", 0) or 0)))

    # Calculate totals
    total_bid_qty = sum(bid_qtys)
    total_ask_qty = sum(ask_qtys)

    return {
        "type": "update",
        "s": symbol,
        "t": timestamp_ns,
        "tick_ts": int(timestamp_ns / 1_000_000_000),
        "snap": False,
        "b": bid_prices,
        "a": ask_prices,
        "bq": bid_qtys,
        "aq": ask_qtys,
        "bo": bid_orders,
        "ao": ask_orders,
        "tbq": total_bid_qty,
        "tsq": total_ask_qty,
    }


async def replay_csv(
    csv_path: str,
    speed: float = 1.0,
    loop: bool = False,
    symbol_override: str = None
):
    """Replay CSV depth data to Redis."""
    print(f"[CSV Replay] Starting replay from: {csv_path}")
    print(f"[CSV Replay] Speed: {speed}x")
    print(f"[CSV Replay] Loop: {loop}")

    # Connect to Redis
    redis_client = await redis.from_url(REDIS_URL)
    print(f"[CSV Replay] Connected to Redis: {REDIS_URL}")

    try:
        while True:
            with open(csv_path, "r", newline="") as f:
                reader = csv.DictReader(f)

                prev_timestamp = None
                row_count = 0

                for row in reader:
                    # Parse the row
                    depth_data = parse_csv_row(row)

                    # Override symbol if specified
                    if symbol_override:
                        depth_data["s"] = symbol_override

                    symbol = depth_data["s"]

                    # Calculate delay based on timestamp difference
                    current_timestamp_str = row.get("timestamp", "")
                    try:
                        current_dt = datetime.strptime(current_timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
                        if prev_timestamp:
                            delay = (current_dt - prev_timestamp).total_seconds() / speed
                            if delay > 0 and delay < 10:  # Cap at 10 seconds
                                await asyncio.sleep(delay)
                        prev_timestamp = current_dt
                    except ValueError:
                        await asyncio.sleep(0.1 / speed)

                    # Serialize with msgpack
                    packed_data = msgpack.packb(depth_data)

                    # Publish to Redis
                    channel = f"{DEPTH_CHANNEL_PREFIX}:{symbol}"
                    await redis_client.publish(channel, packed_data)

                    # Also update cache
                    cache_key = f"cache:{DEPTH_CHANNEL_PREFIX}:{symbol}"
                    await redis_client.set(cache_key, packed_data, ex=86400)

                    row_count += 1

                    if row_count % 100 == 0:
                        print(f"[CSV Replay] Published {row_count} updates for {symbol}")

                print(f"[CSV Replay] Finished {row_count} rows")

            if not loop:
                break

            print("[CSV Replay] Looping...")
            await asyncio.sleep(1)

    except KeyboardInterrupt:
        print("\n[CSV Replay] Stopped by user")
    finally:
        await redis_client.close()
        print("[CSV Replay] Redis connection closed")


def main():
    parser = argparse.ArgumentParser(description="Replay CSV depth data to Redis")
    parser.add_argument("--csv", required=True, help="Path to CSV file")
    parser.add_argument("--speed", type=float, default=1.0, help="Playback speed (1.0 = realtime)")
    parser.add_argument("--loop", action="store_true", help="Loop continuously")
    parser.add_argument("--symbol", help="Override symbol name")

    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f"ERROR: CSV file not found: {args.csv}")
        sys.exit(1)

    asyncio.run(replay_csv(
        csv_path=args.csv,
        speed=args.speed,
        loop=args.loop,
        symbol_override=args.symbol
    ))


if __name__ == "__main__":
    main()
