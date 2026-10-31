#!/usr/bin/env bash
# GitHub Actions 에서 실행: 수집 → 바뀐 데이터만 커밋/푸시
#   bash collector/run.sh full   # 전체 일정 (매일 03:00·15:00, 화면의 '일정 동기화' 버튼)
#   bash collector/run.sh hot    # 경기 중·직전 경기 점수: 3분 간격으로 반복, 해당 경기가 없어지면 바로 종료
set -u
MODE="${1:-hot}"
BR="${GITHUB_REF_NAME:-main}"
INTERVAL="${HOT_INTERVAL_SEC:-180}"     # 반복 간격(초)
MAX_MIN="${HOT_MAX_MIN:-55}"            # 한 번 실행에서 최대 반복 시간(분). 다음 예약 실행이 이어받음
git config user.name  "schedule-bot"
git config user.email "schedule-bot@users.noreply.github.com"
pip install --quiet --disable-pip-version-check pillow >/dev/null 2>&1 || true

# 다른 실행(전체 수집 등)이 먼저 올린 최신 데이터 위에서 작업
pull_data() { git fetch -q origin "$BR" && git checkout -q "origin/$BR" -- data 2>/dev/null; true; }

# 데이터 폴더만 원격 최신 위에 얹어서 커밋 (코드 파일은 건드리지 않음 → 충돌 없음)
push_data() {
  for i in 1 2 3; do
    git fetch -q origin "$BR" || true
    git reset -q --mixed "origin/$BR"
    git add data assets/logos
    if git diff --cached --quiet; then return 0; fi
    git commit -qm "sync: $1" && git push -q origin "HEAD:$BR" && { echo "푸시 완료 ($1)"; return 0; }
    sleep $((i * 5))
  done
  echo "푸시 실패 ($1)"
}

if [ "$MODE" = "full" ]; then
  pull_data
  python collector/collect.py --mode full
  push_data full
  exit 0
fi

END=$((SECONDS + MAX_MIN * 60))
while :; do
  pull_data
  OUT="$(python collector/collect.py --mode hot 2>&1)"; echo "$OUT"
  push_data hot
  echo "$OUT" | grep -q 'NO_TARGETS' && { echo "진행 중·직전 경기 없음 → 종료"; break; }
  [ "$SECONDS" -ge "$END" ] && { echo "최대 ${MAX_MIN}분 도달 → 다음 예약 실행이 이어서 확인"; break; }
  sleep "$INTERVAL"
done
