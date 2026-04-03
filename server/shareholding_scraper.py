"""
Shareholding pattern scraper for Indian stocks via screener.in.

Fetches quarterly/yearly shareholding data (Promoters, FIIs, DIIs, Public, etc.)
and returns structured data for chart visualization and table display.
Also fetches individual shareholder names via screener.in addon API.

Based on the scraping approach from https://github.com/BuildAlgos/screener-scraper
Re-implemented as a minimal module since the original repo is not pip-installable.

Dependencies: beautifulsoup4, requests (already in pyproject.toml)
"""

import re
import requests
import logging
from typing import Optional, Dict, Any, List
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ======================
# Constants
# ======================

SCREENER_BASE_URL = "https://www.screener.in/company/{symbol}/consolidated/"
SCREENER_STANDALONE_URL = "https://www.screener.in/company/{symbol}/"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15  # seconds

SCREENER_ADDON_API = "https://www.screener.in/api/3/{screener_id}/investors/{slug}/{view}/"

# Map aggregate category name → addon API slug
CATEGORY_API_SLUG: Dict[str, str] = {
    "Promoters": "promoters",
    "FIIs": "foreign_institutions",
    "DIIs": "domestic_institutions",
    "Government": "government",
    "Public": "public",
}


# ======================
# Internal helpers
# ======================

def _fetch_screener_page(symbol: str) -> Optional[BeautifulSoup]:
    """
    Fetch and parse screener.in company page.
    Tries consolidated view first, falls back to standalone.
    """
    urls = [
        SCREENER_BASE_URL.format(symbol=symbol),
        SCREENER_STANDALONE_URL.format(symbol=symbol),
    ]

    for url in urls:
        try:
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT,
            )
            if response.status_code == 200:
                return BeautifulSoup(response.content, "html.parser")
            logger.debug(f"screener.in returned {response.status_code} for {url}")
        except requests.RequestException as e:
            logger.warning(f"Failed to fetch {url}: {e}")

    return None


