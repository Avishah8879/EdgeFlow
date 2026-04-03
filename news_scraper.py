from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Dict, List, Tuple

import feedparser
import pytz

MAX_ARTICLES = 100
FEED_URL = "http://pulse.zerodha.com/feed.php"
IST = pytz.timezone("Asia/Kolkata")


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    cleaned = (
        value.replace("\xa0", " ")
        .replace("\ufffd", "")
        .replace("Â", "")
    )
    return " ".join(cleaned.split())


def _format_timestamp(entry: Any) -> str:
    published = getattr(entry, "published_parsed", None)
    if published:
        dt = datetime(*published[:6], tzinfo=pytz.UTC)
    else:
        dt = datetime.now(pytz.UTC)
    dt_ist = dt.astimezone(IST)
    return dt_ist.replace(tzinfo=None).isoformat()


def fetch_zerodha_pulse_articles(limit: int = MAX_ARTICLES) -> Tuple[List[Dict[str, Any]], datetime]:
    """Return structured Zerodha Pulse news articles."""
    feed = feedparser.parse(FEED_URL)
    fetched_at = datetime.now(IST).replace(tzinfo=None)

    if getattr(feed, "bozo", False):
        raise RuntimeError(f"Pulse feed unavailable: {feed.bozo_exception}")

    entries = sorted(
        getattr(feed, "entries", []),
        key=lambda x: getattr(x, "published_parsed", None) or (0,),
        reverse=True,
    )

    articles: List[Dict[str, Any]] = []

    for entry in entries[:limit]:
        title = _clean_text(getattr(entry, "title", ""))
        link = getattr(entry, "link", "")
        summary = _clean_text(getattr(entry, "summary", ""))

        if not title or not link:
            continue

        source_title = ""
        source = getattr(entry, "source", None)
        if isinstance(source, dict):
            source_title = source.get("title") or ""
        else:
            source_title = getattr(source, "title", "") or ""

        article_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        articles.append(
            {
                "id": f"pulse-{article_id}",
                "headline": title,
                "summary": summary or "No summary available",
                "source": _clean_text(source_title) or _clean_text(getattr(entry, "author", "")) or "Zerodha Pulse",
                "timestamp": _format_timestamp(entry),
                "url": link,
                "category": "general",
                "tickers": ["NSE"],
            }
        )

    return articles, fetched_at


if __name__ == "__main__":
    try:
        articles, fetched_at = fetch_zerodha_pulse_articles()
        print(f"Fetched {len(articles)} Pulse articles at {fetched_at.isoformat()} IST")
        for idx, article in enumerate(articles[:10], start=1):
            print(f"{idx}. {article['headline']} ({article['timestamp']})")
    except Exception as exc:
        print(f"Failed to fetch Zerodha Pulse news: {exc}")
