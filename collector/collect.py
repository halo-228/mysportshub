#!/usr/bin/env python3
"""경기 일정 수집기 → data/schedule.json

  python collector/collect.py --mode full   # 하루 1회: 지난달 1일 ~ 약 6개월 뒤까지 전체 일정 + 로고
  python collector/collect.py --mode hot    # 15분마다: 진행 중/곧 시작할 경기의 점수·상태만 (해당 경기 없으면 즉시 종료)

출처 (2026-10-31 실제 응답으로 확인)
  - 축구: ESPN 공개 API  site.api.espn.com/apis/site/v2/sports/soccer/all/teams/{id}/schedule
          → 팀 하나로 리그·챔스·FA컵·카라바오컵·A매치·아시안컵 등 모든 대회 경기가 한 번에 나온다.
  - 롤  : 네이버 e스포츠 API esports-api.game.naver.com/service/v2/schedule/month (로고도 네이버 원본)
  - 네이버 축구 teamCode: api-gw.sports.naver.com (해외 서버 요청을 끊는 경우가 있어 '가능하면' 갱신,
          실패하면 data/naver_codes.json 에 저장된 값 사용. 직접 적어 넣어도 됨)
표준 라이브러리만으로 동작하고, Pillow 가 있으면 로고를 64px 로 줄여 저장한다.
"""
import argparse, datetime as dt, gzip, io, json, os, re, sys, time, urllib.parse, urllib.request

KST = dt.timezone(dt.timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'schedule.json')
CODES = os.path.join(ROOT, 'data', 'naver_codes.json')
LOGO_DIR = os.path.join(ROOT, 'assets', 'logos')
UA = 'sports-hub-collector/2.0 (+github actions)'

ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
LOL_API = 'https://esports-api.game.naver.com/service/v2/schedule/month'
NAVER_API = 'https://api-gw.sports.naver.com/schedule/games'

# ── 선택 가능한 팀 묶음 ─────────────────────────────────────────────────────
FOOTBALL_GROUPS = [            # (ESPN 리그, 선택창 묶음 이름)
    ('eng.1', '프리미어리그'),
    ('esp.1', '라리가'),
]
NATIONAL = [{'id': '451', 'group': '국가대표', 'name': '대한민국', 'logo': 'assets/logos/korea.png'}]
LOL_LEAGUES = [                # (네이버 topLeagueId, 표시 이름)
    ('lck', 'LCK'),
    ('msi', 'MSI'),
    ('world_championship', '월즈'),
]

# ESPN 대회 → (네이버 upperCategory, 네이버 category, 한국어 대회명)
# 네이버 category 값은 네이버 스포츠 웹 코드(main.js)에 들어 있는 목록에서 확인.
COMP = {
    'eng.1':            ('wfootball', 'epl',             '프리미어리그'),
    'esp.1':            ('wfootball', 'primera',         '라리가'),
    'uefa.champions':   ('wfootball', 'champs',          '챔피언스리그'),
    'uefa.europa':      ('wfootball', 'europa',          '유로파리그'),
    'uefa.europa.conf': ('wfootball', 'uecl',            '컨퍼런스리그'),
    'uefa.super_cup':   ('wfootball', 'uefasupercup',    'UEFA 슈퍼컵'),
    'eng.fa':           ('wfootball', 'facup',           'FA컵'),
    'eng.league_cup':   ('wfootball', 'carlingcup',      '카라바오컵'),
    'eng.charity':      ('wfootball', 'communityshield', '커뮤니티 실드'),
    'esp.copa_del_rey': ('wfootball', 'copadelrey',      '코파 델 레이'),
    'esp.super_cup':    ('wfootball', 'spanishsupercup', '스페인 슈퍼컵'),
    'fifa.cwc':         ('wfootball', 'clubworldcup',    '클럽 월드컵'),
    'club.friendly':    ('wfootball', 'clubfriendly',    '클럽 친선경기'),
    'fifa.friendly':    ('kfootball', 'amatch',          'A매치 친선'),
    'afc.asian.cup':    ('kfootball', 'asiancup',        '아시안컵'),
    'fifa.worldq.afc':  ('kfootball', 'wcqafc',          '월드컵 아시아 예선'),
    'fifa.world':       ('kfootball', 'worldcup',        '월드컵'),
}

