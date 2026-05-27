"""
Shared article discovery for stock sentiment analysis.

Used by both FastAPI and Celery so the sync and async sentiment paths do not
drift. The helper intentionally returns a structured empty result instead of
raising when no recent articles can be found.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Iterable

import feedparser

logger = logging.getLogger(__name__)

PULSE_FEED_URL = "https://pulse.zerodha.com/feed.php"
MAX_ARTICLES_PER_QUERY = 10
MAX_FALLBACK_ARTICLES = 12

for _proxy_key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
    _proxy_value = os.getenv(_proxy_key, "")
    if "127.0.0.1:9" in _proxy_value or "localhost:9" in _proxy_value:
        os.environ.pop(_proxy_key, None)
        logger.warning("[SentimentNews] Ignored dead local proxy setting from %s", _proxy_key)


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    cleaned = value.replace("\xa0", " ").replace("\ufffd", "").replace("Ã‚", "")
    return " ".join(cleaned.split())


def _dedupe_articles(articles: Iterable[dict]) -> list[dict]:
    seen: set[str] = set()
    deduped: list[dict] = []
    for article in articles:
        title = _clean_text(article.get("title"))
        link = article.get("link") or ""
        if not title:
            continue
        key = link or title
        digest = hashlib.md5(key.encode("utf-8")).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        deduped.append(
            {
                "title": title,
                "desc": _clean_text(article.get("desc")) or title,
                "date": article.get("date", ""),
                "link": link or "#",
                "source": article.get("source") or "News",
            }
        )
    return deduped


def build_news_aliases(ticker: str, company_name: str | None = None) -> list[str]:
    ticker_upper = ticker.upper().strip()
    aliases = [ticker_upper, f"{ticker_upper} NSE"]

    cleaned_company = _clean_text(company_name)
    if cleaned_company and cleaned_company.upper() != ticker_upper:
        aliases.append(cleaned_company)
        aliases.append(f"{cleaned_company} stock")

    # Avoid searches such as "AAPL NSE" for non-Indian symbols while keeping
    # the exact ticker query for global tickers.
    aliases = [a for a in aliases if a and not (ticker_upper.endswith(".NS") and a.endswith(" NSE"))]

    seen: set[str] = set()
    unique: list[str] = []
    for alias in aliases:
        key = alias.lower()
        if key not in seen:
            seen.add(key)
            unique.append(alias)
    return unique


def _fetch_google_news_package(query: str) -> list[dict]:
    try:
        from GoogleNews import GoogleNews
    except Exception as exc:
        logger.warning("[SentimentNews] GoogleNews package unavailable: %s", exc)
        return []

    articles: list[dict] = []
    try:
        googlenews = GoogleNews(lang="en", region="IN")
        googlenews.set_period("7d")
        googlenews.search(f"{query} stock news")
        for item in googlenews.result()[:MAX_ARTICLES_PER_QUERY]:
            articles.append(
                {
                    "title": item.get("title", ""),
                    "desc": item.get("desc") or item.get("title", ""),
                    "date": item.get("date", ""),
                    "link": item.get("link", "#"),
                    "source": "GoogleNews",
                }
            )
    except Exception as exc:
        logger.warning("[SentimentNews] GoogleNews package failed for %r: %s", query, exc)
    return articles


def _fetch_google_news_rss(query: str) -> list[dict]:
    encoded = urllib.parse.quote_plus(f"{query} stock news")
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 EdgeFlow/1.0"},
        )
        with urllib.request.urlopen(request, timeout=12) as response:
            content = response.read()
    except Exception as exc:
        logger.warning("[SentimentNews] Google News RSS failed for %r: %s", query, exc)
        return []

    feed = feedparser.parse(content)
    articles: list[dict] = []
    for entry in getattr(feed, "entries", [])[:MAX_ARTICLES_PER_QUERY]:
        date_value = getattr(entry, "published", "") or getattr(entry, "updated", "")
        try:
            parsed = parsedate_to_datetime(date_value)
            date_value = parsed.isoformat()
        except Exception:
            pass
        articles.append(
            {
                "title": _clean_text(getattr(entry, "title", "")),
                "desc": _clean_text(getattr(entry, "summary", "")) or _clean_text(getattr(entry, "title", "")),
                "date": date_value,
                "link": getattr(entry, "link", "#"),
                "source": "GoogleNews",
            }
        )
    return articles


def _fetch_pulse_articles(limit: int = 100) -> list[dict]:
    try:
        request = urllib.request.Request(
            PULSE_FEED_URL,
            headers={"User-Agent": "Mozilla/5.0 EdgeFlow/1.0"},
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            content = response.read()
    except Exception as exc:
        logger.warning("[SentimentNews] Zerodha Pulse fetch failed: %s", exc)
        return []

    feed = feedparser.parse(content)
    articles: list[dict] = []
    for entry in getattr(feed, "entries", [])[:limit]:
        title = _clean_text(getattr(entry, "title", ""))
        link = getattr(entry, "link", "")
        if not title or not link:
            continue
        source = getattr(entry, "source", None)
        source_title = source.get("title") if isinstance(source, dict) else getattr(source, "title", "")
        date_value = getattr(entry, "published", "") or getattr(entry, "updated", "")
        try:
            date_value = parsedate_to_datetime(date_value).isoformat()
        except Exception:
            pass
        articles.append(
            {
                "title": title,
                "desc": _clean_text(getattr(entry, "summary", "")) or title,
                "source": _clean_text(source_title) or _clean_text(getattr(entry, "author", "")) or "Zerodha Pulse",
                "date": date_value or datetime.utcnow().isoformat(),
                "link": link,
            }
        )
    return articles


def _alias_matches(article: dict, aliases: list[str]) -> bool:
    haystack = f"{article.get('title', '')} {article.get('desc', '')}".lower()
    ticker = aliases[0].lower() if aliases else ""

    for alias in aliases:
        alias_lower = alias.lower().strip()
        if not alias_lower:
            continue
        if len(alias_lower) <= 6:
            if re.search(rf"(?<![a-z0-9]){re.escape(alias_lower)}(?![a-z0-9])", haystack):
                return True
        elif alias_lower in haystack:
            return True

    # Company names can be long and inconsistent in headlines; match the first
    # two significant words as a practical fallback.
    company_aliases = [a for a in aliases[1:] if " " in a]
    for alias in company_aliases:
        words = [w for w in re.split(r"\W+", alias.lower()) if len(w) > 2 and w not in {"ltd", "limited", "stock"}]
        if len(words) >= 2 and all(word in haystack for word in words[:2]):
            return True

    return bool(ticker and re.search(rf"(?<![a-z0-9]){re.escape(ticker)}(?![a-z0-9])", haystack))


def fetch_sentiment_articles(ticker: str, company_name: str | None = None) -> dict:
    ticker_upper = ticker.upper().strip()
    aliases = build_news_aliases(ticker_upper, company_name)
    google_articles: list[dict] = []

    for alias in aliases:
        google_articles.extend(_fetch_google_news_package(alias))
        google_articles.extend(_fetch_google_news_rss(alias))

    google_articles = _dedupe_articles(google_articles)
    if google_articles:
        logger.info("[SentimentNews] Found %s Google articles for %s", len(google_articles), ticker_upper)
        return {"articles": google_articles, "source": "google", "aliases": aliases}

    pulse_articles = [
        article
        for article in _fetch_pulse_articles()
        if _alias_matches(article, aliases)
    ][:MAX_FALLBACK_ARTICLES]
    pulse_articles = _dedupe_articles(pulse_articles)
    if pulse_articles:
        logger.info("[SentimentNews] Found %s Pulse fallback articles for %s", len(pulse_articles), ticker_upper)
        return {"articles": pulse_articles, "source": "pulse", "aliases": aliases}

    logger.info("[SentimentNews] No articles found for %s with aliases %s", ticker_upper, aliases)
    return {"articles": [], "error": "no_articles_found", "source": "none", "aliases": aliases}
