"""PD-04 eval runner. Local (template or LLM, against fixture/local data) or against a live URL.

  python agent/tests/run_eval.py                         # local, MODEL_PROVIDER from env (default none)
  python agent/tests/run_eval.py --status-dir data/out/status   # local, today's local detector output
  python agent/tests/run_eval.py --url "$ApiUrl/ask"     # live API (batch only; mind Bedrock cost)
"""
import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(ROOT / "agent"), str(ROOT / "backend" / "core" / "python")]

CERTAINTY = ["will definitely", "definitely will", "guaranteed", "100%", "certainly will", "निश्चित रूप से", "पक्का"]
RANGE = re.compile(r"\d[\d,]*\s*[–-]\s*\d[\d,]*")


def load_questions():
    try:
        import yaml
        return yaml.safe_load((HERE / "questions.yaml").read_text(encoding="utf-8"))
    except ImportError:
        raise SystemExit("pip install pyyaml")


def ask_url(url, q):
    req = urllib.request.Request(url, data=json.dumps({"question": q}).encode(), method="POST",
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=35) as r:
        return json.loads(r.read().decode())


def check(item, resp):
    errs = []
    ans = resp.get("answer", "")
    low = ans.lower()
    if resp.get("lang") != item["lang"]:
        errs.append(f"lang {resp.get('lang')} != {item['lang']}")
    if item.get("district") and resp.get("district") != item["district"]:
        errs.append(f"district {resp.get('district')} != {item['district']}")
    if item.get("tools") and not set(item["tools"]) & set(resp.get("tools_used") or []):
        errs.append(f"none of tools {item['tools']} used (got {resp.get('tools_used')})")
    for m in item.get("must_include") or []:
        if m.lower() not in low:
            errs.append(f"missing '{m}'")
    for m in (item.get("must_not") or []) + CERTAINTY:
        if m.lower() in low:
            errs.append(f"contains forbidden '{m}'")
    if item.get("range") and not RANGE.search(ans) and " 0 " not in ans and "0 mm" not in ans and "0 मिमी" not in ans:
        errs.append("no litre range")
    if resp.get("mode") not in ("llm", "template"):
        errs.append(f"bad mode {resp.get('mode')}")
    return errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--status-dir", default=str(HERE / "fixtures" / "status"))
    ap.add_argument("--mode", default="llm")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()
    items = load_questions()
    if not args.url:
        from thirstcast_core.repo import LocalRepo
        from thirstcast_agent.handler_core import handle_ask
        repo = LocalRepo(status_dir=args.status_dir)
    stats = {"en": [0, 0], "hi": [0, 0]}
    for it in items:
        t0 = time.time()
        try:
            resp = ask_url(args.url, it["q"]) if args.url else handle_ask(it["q"], repo=repo, mode=args.mode)
            errs = check(it, resp)
        except Exception as e:  # noqa: BLE001
            resp, errs = {}, [f"request failed: {e!r}"]
        ok = not errs
        stats[it["lang"]][0] += ok
        stats[it["lang"]][1] += 1
        print(f"{'PASS' if ok else 'FAIL'} {it['id']} [{resp.get('mode', '-')}, {time.time() - t0:.1f}s] {it['q']}")
        if errs:
            print("      ", "; ".join(errs))
        if args.verbose or errs:
            print("      ", (resp.get("answer") or "").replace("\n", " ")[:300])
        if args.url:
            time.sleep(1)
    tot = sum(s[0] for s in stats.values()), sum(s[1] for s in stats.values())
    for lang, (p, n) in stats.items():
        print(f"{lang}: {p}/{n} passed")
    print(f"TOTAL: {tot[0]}/{tot[1]} ({100 * tot[0] / max(tot[1], 1):.0f}%)")
    sys.exit(0 if tot[0] == tot[1] else 1)


if __name__ == "__main__":
    main()
