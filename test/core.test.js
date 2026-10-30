// node test/core.test.js — 링크 규칙/필터/중계/HOME·AWAY/라인업 배치 검증
const assert = require('assert');
const { core } = require('../app.js');
const fx = require('./fixture.json');

const first = core.buildFirstMap(fx.games);
const byId = Object.fromEntries(fx.games.map((g) => [g.id, g]));
const sel = new Set(['f:360']);

// 맨유(teamCode 12): 11월 경기는 모두 11월 첫 경기(11-09)로, 12월 경기는 12월 첫 경기(12-03)로 고정
for (const id of ['a', 'b']) assert.strictEqual(core.naverLink(byId[id], core.focusTeam(byId[id], sel), first),
  'https://m.sports.naver.com/wfootball/schedule/index?category=epl&date=2026-11-09&teamCode=12', id);
for (const id of ['c', 'd']) assert.strictEqual(core.naverLink(byId[id], core.focusTeam(byId[id], sel), first),
  'https://m.sports.naver.com/wfootball/schedule/index?category=epl&date=2026-12-03&teamCode=12', id);
// 새벽 경기(05:15 KST)도 KST 날짜 기준
assert.strictEqual(core.ymd(byId.c.start), '2026-12-03');
// 챔스는 champs 카테고리 안에서 따로 월 첫 경기 계산
assert.strictEqual(core.naverLink(byId.u, byId.u.home, first),
  'https://m.sports.naver.com/wfootball/schedule/index?category=champs&date=2026-11-04&teamCode=12');
// 대표팀: kfootball/amatch, 코드 없으면 teamCode 생략
assert.strictEqual(core.naverLink(byId.k, byId.k.away, first), 'https://m.sports.naver.com/kfootball/schedule/index?category=amatch&date=2026-11-13');
// 롤: date=YYYY-MM, 월즈는 world_championship
assert.strictEqual(core.naverLink(byId.l1, byId.l1.home, first), 'https://game.naver.com/esports/League_of_Legends/schedule/world_championship?date=2026-10');
assert.strictEqual(core.naverLink(byId.l2, byId.l2.home, first), 'https://game.naver.com/esports/League_of_Legends/schedule/lck?date=2027-01');

// HOME/AWAY: 축구만
assert.strictEqual(core.showHomeAway(byId.a), true);
assert.strictEqual(core.showHomeAway(byId.l1), false);
// 라인업 버튼: 축구만
assert.strictEqual(core.canLineup(byId.a), true);
assert.strictEqual(core.canLineup(byId.l1), false);
// 중계처
assert.deepStrictEqual(core.watchFor(byId.a).map((w) => w.id), ['coupang', 'youtube']);
assert.deepStrictEqual(core.watchFor(byId.u).map((w) => w.id), ['spotv', 'youtube']);
assert.deepStrictEqual(core.watchFor(byId.k).map((w) => w.id), ['youtube']);
assert.strictEqual(core.watchFor(byId.a)[1].url, 'https://www.youtube.com/@PJY_football');
assert.deepStrictEqual(core.watchFor(byId.l1).map((w) => w.url),
  ['https://chzzk.naver.com/live/0b33823ac81de48d5b78a38cdbc0ab94', 'https://play.sooplive.com/townboy/298226683']);
// 필터
assert.deepStrictEqual(core.filterGames(fx.games, new Set(['l:R1040']), '2026-10-31').map((g) => g.id), ['l2']);
assert.strictEqual(core.todayKST(Date.UTC(2026, 9, 30, 16, 3)), '2026-10-31');

