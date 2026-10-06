/* jinlin sw v.88 — 2026-10-06: 缓存名 →v143, 配合首页尾部三张折叠卡批(index v0.84.0: jlv2.js 独立模块,
   大资金国家队/温度计v2/大盘异动分组, 现有模块零改动; jlv2.js 非壳文件不受SW缓存, 拉取即最新) */
/* jinlin sw v.87 — 2026-10-06: 缓存名 →v142, 终版推送jl-1052(替代并行批15df898, 持仓联动改事件驱动防双算)。前批 →v140, 配合手机卡旧版根治批(index v0.83.43:
   jl-1047/1048/1049 三连推只改了index没升壳号——sw.js字节不变,手机浏览器永不重装SW,
   缓存秒出旧版39,房主刷新多次无效实证;本批补齐壳号配对+横幅点按已改真·硬恢复) */
/* jinlin sw v.84 — 2026-10-06: 缓存名 →v139, 配合龙池资金确认轻量化批(index v0.83.39:
   治「下午10只凌晨1只」——东财风控触发时资金确认大面积失败致全进观察; 日K轻量通道(10根柱)提前, 分钟重通道(240根/只)降级备用;
   门槛/打分/分类零改动 */
/* jinlin sw v.83 — 2026-10-06: 缓存名 →v138, 配合大K线白板根治批(index v0.83.38 + ks-1006-55:
   W1 ks白板根治: 进图查画布无则自动重载(治加载中断后dataset.cur挡重试的永久白板) + 加载中遮白改玻璃加载条 /
   W2 移动端chartMode 100dvh占满(底栏空缺消失) / W3 ks嵌底清透融入 / W4 sw后台刷新同时写规范键(治ks.html带参刷新永远命不中新版) */
