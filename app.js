/* 마이 스포츠 일정 허브 — 화면 로직
 * 순수 함수(core)는 Node 테스트(test/core.test.js)에서도 그대로 검증한다.
 * 링크 규칙·중계처·대회 표시는 CFG 한 곳에 모아두었다. */
'use strict';

const CFG = {
  dataUrl: 'data/schedule.json',
  refreshMs: 10 * 60 * 1000,      // 평소 갱신 (화면이 보일 때만)
  liveRefreshMs: 2 * 60 * 1000,   // 내 구단 경기가 진행 중일 때
  pageSize: 30,                   // 한 번에 그리는 경기 수
  naver: {
    football: (upper, cat, date, code) =>
      `https://m.sports.naver.com/${upper}/schedule/index?category=${cat}&date=${date}` + (code ? `&teamCode=${code}` : ''),
    lol: (league, month) => `https://game.naver.com/esports/League_of_Legends/schedule/${league}?date=${month}`,
  },
  lineupUrl: (lg, id) => `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg || 'all'}/summary?event=${id}`,
  watch: {
    coupang: { name: '쿠팡플레이', url: 'https://www.coupangplay.com/sports', logo: 'assets/watch/coupang.png' },
    spotv:   { name: '스포티비',   url: 'https://www.spotvnow.co.kr/',         logo: 'assets/watch/spotv.png' },
    chzzk:   { name: '치지직 울프', url: 'https://chzzk.naver.com/live/0b33823ac81de48d5b78a38cdbc0ab94', logo: 'assets/watch/chzzk.png' },
    soop:    { name: '숲 스맵',     url: 'https://play.sooplive.com/townboy/298226683', logo: 'assets/watch/soop.png' },
    youtube: { name: '박종윤 (YouTube)', url: 'https://www.youtube.com/@PJY_football', logo: 'assets/watch/youtube.png', always: true },
  },
  // 대회 → 중계처 (always: 종료된 경기에도 표시 — 경기 후 리뷰 영상용)
  watchBy: (g) =>
    g.sport === 'lol' ? ['chzzk', 'soop']
      : (g.lg === 'eng.1' || g.lg === 'esp.1' ? ['coupang'] : /^uefa\./.test(g.lg || '') ? ['spotv'] : []).concat('youtube'),
  // 실제 마지막 동기화 시각: GitHub Actions 실행 기록 (공개 API, 로그인 불필요)
  runsUrl: (o, r) => `https://api.github.com/repos/${o}/${r}/actions/workflows/sync.yml/runs?per_page=5`,
  // 대회 배지: [영문 약칭, 한글, 색 클래스, 필터 묶음]
  comp: {
    'eng.1': ['EPL', '프리미어리그', 'epl', 'league'],
    'esp.1': ['LALIGA', '라리가', 'laliga', 'league'],
    'lck': ['LCK', '리그 오브 레전드', 'lck', 'league'],
    'uefa.champions': ['UCL', '챔피언스리그', 'ucl', 'uefa'],
    'uefa.europa': ['UEL', '유로파리그', 'uel', 'uefa'],
    'uefa.europa.conf': ['UECL', '컨퍼런스리그', 'uel', 'uefa'],
    'uefa.super_cup': ['UEFA', '슈퍼컵', 'ucl', 'uefa'],
    'world_championship': ['WORLDS', '{y} 롤드컵', 'worlds', 'lolint'],
    'msi': ['MSI', '{y} MSI', 'worlds', 'lolint'],
    'eng.fa': ['FA CUP', 'FA컵', 'cup', 'cup'],
    'eng.league_cup': ['EFL CUP', '카라바오컵', 'cup', 'cup'],
    'eng.charity': ['SHIELD', '커뮤니티 실드', 'cup', 'cup'],
    'esp.copa_del_rey': ['COPA', '코파 델 레이', 'cup', 'cup'],
    'esp.super_cup': ['SUPERCOPA', '스페인 슈퍼컵', 'cup', 'cup'],
    'fifa.friendly': ['A매치', '친선경기', 'nat', 'nat'],
    'afc.asian.cup': ['AFC', '아시안컵', 'nat', 'nat'],
    'fifa.worldq.afc': ['WCQ', '월드컵 예선', 'nat', 'nat'],
    'fifa.world': ['FIFA', '월드컵', 'nat', 'nat'],
  },
  filters: [
    ['all', '모든 대회 통합', 'All'],
    ['league', '정규리그', 'EPL · 라리가 · LCK'],
    ['uefa', 'UEFA 대항전', 'UCL · UEL'],
    ['lolint', '롤 국제대회', '월즈 · MSI'],
    ['cup', '컵대회', 'FA컵 · 카라바오 · 코파'],
    ['nat', '국가대표', 'A매치 · 아시안컵'],
  ],
  // 빅매치 판정용 (ESPN 영문 이름이 아니라 수집기가 붙인 한국어 이름 기준)
  bigClubs: ['아스널', '첼시', '리버풀', '맨체스터 시티', '맨체스터 유나이티드', '토트넘', '뉴캐슬', '애스턴 빌라',
    '레알 마드리드', '바르셀로나', '아틀레티코 마드리드', '바이에른 뮌헨', '도르트문트', '레버쿠젠', '파리 생제르맹',
    '인테르', '유벤투스', 'AC 밀란', '나폴리', '벤피카', '포르투', '스포르팅'],
  bigNations: ['일본', '이란', '호주', '사우디아라비아', '브라질', '아르헨티나', '독일', '프랑스', '스페인', '잉글랜드', '포르투갈', '이탈리아', '네덜란드', '우루과이', '멕시코', '미국'],
};

