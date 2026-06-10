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
  count5: 5, count10: 10, tadd5: 5, tadd10: 10 };

// 1. כל סוג תרגיל, רגיל וקל, 3000 פעמים
for (const pid in CONFIG.profiles) {
  const prof = CONFIG.profiles[pid];
  const types = new Set();
  prof.levels.forEach(l => l.types.forEach(t => types.add(t)));
  for (const type of types) {
    for (const easy of [false, true]) {
      for (let i = 0; i < 3000; i++) {
        const ex = genExercise(type, easy);
        assert(Number.isInteger(ex.answer), type + ': answer not integer: ' + ex.answer);
        assert(ex.answer >= 0, type + ': negative answer ' + ex.answer + ' line=' + ex.line);
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
        // אימות חשבוני מתוך השורה עצמה
        if (ex.line && ex.line !== '?' && !ex.emojiLine) {
          const m = ex.line.match(/^([\d?]+) ([+×÷−]) ([\d?]+) = ([\d?]+)$/);
          assert(m, type + ': line format bad: "' + ex.line + '"');
          if (m) {
            const sub = s => s === '?' ? ex.answer : Number(s);
            const A = sub(m[1]), B = sub(m[3]), C = sub(m[4]);
            const op = m[2];
            const calc = op === '+' ? A + B : op === '−' ? A - B : op === '×' ? A * B : A / B;
            assert(calc === C, type + ': wrong math: ' + ex.line + ' (answer=' + ex.answer + ')');
            if (op === '÷') assert(A % B === 0, type + ': division with remainder: ' + ex.line);
            if (op === '−') assert(A - B >= 0, type + ': negative subtraction: ' + ex.line);
          }
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

if (fails) { console.error(fails + ' failures'); process.exit(1); }
console.log('ALL TESTS PASSED');