/* jinlin sw v.82 — 2026-10-06: 缓存名 →v137, 配合市场资金休市兜底批(index v0.83.37:
   M1 修上一批误伤的版本属性引号(data-ver未闭合,自愈壳号比对失效) / M2 市场资金休市兜底:
   东财实时源空(长假/被墙)时用近5日历史最新交易日主力净额顶替暂缺+「休市·显示MM-DD收盘数据」标签 /
   M3 兜底门槛降为有1个指数就显示 / M4 近5日历史全败不再清旧缓存)。
/* jinlin sw v.81 — 2026-10-04: 缓存名 →v111, 配合持仓页通透批(index v0.83.9:
   按钮去灰玻璃化/持仓卡去压黑/开高低收三列报价/日期只留小标签/新闻减字/主力球固定右下角可拖拽记忆)。
   jinlin sw v.80 — 2026-10-03: 缓存名 →v110, 配合命名去撞车批(index v0.83.1:
   N1 中波段块不再重复渲染接回档(v0.83.0 自造的同标签双数值) / N2 短波段档位改「短波·X」
   不再借用日线「接回·X」 / N3 手画Fib标签中性化为「回撤/外推」 / N4 残留「冲刺」文案清零)。
   jinlin sw v.79 — 2026-10-03: 缓存名 →v109, 配合波段链状态机批(index v0.83.0:
   S1 新增 swingStateJL 纯函数(破前低以收盘价为准/双起点/翻转后改反弹档/外推改锚新段起点) /
   S3 外推位不再锚上一段腿低(永鼎 77.57 那类数消失) / S4 卡面 fib 只留4档接回 /
   S5 命名统一(日线段=中波段, 15分=短波段) / S6 自动斐波那契改开关默认关 /
   S7 龙池节假日不再误触发全A重扫 + jl_autoscan_d 闸真正生效)。
   jinlin sw v.78 — 2026-10-01: 缓存名 →v108, 配合龙池榜单不被旧快照覆盖(index v0.82.12:
   P15 poolOfflineJL 覆盖前比数据日——仓库 pool_latest.json 停在 09-21，原来点按龙池扫描
   会无条件把用户 09-30 实盘重扫的榜连 localStorage 一起覆盖回 09-21；现改为快照不比本地新
   就保留本地榜并把两个日期都说清 / P15b 覆盖成功那一路的 toast 也标明是覆盖了哪个本地日)。
   jinlin sw v.77 — 2026-10-01: 缓存名 →v107, 配合持仓详情15分波段判定行五修(index v0.82.11:
   F5 m15缓存永不刷新根治(用户实证:跌穿31.18仍显示31.18) / F1 判定与显示统一用l15hi0 /
   F2 破位加0.2%滞后带+按票记忆+换腿作废 / F3 回调看改指本腿接回档0.382-0.5(原指腿起点=100%回撤) /
   F4 补「已破15分波段起点·接回档作废」失效态 / F6 修「还差0.0%」退化改指冲刺档)。
   jinlin sw v.76 — 2026-10-01: 缓存名 →v106, 配合龙池资金确认计数+补拉轮+mfsvg审计修复批(index v0.82.10:
   P12 资金确认240/172根治(4处进度调用收敛单一出口+补拉轮不再全量重跑+百分比与文字同源+离线表停更明示) /
   P13 mfsvg白框丢失·口径标签·NaN守卫 / P14 撤ydFdCvJL重复图+超大单累计并入mfsvg上栏)。
   jinlin sw v.75 — 2026-10-01: 缓存名 →v105, 配合大盘异动主力流入/流出副图加大批(index v0.82.9:
   P11 mfsvg 170→338 一栏拆两栏(上累计线/下分钟柱)+流入流出合计与分钟数+单笔峰白框+底部时间轴)。
   jinlin sw v.74 — 2026-09-30: 缓存名 →v104, 配合龙池资金到位率+扫完延迟刷新批(index v0.82.8:
   P1c 扫完不再立刻整页reload(治OOM闪退) / P1b 20min强刷→90min硬上限 / P5 trend层进资金名单 /
   P6 温度成交额f6双取(治0亿) / P8 资金确认并发6→3+退避补拉(治只推一个主升))。
   jinlin sw v.73 — 2026-09-30: 缓存名 →v103, 配合龙池空榜诚实化批(index v0.82.7)。
   jinlin sw v.72 — 2026-09-30: 缓存名 →v102, 配合资金DDX三修+诊断行+六信号纯图形戳(index v0.82.6 / ks-0930-54)。
   jinlin sw v.71 — 2026-09-29: 缓存名 →v101, 配合六信号层批+P0注释泄漏热修(index v0.82.5 / ks-0929-53)。
   jinlin sw v.70 — 2026-09-29: 缓存名 →v99, 配合温度/国家队修复批(index v0.82.3: 温度pz100全覆盖+封板确认+双主机/宇宙扫描同根修/国家队盘中今日行)。
   jinlin sw v.69 — 2026-09-30: 缓存名 →v98, 配合六修批(index v0.82.2: 财联社m站/共振chip去重符号/板块资金兜底/fib删字/画线键统一/ETF资金开闸)。
   jinlin sw v.68 — 2026-09-30: 缓存名 →v97, 配合计划态档位前瞻铺满批(index v0.82.1)。
   jinlin sw v.67 — 2026-09-30: 缓存名 →v96(顺带修 v93 遗留: C 活跃缓存名与 KEEP 脱节致自建自删), 配合快讯页签+资金去重批(index v0.82.0)。
   jinlin sw v.66 — 2026-09-30: 缓存名 →v95，配合追加批(反应位默认关/跌停日信号签/持仓入龙池体检/资金面板专业化)(index v0.81.9)。
   jinlin sw v.65 — 2026-09-30: 缓存名 →v94，配合九问批(蜡烛标准红绿/预判回填/情绪分组/温度自动重试/持仓小图三修/板块别名/异动图定标/龙池自动补扫+主推驻留)(index v0.81.8)。
   jinlin sw v.64 — 2026-09-29: 缓存名 →v93，配合审查修复批(龙池空榜保护/水位台账收盘定稿/复盘口径六修/itrace摘除/定时器hidden守卫/扫描全局进度条)(index v0.81.7)。
   jinlin sw v.63 — 2026-09-29: 缓存名 →v92，配合板块资金拉取根治——零写入视同失败走降级链+clist补ut令牌+兜底补贵金属(index v0.81.6)。
   jinlin sw v.62 — 2026-09-28: 缓存名 →v91，配合搜索重码治理+共振面板放出+60分资金解锁(index v0.81.5 / ks v=0928d)。
   --- 近期 ---
   jinlin sw v.60 — 2026-09-28: 缓存名 →v89，配合空头信号口径修正(index v0.81.3 / ks v=0928b)。
   --- 历史 ---
   jinlin sw v.57 — 网络优先 3.5s 封顶回缓存。三连环修复(2026-09-16):
   (a) 缓存写入挂回 fetch 本体,晚到响应照常入缓存,弱网不再永远写不进
   (b) 缓存全 miss 时回退等待原始 fetch,不再 respondWith(undefined) 抛 TypeError
   (c) 预缓存失败不 skipWaiting;activate 保留前一版缓存,消灭"空缓存窗口"
   (d) 2026-09-20: 网络返回 HTTP 错误(4xx/5xx)也视为失败回退缓存,不再把错误响应直接端给用户 */
