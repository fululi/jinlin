#!/usr/bin/env python3
# _b20.py — 温度卡文案修正(v0.82.3 同批): 换骨架后涨跌停数走交易所官方池(getTopicZTPool/DTPool的tc),
#   含科创创业20cm/北交30cm, 不再是"涨幅≥9.8%"自判口径——页脚文案同步改, 避免误导
import io

F = "index.html"
s = io.open(F, encoding="utf-8").read()

OLD = r'''" \xB7 \u6DA8\u505C\u53E3\u5F84\u22659.8% \xB7 \u70B9\u6211\u91CD\u91C7";'''
NEW = r'''" \xB7 \u6DA8\u8DCC\u505C\u5B98\u65B9\u6C60\u53E3\u5F84 \xB7 \u70B9\u6211\u91CD\u91C7";'''
assert s.count(OLD) == 1, f"anchor count={s.count(OLD)}"
s = s.replace(OLD, NEW)

io.open(F, "w", encoding="utf-8").write(s)
print("index.html OK — 温度页脚口径文案")

import re
blocks = [m.group(1) for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, re.S)]
io.open('/tmp/_inline_all.js', 'w', encoding='utf-8').write('\n;\n'.join(blocks))
print("inline blocks:", len(blocks))
