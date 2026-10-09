#!/usr/bin/env python3
"""Re-create the local filing cache (data/sec/*.txt, git-ignored) that `npm run data:verify` reads.
Downloads each filing listed in scripts/real_cases.py DOCS from SEC EDGAR and converts it to the plain text the verifier expects.
Usage: SEC_USER_AGENT="Your Name you@example.com" python3 scripts/fetch_filings.py"""
import html, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("SEC_USER_AGENT", "")
if not os.environ["SEC_USER_AGENT"]:
    raise SystemExit("Set SEC_USER_AGENT to \"Your Name your.email@example.com\" (SEC fair-access policy).")
import real_cases  # noqa: E402

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "sec")
os.makedirs(D, exist_ok=True)
for key, d in real_cases.DOCS.items():
    out = os.path.join(D, d["txt"])
    if os.path.exists(out):
        print("cached", d["txt"]); continue
    time.sleep(0.3)
    raw = urllib.request.urlopen(urllib.request.Request(d["url"], headers={"User-Agent": os.environ["SEC_USER_AGENT"]}), timeout=60).read().decode("utf8", "ignore")
    raw = re.sub(r"(?is)<(script|style).*?</\1>", "", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</h\d>", "\n", raw)
    raw = re.sub(r"(?i)</t[dh]>", " | ", raw)
    t = html.unescape(re.sub(r"<[^>]+>", "", raw)); t = re.sub(r"[ \t\xa0]+", " ", t); t = re.sub(r"\n\s*\n+", "\n", t)
    open(out, "w").write(t); print("fetched", d["txt"], len(t))
