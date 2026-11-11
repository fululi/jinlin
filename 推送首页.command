#!/bin/bash
# 一键推送 · 首页/首页脚本（index.html + 板块强度等非作战屏文件）
#   跟 推送到线上.command 的区别: 那份只管作战屏、且【不碰 index.html】; 这份专推 index.html 及其脚本。
#   用法: 双击即可。只推 git 里已跟踪的改动, 不新建文件、不删文件。
#   判断上线只认线上 index.html 的 SHA1 与本地一致(11-09/11-12 踩过 Pages 构建失败但代码已推)。

cd "$HOME/jinlin-push1104" || { echo "找不到 ~/jinlin-push1104"; read -p "按回车关闭" _; exit 1; }
export GIT_TERMINAL_PROMPT=0 LC_ALL=en_US.UTF-8
bye() { echo; echo "$1"; read -p "按回车关闭" _; exit ${2:-1}; }

# 上次异常中断留下的锁(0字节才算, 有内容的不动)
[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock

U=""; OK=""
for P in "" 7897 7890 7891 1080; do
  if [ -n "$P" ]; then
    nc -z -G 2 127.0.0.1 $P 2>/dev/null || continue; U="http://127.0.0.1:$P"; XO="-x $U"
  else U=""; XO="--noproxy github.com"; fi
  printf "== 试 %s ... " "${U:-直连}"
  C=$(curl -s -m 10 $XO -o /dev/null -w "%{http_code}" "https://github.com/fululi/jinlin.git/info/refs?service=git-upload-pack" || true)
  [ "$C" = "200" ] && { echo "通了"; OK=1; break; }
  echo "不通($C)"
done
[ -n "$OK" ] || bye "!! 都不通: 打开代理软件(换个节点) 或换网络, 再双击一次"
G() { git -c http.proxy="$U" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 "$@"; }

echo "== 待推改动:"; git status --short | head -20
[ -z "$(git status --porcelain)" ] && bye "没有改动, 不用推。" 0

echo "== 拉线上最新 ..."
G fetch origin main || bye "!! 拉取失败, 截图给 Claude"
if ! git merge-base --is-ancestor origin/main HEAD; then
  git rebase origin/main || { git rebase --abort; bye "!! 线上有新提交且冲突, 先停下, 截图给 Claude"; }
fi

# 壳号 +1(sw.js 的 C/KEEP + index.html 的 data-sw), 否则手机上仍是旧缓存
N=$(grep -oE "const C = 'jinlin-shell-v[0-9]+'" sw.js | grep -oE '[0-9]+' | tail -1)
[ -n "$N" ] || bye "!! sw.js 里没找到壳号, 截图给 Claude"
M=$((N+1))
perl -pi -e "s/const C = 'jinlin-shell-v${N}';/const C = 'jinlin-shell-v${M}'; \/* v${M}: 首页更新(一键推送自动升号, 缓存策略零变化) *\//; s/const KEEP = \['jinlin-shell-v${N}'/const KEEP = ['jinlin-shell-v${M}','jinlin-shell-v${N}'/" sw.js
perl -pi -e "s/data-sw=\"jinlin-shell-v${N}\"/data-sw=\"jinlin-shell-v${M}\"/" index.html
grep -q "jinlin-shell-v${M}" sw.js || bye "!! 壳号没改成(${N}→${M}), 截图给 Claude"

MSG=$(head -1 "$HOME/jinlin-zpw1104/推送说明.txt" 2>/dev/null)
[ -n "$MSG" ] || MSG="首页更新 $(date '+%m-%d %H:%M')"
git add -A --sparse && git commit -q -m "${MSG} · 壳v${N}→v${M}" || bye "!! 提交失败, 截图给 Claude"
: > "$HOME/jinlin-zpw1104/推送说明.txt" 2>/dev/null
git log --oneline -1

h1() { shasum -a 1 | cut -d' ' -f1; }
LIVEUP() { [ "$(curl -s -m 25 $XO "https://fululi.github.io/jinlin/index.html?cb=$(date +%s)" | h1)" = "$(h1 < index.html)" ]; }
WAITUP() { i=0; while [ $i -lt 8 ]; do LIVEUP && return 0; sleep 30; i=$((i+1)); done; LIVEUP; }

echo "== 推送中 ..."
G push origin main || bye "!! 推送失败, 截图给 Claude"

printf "== 等 GitHub Pages 部署 "
if WAITUP; then bye "推好了, 线上已是新版. 手机先把站点缓存清掉再进(主页必定拿到新版)." 0; fi

echo "没上线(构建多半失败), 空提交重推一次 ..."
git commit -q --allow-empty -m "重推: GitHub Pages 部署失败, 内容同上 $(date '+%m-%d %H:%M')" && G push origin main || bye "!! 重推失败, 截图给 Claude"
printf "== 再等一次 "
if WAITUP; then bye "重推成功, 线上已是新版." 0; fi
bye "!! 代码推上去了但线上一直没更新, 去 GitHub 网页 Actions 看红色那条, 截图给 Claude"
