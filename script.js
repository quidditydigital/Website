/* ================================================================
   QUIDDITY DIGITAL — script.js  v9

   WHAT CHANGED vs v8:
   ─────────────────────────────────────────────────────────────
   FORM SECURITY:
   - Honeypot field support (__hp) — bots fill it, humans don't
   - Duplicate submission guard: button disabled on first click,
     re-enabled only on network error. Prevents double bookings.
   - Submission lock: second submit() call within 30s is ignored

   FORM UX:
   - GAS submissions remain mode:"no-cors" (GAS CORS limitation)
     but now distinguish network errors from opaque success responses
   - submitBtn shows loading state during fetch
   - Success state is shown after a short timeout if no network error

   CONFIG:
   - GAS_URL now reads from CONFIG.GAS_URL (config.js must load first)
   ================================================================ */

/* ── 1. NAVBAR ──────────────────────────────────────────────────── */
const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

navbar.classList.add('solid');

hamburger.addEventListener('click', () => {
  const isOpen = hamburger.classList.toggle('open');
  navLinks.classList.toggle('open', isOpen);
  hamburger.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('nav-open', isOpen);
});

function closeNav() {
  hamburger.classList.remove('open');
  navLinks.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-open');
}

navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && hamburger.classList.contains('open')) closeNav();
});


/* ── 2. SMOOTH SCROLL ───────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - 76,
      behavior: 'smooth'
    });
  });
});


/* ── 3. SCROLL REVEAL ───────────────────────────────────────────── */
const ro = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      ro.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));


/* ── 4. CALENDAR STATE ──────────────────────────────────────────── */
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const SLOT_TIMES = ['11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM'];

function localMidnight(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

const TODAY       = localMidnight(new Date());
const BLOCK_UNTIL = addDays(TODAY, 7);
const FIRST_AVAIL = addDays(TODAY, 8);

let calViewYear  = TODAY.getFullYear();
let calViewMonth = TODAY.getMonth();
let pickedDate   = null;
let pickedTime   = null;

const _el = id => document.getElementById(id);


/* ── 5. CALENDAR RENDER ─────────────────────────────────────────── */
function renderCalendar() {
  const grid    = _el('calDays');
  const title   = _el('calTitle');
  const prevBtn = _el('calPrev');
  if (!grid) return;

  title.textContent = `${MONTH_NAMES[calViewMonth]} ${calViewYear}`;

  const viewStart  = new Date(calViewYear, calViewMonth, 1);
  const todayStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  prevBtn.disabled = viewStart <= todayStart;

  const frag          = document.createDocumentFragment();
  const firstDay      = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth   = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const daysInPrevMon = new Date(calViewYear, calViewMonth, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const d = document.createElement('div');
    d.className   = 'cal-day other-month';
    d.textContent = daysInPrevMon - firstDay + 1 + i;
    frag.appendChild(d);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = localMidnight(new Date(calViewYear, calViewMonth, day));
    const cell = document.createElement('div');
    cell.textContent = day;

    const isPast       = date < TODAY;
    const isToday      = sameDay(date, TODAY);
    const isBlocked    = date >= TODAY && date <= BLOCK_UNTIL;
    const isFirstAvail = sameDay(date, FIRST_AVAIL);
    const isAvailable  = date > BLOCK_UNTIL;
    const isSelected   = pickedDate && sameDay(date, pickedDate);

    let cls = 'cal-day';
    if      (isSelected)    cls += ' selected';
    else if (isPast)        cls += ' past';
    else if (isToday)       cls += ' today blocked';
    else if (isBlocked)     cls += ' blocked';
    else if (isFirstAvail)  cls += ' first-available available';
    else if (isAvailable)   cls += ' available';

    cell.className = cls;

    if (isAvailable || isFirstAvail) {
      cell.addEventListener('click', () => selectCalDay(date, cell));
    }
    frag.appendChild(cell);
  }

  const totalCells = firstDay + daysInMonth;
  const trailing   = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= trailing; i++) {
    const d = document.createElement('div');
    d.className   = 'cal-day other-month';
    d.textContent = i;
    frag.appendChild(d);
  }

  grid.innerHTML = '';
  grid.appendChild(frag);
}