def _parse_shareholding_table(
    soup: BeautifulSoup,
    section_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Parse shareholding table from screener.in HTML.

    The shareholding section uses a special table class
    "responsive-holder fill-card-width" (different from standard data tables).

    Args:
        soup: Parsed HTML page
        section_id: "quarterly-shp" or "yearly-shp"

    Returns:
        {
            "quarters": ["Dec 2024", "Sep 2024", ...],
            "categories": {"Promoters": [50.31, ...], "FIIs": [23.34, ...], ...}
        }
        or None if section not found.
    """
    section = soup.find(id=section_id)
    if not section:
        return None

    # Find the shareholding table container
    table_container = section.find(class_="responsive-holder fill-card-width")
    if not table_container:
        # Fallback: try finding any table in the section
        table_container = section.find("table")
        if not table_container:
            return None

    table = table_container if table_container.name == "table" else table_container.find("table")
    if not table:
        return None

    # Parse headers — include empty strings to preserve column alignment
    headers: List[str] = []
    thead = table.find("thead")
    if thead:
        for th in thead.find_all("th"):
            headers.append(th.get_text(strip=True))
    else:
        # Fallback: first row might be headers
        first_row = table.find("tr")
        if first_row:
            for th in first_row.find_all(["th", "td"]):
                headers.append(th.get_text(strip=True))

    if not headers:
        return None

    # First header is the Category column (empty or label) — skip it
    # The rest are date strings (e.g. "Mar 2023", "Jun 2023", ...)
    date_headers = headers[1:]

    # Parse body rows (each row = one category with percentage values)
    categories: Dict[str, List[Optional[float]]] = {}
    tbody = table.find("tbody")
    rows = tbody.find_all("tr") if tbody else table.find_all("tr")[1:]

    for tr in rows:
        cells = tr.find_all("td")
        if len(cells) < 2:
            continue

        category_name = cells[0].get_text(strip=True)
        if not category_name:
            continue

        # Strip trailing "+" used by screener.in for expandable categories
        category_name = category_name.rstrip("+").strip()

        # Skip "No. of Shareholders" row — not a percentage category
        if "shareholder" in category_name.lower():
            continue

        values: List[Optional[float]] = []
        for cell in cells[1:]:
            text = cell.get_text(strip=True).replace("%", "").replace(",", "")
            try:
                values.append(float(text))
            except (ValueError, TypeError):
                values.append(None)

        # Only include categories that have at least one non-null value
        if any(v is not None for v in values):
            categories[category_name] = values

    if not categories:
        return None

    return {
        "quarters": date_headers,
        "categories": categories,
    }


def _extract_screener_id(soup: BeautifulSoup) -> Optional[int]:
    """
    Extract the numeric screener.in company ID from HTML.

    screener.in embeds the company ID in style tags as `data-row-company-id="2726"`.
    We search all script and style tags plus the raw HTML for this pattern.
    """
    html_str = str(soup)
    match = re.search(r'data-row-company-id[="\s]+(\d+)', html_str)
    if match:
        return int(match.group(1))

    # Fallback: look in warehouse data attribute on section elements
    for section in soup.find_all(attrs={"data-warehouse-id": True}):
        try:
            return int(section["data-warehouse-id"])
        except (ValueError, TypeError):
            continue

    return None


def _fetch_shareholders(
    screener_id: int,
    view: str,
    quarters_table: List[str],
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fetch individual shareholders for each category via screener.in addon API.

    Args:
        screener_id: Numeric screener.in company ID
        view: "quarterly" or "yearly"
        quarters_table: List of quarter strings in newest-first order (table order)

    Returns:
        Dict mapping category name → list of {"name": str, "values": list} dicts.
        Values are in newest-first order matching quarters_table.
    """
    api_view = "quarterly" if view == "quarterly" else "yearly"
    result: Dict[str, List[Dict[str, Any]]] = {}

    for category, slug in CATEGORY_API_SLUG.items():
        url = SCREENER_ADDON_API.format(
            screener_id=screener_id, slug=slug, view=api_view
        )
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code != 200:
                logger.debug(f"Addon API returned {resp.status_code} for {category}")
                result[category] = []
                continue

            data = resp.json()
            if not isinstance(data, dict):
                result[category] = []
                continue

            shareholders: List[Dict[str, Any]] = []
            for name, period_data in data.items():
                if not isinstance(period_data, dict):
                    continue

                # Build values aligned to quarters_table (newest-first)
                values: List[Optional[float]] = []
                for quarter in quarters_table:
                    raw = period_data.get(quarter)
                    if raw is not None and not isinstance(raw, dict):
                        try:
                            values.append(float(str(raw).replace("%", "").replace(",", "")))
                        except (ValueError, TypeError):
                            values.append(None)
                    else:
                        values.append(None)

                # Only include shareholders with at least one non-null value
                if any(v is not None for v in values):
                    shareholders.append({"name": name, "values": values})

            # Sort by most recent value descending (largest holders first)
            def _sort_key(sh: Dict[str, Any]) -> float:
                for v in sh["values"]:
                    if v is not None:
                        return -v
                return 0.0

            shareholders.sort(key=_sort_key)
            result[category] = shareholders

        except requests.RequestException as e:
            logger.warning(f"Failed to fetch shareholders for {category}: {e}")
            result[category] = []
        except (ValueError, KeyError) as e:
            logger.warning(f"Failed to parse shareholders for {category}: {e}")
            result[category] = []

    return result


# ======================
# Public API
# ======================

def fetch_shareholding(symbol: str, view: str = "quarterly") -> Dict[str, Any]:
    """
    Fetch shareholding pattern data for an NSE stock.

    Args:
        symbol: NSE stock symbol (e.g., "RELIANCE", "TCS", "INFY")
        view: "quarterly" or "yearly"

    Returns:
        {
            "success": True/False,
            "symbol": "RELIANCE",
            "view": "quarterly",
            "quarters": ["Dec 2024", "Sep 2024", ...],       # newest-first (table)
            "data": [                                          # table rows
                {"category": "Promoters", "values": [50.31, ...]},
                ...
            ],
            "chart_data": [                                    # recharts format, oldest-first
                {"quarter": "Mar 2022", "Promoters": 50.31, "FIIs": 23.34, ...},
                ...
            ],
            "error": null
        }
    """
    section_id = "quarterly-shp" if view == "quarterly" else "yearly-shp"

    error_base = {
        "success": False,
        "symbol": symbol,
        "view": view,
        "quarters": [],
        "data": [],
        "chart_data": [],
    }

    soup = _fetch_screener_page(symbol)
    if not soup:
        return {**error_base, "error": f"Failed to fetch data from screener.in for {symbol}"}

    parsed = _parse_shareholding_table(soup, section_id)
    if not parsed:
        return {**error_base, "error": f"No shareholding data found for {symbol}"}

    # quarters from HTML are oldest-first: ["Jun 2023", "Sep 2023", ..., "Dec 2025"]
    quarters_chronological = parsed["quarters"]
    categories = parsed["categories"]

    # Table display: newest-first (reverse quarters and values)
    quarters_table = list(reversed(quarters_chronological))
    data = [
        {"category": name, "values": list(reversed(values)), "shareholders": []}
        for name, values in categories.items()
    ]

    # Fetch individual shareholders via addon API
    screener_id = _extract_screener_id(soup)
    if screener_id:
        shareholders_map = _fetch_shareholders(screener_id, view, quarters_table)
        for entry in data:
            cat_name = entry["category"]
            entry["shareholders"] = shareholders_map.get(cat_name, [])
    else:
        logger.debug(f"Could not extract screener ID for {symbol}, skipping shareholders")

    # Chart display: oldest-first (keep chronological order for left-to-right rendering)
    chart_data = []
    for i in range(len(quarters_chronological)):
        point: Dict[str, Any] = {"quarter": quarters_chronological[i]}
        for cat_name, cat_values in categories.items():
            if i < len(cat_values) and cat_values[i] is not None:
                point[cat_name] = cat_values[i]
        chart_data.append(point)

    return {
        "success": True,
        "symbol": symbol,
        "view": view,
        "quarters": quarters_table,
        "data": data,
        "chart_data": chart_data,
        "error": None,
    }
