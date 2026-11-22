#!/usr/bin/env python3
"""Enrich existing news metadata with thumbnails from each original article."""
import html.parser
import ipaddress
import json
import pathlib
import socket
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "lcf/articles.json"
MAX_BYTES = 200_000
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; LianDiscovery/1.0; metadata preview)"}

def public_https(value):
    try:
        p = urllib.parse.urlsplit(value)
        if p.scheme != "https" or not p.hostname or p.username or p.password or p.port not in (None, 443):
            return False
        for answer in socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM):
            if not ipaddress.ip_address(answer[4][0]).is_global:
                return False
        return True
    except (ValueError, OSError):
        return False

class Metadata(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key in ("og:image", "og:image:url", "twitter:image", "twitter:image:src"):
                self.images.append(a.get("content", ""))
        elif tag == "img":
            for key in ("data-original", "data-src", "src"):
                candidate = a.get(key, "")
                if candidate and not any(x in candidate.lower() for x in ("logo", "icon", "avatar", "banner", "pixel", "loading")):
                    self.images.append(candidate)
                    break

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None

def get_image(article_url):
    if not public_https(article_url):
        return ""
    req = urllib.request.Request(article_url, headers=HEADERS)
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=12) as response:
            if "text/html" not in response.headers.get("Content-Type", "").lower():
                return ""
            page = response.read(MAX_BYTES).decode("utf-8", "replace")
        parser = Metadata()
        parser.feed(page)
        for candidate in parser.images:
            url = urllib.parse.urljoin(article_url, candidate.strip())
            if public_https(url):
                return url
    except (OSError, ValueError, html.parser.HTMLParseError) as error:
        print("Image metadata unavailable:", urllib.parse.urlsplit(article_url).path, type(error).__name__)
    return ""

def main():
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    updated = 0
    for article in payload.get("articles", [])[:30]:
        if article.get("image"):
            continue
        image = get_image(article.get("url", ""))
        if image:
            article["image"] = image
            updated += 1
    if updated:
        DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Thumbnails enriched:", updated, "of", len(payload.get("articles", [])))

if __name__ == "__main__":
    main()