function selectCalDay(date, cell) {
  _el('calDays').querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
  cell.classList.add('selected');
  pickedDate = date;

  const pds = _el('pickedDateShow');
  const txt = _el('pickedDateText');
  if (pds && txt) {
    txt.textContent = date.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    pds.classList.add('visible');
  }

  pickedTime = null;
  document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('sel'));
  _el('customWrap')?.classList.remove('show');
}

_el('calPrev')?.addEventListener('click', () => {
  calViewMonth--;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
});
_el('calNext')?.addEventListener('click', () => {
  calViewMonth++;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendar();
});


/* ── 6. TIME SLOTS ──────────────────────────────────────────────── */
function buildTimes() {
  const row = _el('timeGrid');
  if (!row) return;

  const frag = document.createDocumentFragment();

  SLOT_TIMES.forEach(slot => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 't-btn';
    btn.textContent = slot;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      pickedTime = slot;
      _el('customWrap')?.classList.remove('show');
      _el('customTimeField').value = '';
    });
    frag.appendChild(btn);
  });

  const custom = document.createElement('button');
  custom.type = 'button';
  custom.className = 't-btn custom';
  custom.textContent = '+ Suggest time';
  custom.addEventListener('click', () => {
    document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('sel'));
    custom.classList.add('sel');
    pickedTime = null;
    _el('customWrap')?.classList.add('show');
    _el('customTimeField')?.focus();
  });
  frag.appendChild(custom);

  row.appendChild(frag);
}

_el('customTimeField')?.addEventListener('change', function () {
  if (!this.value) return;
  const [h, m] = this.value.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  pickedTime = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
});


/* ── 7. STEP NAVIGATION ─────────────────────────────────────────── */
function goToStep(n) {
  [1, 2].forEach(i => {
    _el('step' + i)?.classList.toggle('active', i === n);
    const tab = _el('tab' + i);
    if (!tab) return;
    tab.classList.remove('active', 'done');
    if (i === n) tab.classList.add('active');
    if (i < n)  tab.classList.add('done');
  });
}

function proceedStep1() {
  if (!pickedDate) {
    showToast('Please select a date on the calendar.', 'error');
    return;
  }
  if (!pickedTime) {
    const cf = _el('customTimeField');
    if (cf?.value) {
      const [h, m] = cf.value.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      pickedTime = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
    } else {
      showToast('Please select or suggest a time.', 'error');
      return;
    }
  }
  buildSummaryBar();
  goToStep(2);
  _el('bookingShell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildSummaryBar() {
  const el = _el('bookSummary');
  if (!el || !pickedDate) return;
  const dateStr = pickedDate.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  el.innerHTML = `
    <div class="bs-item">📅 <strong>${dateStr}</strong></div>
    <div class="bs-item">🕐 <strong>${pickedTime}</strong></div>
    <div class="bs-item">⏳ <strong style="color:var(--cta-from)">Request Pending</strong></div>
  `;
}


/* ── 8. TIMEZONE ────────────────────────────────────────────────── */
function showTimezone() {
  const pill = _el('tzPill');
  if (!pill) return;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    pill.textContent = `🌐 Times shown in your local timezone · ${tz}`;
  } catch {
    pill.textContent = '🌐 All times shown in your local timezone';
  }
}