/* jinlin sw v.82 — 2026-10-05: →v122 壳改「先秒出缓存+后台静默更新」: v121 及以前网络竞跑3.5s, 弱网必输喂旧缓存(=手机永远慢一版的根因); 配合 index jl-1020 自愈, 弱网最多两次刷新到新版 */
/* jinlin sw v.90 — 2026-10-06: 缓存名 →v168, 配合大盘异动聚合剔ST批(index v0.84.26: jlv2.js?v=5,
   ST/*ST 5%涨跌停口径≠主板, 六组聚合/代表个股/扩散横幅/最新全剔除, CFG.yd.exst可关) */
/* jinlin sw v.91 — 2026-10-06: 缓存名 →v169, 配合ST剔除推广全站批(index v0.84.27: jlv2.js?v=6,
   主模块异动Tab事件流全tab/涨停池家数/密度图/气泡聚集 + jlv2涨跌停池(温度v2九因子/连板/炸板/昨涨停溢价)同口径剔ST/退市) */
/* jinlin sw v.92 — 2026-10-06: 缓存名 →v170, 配合离线板块映射批(index v0.84.28: jlv2.js?v=7 + jl_sector_map.js?v=1,
   内置东财EM2016二级行业映射5929只纯静态——板块异动聚簇键换映射(治恒0组)/热点板块持续离线聚合/跌停明细可点展开+DT池sort根修) */
const C = 'jinlin-shell-v170'; /* jl-1080 v0.84.28: 离线板块映射三空转位补齐; jlv2.js?v=7 jl_sector_map.js?v=1 */
const KEEP = ['jinlin-shell-v170', 'jinlin-shell-v169'];
const SHELL = ['./', 'index.html', 'ks.html'];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))   // jl-1024: 预缓存尽力而为
      .catch(() => {})
      .then(() => self.skipWaiting())     // jl-1024: 无条件接管——v122/123「预缓存失败不激活」致弱网永远不生效的坑根治
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => KEEP.indexOf(k) < 0).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll().then(cs => cs.forEach(c => { try { c.postMessage({ type: 'JL_SW_NEW' }); } catch (e) {} })))
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;                 // 只管本站的壳,行情接口一律直连
  if (!/(\/|index\.html|ks\.html)$/.test(u.pathname)) return;
  const bg = fetch(e.request).then(r => {                   // 后台静默更新: 晚到响应照常入缓存,弱网不再永远写不进
    if (r && r.ok) { const cp = r.clone(); const cp2 = r.clone(); caches.open(C).then(c => { c.put(e.request, cp); try { const nu = new URL(e.request.url); nu.search = ''; if (nu.href !== e.request.url) c.put(nu.href, cp2); } catch (e2) {} }); return r; }
    throw new Error('bad-net');                             // HTTP 错误(404/500)不入缓存,不把错误页端给用户
  });
  e.respondWith(
    caches.open(C).then(c => c.match(e.request, { ignoreSearch: true }))  /* jl-1060: 只匹配当前壳缓存——原先全局匹配会把KEEP的旧壳缓存里陈年ks.html喂给iframe, 新玻璃永远到不了手机(房主面板仍死黑根因) */
      .then(m => {
        if (m) { bg.catch(() => {}); return m; }            // 有缓存: 先秒出,新版后台入缓存,下次刷新即新(不再3.5s竞跑)
        return bg.catch(() => caches.match('index.html').then(x => { if (x) return x; throw new Error('no-shell'); }));  // 缓存全空: 等网络,失败回退缓存任一 index
      })
  );
});
