#!/usr/bin/env python3
"""Embed the exact source commit in the HTML artifact before deployment.

Usage:
  python3 scripts/stamp-build.py --commit "$(git rev-parse HEAD)" --date "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
Run on the *deployment artifact*, not on a working tree that will be committed afterward.
"""
import argparse
import html
import pathlib
import re

parser = argparse.ArgumentParser()
parser.add_argument("--commit", required=True)
parser.add_argument("--date", required=True)
parser.add_argument("--html", default="index.html")
args = parser.parse_args()
if not re.fullmatch(r"[a-fA-F0-9]{40}", args.commit):
    parser.error("--commit must be a full 40-character Git SHA")
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", args.date):
    parser.error("--date must be a UTC ISO 8601 timestamp")
path = pathlib.Path(args.html)
source = path.read_text(encoding="utf-8")
for name, value in (("lhs-commit", args.commit), ("lhs-build-date", args.date)):
    pattern = rf'(<meta name="{name}" content=")[^"]*(">)'
    source, count = re.subn(pattern, lambda m: m.group(1) + html.escape(value, quote=True) + m.group(2), source, count=1)
    if count != 1:
        raise SystemExit(f"Missing meta field: {name}")
path.write_text(source, encoding="utf-8")
print(f"Stamped {path} with {args.commit[:12]} ({args.date})")
