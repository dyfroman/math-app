// בדיקה אוטומטית של הלוגיקה הטהורה מתוך index.html
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('==LOGIC-START==');
const end = html.indexOf('/* ==LOGIC-END== */');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(1); }
const code = html.slice(html.indexOf('*/', start) + 2, end);
const api = (function () {
  return eval(code + ';({ CONFIG, genExercise, updateProgress, chooseType, defaultState, placementStartLevel })');
})();
const { CONFIG, genExercise, updateProgress, chooseType, defaultState, placementStartLevel } = api;

let fails = 0;
function assert(cond, msg) { if (!cond) { fails++; console.error('FAIL:', msg); } }

const MAXES = { addsub100: 100, addsub1000: 1000, add10: 10, sub10: 10, addsub20: 20,
  count5: 5, count10: 10, tadd5: 5, tadd10: 10,
  addsub_4digit: 9999, addsub_tens: 100, place_value: 9 };

// 1. כל סוג תרגיל, רגיל וקל, 3000 פעמים
for (const gid in CONFIG.grades) {
  const prof = CONFIG.grades[gid];
  const types = new Set();
  prof.levels.forEach(l => l.types.forEach(t => types.add(t)));
  for (const type of types) {
    for (const easy of [false, true]) {
      for (let i = 0; i < 3000; i++) {
        const ex = genExercise(type, easy);
        if (typeof ex.answer === 'string') {
          // תשובות מחרוזת (גאומטריה) מותרות רק במצב בחירה
          assert(ex.mode === 'choice' && ex.answer.length > 0, type + ': string answer must be choice: ' + ex.answer);
        } else {
          assert(Number.isInteger(ex.answer), type + ': answer not integer: ' + ex.answer);
          assert(ex.answer >= 0, type + ': negative answer ' + ex.answer + ' line=' + ex.line);
        }
        assert(ex.mode === 'numpad' || ex.mode === 'choice', type + ': bad mode');
        assert(typeof ex.hint === 'string' && ex.hint.length > 0, type + ': missing hint');
        if (ex.mode === 'numpad') {
          assert((ex.line || '').includes('?'), type + ': numpad line missing ? : ' + ex.line);
        } else {
          assert(Array.isArray(ex.options) && ex.options.length >= 2, type + ': bad options');
          const hits = ex.options.filter(o => o.value === ex.answer).length;
          assert(hits === 1, type + ': options must contain answer exactly once, got ' + hits);
          const vals = ex.options.map(o => o.value);
          assert(new Set(vals).size === vals.length, type + ': duplicate option values ' + vals);
        }
        // אימות חשבוני מתוך השורה עצמה: מציבים את התשובה במקום ה-? ומחשבים את שני האגפים
        // (תומך גם בסדר פעולות וסוגריים; שורות בלי '=' כמו עיגול וסדרות נבדקות בנפרד)
        if (ex.line && ex.line.includes('=') && !ex.emojiLine) {
          const expr = ex.line.replace(/,/g, '').replace(/\?/g, String(ex.answer))
            .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
          const parts = expr.split('=');
          assert(parts.length === 2, type + ': line must have one "=": ' + ex.line);
          let lv, rv;
          try { lv = eval(parts[0]); rv = eval(parts[1]); }
          catch (e) { assert(false, type + ': line not evaluable: ' + ex.line); continue; }
          assert(lv === rv, type + ': wrong math: ' + ex.line + ' (answer=' + ex.answer + ')');
          assert(Number.isInteger(lv) && lv >= 0, type + ': non-integer/negative value in: ' + ex.line);
        }
        // בדיקות ייעודיות לסוגים החדשים
        if (type === 'rounding') {
          assert(ex.answer % ex.meta.unit === 0, 'rounding: answer not multiple of unit: ' + ex.line);
          assert(ex.answer === Math.round(ex.meta.n / ex.meta.unit) * ex.meta.unit,
            'rounding: wrong rounding of ' + ex.meta.n + ' to ' + ex.meta.unit + ' (got ' + ex.answer + ')');
        }
        if (type === 'sequence') {
          const nums = ex.line.replace(' , ?', '').split(' , ').map(Number);
          for (let j = 1; j < nums.length; j++)
            assert(nums[j] - nums[j - 1] === ex.meta.diff, 'sequence: uneven jumps: ' + ex.line);
          assert(ex.answer === nums[nums.length - 1] + ex.meta.diff, 'sequence: wrong next: ' + ex.line);
        }
        if (type === 'place_value' || type === 'place_big') {
          assert(Math.floor(ex.meta.n / Math.pow(10, ex.meta.place)) % 10 === ex.answer,
            type + ': wrong digit of ' + ex.meta.n + ' place ' + ex.meta.place);
        }
        if (type === 'area_perim') {
          const exp = ex.meta.kind === 'area' ? ex.meta.w * ex.meta.h : 2 * (ex.meta.w + ex.meta.h);
          assert(ex.answer === exp, 'area_perim: wrong ' + ex.meta.kind + ' for ' + ex.meta.w + 'x' + ex.meta.h);
        }
        if (type === 'area_triangle') {
          assert(ex.answer === ex.meta.base * ex.meta.height / 2, 'area_triangle: wrong area ' + ex.meta.base + 'x' + ex.meta.height);
        }
        if (type === 'average') {
          const sum = ex.meta.nums.reduce((s, x) => s + x, 0);
          assert(ex.answer === sum / ex.meta.nums.length, 'average: wrong for ' + ex.meta.nums.join(','));
        }
        if (type === 'addsub_tens') {
          assert(ex.answer % 10 === 0 && ex.answer <= 100, 'addsub_tens: ' + ex.line);
        }
        // גבולות טווח
        if (MAXES[type]) {
          const cap = MAXES[type];
          assert(ex.answer <= cap, type + ': answer ' + ex.answer + ' exceeds max ' + cap + ' line=' + ex.line);
        }
        if (type === 'compare') assert(ex.answer === Math.max(...ex.options.map(o => o.value)), 'compare: answer not max');
        if (type === 'digits') assert(ex.answer >= 0 && ex.answer <= 9, 'digits out of range');
      }
    }
  }
}
console.log('exercise generation: OK');

