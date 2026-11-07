import json, sys, collections, statistics as st
W = {"c1":10,"c2":15,"c3":20,"c4":20,"c5":15,"c6":15,"c7":5}
SCALE = {"c4":20,"c6":10}
def pts(c, a):
    if a == "NA": return None
    if c in SCALE: return float(a)/SCALE[c]
    return 1.0 if a == "Y" else 0.0
def total(ans):
    app = {c: pts(c, ans[c]) for c in W}
    app = {c: v for c, v in app.items() if v is not None}
    if not app: return None
    wsum = sum(W[c] for c in app)
    return round(sum(W[c]*v for c, v in app.items())*100/wsum, 2)
gt = {k: v for k, v in json.load(open("bench/gt_manual.json")).items() if not k.startswith("_")}
rows = [json.loads(l) for l in open(sys.argv[1]) if '"ok": true' in l]
# GT total only using confident values; for '?' use the value without ? (best guess)
gt_clean = {cid: {c: str(v).rstrip("?") for c, v in d.items()} for cid, d in gt.items()}
stats = collections.defaultdict(lambda: {"hit":0,"n":0,"cost":[],"lat":[],"mae":[],"c8":[0,0],"lang":collections.defaultdict(lambda:[0,0]),"crit":collections.defaultdict(lambda:[0,0])})
for r in rows:
    m, cid = r["model"], r["cid"]
    ans = {c: r["result"][c]["answer"] for c in r["result"]}
    s = stats[m]; s["cost"].append(r["usage"].get("cost") or 0); s["lat"].append(r["latency"])
    lang = cid.split("-")[1]
    for c, v in gt[cid].items():
        if str(v).endswith("?"): continue
        ok = str(v) == ans[c]
        if c == "c8": s["c8"][0] += ok; s["c8"][1] += 1
        s["hit"] += ok; s["n"] += 1
        s["lang"][lang][0] += ok; s["lang"][lang][1] += 1
        s["crit"][c][0] += ok; s["crit"][c][1] += 1
    tg, tm = total(gt_clean[cid]), total(ans)
    if tg is not None and tm is not None: s["mae"].append(abs(tg - tm))
print(f"{'model':32s} acc%  RU   KZ   EN  | c8  | MAE_total | $/dialog  avg_s")
for m, s in sorted(stats.items(), key=lambda kv: -kv[1]["hit"]/kv[1]["n"]):
    L = {k: f"{100*a/b:4.0f}" for k, (a, b) in s["lang"].items()}
    print(f"{m:32s} {100*s['hit']/s['n']:4.1f} {L.get('ru','  -')} {L.get('kz','  -')} {L.get('en','  -')} | {s['c8'][0]}/{s['c8'][1]} | {st.mean(s['mae']):6.2f}    | {st.mean(s['cost']):.4f}  {st.mean(s['lat']):5.1f}  n={len(s['cost'])}")
print("\nper-criterion accuracy (all models pooled):")
pool = collections.defaultdict(lambda:[0,0])
for s in stats.values():
    for c,(a,b) in s["crit"].items(): pool[c][0]+=a; pool[c][1]+=b
print({c: f"{100*a/b:.0f}% (n={b})" for c,(a,b) in sorted(pool.items())})
print("\ntotal spend this file: $%.3f" % sum(sum(s['cost']) for s in stats.values()))
