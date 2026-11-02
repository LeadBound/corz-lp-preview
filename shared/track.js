/* Corz landing pages: per-lead tracking.
 * The link carries ?t=<opaque token> (never a name or an email) and ?s=<sector>.
 * A visit counts only after a human signal (scroll, pointer, touch, key, or 8 s visible), because mail
 * scanners such as Microsoft Safe Links open every link within seconds and run no interaction.
 * Events: visit, scroll_50, scroll_90, video_25/50/90, booking_opened, booking_scheduled.
 * ENDPOINT stays null until the n8n webhook exists; until then events only go to the console.
 */
(function () {
  var ENDPOINT = null; // e.g. 'https://bennivbee.app.n8n.cloud/webhook/corz-lp'
  var CALENDLY = 'https://calendly.com/itamar-corz/meet-with-me';
  var q = new URLSearchParams(location.search);
  var token = (q.get('t') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || null;
  var page = document.documentElement.getAttribute('data-page') || 'unknown';
  var sent = {};
  var human = false;
  var queue = [];

  function send(name, extra) {
    if (sent[name]) return;
    sent[name] = true;
    var body = { event: name, t: token, page: page, s: q.get('s'), at: new Date().toISOString(), extra: extra || null };
    if (!human && name !== 'visit') { queue.push(body); return; }
    if (!ENDPOINT) { console.info('[corz-track]', body); return; }
    try { navigator.sendBeacon(ENDPOINT, JSON.stringify(body)); } catch (e) { /* tracking never breaks the page */ }
  }

  function becameHuman() {
    if (human) return;
    human = true;
    send('visit');
    queue.splice(0).forEach(function (b) { sent[b.event] = false; send(b.event, b.extra); });
  }
  ['scroll', 'pointerdown', 'pointermove', 'touchstart', 'keydown'].forEach(function (ev) {
    addEventListener(ev, becameHuman, { once: true, passive: true });
  });
  setTimeout(function () { if (document.visibilityState === 'visible') becameHuman(); }, 8000);

  addEventListener('scroll', function () {
    var h = document.documentElement;
    var p = (h.scrollTop + innerHeight) / h.scrollHeight;
    if (p > 0.5) send('scroll_50');
    if (p > 0.9) send('scroll_90');
  }, { passive: true });

  document.querySelectorAll('video[data-track]').forEach(function (v) {
    v.addEventListener('timeupdate', function () {
      var p = v.currentTime / (v.duration || 1);
      if (p > 0.25) send('video_25');
      if (p > 0.5) send('video_50');
      if (p > 0.9) send('video_90');
    });
  });

  // Calendly inline embed reports the booking by postMessage, so "booked" is known, not guessed.
  addEventListener('message', function (e) {
    if (!e.data || typeof e.data.event !== 'string' || e.data.event.indexOf('calendly.') !== 0) return;
    if (e.data.event === 'calendly.date_and_time_selected') send('booking_opened');
    if (e.data.event === 'calendly.event_scheduled') {
      send('booking_scheduled');
      document.dispatchEvent(new CustomEvent('corz:booked'));
    }
  });

  // Sector proof line: <p data-sector="edu">…</p>; only the matching one shows.
  var s = q.get('s');
  document.querySelectorAll('[data-sector]').forEach(function (el) {
    el.hidden = el.getAttribute('data-sector') !== s;
  });

  // Booking. utm_content carries the token into the Calendly booking itself, so a booking matches its lead.
  var url = CALENDLY + '?hide_gdpr_banner=1&locale=he&utm_source=corz-lp&utm_medium=' + page + (token ? '&utm_content=' + token : '');
  var widget = null;
  function calendlyReady(cb) {
    if (window.Calendly) return cb();
    if (!widget) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://assets.calendly.com/assets/external/widget.css';
      document.head.appendChild(css);
      widget = document.createElement('script');
      widget.src = 'https://assets.calendly.com/assets/external/widget.js';
      widget.async = true;
      document.body.appendChild(widget);
    }
    widget.addEventListener('load', cb, { once: true });
  }
  // Every booking button, and the floating circle, opens Itamar's calendar as a popup over the page.
  function openBooking(e) {
    if (e) e.preventDefault();
    send('booking_click');
    calendlyReady(function () { window.Calendly.initPopupWidget({ url: url }); });
  }
  document.querySelectorAll('[data-book]').forEach(function (a) { a.addEventListener('click', openBooking); });

  // The inline calendar at the bottom of the page loads when it comes near the screen.
  var inline = false;
  function loadInline() {
    var box = document.getElementById('calendly');
    if (inline || !box) return;
    inline = true;
    box.innerHTML = '';
    var w = document.createElement('div');
    w.className = 'cal-inline';
    w.setAttribute('data-url', url);
    w.style.minWidth = '300px';
    w.style.height = '700px';
    box.appendChild(w);
    calendlyReady(function () { window.Calendly.initInlineWidget({ url: url, parentElement: w }); });
  }
  if ('IntersectionObserver' in window) {
    var target = document.getElementById('book');
    if (target) new IntersectionObserver(function (en, o) {
      if (en[0].isIntersecting) { loadInline(); o.disconnect(); }
    }, { rootMargin: '400px' }).observe(target);
  }

  // Floating circle on the right, always on screen.
  var st = document.createElement('style');
  st.textContent = '.book-fab{position:fixed;right:24px;bottom:24px;z-index:50;width:64px;height:64px;border-radius:50%;border:0;cursor:pointer;' +
    'background:#E0157F;color:#fff;display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(224,21,127,.75);transition:transform .2s}' +
    '.book-fab:hover,.book-fab:focus-visible{transform:scale(1.07)}.book-fab svg{width:28px;height:28px}' +
    '.book-fab span{position:absolute;right:76px;top:50%;translate:0 -50%;white-space:nowrap;background:#1B2951;color:#fff;font:500 15px Rubik,sans-serif;' +
    'padding:8px 14px;border-radius:10px;opacity:0;pointer-events:none;transition:opacity .2s}' +
    '.book-fab:hover span,.book-fab:focus-visible span{opacity:1}' +
    '.book-fab::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid #E0157F;animation:fab 2.4s ease-out 3s 2}' +
    '@keyframes fab{from{transform:scale(1);opacity:.8}to{transform:scale(1.6);opacity:0}}' +
    '@media (max-width:600px){.book-fab{right:16px;bottom:16px;width:58px;height:58px}}' +
    '@media (prefers-reduced-motion:reduce){.book-fab::after{animation:none}}';
  document.head.appendChild(st);
  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'book-fab';
  fab.setAttribute('aria-label', 'קביעת פגישה עם איתמר');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span>קביעת פגישה עם איתמר</span>';
  fab.addEventListener('click', openBooking);
  document.body.appendChild(fab);

  // Product loops play only while on screen.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        var v = x.target;
        if (x.isIntersecting && !matchMedia('(prefers-reduced-motion: reduce)').matches) v.play().catch(function () {});
        else v.pause();
      });
    }, { threshold: 0.35 });
    document.querySelectorAll('video.loop').forEach(function (v) { io.observe(v); });
  }
})();