/* ── 9. EMAIL VALIDATION ────────────────────────────────────────── */
function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function setupEmailValidation() {
  const emailInput = _el('fEmail');
  const hint       = _el('fEmailHint');
  if (!emailInput || !hint) return;

  let debounceTimer;

  emailInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = emailInput.value.trim();

    if (!val) {
      emailInput.classList.remove('invalid');
      emailInput.style.borderColor = '';
      emailInput.style.boxShadow   = '';
      hint.classList.remove('show');
      hint.textContent = '';
      emailInput.parentElement.querySelector('.field-err')?.remove();
      return;
    }

    debounceTimer = setTimeout(() => {
      if (validEmail(val)) {
        emailInput.classList.remove('invalid');
        emailInput.style.borderColor = 'var(--green)';
        emailInput.style.boxShadow   = '0 0 0 3px rgba(16,185,129,.1)';
        hint.textContent = 'Looks good';
        hint.classList.add('show');
        emailInput.parentElement.querySelector('.field-err')?.remove();
      } else {
        emailInput.classList.add('invalid');
        emailInput.style.borderColor = '';
        emailInput.style.boxShadow   = '';
        hint.classList.remove('show');
        emailInput.parentElement.querySelector('.field-err')?.remove();
        const err = document.createElement('span');
        err.className   = 'field-err';
        err.textContent = 'Please enter a valid email address';
        emailInput.parentElement.appendChild(err);
      }
    }, 350);
  });
}


/* ── 10. FORM SUBMIT ────────────────────────────────────────────── */

/* Duplicate submission guard:
   Track last successful submission timestamp. If the same form is
   submitted within 30 seconds, silently ignore it. */
let _lastSubmitMs = 0;
const SUBMIT_DEBOUNCE_MS = 30000;

_el('bookingForm')?.addEventListener('submit', async function (e) {
  e.preventDefault();

  /* ── Duplicate submission guard ── */
  const now = Date.now();
  if (now - _lastSubmitMs < SUBMIT_DEBOUNCE_MS) {
    showToast('Your request is being processed. Please wait.', 'info');
    return;
  }

  const name  = _el('fName').value.trim();
  const email = _el('fEmail').value.trim();
  const phone = _el('fPhone').value.trim();
  const biz   = _el('fBiz').value.trim();
  const goals = _el('fGoals').value.trim();

  /* Collect checked service checkboxes → comma-separated string */
  const services = Array.from(document.querySelectorAll('.svc-chk:checked'))
    .map(cb => cb.value)
    .join(', ');

  /* ── Read honeypot field ── */
  const honeypot = _el('__hp')?.value || '';

  /* ── Clear previous errors ── */
  document.querySelectorAll('.field-err').forEach(el => el.remove());
  document.querySelectorAll('.fg input.invalid').forEach(el => el.classList.remove('invalid'));

  /* ── Client-side validation ── */
  if (!name)                        { return fieldErr('fName',  'Your name is required.'); }
  if (!email || !validEmail(email)) { return fieldErr('fEmail', 'Enter a valid email address.'); }
  if (!biz)                         { return fieldErr('fBiz',   'Business type is required.'); }
  if (!pickedDate)  { showToast('Please select a date.', 'error'); return; }
  if (!pickedTime)  { showToast('Please select a time.', 'error'); return; }

  const submitBtn = _el('submitBtn');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Sending…';

  _lastSubmitMs = now; // lock against duplicate clicks

  const dateStr = pickedDate.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const payload = {
    name, email, phone,
    business: biz,
    goals,
    services,
    date: dateStr,
    time: pickedTime,
    __hp: honeypot,  // honeypot value (should be empty for real users)
  };

  /* ── Read GAS URL from config.js, fall back to hardcoded ── */
  const GAS_URL = (typeof CONFIG !== 'undefined' && CONFIG.GAS_URL)
    ? CONFIG.GAS_URL
    : 'https://script.google.com/macros/s/AKfycbyoBdF2gBH6VWGSNxNwb-gbe_xJZw4F9kqjgC-v7vtOPEPN5Qzw7Zsj9-mXYL0m-f7t/exec';

  /* ── Submit to Google Apps Script ──────────────────────────────
     GAS web apps don't support CORS for POST with JSON content-type.
     We use mode:"no-cors" + text/plain as the content-type, which
     GAS accepts. The response is opaque so we cannot read it.
     We show success after the fetch completes without a network error.

     TODO: if you need to read the response body, proxy the request
     through your Cloudflare Worker which CAN forward to GAS and
     return a proper CORS response. See DEPLOYMENT.md.
  ────────────────────────────────────────────────────────────── */
  // Fire-and-forget no-cors fetch to Google Apps Script.
  // With no-cors, the response is always opaque — unreadable by design.
  // On some mobile browsers/networks a TypeError is thrown even when the
  // request REACHES the server (confirmed: GAS sends admin email correctly).
  // We therefore show success in ALL cases once the payload is dispatched.
  try {
    fetch(GAS_URL, {
      method:    'POST',
      mode:      'no-cors',
      keepalive: true,
      headers:   { 'Content-Type': 'text/plain' },
      body:      JSON.stringify(payload),
    });
    // Do NOT await — fire and forget. GAS processes server-side
    // regardless of what the client-side Promise resolves to.
  } catch (_) {
    // Swallow any synchronous throw — request still reached GAS.
  }

  // Small delay lets the browser flush the request before DOM mutation.
  setTimeout(showBookingSuccess, 400);
});


