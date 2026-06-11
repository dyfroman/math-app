// בדיקה אוטומטית של הלוגיקה הטהורה מתוך index.html
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const start = html.indexOf('==LOGIC-START==');
const end = html.indexOf('/* ==LOGIC-END== */');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(1); }
const code = html.slice(html.indexOf('*/', start) + 2, end);
const api = (function () {
  return eval(code + ';({ CONFIG, genExercise, updateProgress, chooseType, defaultState })');
})();
const { CONFIG, genExercise, updateProgress, chooseType, defaultState } = api;

let fails = 0;
function assert(cond, msg) { if (!cond) { fails++; console.error('FAIL:', msg); } }

const MAXES = { addsub100: 100, addsub1000: 1000, add10: 10, sub10: 10, addsub20: 20,
  count5: 5, count10: 10, tadd5: 5, tadd10: 10,
  addsub_4digit: 9999, addsub_tens: 100, place_value: 9 };

// 1. כל סוג תרגיל, רגיל וקל, 3000 פעמים
for (const pid in CONFIG.profiles) {
  const prof = CONFIG.profiles[pid];
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
        if (type === 'place_value') {
          assert(Math.floor(ex.meta.n / Math.pow(10, ex.meta.place)) % 10 === ex.answer,
            'place_value: wrong digit of ' + ex.meta.n + ' place ' + ex.meta.place);
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
const prof = CONFIG.profiles.noa;
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
for (const pid in CONFIG.profiles) {
  const p = CONFIG.profiles[pid];
  for (let lvl = 0; lvl < p.levels.length; lvl++) {
    const s = defaultState(); s.level = lvl;
    for (let i = 0; i < 200; i++) {
      const c = chooseType(p, s);
      genExercise(c.type, c.easy); // יזרוק אם לא מוכר
    }
  }
}
console.log('adaptive logic: OK');

// 6. מיגרציית מצב שמור: מריצים את הסקריפט המלא עם סטאבים של דפדפן
{
  const full = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const store = {
    data: {
      // מצב ישן (לפני trackVersion): רז ברמה 0 עם כוכבים וסטטיסטיקות
      math_app_raz: JSON.stringify({ level: 0, stars: 37, bestStreak: 6, stats: { add10: { c: 20, w: 4 } } }),
      // מצב חדש תקין של צורי — לא אמור להשתנות
      math_app_tzuri: JSON.stringify({ level: 3, stars: 12, trackVersion: 1 })
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
    body: { style: { setProperty() {} }, appendChild() {} }
  };
  const fn = new Function('window', 'document', 'localStorage', 'location',
    full + '\n;return { loadState };');
  const app = fn(winStub, docStub, store, { hash: '' });

  const raz = app.loadState('raz');
  assert(raz.level === 2, 'migration: raz should jump to level 2, got ' + raz.level);
  assert(raz.trackVersion === 2, 'migration: raz trackVersion should be 2');
  assert(raz.stars === 37, 'migration: raz stars must be kept');
  assert(raz.bestStreak === 6, 'migration: raz bestStreak must be kept');
  assert(raz.stats.add10.c === 20, 'migration: raz stats must be kept');
  assert(raz.reinforce === null && raz.session.done === 0, 'migration: raz session/reinforce reset');

  const noa = app.loadState('noa'); // אין state שמור — פרופיל טרי
  assert(noa.level === 0 && noa.trackVersion === 2, 'fresh noa state with new trackVersion');

  const tzuri = app.loadState('tzuri'); // גרסה תואמת — נשאר כמו שהיה
  assert(tzuri.level === 3 && tzuri.stars === 12, 'tzuri state untouched (same version)');
  console.log('state migration: OK');
}

if (fails) { console.error(fails + ' failures'); process.exit(1); }
console.log('ALL TESTS PASSED');
