# 내 경기 일정

응원하는 팀만 골라 두면 그 팀의 모든 대회 경기(리그·챔스·FA컵·카라바오컵·A매치·아시안컵·LCK·MSI·월즈)를 날짜순으로 보여주는 개인용 웹앱입니다.
휴대폰 홈 화면이나 PC 바탕화면에 바로가기(앱 아이콘)로 깔아 둘 수 있습니다.

## 구조 (서버비 0원)

```
GitHub Actions (자동, 무료) ──> data/schedule.json ──> GitHub Pages (웹앱)
  · 매일 03:00 / 15:00  전체 일정 수집                       · 열 때 JSON 하나만 받음 (안 바뀌었으면 304)
  · 15분마다           경기 중·직전 경기 점수만 갱신             · 로고는 처음 한 번만 받고 캐시
                                                            · 라인업은 버튼 누를 때만 ESPN에서 실시간
```

| 데이터 | 출처 |
|---|---|
| 축구 일정·점수·로고 | ESPN 공개 API (팀 하나로 모든 대회 경기가 나옴) |
| 축구 라인업 | ESPN 경기 상세 (보통 킥오프 1시간 전 발표, 버튼 누를 때 실시간 조회) |
| 롤 일정·점수·로고 | 네이버 e스포츠 API (로고도 네이버 원본) |
| 네이버 일정 링크의 teamCode | `data/naver_codes.json` (자동 학습 + 직접 입력) |

## 처음 한 번만: 배포 (약 5분)

1. GitHub에서 **공개(Public)** 저장소를 새로 만듭니다. (공개여야 Pages·Actions가 무료·무제한)
2. **압축을 푼 `sports-hub` 폴더 "안의" 파일들**을 저장소 맨 위에 올립니다.
   `index.html` 이 저장소 첫 화면에 바로 보여야 정상입니다. (`sports-hub/index.html` 처럼 한 단계 들어가 있으면 안 됨)
3. **`.github` 폴더는 웹 업로드에서 자주 빠집니다** (점으로 시작하는 숨김 폴더라서). 아래로 직접 만들어 주세요.
   - 저장소 → **Add file → Create new file**
   - 파일 이름 칸에 `.github/workflows/sync.yml` 입력 (슬래시를 치면 폴더가 자동으로 생김)
   - 함께 드린 `sync.yml` 내용을 그대로 붙여넣기 → **Commit changes**
4. **Settings → Actions → General**
   - *Actions permissions*: **Allow all actions and reusable workflows**
   - 맨 아래 *Workflow permissions*: **Read and write permissions** → Save
5. **Actions** 탭 → 왼쪽 `sync-schedule` → **Run workflow** → `full` → Run (1~2분)
6. **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main` / `/(root)` → Save
7. 1~2분 뒤 `https://<아이디>.github.io/<저장소이름>/` 접속 → 관심 구단 설정 → 끝

이후로는 손댈 게 없습니다. 일정·점수는 자동으로 바뀌고, 열어 둔 화면도 10분마다(경기 중엔 2분마다) 알아서 새로고침됩니다.
> 공개 저장소는 60일 동안 아무 변경이 없으면 GitHub가 예약 실행을 멈추는데, 이 수집기는 매일 데이터를 커밋하므로 해당되지 않습니다.
> 혹시 멈추면 Actions 탭에서 *Enable workflow* 를 한 번 눌러 주세요.

## 바로가기로 깔기

- **안드로이드(크롬)**: 주소 접속 → 메뉴 ⋮ → *홈 화면에 추가* (앱 아이콘으로 설치됨)
- **아이폰(사파리)**: 공유 버튼 → *홈 화면에 추가*
- **PC(크롬/엣지)**: 주소창 오른쪽 *앱 설치* 아이콘

## 구글 사이트에 올리고 싶다면

구글 사이트 편집 화면 → **삽입 → 삽입(Embed) → URL** 에 위 GitHub Pages 주소를 넣으면 됩니다.
데이터는 GitHub 쪽에서 계속 갱신되므로 **구글 사이트 안에서도 자동 동기화는 그대로 됩니다.**
다만 구글 사이트 안에서는 틀(iframe) 안에 들어가서 높이가 고정되고 앱 아이콘 설치가 안 되므로,
바로가기는 GitHub Pages 주소로 직접 만드는 쪽을 권합니다.

## 네이버 일정 링크 규칙

- 축구: `m.sports.naver.com/{wfootball|kfootball}/schedule/index?category={epl|primera|champs|…}&date={그 팀의 그 대회 그 달 첫 경기}&teamCode={팀코드}`
  → 한 달 내내 같은 링크, 다음 달이 되면 그 달 첫 경기 날짜로 바뀜
- 롤: `game.naver.com/esports/League_of_Legends/schedule/{lck|world_championship|msi}?date=YYYY-MM`

**teamCode 채우기:** 네이버 축구 API는 해외 서버 요청을 끊는 경우가 있어, 수집기가 가능할 때만 자동으로 배웁니다.
비어 있는 팀은 링크에 teamCode 없이 그 대회 일정 페이지로 갑니다. 확실히 하려면
네이버 스포츠에서 팀을 눌렀을 때 주소의 `teamCode=` 값을 `data/naver_codes.json` 에 `"ESPN팀번호": "네이버코드"` 로 적어 주세요.
(이미 들어 있음: 맨유 `"360": "12"`, AT마드리드 `"1068": "26305"`. ESPN 팀번호는 `data/schedule.json` 의 `"key":"f:번호"`)

## 중계 링크

| 대회 | 버튼 |
|---|---|
| 프리미어리그, 라리가 | 쿠팡플레이 (스포츠 홈) |
| 챔스·유로파·컨퍼런스 | 스포티비 나우 |
| LCK·MSI·월즈 | 치지직 울프, 숲 스맵 생방송 |

쿠팡플레이는 로그인 없이는 경기 목록을 볼 수 없게 막혀 있어서, 경기별 바로가기 대신 스포츠 홈으로 연결합니다.

## 손볼 곳

- 팀/리그 추가: `collector/collect.py` 의 `FOOTBALL_GROUPS`(ESPN 리그 코드), `LOL_LEAGUES`
- 한국어 팀 이름: 같은 파일의 `KO`
- 중계처·링크 규칙: `app.js` 맨 위 `CFG`
- 테스트: `node test/core.test.js`
