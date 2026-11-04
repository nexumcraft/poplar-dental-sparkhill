// Poplar Dental Practice — small enhancements: live opening status, mobile menu,
// and the new-patient form. The site works without this file.

// Opening sessions per weekday (0 = Sunday), as [start, end] in minutes after midnight, UK time.
const SESSIONS = {
  1: [[540, 780], [840, 1050]],
  2: [[540, 780], [840, 1050]],
  3: [[540, 780], [840, 1050]],
  4: [[540, 780], [840, 1050]],
  5: [[540, 780], [840, 1050]],
};
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ukNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type).value;
  return {
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday')),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${((hour + 11) % 12) + 1}${mins ? `:${String(mins).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

function openingStatus({ day, minutes }) {
  const today = SESSIONS[day] || [];
  const current = today.find(([start, end]) => minutes >= start && minutes < end);
  if (current) return { state: 'open', text: `Open now until ${formatTime(current[1])}` };

  const next = today.find(([start]) => minutes < start);
  if (next) {
    const onLunch = today.some(([, end]) => minutes >= end);
    return { state: 'closed', text: onLunch ? `Closed for lunch, back at ${formatTime(next[0])}` : `Closed now, opens ${formatTime(next[0])} today` };
  }

  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const nextDay = (day + ahead) % 7;
    if (SESSIONS[nextDay]) {
      const when = ahead === 1 ? 'tomorrow' : DAY_NAMES[nextDay];
      return { state: 'closed', text: `Closed now, opens ${formatTime(SESSIONS[nextDay][0][0])} ${when}` };
    }
  }
  return { state: 'closed', text: 'Closed now' };
}

function updateOpeningStatus() {
  const now = ukNow();
  const status = openingStatus(now);
  document.documentElement.dataset.open = status.state;
  document.querySelectorAll('[data-open-status]').forEach((el) => { el.textContent = status.text; });
  document.querySelectorAll('[data-hours] tr').forEach((row) => {
    row.classList.toggle('is-today', Number(row.dataset.day) === now.day);
  });
}

function setUpMenu() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
}

function setUpRegisterForm() {
  const form = document.querySelector('[data-register-form]');
  if (!form) return;
  const status = form.querySelector('[data-form-status]');
  const submit = form.querySelector('button[type="submit"]');
  const dob = form.querySelector('input[type="date"]');
  if (dob) dob.max = new Date().toISOString().slice(0, 10);

  const showStatus = (kind, message) => {
    status.hidden = false;
    status.className = `form-status form-status--${kind}`;
    status.textContent = message;
  };

  const clearError = (control) => {
    const wrapper = control.closest('.field');
    wrapper?.querySelector('.field-error')?.remove();
    wrapper?.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  };

  const setError = (control, message) => {
    const wrapper = control.closest('.field');
    const error = document.createElement('p');
    error.className = 'field-error';
    error.id = `${control.name}-error`;
    error.textContent = message;
    wrapper.append(error);
    wrapper.querySelectorAll(`[name="${control.name}"]`).forEach((el) => {
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('aria-describedby', error.id);
    });
  };

  const isValid = (control) => {
    if (control.type === 'radio') return Boolean(form.querySelector(`[name="${control.name}"]:checked`));
    if (control.type === 'checkbox') return control.checked;
    if (control.name === 'phone') return control.value.replace(/\D/g, '').length >= 10;
    if (control.type === 'date' && control.value) return control.value <= control.max;
    return control.value.trim() !== '';
  };

  const validate = () => {
    const checked = new Set();
    let firstInvalid = null;
    form.querySelectorAll('[required]').forEach((control) => {
      if (checked.has(control.name)) return;
      checked.add(control.name);
      clearError(control);
      if (!isValid(control)) {
        setError(control, control.dataset.error || 'Fill in this field');
        firstInvalid ??= control;
      }
    });
    firstInvalid?.focus();
    return !firstInvalid;
  };

  form.addEventListener('input', (event) => clearError(event.target));
  form.addEventListener('change', (event) => clearError(event.target));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validate()) return;

    submit.disabled = true;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!response.ok) throw new Error(`Form service replied ${response.status}`);
      form.reset();
      showStatus('ok', "Thanks, we've received your details. We'll contact you to arrange your first appointment.");
    } catch {
      showStatus('warn', "We couldn't send your details just now. Please try again, or call us on 0121 771 3720.");
    } finally {
      submit.disabled = false;
    }
  });
}

// Fades sections in as they scroll into view. Content only starts hidden once this has run,
// so the page stays fully visible if the script fails or IntersectionObserver is missing.
function setUpReveals() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const groups = ['.section-head', '.treatment-group__title', '.row-list li', '.urgent-row', '.first-visit > div', '.numbered li',
    '.two-col > div', '.visit > *', '.facts__list li', '.cta-band__inner > *', '.prose > h2', '.aside-card', '.person', '.band-table', '.form-card', '.check-list li', '.brush-scene', '.testimonial'];
  const targets = document.querySelectorAll(groups.join(','));
  targets.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.matches(groups.join(',')));
    el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el), 5) * 70}ms`);
    el.classList.add('reveal');
  });
  let observerWorks = false;
  // The observer reports every target once straight away; if it stays silent, show everything.
  setTimeout(() => { if (!observerWorks) document.documentElement.classList.remove('reveal-ready'); }, 1500);
  const observer = new IntersectionObserver((entries) => {
    observerWorks = true;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el) => observer.observe(el));
  document.documentElement.classList.add('reveal-ready');
}

setUpReveals();
updateOpeningStatus();
setInterval(updateOpeningStatus, 60 * 1000);
setUpMenu();
setUpRegisterForm();
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