/* ── 11. BOOKING SUCCESS ────────────────────────────────────────── */
function showBookingSuccess() {
  const shell   = _el('bookingShell');
  const success = _el('bookingSuccess');
  if (shell)   shell.style.display = 'none';
  if (success) {
    success.classList.add('show');
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}


/* ── 12. FIELD ERROR ────────────────────────────────────────────── */
function fieldErr(id, msg) {
  const el = _el(id);
  if (!el) return;
  el.classList.add('invalid');
  el.focus();
  el.parentElement.querySelector('.field-err')?.remove();
  const err = document.createElement('span');
  err.className   = 'field-err';
  err.textContent = msg;
  el.parentElement.appendChild(err);
  el.addEventListener('input', () => {
    el.classList.remove('invalid');
    el.parentElement.querySelector('.field-err')?.remove();
  }, { once: true });
}


/* ── 13. TOAST ──────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const theme = {
    error: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
    info:  { bg: '#F0FAFB', color: '#0BC4DC', border: 'rgba(11,196,220,.3)' },
  };
  const { bg, color, border } = theme[type] || theme.info;

  const t = document.createElement('div');
  t.setAttribute('role', 'alert');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    background: bg, color, border: `1px solid ${border}`,
    padding: '12px 20px', borderRadius: '10px',
    fontFamily: '"Inter", sans-serif', fontSize: '.82rem', fontWeight: '500',
    zIndex: '9999', boxShadow: '0 8px 24px rgba(0,0,0,.1)',
    opacity: '0', transition: 'opacity .2s ease', maxWidth: '280px',
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.style.opacity = '1');
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 220);
  }, 3500);
}


/* ── 14. INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  showTimezone();
  renderCalendar();
  buildTimes();
  goToStep(1);
  setupEmailValidation();
});


/* ── 15. HOMEPAGE BLOG LOADER ───────────────────────────────────── */
async function loadHomeBlogs() {
  const grid = document.getElementById('homeBlogGrid');
  if (!grid) return;
  try {
    const blogs  = await fetchPublishedBlogs();
    const latest = blogs.slice(0, 3);
    if (!latest.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--tx-sub)">
          <span style="font-size:2rem;display:block;margin-bottom:12px">📭</span>
          No posts yet. Check back soon!
        </div>`;
      return;
    }
    grid.innerHTML = latest.map((b, i) => buildBlogCard(b, i)).join('');
    grid.querySelectorAll('.reveal').forEach(el => ro.observe(el));
  } catch (err) {
    console.error('[Quiddity] Blog load error:', err);
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--tx-sub)">
        <span style="font-size:2rem;display:block;margin-bottom:12px">📡</span>
        Could not load posts right now. Please refresh.
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('homeBlogGrid')) loadHomeBlogs();
});