// 라인업: 실제 ESPN 응답(아스널 4-2-3-1) → GK 1 / 4 / 2 / 3 / 1, 줄 안은 왼쪽→오른쪽
const lu = core.parseLineup(require('./lineup_sample.json'));
const ars = lu.away;
assert.deepStrictEqual(ars.rows.map((r) => r.length), [1, 4, 2, 3, 1]);
assert.deepStrictEqual(ars.rows[1].map((p) => p.pos), ['LB', 'CD-L', 'CD-R', 'RB']);
assert.deepStrictEqual(ars.rows[3].map((p) => p.pos), ['AM-L', 'AM', 'AM-R']);
assert.deepStrictEqual(lu.home.rows.map((r) => r.length), [1, 5, 4, 1]);
// 미발표(선발 0명)면 null → "아직 라인업이 확인되지 않았습니다"
assert.strictEqual(core.parseLineup({ rosters: [{ homeAway: 'home', roster: [] }, { homeAway: 'away', roster: [] }] }), null);
assert.strictEqual(core.parseLineup({}), null);

// 직접 입력한 네이버 팀코드가 자동 값보다 우선
assert.ok(core.naverLink(byId.k, byId.k.away, first, { 'f:451': '999' }).endsWith('&teamCode=999'));
// D-day 배지
assert.strictEqual(core.dday('2026-10-31', '2026-10-31'), '오늘 (D-DAY)');
assert.strictEqual(core.dday('2026-11-01', '2026-10-31'), '내일 (D-1)');
assert.strictEqual(core.dday('2026-11-02', '2026-10-31'), '모레 (D-2)');
assert.strictEqual(core.dday('2026-11-09', '2026-10-31'), 'D-9');
assert.strictEqual(core.dday('2026-10-28', '2026-10-31'), '3일 전');
// 대회 배지·필터 묶음
assert.deepStrictEqual(core.compInfo(byId.l1), { abbr: 'WORLDS', name: '2026 롤드컵', cls: 'worlds', grp: 'lolint' });
assert.strictEqual(core.compInfo(byId.u).grp, 'uefa');
assert.strictEqual(core.compInfo(byId.k).grp, 'nat');
// 빅매치: 빅클럽끼리 / 국제대회 LCK 팀 / 결승·8강
assert.strictEqual(core.isBig({ ...byId.a, home: { name: '맨체스터 유나이티드' }, away: { name: '리버풀' } }), true);
assert.strictEqual(core.isBig(byId.a), false);
assert.strictEqual(core.isBig(byId.l1, new Set(['l:R480'])), true);
assert.strictEqual(core.isBig({ ...byId.l2, round: '결승' }), true);
// 캘린더(.ics): UTC 시각, 30분 전 알림
const ics = core.ics(byId.c, 'https://x.test');
assert.ok(ics.includes('DTSTART:20261202T201500Z') && ics.includes('TRIGGER:-PT30M') && ics.includes('SUMMARY:뉴캐슬 vs 맨유 (프리미어리그)'), ics);

// 실제 동기화 시각 조회용 저장소 주소 추출
assert.deepStrictEqual(core.repoFromLocation('vvdlcksvv.github.io', '/sports-hub/'), { owner: 'vvdlcksvv', repo: 'sports-hub' });
assert.deepStrictEqual(core.repoFromLocation('me.github.io', '/'), { owner: 'me', repo: 'me.github.io' });
assert.strictEqual(core.repoFromLocation('localhost', '/'), null);
assert.strictEqual(core.agoText(5 * 60e3), '5분 전');
assert.strictEqual(core.agoText(125 * 60e3), '2시간 5분 전');

// 하이라이트 검색 링크, 순위 구간 한글
assert.ok(core.highlightUrl({ ...byId.a, status: 'end' }).startsWith('https://www.youtube.com/results?search_query='));
assert.ok(decodeURIComponent(core.highlightUrl(byId.l1)).includes('T1 vs HLE WORLDS 하이라이트'));
assert.strictEqual(core.zoneLabel('Relegation'), '강등');
// 라인업 선수에 ESPN 선수 id 포함 (한국 선수 표시용)
assert.ok(lu.away.rows.flat().every((p) => /^\d+$/.test(p.id)));

console.log('모든 테스트 통과');
