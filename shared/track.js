/* Corz landing pages: per-lead tracking.
 * The link carries ?t=<opaque token> (never a name or an email) and ?s=<sector>.
 * The page does NOT decide who is human. Mail scanners (Microsoft Safe Links / Defender, Oracle, AWS) open every
 * link in a real browser and scroll to the bottom in one second, so scroll and time-on-page proved nothing
 * (16.11: all 17 alerts were scanners). Every event carries the facts and n8n decides, with the visitor's IP owner:
 *   sid  one id per page load      tz/lang  browser time zone + language      wd  navigator.webdriver (automation)
 *   inp  first REAL input (trusted pointer move / wheel / touch / key; scroll alone is not input)
 *   jump scroll_90 reached under 0.8 s after the first scroll with no input (a scripted scroll-to-bottom)
 * Events: visit, engaged, scroll_30/50/90, video_25/50/90, booking_click, booking_opened, booking_scheduled.
 */
(function () {
  var ENDPOINT = 'https://bennivbee.app.n8n.cloud/webhook/corz-lp'; // n8n: Corz · Landing page tracking (uhXN0RhVwQLnfICI)
  var CALENDLY = 'https://calendly.com/itamar-corz/meet-with-me';
  var q = new URLSearchParams(location.search);
  var token = (q.get('t') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || null;
  var page = document.documentElement.getAttribute('data-page') || 'unknown';
  var t0 = Date.now();
  var ctx = { sid: Math.random().toString(36).slice(2, 10), tz: '', lang: navigator.language || '', wd: !!navigator.webdriver, inp: '' };
  try { ctx.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* old browser */ }
  var sent = {};

  function send(name, extra) {
    if (sent[name] || !token) return;
    sent[name] = true;
    var x = { ms: Date.now() - t0 };
    for (var k in ctx) x[k] = ctx[k];
    for (var j in (extra || {})) x[j] = extra[j];
    var body = { event: name, t: token, page: page, s: q.get('s'), at: new Date().toISOString(), extra: x };
    // A form body is CORS-safelisted, so the beacon needs no preflight; n8n reads it as body.d.
    try { navigator.sendBeacon(ENDPOINT, new URLSearchParams({ d: JSON.stringify(body) })); } catch (e) { /* tracking never breaks the page */ }
  }
  send('visit');

  function input(e) {
    if (!e.isTrusted || ctx.inp) return;
    if (e.type === 'pointermove' && !(e.movementX || e.movementY)) return;
    ctx.inp = e.type;
    send('engaged');
  }
  ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    addEventListener(ev, input, { passive: true });
  });

  var firstScroll = 0;
  addEventListener('scroll', function () {
    var h = document.documentElement;
    var p = (h.scrollTop + innerHeight) / h.scrollHeight;
    if (!firstScroll) firstScroll = Date.now();
    if (p > 0.3) send('scroll_30');
    if (p > 0.5) send('scroll_50');
    if (p > 0.9) send('scroll_90', { jump: !ctx.inp && Date.now() - firstScroll < 800 });
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

  // No inline calendar: the Calendly embed pulls ~4.4MB of third-party scripts, so it loads only on a click.

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
