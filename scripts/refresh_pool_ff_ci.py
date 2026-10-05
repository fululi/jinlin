#!/usr/bin/env python3
# CI: 刷新 pool_ff.json (东财 push2his fflow 日线主力净额, 与页面实时路径同源同口径)
# 环境: GitHub Actions / 本地 — 仓库根目录执行; 节假日自动跳过(数据日不变则不提交)
import json, os, subprocess, sys, time, random, threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = os.path.join(ROOT, 'pool_ff.json')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/'}

def get(url, timeout=12, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception:
            time.sleep(0.5 * (i + 1))
    return None

def secid(code):
    return ('1.' if code.startswith('6') else '0.') + code

# 1) 基准交易日历: 平安银行(000001) fflow 最近15个交易日
j = get('https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=0.000001&lmt=15&end=20500101&fields1=f1,f2,f3,f7&fields2=f51,f52')
kl = ((j or {}).get('data') or {}).get('klines') or []
DAYS = [l.split(',')[0] for l in kl]
if len(DAYS) < 10:
    print('交易日历获取失败'); sys.exit(1)
ASOF = DAYS[-1]
print('交易日窗: %s -> %s' % (DAYS[0], ASOF), flush=True)

# 2) 宇宙: 旧表 ∪ clist 全A代码(含北交)
old = json.load(open(FF, encoding='utf-8')) if os.path.exists(FF) else {"d": {}}
od = old.get('d') or {}
names = {c: v[0] for c, v in od.items()}
codes = set(od.keys())
pn = 1
while pn <= 80:
    j = get('https://push2.eastmoney.com/api/qt/clist/get?pn=%d&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f12,f14' % pn)
    rows = (((j or {}).get('data') or {}).get('diff')) or []
    if not rows:
        break
    for r in rows:
        c = str(r['f12']).zfill(6)
        codes.add(c)
        names.setdefault(c, r['f14'])
    if len(rows) < 100:
        break
    pn += 1
print('宇宙: %d 只 (旧表 %d)' % (len(codes), len(od)), flush=True)

# 3) 逐股拉最近15日主力净额(温和并发)
lock = threading.Lock()
done = [0]
results = {}

def worker(code):
    time.sleep(random.uniform(0, 0.25))
    j = get('https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=%s&lmt=15&end=20500101&fields1=f1,f2,f3,f7&fields2=f51,f52' % secid(code))
    m = {}
    for line in ((((j or {}).get('data')) or {}).get('klines') or []):
        p = line.split(',')
        try:
            m[p[0]] = float(p[1])
        except Exception:
            pass
    return code, m

with ThreadPoolExecutor(max_workers=6) as ex:
    futs = [ex.submit(worker, c) for c in codes]
    for fu in as_completed(futs):
        c, m = fu.result()
        with lock:
            done[0] += 1
            if done[0] % 500 == 0:
                print('  进度 %d/%d' % (done[0], len(codes)), flush=True)
        if m:
            nets = [m.get(d) for d in DAYS]
            if any(v is not None for v in nets):
                results[c] = nets

cover = len(results) / max(1, len(codes))
print('成功: %d / %d (%.1f%%)' % (len(results), len(codes), cover * 100), flush=True)
if cover < 0.80:
    print('覆盖率不足80%%, 保守退出不动旧表'); sys.exit(1)

d = {c: [names.get(c, ''), results[c]] for c in sorted(codes) if c in results}
out = {"asof": ASOF, "days": DAYS, "d": d}
json.dump(out, open(FF, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('写出 pool_ff.json: %d bytes, %d 只, asof=%s' % (os.path.getsize(FF), len(d), ASOF), flush=True)

# 4) 有变化才提交
r = subprocess.run(['git', 'status', '--porcelain', '--', 'pool_ff.json'], cwd=ROOT, capture_output=True, text=True)
if not r.stdout.strip():
    print('无变化(节假日/已刷新), 跳过提交'); sys.exit(0)
subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], cwd=ROOT)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], cwd=ROOT)
subprocess.run(['git', 'add', 'pool_ff.json'], cwd=ROOT)
subprocess.run(['git', 'commit', '-m', 'CI: 离线资金表刷新至 ' + ASOF], cwd=ROOT)
pr = subprocess.run(['git', 'push'], cwd=ROOT, capture_output=True, text=True)
print('git push: rc=%d %s' % (pr.returncode, (pr.stderr or '')[-300:]), flush=True)
sys.exit(0 if pr.returncode == 0 else 1)