KO = {  # ESPN 영문 이름 → 한국어 (없으면 영문 그대로)
    'AFC Bournemouth': '본머스', 'Arsenal': '아스널', 'Aston Villa': '애스턴 빌라', 'Brentford': '브렌트퍼드',
    'Brighton & Hove Albion': '브라이턴', 'Chelsea': '첼시', 'Coventry City': '코번트리 시티',
    'Crystal Palace': '크리스탈 팰리스', 'Everton': '에버턴', 'Fulham': '풀럼', 'Hull City': '헐 시티',
    'Ipswich Town': '입스위치 타운', 'Leeds United': '리즈 유나이티드', 'Liverpool': '리버풀',
    'Manchester City': '맨체스터 시티', 'Manchester United': '맨체스터 유나이티드', 'Newcastle United': '뉴캐슬',
    'Nottingham Forest': '노팅엄 포레스트', 'Sunderland': '선덜랜드', 'Tottenham Hotspur': '토트넘',
    'West Ham United': '웨스트햄', 'Wolverhampton Wanderers': '울버햄튼', 'Burnley': '번리',
    'Leicester City': '레스터 시티', 'Southampton': '사우샘프턴', 'Sheffield United': '셰필드 유나이티드',
    'Middlesbrough': '미들즈브러', 'Norwich City': '노리치 시티', 'Watford': '왓퍼드', 'West Bromwich Albion': '웨스트브롬',
    'Alavés': '알라베스', 'Athletic Club': '아틀레틱 빌바오', 'Atlético Madrid': '아틀레티코 마드리드',
    'Barcelona': '바르셀로나', 'Celta Vigo': '셀타 비고', 'Deportivo': '데포르티보', 'Elche': '엘체',
    'Espanyol': '에스파뇰', 'Getafe': '헤타페', 'Levante': '레반테', 'Málaga': '말라가', 'Osasuna': '오사수나',
    'Racing Santander': '라싱 산탄데르', 'Rayo Vallecano': '라요 바예카노', 'Real Betis': '레알 베티스',
    'Real Madrid': '레알 마드리드', 'Real Sociedad': '레알 소시에다드', 'Sevilla': '세비야', 'Valencia': '발렌시아',
    'Villarreal': '비야레알', 'Girona': '지로나', 'Mallorca': '마요르카', 'Real Oviedo': '레알 오비에도',
    'Las Palmas': '라스팔마스', 'Valladolid': '바야돌리드', 'Leganés': '레가네스',
    'Bayern Munich': '바이에른 뮌헨', 'Borussia Dortmund': '도르트문트', 'Bayer Leverkusen': '레버쿠젠',
    'RB Leipzig': '라이프치히', 'Eintracht Frankfurt': '프랑크푸르트', 'VfB Stuttgart': '슈투트가르트',
    'Paris Saint-Germain': '파리 생제르맹', 'AS Monaco': 'AS 모나코', 'Marseille': '마르세유', 'Lille': '릴',
    'Lyon': '리옹', 'Internazionale': '인테르', 'Juventus': '유벤투스', 'AC Milan': 'AC 밀란', 'Napoli': '나폴리',
    'Atalanta': '아탈란타', 'AS Roma': 'AS 로마', 'Lazio': '라치오', 'Benfica': '벤피카', 'FC Porto': '포르투',
    'Sporting CP': '스포르팅', 'Ajax Amsterdam': '아약스', 'PSV Eindhoven': 'PSV', 'Feyenoord Rotterdam': '페예노르트',
    'Club Brugge': '클뤼프 브뤼허', 'Galatasaray': '갈라타사라이', 'Fenerbahce': '페네르바체', 'Celtic': '셀틱',
    'Rangers': '레인저스', 'Slavia Prague': '슬라비아 프라하', 'Shakhtar Donetsk': '샤흐타르', 'Bodo/Glimt': '보되/글림트',
    'Olympiacos': '올림피아코스', 'Copenhagen': '코펜하겐', 'Red Bull Salzburg': '잘츠부르크', 'Young Boys': '영 보이스',
    'South Korea': '대한민국', 'Japan': '일본', 'China PR': '중국', 'Australia': '호주', 'Iran': '이란', 'Iraq': '이라크',
    'Saudi Arabia': '사우디아라비아', 'Qatar': '카타르', 'United Arab Emirates': 'UAE', 'Jordan': '요르단',
    'Oman': '오만', 'Kuwait': '쿠웨이트', 'Palestine': '팔레스타인', 'Yemen': '예멘', 'Vietnam': '베트남',
    'Thailand': '태국', 'Uzbekistan': '우즈베키스탄', 'Syria': '시리아', 'Bahrain': '바레인', 'Lebanon': '레바논',
    'Malaysia': '말레이시아', 'Indonesia': '인도네시아', 'Kyrgyzstan': '키르기스스탄', 'Tajikistan': '타지키스탄',
    'Brazil': '브라질', 'Argentina': '아르헨티나', 'Paraguay': '파라과이', 'Uruguay': '우루과이', 'Colombia': '콜롬비아',
    'Mexico': '멕시코', 'United States': '미국', 'Canada': '캐나다', 'Ghana': '가나', 'Nigeria': '나이지리아',
    'Cameroon': '카메룬', 'Ivory Coast': '코트디부아르', 'Egypt': '이집트', 'Morocco': '모로코', 'Tunisia': '튀니지',
    'Germany': '독일', 'France': '프랑스', 'Spain': '스페인', 'England': '잉글랜드', 'Portugal': '포르투갈',
    'Italy': '이탈리아', 'Netherlands': '네덜란드', 'Belgium': '벨기에', 'Croatia': '크로아티아', 'Serbia': '세르비아',
    'Austria': '오스트리아', 'Switzerland': '스위스', 'Iceland': '아이슬란드', 'Peru': '페루', 'Chile': '칠레',
    'Ecuador': '에콰도르', 'Venezuela': '베네수엘라', 'Bolivia': '볼리비아', 'Norway': '노르웨이', 'Poland': '폴란드',
    'Denmark': '덴마크', 'Sweden': '스웨덴', 'Turkey': '튀르키예', 'Scotland': '스코틀랜드', 'Wales': '웨일스', 'New Zealand': '뉴질랜드', 'Panama': '파나마', 'Costa Rica': '코스타리카',
}