/* ---------------- 순수 함수 ---------------- */
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const core = {
  ymd: (s) => s.slice(0, 10),        // 데이터 시각은 항상 KST(+09:00) 문자열
  ym: (s) => s.slice(0, 7),
  hm: (s) => s.slice(11, 16),
  todayKST: (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10),
  addDays: (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10),
  dayDiff: (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5),
  wd: (ymd) => WD[new Date(ymd + 'T00:00:00Z').getUTCDay()],
  md: (ymd) => `${+ymd.slice(5, 7)}월 ${+ymd.slice(8, 10)}일`,

  /** 날짜 머리말 배지: 오늘 / 내일 (D-1) / 모레 (D-2) / D-n / n일 전 */
  dday(ymd, today) {
    const n = core.dayDiff(today, ymd);
    return n === 0 ? '오늘 (D-DAY)' : n === 1 ? '내일 (D-1)' : n === 2 ? '모레 (D-2)' : n > 0 ? `D-${n}` : n === -1 ? '어제' : `${-n}일 전`;
  },

  /** "네이버category|YYYY-MM|팀key" → 그 팀이 그 대회에서 그 달에 치르는 첫 경기 날짜 (한 달 내내 같은 링크) */
  buildFirstMap(games) {
    const m = new Map();
    for (const g of games) {
      if (g.sport !== 'football' || !g.nv) continue;
      const d = core.ymd(g.start);
      const base = `${g.nv[1]}|${core.ym(g.start)}|`;
      for (const t of [g.home, g.away]) {
        const k = base + t.key;
        const cur = m.get(k);
        if (!cur || d < cur) m.set(k, d);
      }
    }
    return m;
  },

  naverLink(g, focus, firstMap, codes = {}, cfg = CFG) {
    if (g.sport === 'lol') return cfg.naver.lol(g.lg, core.ym(g.start));
    if (!g.nv) return null;
    const date = firstMap.get(`${g.nv[1]}|${core.ym(g.start)}|${focus.key}`) || core.ymd(g.start);
    return cfg.naver.football(g.nv[0], g.nv[1], date, codes[focus.key] || focus.code);
  },

  focusTeam: (g, sel) => (sel.has(g.home.key) || !sel.has(g.away.key) ? g.home : g.away),
  showHomeAway: (g) => g.sport === 'football' && !g.neutral,
  watchFor: (g, cfg = CFG) => cfg.watchBy(g).map((id) => ({ id, ...cfg.watch[id] })),
  canLineup: (g) => g.sport === 'football' && g.status !== 'off',

  /** 아이디.github.io/저장소/ → {owner, repo}. GitHub Pages 가 아니면 null */
  repoFromLocation(host, path) {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(host || '');
    if (!m) return null;
    const seg = (path || '/').split('/').filter(Boolean)[0];
    return { owner: m[1], repo: seg && !/\.html?$/.test(seg) ? seg : `${m[1]}.github.io` };
  },

  /** 끝난 경기 하이라이트: 유튜브 검색 결과로 바로 */
  highlightUrl(g) {
    const ci = core.compInfo(g);
    const q = g.sport === 'lol' ? `${g.home.abbr || g.home.name} vs ${g.away.abbr || g.away.name} ${ci.abbr || 'LoL'} 하이라이트`
      : `${g.home.name} ${g.away.name} 하이라이트 ${ci.name}`;
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  },

  /** ESPN 순위 구간 설명 → 한글 */
  zoneLabel: (zn) => ({
    'Champions League': '챔스 진출', 'Europa League': '유로파 진출', 'Conference League qualifying': '컨퍼런스 예선',
    'Relegation': '강등', 'Qualifies for round of 16': '16강 직행', 'Knockout phase playoffs - seeded': 'PO (시드)',
    'Knockout phase playoffs - unseeded': 'PO (비시드)', 'Eliminated': '탈락',
  }[zn] || zn || ''),

  agoText(ms) {
    const m = Math.max(0, Math.round(ms / 60e3));
    return m < 1 ? '방금 전' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 ${m % 60 ? `${m % 60}분 ` : ''}전` : `${Math.floor(m / 1440)}일 전`;
  },

  compInfo(g, cfg = CFG) {
    const c = cfg.comp[g.lg];
    if (!c) return { abbr: '', name: g.comp, cls: g.sport === 'lol' ? 'lck' : 'cup', grp: g.sport === 'lol' ? 'lolint' : 'cup' };
    return { abbr: c[0], name: c[1].replace('{y}', g.start.slice(0, 4)), cls: c[2], grp: c[3] };
  },

  isBig(g, lckKeys = new Set(), cfg = CFG) {
    const r = g.round || '';
    if (/결승|4강|8강|플레이오프|Final|Semi|Quarter|Round of 16|Knockout/i.test(r)) return true;
    if (g.sport === 'lol') return (g.lg === 'world_championship' || g.lg === 'msi') && (lckKeys.has(g.home.key) || lckKeys.has(g.away.key));
    const club = (t) => cfg.bigClubs.includes(t.name);
    if (club(g.home) && club(g.away)) return true;
    const kor = g.home.name === '대한민국' || g.away.name === '대한민국';
    return kor && (cfg.bigNations.includes(g.home.name) || cfg.bigNations.includes(g.away.name));
  },

  filterGames(games, sel, fromYmd, toYmd = '9999') {
    return games
      .filter((g) => (sel.has(g.home.key) || sel.has(g.away.key)) && core.ymd(g.start) >= fromYmd && core.ymd(g.start) < toYmd)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  },

  /** 경기 일정을 휴대폰/구글 캘린더에 넣을 .ics 텍스트 */
  ics(g, url) {
    const t0 = Date.parse(g.start);
    const t1 = t0 + (g.sport === 'lol' ? 3 : 2) * 3600e3;
    const f = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const e = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const ci = core.compInfo(g);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sports-hub//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${g.id}@sports-hub`, `DTSTAMP:${f(t0)}`, `DTSTART:${f(t0)}`, `DTEND:${f(t1)}`,
      `SUMMARY:${e(`${g.home.name} vs ${g.away.name} (${ci.name})`)}`,
      g.venue ? `LOCATION:${e(g.venue)}` : '', url ? `URL:${url}` : '',
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:곧 경기 시작', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  },

  /** ESPN 라인업 → {home,away} 각 {team, formation, rows:[[선수…] GK부터 공격까지], subs}. 미발표면 null */
  parseLineup(j) {
    const out = {};
    for (const r of j.rosters || []) {
      const st = (r.roster || []).filter((p) => p.starter);
      if (st.length < 11) return null;
      out[r.homeAway] = {
        team: r.team && r.team.displayName, formation: r.formation || '',
        rows: core.formationRows(st, r.formation),
        subs: (r.roster || []).filter((p) => !p.starter).map(core.player),
      };
    }
    return out.home && out.away ? out : null;
  },
  player: (p) => ({ id: String((p.athlete && p.athlete.id) || ''), n: p.jersey || '', name: (p.athlete && (p.athlete.shortName || p.athlete.displayName)) || '', pos: (p.position && p.position.abbreviation) || '' }),

  /** 포지션 코드로 앞뒤(깊이)·좌우를 정하고, 포메이션 숫자대로 줄을 나눈다 */
  formationRows(starters, formation) {
    const depth = (a) => (a === 'G' ? 0 : /^(CD|CB|LB|RB|SW)/.test(a) ? 1 : /WB/.test(a) ? 1.5 : /^DM/.test(a) ? 2
      : /^(CM|LM|RM|M)/.test(a) ? 3 : /^AM/.test(a) ? 4 : /^(LW|RW)/.test(a) ? 4.5 : 5);
    const side = (a) => (/^L(B|WB|M|W)$/.test(a) ? -2 : /^R(B|WB|M|W)$/.test(a) ? 2 : /-L$/.test(a) ? -1 : /-R$/.test(a) ? 1 : 0);
    const ps = starters.map((p) => ({ ...core.player(p), place: +p.formationPlace || 0 }));
    const gk = ps.filter((p) => p.pos === 'G');
    const field = ps.filter((p) => p.pos !== 'G')
      .sort((a, b) => depth(a.pos) - depth(b.pos) || side(a.pos) - side(b.pos) || a.place - b.place);
    const counts = (formation || '').split('-').map(Number).filter((n) => n > 0);
    const rows = [gk.length ? gk : field.splice(0, 1)];
    if (counts.reduce((s, n) => s + n, 0) === field.length) {
      let i = 0;
      for (const n of counts) { rows.push(field.slice(i, i + n).sort((a, b) => side(a.pos) - side(b.pos) || a.place - b.place)); i += n; }
    } else {
      const by = new Map();
      for (const p of field) { const d = depth(p.pos); by.set(d, [...(by.get(d) || []), p]); }
      for (const d of [...by.keys()].sort()) rows.push(by.get(d));
    }
    return rows;
  },
};

if (typeof module !== 'undefined') module.exports = { core, CFG };

/* ---------------- 화면 ---------------- */
if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (id, cls = '') => `<svg class="ic ${cls}"><use href="#i-${id}"/></svg>`;
  const load_ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const save_ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 저장 불가 환경: 이번 방문 동안만 */ } };

  const S = {
    data: null, byId: new Map(), first: new Map(), updated: '', lastLoad: 0, lu: new Map(),
    sel: new Set(load_('sh.teams', [])), codes: load_('sh.codes', {}), spoil: load_('sh.spoil', false),
    tab: load_('sh.tab', 'up'), flt: 'all', focus: null, big: false, q: '', shown: CFG.pageSize, week: 0,
    revealed: new Set(), lck: new Set(), teamByKey: new Map(),
  };

  const logo = (t, cls = 'lg') => t && t.logo
    ? `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy" decoding="async">`
    : `<span class="${cls} ph">${esc(((t && (t.abbr || t.name)) || '?').replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 3))}</span>`;
  const mine = (g) => S.sel.has(g.home.key) || S.sel.has(g.away.key);
  const ext = (href, cls, inner, title = '') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}" aria-label="${esc(title)}"` : ''}>${inner}</a>`;

  /* ---------- 데이터 걸러내기 ---------- */
  function scoped() {
    const today = core.todayKST();
    let gs = S.data.games.filter((g) => (S.focus ? g.home.key === S.focus || g.away.key === S.focus : mine(g)));
    if (S.tab === 'up') gs = gs.filter((g) => core.ymd(g.start) >= today && g.status !== 'end' || g.status === 'live');
    else if (S.tab === 'res') gs = gs.filter((g) => g.status === 'end').reverse();
    if (S.big) gs = gs.filter((g) => core.isBig(g, S.lck));
    if (S.q) {
      const q = S.q.toLowerCase();
      gs = gs.filter((g) => {
        const c = core.compInfo(g);
        return [g.home.name, g.away.name, g.home.abbr, g.away.abbr, c.abbr, c.name, g.comp, g.round, g.venue]
          .some((v) => v && String(v).toLowerCase().includes(q));
      });
    }
    return gs;
  }
  const byFilter = (gs) => (S.flt === 'all' ? gs : gs.filter((g) => core.compInfo(g).grp === S.flt));

  /* ---------- 상단 요약 ---------- */
  function renderHeader() {
    const t = core.todayKST();
    $('today').textContent = `기준일: ${t.slice(0, 4)}년 ${core.md(t)} (${core.wd(t)}) KST`;
    const ss = $('syncState');
    if (S.data) {
      // 실제 값: ① GitHub Actions 마지막 실행 시각(수집기가 확인한 시각) ② 일정 파일이 마지막으로 바뀐 시각
      const changed = core.agoText(Date.now() - Date.parse(S.data.updated));
      const run = S.run;
      const bad = (S.data.errors && S.data.errors.length) || (run && run.conclusion !== 'success');
      const age = run ? Date.now() - Date.parse(run.updated_at) : Date.now() - Date.parse(S.data.updated);
      ss.className = 'sync' + (bad ? ' warn' : age > 60 * 60e3 ? ' stale' : '');
      const main = run
        ? (run.conclusion === 'success' ? `${core.agoText(age)} 자동 동기화 완료` : `${core.agoText(age)} 동기화 실패 — Actions 탭 확인`)
        : `${changed} 일정 갱신`;
      const errs = S.data.errors && S.data.errors.length ? ` · 일부 수집 실패: ${esc(S.data.errors.join(', '))}` : '';
      ss.innerHTML = `<i class="dot"></i><span>${main}</span><small>${run ? ` · 일정 변경 ${changed}` : ''}${errs}</small>`;
      ss.title = `일정 파일 기준 시각: ${new Date(S.data.updated).toLocaleString('ko-KR')}` + (run ? `\n마지막 수집 실행: ${new Date(run.updated_at).toLocaleString('ko-KR')}` : '');
    }
    $('cnt').textContent = S.sel.size;
    const sp = $('spoiler');
    sp.setAttribute('aria-pressed', S.spoil);
    sp.querySelector('use').setAttribute('href', S.spoil ? '#i-eyeoff' : '#i-eye');
    sp.querySelector('b').textContent = S.spoil ? 'ON' : 'OFF';
  }

  function renderStats() {
    if (!S.data) return;
    const today = core.todayKST(), until = core.addDays(today, 30);
    const up = S.data.games.filter((g) => mine(g) && g.status !== 'end' && core.ymd(g.start) >= today && core.ymd(g.start) < until);
    $('stTeams').textContent = S.sel.size;
    const grps = new Set(S.data.games.filter((g) => mine(g) && core.ymd(g.start) >= today).map((g) => core.compInfo(g).grp));
    const nm = { league: '리그', uefa: 'UCL', lolint: '월즈', cup: '컵대회', nat: '대표팀' };
    $('stComps').innerHTML = [...grps].map((g) => `<span>${nm[g]}</span>`).join('<i>+</i>') + (grps.size ? ' 통합' : '');
    $('stUp').textContent = up.length;
    const extra = up.filter((g) => !['league'].includes(core.compInfo(g).grp));
    const names = [...new Set(extra.map((g) => core.compInfo(g).name))].slice(0, 2).join('·');
    $('stUpSub').innerHTML = extra.length ? `(${esc(names)}${extra.length > 2 ? ' 등' : ''} <b>${extra.length}건</b> 포함)` : '';

    const nx = S.data.games.find((g) => mine(g) && (g.status === 'live' || (g.status === 'before' && Date.parse(g.start) > Date.now() - 3 * 3600e3)));
    const box = $('next');
    if (!nx) {
      box.innerHTML = `<p class="stat-k next-k">NEXT MATCH · 가장 빠른 일정</p><div class="next-b"><p class="next-t">${S.sel.size ? '예정된 경기가 없어요' : '관심 구단을 먼저 골라 주세요'}</p></div>`;
      return;
    }
    const d = core.ymd(nx.start), ci = core.compInfo(nx);
    const left = Date.parse(nx.start) - Date.now();
    const cd = nx.status === 'live' ? '<b class="live-t">LIVE 진행 중</b>'
      : left < 0 ? '곧 시작' : left < 36e5 ? `${Math.ceil(left / 6e4)}분 후 시작` : left < 864e5 ? `${Math.floor(left / 36e5)}시간 ${Math.floor((left % 36e5) / 6e4)}분 후` : core.dday(d, core.todayKST());
    const nv = core.naverLink(nx, core.focusTeam(nx, S.sel), S.first, S.codes);
    box.innerHTML = `<p class="stat-k next-k">NEXT MATCH · 가장 빠른 일정 <span class="cd">${cd}</span></p>
      <div class="next-b"><div class="next-m"><p class="next-t"><span class="nt">${logo(nx.home, 'lg sm')}<b>${esc(nx.home.name)}</b></span><i>vs</i><span class="nt">${logo(nx.away, 'lg sm')}<b>${esc(nx.away.name)}</b></span></p>
      <p class="next-s">${core.md(d)} (${core.wd(d)}) ${core.hm(nx.start)} · <span class="c-${ci.cls}-t">${esc(ci.name)}</span></p></div>
      <div class="next-a">${nv ? ext(nv, 'nvbtn', `${nx.sport === 'lol' ? '네이버 중계' : '네이버 일정'}${ic('ext')}`) : ''}${core.watchFor(nx).map((w) => ext(w.url, 'wbtn', `<img src="${w.logo}" alt="" width="20" height="20">`, `${w.name}에서 보기`)).join('')}</div></div>`;
  }

  function renderFav() {
    if (!S.data) return;
    const ts = [...S.sel].map((k) => S.teamByKey.get(k)).filter(Boolean);
    if (S.focus && !S.sel.has(S.focus)) S.focus = null;
    $('fav').innerHTML = `<button class="fchip all${S.focus ? '' : ' on'}" data-focus="" type="button">선택 구단 전체 보기 (${ts.length})</button>` +
      ts.map((t) => `<button class="fchip${S.focus === t.key ? ' on' : ''}" data-focus="${esc(t.key)}" type="button">${logo(t, 'lg xs')}${esc(t.abbr && t.sport === 'lol' ? t.name : t.name)}</button>`).join('') +
      '<button class="fchip add" data-open="picker" type="button">' + ic('plus') + '구단 추가</button>';
  }

  function renderFilters(gs) {
    const n = (k) => (k === 'all' ? gs.length : gs.filter((g) => core.compInfo(g).grp === k).length);
    $('comps').innerHTML = CFG.filters.map(([k, a, b]) => {
      const c = n(k);
      if (k !== 'all' && !c && S.flt !== k) return '';
      return `<button class="cchip c-${k}${S.flt === k ? ' on' : ''}" data-flt="${k}" type="button"><span>${a}</span><small>${b}</small><em>${c}</em></button>`;
    }).join('');
  }

  /* ---------- 경기 카드 ---------- */
  function teamBox(t, g, isHome) {
    const star = S.sel.has(t.key) ? ic('star', 'fill gold star') : '';
    const ha = core.showHomeAway(g) ? `<small>${isHome ? 'HOME' : 'AWAY'}</small>` : '';
    const tt = S.teamByKey.get(t.key);
    const form = tt && tt.form ? `<span class="fm" title="최근 ${tt.form.length}경기 (왼쪽이 오래된 경기)">${[...tt.form].map((r) => `<i class="r${r}">${{ W: '승', D: '무', L: '패' }[r]}</i>`).join('')}</span>` : '';
    const name = `<div class="tn"><b>${isHome ? star : ''}${esc(t.name)}${isHome ? '' : star}</b><span class="tsub">${ha}${form}</span></div>`;
    return `<div class="tm ${isHome ? 'h' : 'a'}${S.sel.has(t.key) ? ' me' : ''}">${isHome ? name + logo(t) : logo(t) + name}</div>`;
  }

  function center(g) {
    if (g.status === 'off') return '<div class="vs"><span class="vs-b off">연기</span><small>일정 미정</small></div>';
    if (!g.score) return `<div class="vs"><span class="vs-b">VS</span><small>${g.status === 'live' ? '진행 중' : '예정'}</small></div>`;
    if (S.spoil && !S.revealed.has(g.id)) return `<div class="vs"><button class="reveal" data-reveal="${esc(g.id)}" type="button">${ic('eye')}결과 보기</button><small>${g.status === 'live' ? '진행 중' : '종료'}</small></div>`;
    const [h, a] = g.score;
    const w = g.status === 'end' ? (h > a ? 'h' : a > h ? 'a' : g.pen ? (g.pen[0] > g.pen[1] ? 'h' : 'a') : '') : '';
    return `<div class="vs"><span class="score${g.status === 'live' ? ' live' : ''}"><b class="${w === 'h' ? 'w' : ''}">${h}</b><i>:</i><b class="${w === 'a' ? 'w' : ''}">${a}</b></span>
      <small>${g.status === 'live' ? '<span class="live-t">LIVE</span>' : g.pen ? `PK ${g.pen[0]}:${g.pen[1]}` : '종료'}</small></div>`;
  }

  /** 한국 선수 배지: 라인업 발표 후엔 선발/벤치, 그 전엔 소속 선수 이름 */
  function krTag(g) {
    if (g.sport !== 'football') return '';
    const flag = ic('kr', 'flag');
    if (g.krl) {
      const ps = g.krl.filter((p) => p.name);
      if (!ps.length) return '';
      return ps.map((p) => `<span class="tag kr${p.s ? ' on' : ''}">${flag}${esc(p.name)} ${p.s ? '선발' : '벤치'}</span>`).join('');
    }
    const names = [g.home, g.away].flatMap((t) => ((S.teamByKey.get(t.key) || {}).kr || []).map((p) => p.name));
    return names.length ? `<span class="tag kr">${flag}${names.map(esc).join(' · ')}</span>` : '';
  }

  function card(g) {
    const ci = core.compInfo(g), big = core.isBig(g, S.lck);
    const focus = core.focusTeam(g, S.sel);
    const nv = core.naverLink(g, focus, S.first, S.codes);
    const meta = [g.round, g.sport === 'lol' && g.bo ? `Bo${g.bo}` : ''].filter(Boolean).map(esc).join(' · ');
    const acts = [];
    if (nv) acts.push(ext(nv, 'nvbtn', `${ic('tv')}<span>${g.sport === 'lol' && g.status !== 'end' ? '네이버 중계/일정' : '네이버 일정'}</span>${ic('ext', 'sm')}`));
    for (const w of core.watchFor(g)) if (g.status !== 'end' || w.always) acts.push(ext(w.url, 'wbtn', `<img src="${w.logo}" alt="" width="20" height="20">`, `${w.name}에서 보기`));
    if (g.status === 'end') acts.push(ext(core.highlightUrl(g), 'sq hl', `${ic('play', 'fill')}<span>하이라이트</span>`, '유튜브에서 하이라이트 찾기'));
    if (core.canLineup(g)) acts.push(`<button class="sq lu" data-lineup="${esc(g.id)}" type="button" title="라인업 확인" aria-label="라인업 확인">${ic('shirt')}<span>라인업</span></button>`);
    if (g.status === 'before') acts.push(`<button class="sq" data-ics="${esc(g.id)}" type="button" title="내 캘린더에 추가" aria-label="내 캘린더에 추가">${ic('calplus')}</button>`);
    return `<article class="card${g.status === 'live' ? ' is-live' : ''}${big ? ' is-big' : ''}">
      <div class="c-meta">
        <div class="mr"><span class="time">${ic('clock')}<b>${core.hm(g.start)}</b><small>KST</small></span>
        <span class="cbadge c-${ci.cls}">${ci.abbr ? `<b>${esc(ci.abbr)}</b><i>·</i>` : ''}${esc(ci.name)}</span></div>
        <div class="mr">${g.status === 'live' ? '<span class="tag live">● LIVE</span>' : ''}${big ? `<span class="tag big">${ic('flame', 'fill')}BIG MATCH</span>` : ''}${krTag(g)}</div>
        <p class="sub">${meta}${meta && g.venue ? ' · ' : ''}${g.venue ? `${ic('pin', 'sm')}${esc(g.venue)}` : ''}</p>
      </div>
      <div class="c-match">${teamBox(g.home, g, true)}${center(g)}${teamBox(g.away, g, false)}</div>
      <div class="c-act">${acts.join('')}</div>
    </article>`;
  }

  function dayHead(d, n, today) {
    const n0 = core.dayDiff(today, d);
    return `<div class="dayh${n0 === 0 ? ' today' : ''}">${ic('cal')}<h2>${core.md(d)} (${core.wd(d)})</h2><span class="dd${n0 < 0 ? ' past' : ''}">${core.dday(d, today)}</span><span class="dn">총 <b>${n}</b>경기</span></div>`;
  }

  function renderList(gs) {
    const root = $('list');
    if (!S.sel.size) {
      root.innerHTML = `<div class="empty big"><img src="assets/icon.svg" alt="" width="84" height="84"><h3>관심 구단을 골라 주세요</h3><p>리그·챔스·컵대회·A매치·LCK·월즈까지<br>고른 구단의 모든 경기를 한 화면에 모아 드려요.</p><button class="hb hb-primary" data-open="picker" type="button">${ic('star', 'fill')}관심 구단 설정</button></div>`;
      return;
    }
    if (S.tab === 'week') return renderWeek(gs);
    const list = gs.slice(0, S.shown);
    if (!list.length) { root.innerHTML = `<p class="empty">${S.q || S.big || S.flt !== 'all' ? '조건에 맞는 경기가 없어요.' : S.tab === 'res' ? '종료된 경기가 없어요.' : '예정된 경기가 없어요.'}</p>`; return; }
    const today = core.todayKST();
    const counts = new Map();
    for (const g of gs) counts.set(core.ymd(g.start), (counts.get(core.ymd(g.start)) || 0) + 1);
    let html = '', cur = '';
    for (const g of list) {
      const d = core.ymd(g.start);
      if (d !== cur) { if (cur) html += '</div>'; cur = d; html += `<section class="day" data-d="${d}">${dayHead(d, counts.get(d), today)}<div class="cards">`; }
      html += card(g);
    }
    html += '</div></section>';
    if (gs.length > list.length) html += `<button class="more" data-more type="button">더 보기 · ${gs.length - list.length}경기 남음</button>`;
    root.innerHTML = html;
    if (S.tab === 'all' && S.jump) {                           // 전체 타임라인: 오늘(또는 가장 가까운 날)로 이동
      S.jump = false;
      const el = [...root.querySelectorAll('.day')].find((s) => s.dataset.d >= today);
      if (el) el.scrollIntoView({ block: 'start' });
    }
  }

  function renderWeek(gs) {
    const today = core.todayKST();
    const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;      // 월요일 시작
    const mon = core.addDays(today, -dow + S.week * 7), sun = core.addDays(mon, 6);
    const byDay = new Map();
    for (const g of gs) { const d = core.ymd(g.start); if (d >= mon && d <= sun) byDay.set(d, [...(byDay.get(d) || []), g]); }
    let cols = '';
    for (let i = 0; i < 7; i++) {
      const d = core.addDays(mon, i), list = byDay.get(d) || [];
      cols += `<div class="wcol${d === today ? ' today' : ''}${list.length ? '' : ' none'}"><div class="wh"><b>${core.wd(d)}</b><span>${+d.slice(5, 7)}/${+d.slice(8, 10)}</span></div>` +
        (list.length ? list.map((g) => {
          const ci = core.compInfo(g);
          const sc = g.score && !(S.spoil && !S.revealed.has(g.id)) ? `<em>${g.score[0]}:${g.score[1]}</em>` : '';
          return `<button class="wi c-${ci.cls}" data-pop="${esc(g.id)}" type="button"><span class="wt">${core.hm(g.start)} · ${esc(ci.abbr || ci.name)}${g.status === 'live' ? ' <b class="live-t">LIVE</b>' : ''}</span>
            <span class="wr">${logo(g.home, 'lg xs')}<span>${esc(g.home.abbr || g.home.name)}</span>${sc}</span><span class="wr">${logo(g.away, 'lg xs')}<span>${esc(g.away.abbr || g.away.name)}</span></span></button>`;
        }).join('') : '<p class="wnone">경기 없음</p>') + '</div>';
    }
    $('list').innerHTML = `<div class="panel week"><div class="wbar"><button class="sq" data-week="-1" type="button" aria-label="이전 주">${ic('left')}</button>
      <h2>${core.md(mon)} – ${core.md(sun)}</h2><button class="sq" data-week="1" type="button" aria-label="다음 주">${ic('right')}</button>
      ${S.week ? '<button class="mini" data-week="0" type="button">이번 주</button>' : ''}<span class="dn">이번 주 <b>${[...byDay.values()].reduce((s, l) => s + l.length, 0)}</b>경기</span></div>
      <div class="wgrid">${cols}</div></div>`;
  }

  /* ---------- 순위표 (탭을 열 때만 standings.json 을 받음) ---------- */
  async function loadStandings() {
    if (S.st && Date.now() - S.stT < 10 * 60e3) return;
    try {
      const r = await fetch('data/standings.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      S.st = await r.json(); S.stT = Date.now();
    } catch (_) { S.st = S.st || { tables: {} }; }
  }

  function renderStandings() {
    const root = $('list');
    if (!S.st) { root.innerHTML = '<p class="empty">순위표 불러오는 중…</p>'; loadStandings().then(() => S.tab === 'tbl' && renderStandings()); return; }
    if (Date.now() - S.stT > 10 * 60e3) loadStandings().then(() => S.tab === 'tbl' && S.stT > Date.now() - 5e3 && renderStandings());
    const T = S.st.tables || {};
    const order = ['epl', 'laliga', 'ucl', 'lck'].filter((k) => T[k]);
    if (!order.length) { root.innerHTML = '<p class="empty">순위표가 아직 없어요. 다음 자동 동기화 후 생겨요.</p>'; return; }
    if (!order.includes(S.lt)) {                                   // 내 구단이 가장 많은 리그를 먼저
      S.lt = order.map((k) => [k, T[k].rows.filter((r) => S.sel.has(r.key)).length]).sort((a, b) => b[1] - a[1])[0][0];
    }
    const t = T[S.lt], lol = S.lt === 'lck';
    const cls = { epl: 'epl', laliga: 'laliga', ucl: 'ucl', lck: 'lck' };
    const zc = (z) => (z ? `style="--z:${esc(z.replace(/^#+/, '#'))}"` : '');
    const zones = [...new Map(t.rows.filter((r) => r.zn).map((r) => [r.zn, r.z])).entries()];
    const head = lol ? '<th>경기</th><th>승</th><th>패</th><th class="hs">세트</th><th>득실</th>'
      : '<th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th>';
    const rows = t.rows.map((r) => {
      const me = S.sel.has(r.key);
      const team = S.teamByKey.get(r.key);
      const fm = team && team.form ? `<span class="fm sm">${[...team.form].map((x) => `<i class="r${x}">${{ W: '승', D: '무', L: '패' }[x]}</i>`).join('')}</span>` : '';
      const cells = lol ? `<td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td class="hs">${r.sw}-${r.sl}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td>`
        : `<td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td>`;
      return `<tr class="${me ? 'me' : ''}" ${zc(r.z)}><td class="rk"><span${r.z ? ' class="zb"' : ''}>${r.r}</span></td>
        <td class="tmc"><div class="tmi">${logo(r, 'lg xs')}<span>${me ? ic('star', 'fill gold star') : ''}${esc(r.name)}</span>${fm}</div></td>${cells}</tr>`;
    }).join('');
    root.innerHTML = `<div class="panel stand">
      <div class="stabs">${order.map((k) => `<button type="button" data-lt="${k}" class="cchip c-${cls[k]}${k === S.lt ? ' on' : ''}"><span>${esc(T[k].name)}</span><em>${T[k].rows.filter((r) => S.sel.has(r.key)).length || ''}</em></button>`).join('')}</div>
      <div class="shead"><h2>${esc(t.name)} <small>${esc(t.season)}</small></h2><span class="dn">출처: ${esc(t.src)}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="tmc">팀 <small>최근 5경기</small></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      ${zones.length ? `<p class="zones">${zones.map(([n, z]) => `<span ${zc(z)}><i></i>${esc(core.zoneLabel(n))}</span>`).join('')}</p>` : ''}
      ${lol ? '<p class="zones">순위는 정규시즌 승수 → 세트 득실 순으로 정렬했어요. 공식 동률 규정(승자승 등)과 다를 수 있어요.</p>' : ''}</div>`;
  }

  function render() {
    if (!S.data) return;
    renderHeader(); renderStats(); renderFav();
    for (const b of $('tabs').children) b.setAttribute('aria-selected', b.dataset.tab === S.tab);
    $('big').setAttribute('aria-pressed', S.big);
    document.body.classList.toggle('t-tbl', S.tab === 'tbl');
    if (S.tab === 'tbl') return renderStandings();
    const base = S.sel.size ? scoped() : [];
    renderFilters(base);
    const gs = byFilter(base);
    $('total').textContent = gs.length;
    renderList(gs);
  }

  /* ---------- 팀 선택 / 네이버 설정 ---------- */
  function renderPicker() {
    const groups = new Map();
    for (const t of S.data.teams) groups.set(t.group, [...(groups.get(t.group) || []), t]);
    let html = '';
    for (const [name, ts] of groups) {
      html += `<fieldset><legend>${esc(name)} <small>${ts.filter((t) => S.sel.has(t.key)).length}/${ts.length}</small></legend><div class="pchips">` +
        ts.map((t) => `<label class="pchip" data-n="${esc((t.name + ' ' + (t.abbr || '')).toLowerCase())}"><input type="checkbox" value="${esc(t.key)}"${S.sel.has(t.key) ? ' checked' : ''}>${logo(t, 'lg xs')}<span>${esc(t.name)}</span></label>`).join('') +
        '</div></fieldset>';
    }
    $('teams').innerHTML = html;
  }

  function renderNv() {
    const ts = [...S.sel].map((k) => S.teamByKey.get(k)).filter((t) => t && t.sport === 'football');
    if (!ts.length) { $('nvList').innerHTML = '<p class="help">관심 구단에 축구팀이 없어요. (롤은 팀코드 없이 월별 일정으로 연결돼요)</p>'; return; }
    $('nvList').innerHTML = ts.map((t) => {
      const g = S.data.games.find((x) => x.nv && (x.home.key === t.key || x.away.key === t.key) && core.ymd(x.start) >= core.todayKST());
      const probe = g ? CFG.naver.football(g.nv[0], g.nv[1], core.ymd(g.start)) : '';
      return `<div class="nvrow">${logo(t, 'lg xs')}<span class="nvn">${esc(t.name)}</span>
        <input inputmode="numeric" pattern="[0-9]*" placeholder="${esc(t.code || '팀코드')}" value="${esc(S.codes[t.key] || '')}" data-code="${esc(t.key)}" aria-label="${esc(t.name)} 네이버 팀코드">
        <span class="nvs ${S.codes[t.key] || t.code ? 'ok' : ''}">${S.codes[t.key] ? '직접 입력' : t.code ? '자동 확인됨' : '미설정'}</span>
        ${probe ? ext(probe, 'mini', '찾기' + ic('ext', 'sm'), '네이버에서 이 팀 찾기') : ''}</div>`;
    }).join('');
  }

  function showMsg(title, html) {
    $('msgT').textContent = title;
    $('msgB').innerHTML = html;
    if (!$('msg').open) $('msg').showModal();
  }

  /* ---------- 라인업 (버튼 누를 때만 ESPN 조회, 2분 캐시) ---------- */
  function pitch(t, tm) {
    const W = 300, H = 380, rows = t.rows;
    let dots = '';
    rows.forEach((r, i) => {
      const y = H - 34 - (i * (H - 70)) / Math.max(rows.length - 1, 1);
      r.forEach((p, j) => {
        const x = (W * (j + 1)) / (r.length + 1);
        const last = p.name.split(' ').slice(-1)[0];
        const nm = esc(r.length >= 4 || p.name.length > 11 ? (last.length > 10 ? last.slice(0, 9) + '…' : last) : p.name);
        const ko = (S.data.kr || {})[p.id];
        dots += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"${ko ? ' class="krp"' : ''}>${ko ? '<circle r="18.5" class="kr1"/><circle r="18.5" class="kr2"/>' : ''}<circle r="14" class="${i ? 'pl' : 'gk'}"/><text class="no" dy="4.5">${esc(p.n)}</text><text class="pn" dy="${ko ? 31 : 28}">${esc(ko || '') || nm}</text></g>`;
      });
    });
    const kr = S.data.kr || {};
    const krs = t.rows.flat().filter((p) => kr[p.id]).map((p) => `${kr[p.id]} 선발`).concat(t.subs.filter((p) => kr[p.id]).map((p) => `${kr[p.id]} 벤치`));
    return `<figure class="pitch"><figcaption>${logo(tm, 'lg sm')}<b>${esc(tm.name)}</b><span>${esc(t.formation)}</span></figcaption>
      ${krs.length ? `<p class="krline">${ic('kr', 'flag')}${krs.map(esc).join(' · ')}</p>` : ''}
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tm.name)} 선발 라인업"><defs><linearGradient id="turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f6b3e"/><stop offset="1" stop-color="#154d2c"/></linearGradient></defs>
        <rect fill="url(#turf)" x="0" y="0" width="${W}" height="${H}" rx="12"/>
        ${[0, 1, 2, 3, 4, 5, 6].map((k) => `<rect x="0" y="${k * 54}" width="${W}" height="27" fill="rgba(255,255,255,.025)"/>`).join('')}
        <g class="ln2"><rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="4"/><circle cx="${W / 2}" cy="10" r="40"/><rect x="${W / 2 - 70}" y="${H - 68}" width="140" height="58"/><rect x="${W / 2 - 32}" y="${H - 30}" width="64" height="20"/></g>
        ${dots}</svg>
      <details${t.subs.some((p) => kr[p.id]) ? ' open' : ''}><summary>교체 명단 ${t.subs.length}명</summary><p>${t.subs.map((p) => `<span${kr[p.id] ? ' class="krs"' : ''}><b>${esc(p.n)}</b> ${esc(kr[p.id] || p.name)}</span>`).join('')}</p></details></figure>`;
  }

  async function openLineup(id) {
    const g = S.byId.get(id);
    if (!g) return;
    const c = S.lu.get(id);
    let lu = c && Date.now() - c.t < 120e3 ? c.v : undefined;
    if (lu === undefined) {
      showMsg('라인업 확인', '<p class="loading">불러오는 중…</p>');
      try {
        const r = await fetch(CFG.lineupUrl(g.lg, id.slice(1)));
        if (!r.ok) throw new Error(r.status);
        lu = core.parseLineup(await r.json());
        S.lu.set(id, { t: Date.now(), v: lu });
      } catch (_) {
        showMsg('라인업 확인', '<div class="nolu"><b>라인업을 불러오지 못했어요.</b><p>잠시 후 다시 눌러 주세요.</p></div>');
        return;
      }
    }
    if (!lu) {
      return showMsg('라인업 확인', `<div class="nolu">${ic('shirt', 'xl')}<b>아직 라인업이 확인되지 않았습니다.</b>
        <p>선발 명단은 보통 킥오프 1시간 전쯤 발표돼요.<br>${core.md(core.ymd(g.start))} ${core.hm(g.start)} 킥오프 · 그때 다시 눌러 주세요.</p></div>`);
    }
    showMsg(`${g.home.name} vs ${g.away.name}`, `<div class="pitches">${pitch(lu.home, g.home)}${pitch(lu.away, g.away)}</div><p class="src">선발 명단 출처: ESPN</p>`);
  }

  function downloadIcs(id) {
    const g = S.byId.get(id);
    if (!g) return;
    const url = core.naverLink(g, core.focusTeam(g, S.sel), S.first, S.codes);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([core.ics(g, url)], { type: 'text/calendar;charset=utf-8' }));
    a.download = `${g.home.name} vs ${g.away.name}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ---------- 불러오기 / 자동 갱신 ---------- */
  async function load(force) {
    if (!force && Date.now() - S.lastLoad < 60e3) return;
    S.lastLoad = Date.now();
    try {
      const r = await fetch(CFG.dataUrl, { cache: 'no-cache' }); // 바뀐 게 없으면 304 로 끝나 전송량 거의 0
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (d.updated === S.updated && S.data) { renderHeader(); return; }
      S.updated = d.updated; S.data = d;
      S.byId = new Map(d.games.map((g) => [g.id, g]));
      S.teamByKey = new Map(d.teams.map((t) => [t.key, t]));
      S.lck = new Set(d.teams.filter((t) => t.group === 'LCK').map((t) => t.key));
      S.first = core.buildFirstMap(d.games);
      render();
      if ($('picker').open) renderPicker();
    } catch (e) {
      if (!S.data) $('list').innerHTML = '<p class="empty">일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>';
      $('syncState').className = 'sync warn';
      $('syncState').lastElementChild.textContent = '연결 실패 — 잠시 후 다시 시도';
    }
  }

  /* 실제 마지막 동기화 시각 (GitHub Pages 에서만, 화면에 보일 때 최대 10분에 한 번) */
  async function loadRun() {
    const rp = core.repoFromLocation(location.hostname, location.pathname);
    if (!rp || Date.now() - (loadRun.t || 0) < 9 * 60e3) return;
    loadRun.t = Date.now();
    try {
      const r = await fetch(CFG.runsUrl(rp.owner, rp.repo), { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const runs = (await r.json()).workflow_runs || [];
      S.run = runs.find((x) => x.status === 'completed') || null;
      renderHeader();
    } catch (_) { /* 실패하면 일정 파일 시각으로 표시 */ }
  }

  function schedule() {
    clearTimeout(schedule.t);
    if (document.hidden) return;                                  // 안 보이는 동안은 타이머 자체를 끈다
    const live = S.data && S.data.games.some((g) => g.status === 'live' && mine(g));
    schedule.t = setTimeout(async () => { await load(true); loadRun(); renderHeader(); renderStats(); schedule(); }, live ? CFG.liveRefreshMs : CFG.refreshMs);
  }

  /* ---------- 이벤트 ---------- */
  const setTab = (t) => { S.tab = t; S.shown = CFG.pageSize; S.jump = t === 'all'; save_('sh.tab', t); render(); };
  document.addEventListener('click', (e) => {
    const lt = e.target.closest('[data-lt]');
    if (lt) { S.lt = lt.dataset.lt; renderStandings(); return; }
    const el = e.target.closest('[data-lineup],[data-open],[data-more],[data-close],[data-clear],[data-tab],[data-flt],[data-focus],[data-reveal],[data-ics],[data-week],[data-pop],#refresh,#spoiler,#big');
    if (!el) return;
    const ds = el.dataset;
    if (ds.lineup) openLineup(ds.lineup);
    else if (ds.open === 'picker') { renderPicker(); $('q').value = ''; $('picker').showModal(); }
    else if (ds.open === 'nv') { renderNv(); $('nv').showModal(); }
    else if (ds.tab) setTab(ds.tab);
    else if (ds.flt) { S.flt = ds.flt; S.shown = CFG.pageSize; render(); }
    else if (ds.focus !== undefined) { S.focus = ds.focus || null; S.shown = CFG.pageSize; render(); }
    else if (ds.reveal) { S.revealed.add(ds.reveal); render(); }
    else if (ds.ics) downloadIcs(ds.ics);
    else if (ds.week !== undefined) { S.week = +ds.week === 0 ? 0 : S.week + +ds.week; render(); }
    else if (ds.pop) { const g = S.byId.get(ds.pop); if (g) showMsg(`${core.md(core.ymd(g.start))} (${core.wd(core.ymd(g.start))})`, `<div class="cards solo">${card(g)}</div>`); }
    else if (el.hasAttribute('data-more')) { S.shown += CFG.pageSize; render(); }
    else if (el.hasAttribute('data-clear')) { S.sel.clear(); save_('sh.teams', []); renderPicker(); $('cnt').textContent = 0; }
    else if (el.hasAttribute('data-close')) el.closest('dialog').close();
    else if (el.id === 'refresh') { el.classList.add('spin'); S.stT = 0; loadRun.t = 0; loadRun(); load(true).finally(() => setTimeout(() => el.classList.remove('spin'), 600)); }
    else if (el.id === 'spoiler') { S.spoil = !S.spoil; S.revealed.clear(); save_('sh.spoil', S.spoil); render(); }
    else if (el.id === 'big') { S.big = !S.big; S.shown = CFG.pageSize; render(); }
  });
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  $('teams').addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    e.target.checked ? S.sel.add(e.target.value) : S.sel.delete(e.target.value);
    save_('sh.teams', [...S.sel]);
    $('cnt').textContent = S.sel.size;
  });
  $('picker').addEventListener('close', () => { S.shown = CFG.pageSize; render(); schedule(); });
  $('nvList').addEventListener('change', (e) => {
    const k = e.target.dataset.code;
    if (!k) return;
    const v = e.target.value.replace(/\D/g, '');
    if (v) S.codes[k] = v; else delete S.codes[k];
    save_('sh.codes', S.codes);
    renderNv();
  });
  $('nv').addEventListener('close', render);
  $('q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const l of $('teams').querySelectorAll('.pchip')) l.hidden = !!q && !l.dataset.n.includes(q);
  });
  let qt;
  $('q2').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value.trim(); S.shown = CFG.pageSize; render(); }, 180); });
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t.tagName === 'IMG' && t.classList.contains('lg')) t.replaceWith(Object.assign(document.createElement('span'), { className: t.className + ' ph' }));
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false).then(() => { loadRun(); renderHeader(); renderStats(); schedule(); }); else clearTimeout(schedule.t); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  renderHeader();
  load(true).then(schedule);
  loadRun();
}