// 2. מנגנון אדפטיבי: 5 נכונות ברצף => עליית רמה
let st = defaultState();
const prof = CONFIG.grades.g3;
for (let i = 0; i < 5; i++) updateProgress(st, 'mul_easy', true, prof.levels.length, CONFIG);
assert(st.level === 1, 'level up after 5 correct, got level ' + st.level);
assert(st.consecutive === 0, 'consecutive reset after level up');

// 3. 3 טעויות באותו סוג => חיזוק
st = defaultState();
for (let i = 0; i < 3; i++) updateProgress(st, 'mul_easy', false, prof.levels.length, CONFIG);
assert(st.reinforce && st.reinforce.type === 'mul_easy', 'reinforce starts after 3 wrong');
let sel = chooseType(prof, st);
assert(sel.type === 'mul_easy' && sel.easy === true, 'chooseType serves easy reinforce');
// חיזוק מסתיים אחרי reinforceCount נכונות ובלי עליית רמה בזמן חיזוק
for (let i = 0; i < CONFIG.reinforceCount; i++) updateProgress(st, 'mul_easy', true, prof.levels.length, CONFIG);
assert(st.reinforce === null, 'reinforce ends');
assert(st.level === 0, 'no level up during reinforce');

// 4. אין עלייה מעבר לרמה אחרונה
st = defaultState();
st.level = prof.levels.length - 1;
for (let i = 0; i < 10; i++) updateProgress(st, 'div', true, prof.levels.length, CONFIG);
assert(st.level === prof.levels.length - 1, 'level capped at max');

// 5. chooseType תמיד מחזיר סוג חוקי מכל רמה
for (const gid in CONFIG.grades) {
  const p = CONFIG.grades[gid];
  for (let lvl = 0; lvl < p.levels.length; lvl++) {
    const s = defaultState(); s.level = lvl;
    for (let i = 0; i < 200; i++) {
      const c = chooseType(p, s);
      genExercise(c.type, c.easy); // יזרוק אם לא מוכר
    }
  }
}
console.log('adaptive logic: OK');

// 5b. מבחן מיקום => רמת פתיחה (פרופורציוני, חסום, לעולם לא הרמה האחרונה)
assert(placementStartLevel(0, 6, 8) === 0, 'placement: 0 correct -> level 0');
assert(placementStartLevel(6, 6, 8) === 6, 'placement: all correct -> levelsCount-2');
assert(placementStartLevel(3, 6, 8) === 3, 'placement: half -> middle');
assert(placementStartLevel(6, 6, 1) === 0, 'placement: single-level track -> 0');
assert(placementStartLevel(6, 6, 2) === 0, 'placement: two-level track -> 0');
for (let lc = 1; lc <= 12; lc++)
  for (let c = 0; c <= 6; c++) {
    const v = placementStartLevel(c, 6, lc);
    assert(v >= 0 && v <= Math.max(0, lc - 2), 'placement out of bounds lc=' + lc + ' c=' + c + ' v=' + v);
  }
console.log('placement logic: OK');

// 6. מיגרציית מצב שמור + מודל הילדים: מריצים את הסקריפט המלא עם סטאבים של דפדפן
{
  const full = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const store = {
    data: {
      'math_app_users': JSON.stringify([
        { id: 'u1', name: 'בדיקה', gradeId: 'g1', themeKey: 'forest', emoji: '🦊' },
        { id: 'u2', name: 'חדשה', gradeId: 'g3', themeKey: 'space', emoji: '🦄' }
      ]),
      // מצב ישן (trackVersion שונה): שומרים כוכבים/סטטיסטיקות, מאפסים רמה לנקודת הפתיחה
      'math_app_user_u1': JSON.stringify({ level: 5, stars: 37, bestStreak: 6, stats: { add10: { c: 20, w: 4 } }, trackVersion: 99 })
    },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = v; },
    removeItem(k) { delete this.data[k]; }
  };
  const winStub = { addEventListener() {}, innerWidth: 400, innerHeight: 800 };
  const docStub = {
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; },
    body: { style: { setProperty() {} }, appendChild() {}, dataset: {} }
  };
  const fn = new Function('window', 'document', 'localStorage', 'location',
    full + '\n;return { loadState };');
  const app = fn(winStub, docStub, store, { hash: '' });

  const u1 = app.loadState('u1');
  assert(u1.level === 0, 'migration: u1 resets to startLevel 0, got ' + u1.level);
  assert(u1.trackVersion === 1, 'migration: u1 trackVersion should be 1');
  assert(u1.stars === 37, 'migration: u1 stars must be kept');
  assert(u1.bestStreak === 6, 'migration: u1 bestStreak must be kept');
  assert(u1.stats.add10.c === 20, 'migration: u1 stats must be kept');
  assert(u1.reinforce === null && u1.session.done === 0, 'migration: u1 session/reinforce reset');

  const u2 = app.loadState('u2'); // אין state שמור — ילד טרי
  assert(u2.level === 0 && u2.trackVersion === 1, 'fresh u2 state with grade trackVersion');
  console.log('state migration: OK');
}

if (fails) { console.error(fails + ' failures'); process.exit(1); }
console.log('ALL TESTS PASSED');