# ── HTTP ──────────────────────────────────────────────────────────────────
def http(url, params=None, tries=3, timeout=25, raw=False):
    if params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
                return body if raw else json.loads(body.decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            last = e
            if i + 1 < tries:
                time.sleep(1.5 * (i + 1))
    raise RuntimeError(f'{url} → {last}')


def kst_iso(v):
    """ESPN 'YYYY-MM-DDTHH:MMZ' / 네이버 epoch(ms) → 'YYYY-MM-DDTHH:MM:00+09:00'"""
    if isinstance(v, (int, float)):
        t = dt.datetime.fromtimestamp(v / 1000 if v > 1e11 else v, KST)
    else:
        t = dt.datetime.fromisoformat(v.replace('Z', '+00:00')).astimezone(KST)
    return t.strftime('%Y-%m-%dT%H:%M:00+09:00')


def months(start, n):
    y, m, out = start.year, start.month, []
    for _ in range(n):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


# ── 로고: 한 번만 받아서 64px 로 저장 (이후 같은 주소에서 캐시) ─────────────────
try:
    from PIL import Image
except Exception:  # noqa: BLE001
    Image = None


def ensure_logo(rel, url):
    """assets/logos/<rel>.png 가 없으면 받아서 저장. 성공하면 상대경로, 실패하면 원본 URL."""
    if not url:
        return None
    path = os.path.join(LOGO_DIR, rel + '.png')
    web = f'assets/logos/{rel}.png'
    if os.path.exists(path):
        return web
    try:
        body = http(url, raw=True, tries=2, timeout=20)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if Image:
            im = Image.open(io.BytesIO(body)).convert('RGBA')
            im.thumbnail((64, 64), Image.LANCZOS)
            im.save(path, optimize=True)
        else:
            open(path, 'wb').write(body)
        return web
    except Exception as e:  # noqa: BLE001
        print(f'  ! 로고 {rel}: {e}', file=sys.stderr)
        return None


def espn_logo_url(team):
    """경기 데이터에 들어 있는 로고 주소를 우선 사용 (없는 팀은 None). ESPN 이미지 서버의 축소 기능으로 받는다."""
    href = team.get('logo') or next((l.get('href') for l in team.get('logos') or [] if 'dark' not in (l.get('rel') or [])), None)
    if not href:
        return None
    m = re.match(r'https?://a\.espncdn\.com(/i/.+?\.png)', href)
    return f'https://a.espncdn.com/combiner/i?img={m.group(1)}&w=128&h=128' if m else href


# ── 축구 (ESPN) ────────────────────────────────────────────────────────────
def score_of(c):
    s = c.get('score')
    if isinstance(s, dict):
        v, so = s.get('displayValue', s.get('value')), s.get('shootoutScore')
    else:
        v, so = s, c.get('shootoutScore')
    try:
        v = int(float(v))
    except (TypeError, ValueError):
        v = None
    try:
        so = int(float(so)) if so is not None else None
    except (TypeError, ValueError):
        so = None
    return v, so


def norm_espn_status(st):
    t = (st or {}).get('type', {})
    name, state = t.get('name', ''), t.get('state', '')
    if name in ('STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_ABANDONED', 'STATUS_SUSPENDED'):
        return 'off'
    return {'pre': 'before', 'in': 'live', 'post': 'end'}.get(state, 'before')


def parse_espn_event(e, league_slug, team_info):
    c = e['competitions'][0]
    comp = COMP.get(league_slug)
    upper, cat, cname = comp if comp else ('wfootball', None, (e.get('league') or {}).get('abbreviation') or league_slug)
    sides = {}
    for t in c['competitors']:
        tm = t['team']
        tid = str(tm.get('id'))
        info = team_info.get(tid, {})
        score, so = score_of(t)
        sides[t['homeAway']] = {
            'key': f'f:{tid}', 'name': info.get('name') or KO.get(tm.get('displayName'), tm.get('displayName')),
            '_logo_url': info.get('logo_url') or espn_logo_url(tm), '_logo_fixed': info.get('logo'),
            '_score': score, '_so': so, '_espn': tid,
        }
    status = norm_espn_status(c.get('status') or e.get('status'))
    h, a = sides['home'], sides['away']
    g = {
        'id': f'f{e["id"]}', 'sport': 'football', 'lg': league_slug, 'comp': cname,
        'round': (e.get('seasonType') or {}).get('abbreviation') if league_slug not in ('eng.1', 'esp.1') else None,
        'start': kst_iso(e['date']), 'status': status,
        'score': [h['_score'], a['_score']] if status in ('live', 'end') and h['_score'] is not None else None,
        'pen': [h['_so'], a['_so']] if h['_so'] is not None and a['_so'] is not None else None,
        'neutral': bool(c.get('neutralSite')),
        'venue': ((c.get('venue') or {}).get('fullName')) or None,
        'nv': [upper, cat] if cat else None,
        'home': h, 'away': a,
    }
    if g['round'] in ('League Phase',):
        g['round'] = None
    return g


def collect_football(month_from):
    teams, games, errors = {}, {}, []
    team_info = {}
    for league, group in FOOTBALL_GROUPS:
        try:
            d = http(f'{ESPN}/{league}/teams')
            for t in d['sports'][0]['leagues'][0]['teams']:
                tm = t['team']
                tid = str(tm['id'])
                team_info[tid] = {'name': KO.get(tm['displayName'], tm['displayName']), 'group': group,
                                  'logo_url': espn_logo_url(tm)}
        except Exception as e:  # noqa: BLE001
            errors.append(group)
            print(f'! {group} 팀 목록: {e}', file=sys.stderr)
    for n in NATIONAL:
        team_info[n['id']] = {'name': n['name'], 'group': n['group'], 'logo': n['logo']}

    for tid, info in team_info.items():
        evs = []
        for q in ('?fixture=true', ''):          # 예정 경기 + 이번 시즌 결과
            try:
                evs += http(f'{ESPN}/all/teams/{tid}/schedule{q}').get('events', [])
            except Exception as e:  # noqa: BLE001
                print(f'! {info["name"]} 일정: {e}', file=sys.stderr)
                if info['name'] not in errors:
                    errors.append(info['name'])
        for e in evs:
            if not e.get('date') or kst_iso(e['date'])[:10] < month_from:
                continue
            slug = (e.get('league') or {}).get('slug') or ''
            g = parse_espn_event(e, slug, team_info)
            games[g['id']] = g
        teams[f'f:{tid}'] = {'key': f'f:{tid}', 'name': info['name'], 'group': info['group'], 'sport': 'football',
                             '_logo_url': info.get('logo_url'), '_logo_fixed': info.get('logo'), '_espn': tid}
    return teams, list(games.values()), errors


# ── 롤 (네이버 e스포츠) ─────────────────────────────────────────────────────
def lol_status(s):
    s = (s or '').upper()
    return 'end' if s == 'RESULT' else 'live' if s in ('STARTED', 'LIVE', 'PLAYING') else 'off' if s in ('CANCEL', 'CANCELED', 'POSTPONED') else 'before'


def parse_lol(m, lname):
    def side(t):
        if not t or t.get('teamId') in (None, 'TBD'):
            return {'key': 'l:TBD', 'name': '미정', '_logo_url': None}
        return {'key': f'l:{t["teamId"]}', 'name': t.get('name') or t.get('nameEngAcronym'),
                'abbr': t.get('nameEngAcronym'), '_logo_url': t.get('imageUrl') or t.get('colorImageUrl')}
    status = lol_status(m.get('matchStatus'))
    return {
        'id': f'l{m["gameId"]}', 'sport': 'lol', 'lg': m.get('topLeagueId'), 'comp': lname, 'round': m.get('title'),
        'start': kst_iso(m['startDate']), 'status': status,
        'score': [m.get('homeScore'), m.get('awayScore')] if status in ('live', 'end') else None,
        'bo': m.get('maxMatchCount'), 'neutral': True, 'venue': m.get('stadium') or None, 'home': side(m.get('homeTeam')), 'away': side(m.get('awayTeam')),
    }


def collect_lol_league(lid, lname, month_list):
    return collect_lol(month_list, [(lid, lname)])


def collect_lol(month_list, leagues=LOL_LEAGUES):
    games, errors = {}, []
    for lid, lname in leagues:
        for y, mo in month_list:
            try:
                d = http(LOL_API, {'month': f'{y:04d}-{mo:02d}', 'topLeagueId': lid, 'relay': 'false'})
                for m in (d.get('content') or {}).get('matches') or []:
                    g = parse_lol(m, lname)
                    games[g['id']] = g
            except Exception as e:  # noqa: BLE001
                print(f'! {lname} {y}-{mo}: {e}', file=sys.stderr)
                if lname not in errors:
                    errors.append(lname)
    return list(games.values()), errors


def lol_teams(games, old_teams):
    """LCK 경기에 나온 팀 = 'LCK' 묶음, 그 외 대회에만 나온 팀 = '해외 (LoL)' 묶음. 예전에 있던 팀도 유지."""
    teams = {t['key']: t for t in old_teams if t.get('sport') == 'lol'}
    cnt = {}
    for g in games:
        for s in (g['home'], g['away']):
            cnt[s['key']] = cnt.get(s['key'], 0) + 1
    for g in sorted(games, key=lambda g: 0 if g['lg'] == 'lck' else 1):
        for s in (g['home'], g['away']):
            if s['key'] == 'l:TBD' or (g['lg'] == 'lck' and cnt[s['key']] < 4 and s['key'] not in teams):
                continue                                       # 이벤트전(올스타 등)에만 나온 팀은 제외
            grp = 'LCK' if g['lg'] == 'lck' else '해외 (LoL)'
            cur = teams.get(s['key'])
            if cur and cur['group'] == 'LCK':
                grp = 'LCK'
            teams[s['key']] = {'key': s['key'], 'name': s['name'], 'group': grp, 'sport': 'lol',
                               '_logo_url': s.get('_logo_url') or (cur or {}).get('_logo_url'),
                               'logo': (cur or {}).get('logo')}
    return teams


# ── 네이버 축구 teamCode (가능할 때만) ──────────────────────────────────────
def load_codes():
    try:
        return json.load(open(CODES, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return {}


def learn_naver_codes(games, codes):
    """네이버 일정 API 의 경기와 같은 대회·같은 시각 경기를 짝지어 ESPN 팀 id → 네이버 teamCode 를 배운다."""
    need = {}
    for g in games:
        if g['sport'] != 'football' or not g.get('nv'):
            continue
        for s in (g['home'], g['away']):
            if s['_espn'] not in codes:
                need.setdefault((g['nv'][0], g['nv'][1], g['start'][:7]), []).append(g)
                break
    if not need:
        return 0
    learned = 0
    for (upper, cat, ym), gs in sorted(need.items()):
        y, m = map(int, ym.split('-'))
        last = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)).day
        try:
            d = http(NAVER_API, {'fields': 'basic', 'upperCategoryId': upper, 'categoryId': cat,
                                 'fromDate': f'{ym}-01', 'toDate': f'{ym}-{last:02d}', 'size': 500}, tries=1, timeout=12)
        except Exception as e:  # noqa: BLE001
            print(f'  네이버 teamCode 갱신 건너뜀 ({e.__class__.__name__}) — 저장된 값 사용', file=sys.stderr)
            return learned                                    # 한 번 막히면 이번 실행에서는 더 시도하지 않음
        ngames = ((d.get('result') or {}).get('games')) or d.get('games') or []
        by_time = {}
        for ng in ngames:
            t = ng.get('gameDateTime') or ng.get('gameDate')
            if not t:
                continue
            by_time.setdefault(str(t)[:16].replace(' ', 'T'), []).append(ng)
        for g in gs:
            cands = by_time.get(g['start'][:16], [])
            if len(cands) != 1:
                continue                                       # 같은 시각 경기가 여럿이면 확실하지 않으므로 건너뜀
            ng = cands[0]
            for side, s in (('home', g['home']), ('away', g['away'])):
                code = ng.get(f'{side}TeamCode')
                if code and s['_espn'] not in codes:
                    codes[s['_espn']] = str(code)
                    learned += 1
    return learned


# ── 마무리: 로고·코드 붙이고 내부 필드 정리 ─────────────────────────────────
def finalize_side(s, codes, logo_cache):
    out = {'key': s['key'], 'name': s['name']}
    if s.get('abbr'):
        out['abbr'] = s['abbr']
    if s.get('_espn') and codes.get(s['_espn']):
        out['code'] = codes[s['_espn']]
    if s.get('_logo_fixed'):
        out['logo'] = s['_logo_fixed']
    elif s['key'] in logo_cache:
        if logo_cache[s['key']]:
            out['logo'] = logo_cache[s['key']]
    elif s.get('_logo_url'):
        rel = ('f/' if s['key'].startswith('f:') else 'l/') + s['key'][2:]
        logo = logo_cache[s['key']] = ensure_logo(rel, s['_logo_url'])
        if logo:
            out['logo'] = logo
    elif s.get('logo'):
        out['logo'] = s['logo']
    return out


def write_if_changed(out, old):
    keep = lambda d: json.dumps({k: d.get(k) for k in ('teams', 'games', 'errors')}, sort_keys=True, ensure_ascii=False)
    if old and keep(out) == keep(old):
        print('변경 없음 — 저장하지 않음')
        return False
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'저장: 경기 {len(out["games"])} / 팀 {len(out["teams"])} / 실패 {out["errors"]}')
    return True


def load_old():
    try:
        return json.load(open(OUT, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return {}


def full():
    now = dt.datetime.now(KST)
    prev_month = (now.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
    month_from = prev_month.strftime('%Y-%m-%d')
    old = load_old()

    fteams, fgames, ferr = collect_football(month_from)
    lgames, lerr = collect_lol(months(prev_month, 8))
    lgames = [g for g in lgames if g['start'][:10] >= month_from]
    lteams = lol_teams(lgames, old.get('teams', []))
    if sum(t['group'] == 'LCK' for t in lteams.values()) < 10:      # 비시즌엔 최근 경기에 LCK 팀이 다 안 나오므로 올해 LCK 전체로 팀 목록 보충
        extra, _ = collect_lol_league('lck', 'LCK', months(dt.date(now.year, 1, 1), now.month))
        lteams = lol_teams(extra + lgames, list(lteams.values()))
    if not fgames and not lgames:
        sys.exit('모든 수집 실패 — 기존 데이터 유지')

    codes = load_codes()
    n = learn_naver_codes(fgames, codes)
    if n:
        with open(CODES, 'w', encoding='utf-8') as f:
            json.dump(dict(sorted(codes.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0)), f, ensure_ascii=False, indent=1)
        print(f'네이버 teamCode {n}개 새로 확인')

    logo_cache = {}
    teams = []
    for t in list(fteams.values()) + list(lteams.values()):
        s = finalize_side({**t, '_logo_fixed': t.get('_logo_fixed')}, codes, logo_cache)
        teams.append({**s, 'group': t['group'], 'sport': t['sport']})
    games = []
    for g in sorted(fgames + lgames, key=lambda g: (g['start'], g['id'])):
        g = {k: v for k, v in g.items() if v is not None}
        g['home'] = finalize_side(g['home'], codes, logo_cache)
        g['away'] = finalize_side(g['away'], codes, logo_cache)
        games.append(g)
    order = {'프리미어리그': 0, '라리가': 1, '국가대표': 2, 'LCK': 3, '해외 (LoL)': 4}
    teams.sort(key=lambda t: (order.get(t['group'], 9), t['name']))
    out = {'updated': now.isoformat(timespec='seconds'), 'errors': ferr + lerr, 'teams': teams, 'games': games}
    write_if_changed(out, old)


def hot():
    """진행 중이거나 20분 안에 시작하는 경기만 다시 확인. 없으면 아무것도 안 하고 끝."""
    old = load_old()
    if not old.get('games'):
        return full()
    now = dt.datetime.now(KST)
    targets = []
    for g in old['games']:
        st = dt.datetime.fromisoformat(g['start'])
        mins = (now - st).total_seconds() / 60
        if g['status'] == 'live' or (g['status'] == 'before' and -20 <= mins <= 240):
            targets.append(g)
    if not targets:
        print('확인할 경기 없음')
        return
    by_id = {g['id']: g for g in old['games']}
    changed = 0
    # 축구: 대회·날짜별 ESPN scoreboard 한 번씩
    boards = {}
    for g in [g for g in targets if g['sport'] == 'football']:
        utc = dt.datetime.fromisoformat(g['start']).astimezone(dt.timezone.utc)
        for day in {utc.date(), (utc - dt.timedelta(hours=12)).date()}:
            k = (g['lg'], day.strftime('%Y%m%d'))
            if k not in boards:
                try:
                    boards[k] = {e['id']: e for e in http(f'{ESPN}/{k[0]}/scoreboard', {'dates': k[1]}).get('events', [])}
                except Exception as e:  # noqa: BLE001
                    print(f'! {k}: {e}', file=sys.stderr)
                    boards[k] = {}
            e = boards[k].get(g['id'][1:])
            if not e:
                continue
            c = e['competitions'][0]
            st = norm_espn_status(c.get('status') or e.get('status'))
            sc = {t['homeAway']: score_of(t) for t in c['competitors']}
            new = dict(g, status=st)
            if st in ('live', 'end') and sc['home'][0] is not None:
                new['score'] = [sc['home'][0], sc['away'][0]]
            if sc['home'][1] is not None and sc['away'][1] is not None:
                new['pen'] = [sc['home'][1], sc['away'][1]]
            if new != g:
                by_id[g['id']] = new
                changed += 1
            break
    # 롤: 해당 대회·월만 다시
    lol_keys = {(g['lg'], g['start'][:7]) for g in targets if g['sport'] == 'lol'}
    for lid, ym in lol_keys:
        lname = dict(LOL_LEAGUES).get(lid, lid)
        try:
            d = http(LOL_API, {'month': ym, 'topLeagueId': lid, 'relay': 'false'})
        except Exception as e:  # noqa: BLE001
            print(f'! {lid} {ym}: {e}', file=sys.stderr)
            continue
        for m in (d.get('content') or {}).get('matches') or []:
            ng = parse_lol(m, lname)
            g = by_id.get(ng['id'])
            if not g:
                continue
            new = dict(g, status=ng['status'])
            if ng['score'] is not None:
                new['score'] = ng['score']
            if new != g:
                by_id[g['id']] = new
                changed += 1
    if not changed:
        print('변경 없음')
        return
    out = dict(old, updated=now.isoformat(timespec='seconds'), games=sorted(by_id.values(), key=lambda g: (g['start'], g['id'])))
    write_if_changed(out, old)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['full', 'hot'], default='full')
    a = ap.parse_args()
    full() if a.mode == 'full' else hot()
