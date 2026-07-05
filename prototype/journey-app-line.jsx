/* global React, ReactDOM, IOSDevice */
const { useState, useEffect, useRef, useCallback } = React;

const TENANT = 'Bangkok Pet Clinic';
// C1 fix — clinic identity comes from tenant config; surfaced on Stage 1 + Stage 3
const CLINIC = {
  name: TENANT,
  address: '128 Sukhumvit 49, Khlong Tan Nuea, Watthana, Bangkok 10110',
  mapUrl: 'https://maps.google.com/?q=Bangkok+Pet+Clinic+Sukhumvit+49',
  phone: '+66 2 712 3456',
  phoneTel: '+6627123456',
  locality: 'Sukhumvit 49',
  hours: 'จ–ส · Mon–Sat 09:00–16:00',
  closedDays: [0], // Sunday — from tenant config
};
// Locale for date rendering — 'auto' follows the browser; ไทย/EN can be forced from
// the journey-header toggle (journey chrome, not phone UI). Persisted as pd-locale
// so the playable prototype follows the same setting.
const AUTO_TH = ((navigator.language || 'th').toLowerCase().indexOf('th') === 0);
let LOCALE_PREF = (() => { try { return localStorage.getItem('pd-locale') || 'auto'; } catch (e) { return 'auto'; } })();
const IS_TH = () => LOCALE_PREF === 'th' || (LOCALE_PREF === 'auto' && AUTO_TH);
const FMT_DATE = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(IS_TH() ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const FMT_DOW = (iso) => {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString(IS_TH() ? 'th-TH' : 'en-GB', { weekday: 'short' });
};
// Mask a phone number for OTP / SMS confirmation displays: 0982345678 -> 09x-xxx-5678
function maskPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  if (d.length < 4) return p || '08x-xxx-5678';
  return `${d.slice(0, 2)}x-xxx-${d.slice(-4)}`;
}
// B2 fix — find the next open day (skips clinic closed days)
function nextOpenISO(fromISO) {
  const d = new Date((fromISO || todayISO()) + 'T00:00:00');
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    if (!CLINIC.closedDays.includes(d.getDay())) return d.toISOString().split('T')[0];
  }
  return fromISO;
}
// ─── Calendar reminder — PII-FREE ───────────────────────────────────────────
// PDPA: the .ics / Google Calendar entry is a GENERIC reminder only. No pet name,
// owner name, clinic name, address, or reason — so a forwarded or screenshotted
// link leaks nothing. The appointment specifics stay private inside LINE.
// Static-host friendly (GitHub Pages): built client-side; the user explicitly
// picks Download (.ics) or Google Calendar — no silent WKWebView deep-link failures.
function calPlatform() {
  const ua = navigator.userAgent;
  const isApple = /iPhone|iPad|iPod|Mac/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isIOSSafari = isIOS && /Safari/i.test(ua)
    && !/CriOS|FxiOS|OPiOS|EdgiOS|mercury|Line\//i.test(ua);
  const inWKWebView = isIOS && (/Line\//i.test(ua) || /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua));
  // TEST: window.__PD_SIM forces a platform route — 'ios' | 'line' | 'android' | 'desktop'.
  const sim = (typeof window !== 'undefined') && (window.__PD_SIM || (window.__PD_SIM_LINE ? 'line' : ''));
  if (sim === 'ios')     return { isApple:true,  isIOS:true,  isIOSSafari:true,  inWKWebView:false, isAndroid:false, simulated:'ios' };
  if (sim === 'line')    return { isApple:true,  isIOS:true,  isIOSSafari:false, inWKWebView:true,  isAndroid:false, simulated:'line' };
  if (sim === 'android') return { isApple:false, isIOS:false, isIOSSafari:false, inWKWebView:false, isAndroid:true,  simulated:'android' };
  if (sim === 'desktop') return { isApple:false, isIOS:false, isIOSSafari:false, inWKWebView:false, isAndroid:false, simulated:'desktop' };
  return { isApple, isIOS, isIOSSafari, inWKWebView, isAndroid: /Android/i.test(ua) };
}
function reminderTimes(form) {
  const start = new Date(`${form.date}T${(form.time || '10:00')}:00`);
  const end   = new Date(start.getTime() + 30 * 60000);
  return { start, end };
}
// Generic reminder — contains NO personal data of any kind.
function buildReminderICS(form) {
  const { start, end } = reminderTimes(form);
  const fmt = (dt) => dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PawsDee//Reminder//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@pawsdee`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    'SUMMARY:🐾 เตือนนัดหมาย PawsDee · PawsDee appointment',
    'DESCRIPTION:ดูรายละเอียดนัดหมายของคุณใน LINE · See your appointment details in LINE',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:เตือนนัดหมาย PawsDee', 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
function buildGCalURL(form) {
  const { start, end } = reminderTimes(form);
  const fmt = (dt) => dt.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'เตือนนัดหมาย PawsDee · PawsDee appointment',
    dates: `${fmt(start)}/${fmt(end)}`,
    details: 'ดูรายละเอียดนัดหมายของคุณใน LINE · See your appointment details in LINE',
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
// Build the PII-free .ics as an object URL (caller revokes).
function icsBlobURL(form) {
  return URL.createObjectURL(new Blob([buildReminderICS(form)], { type: 'text/calendar;charset=utf-8' }));
}
// Static GitHub-Pages lander — rebuilds the .ics in Safari. Carries only date+time.
function landerURL(form, { line } = {}) {
  const u = new URL('add.html', location.href);
  u.searchParams.set('d', form.date || '');
  u.searchParams.set('t', form.time || '10:00');
  return u.href + (line ? '&openExternalBrowser=1' : '');
}
// Tiny transient toast — used only when simulating routes in the prototype.
function calToast(msg) {
  document.getElementById('pd-cal-toast')?.remove();
  const t = document.createElement('div');
  t.id = 'pd-cal-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:100000;background:#0f172a;color:#fff;font:600 13px/1.45 var(--font-th),system-ui,sans-serif;padding:11px 16px;border-radius:12px;max-width:88%;box-shadow:0 10px 40px rgba(0,0,0,.35);text-align:center';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
// ── Native-first router ───────────────────────────────────────────────────────
// The bottom sheet is now only a FALLBACK (desktop / unknown). Each mobile OS gets
// the fewest-tap native path; add.html is the last-resort lander for both.
//   • iOS Safari       → navigate to the .ics blob; iOS opens Calendar.app (1 tap)
//   • iOS in-app (LINE)→ add.html?…&openExternalBrowser=1  (bounces out to Safari)
//   • Android          → googlecal:// deep link → web Google Calendar → add.html
//   • Desktop/unknown  → the options sheet
function addToCalendar(form, opts = {}) {
  const plat = calPlatform();
  if (opts.forceSheet) return openCalSheet(form);
  const sim = plat.simulated;
  const go = (url) => { if (sim) window.open(url, '_blank', 'noopener'); else window.location.href = url; };

  if (plat.isIOSSafari) {
    const url = icsBlobURL(form);
    if (sim) calToast('iOS Safari · เปิด .ics → Calendar.app เปิดเลย (1 ขั้นตอน)');
    go(url);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    return;
  }
  if (plat.inWKWebView) {
    if (sim) calToast('LINE / Chrome iOS · เปิด add.html ใน Safari ผ่าน openExternalBrowser=1');
    go(landerURL(form, { line: true }));
    return;
  }
  if (plat.isAndroid) {
    const web = buildGCalURL(form);
    if (sim) { calToast('Android · googlecal:// → ถ้าไม่มีแอป fallback เป็นเว็บ Google Calendar'); window.open(web, '_blank', 'noopener'); return; }
    const deep = web.replace(/^https:\/\//, 'googlecal://');
    let handled = false;
    const onHide = () => { handled = true; };
    document.addEventListener('visibilitychange', onHide, { once: true });
    window.location.href = deep;
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (handled || document.hidden) return;
      try { window.location.href = web; }
      catch (e) { window.location.href = landerURL(form); }
    }, 1200);
    return;
  }
  openCalSheet(form);
}

// Fallback options sheet (desktop / unknown) + the prototype's route-test surface.
function openCalSheet(form) {
  const plat = calPlatform();
  const ics = buildReminderICS(form);
  const gcal = buildGCalURL(form);
  const icsURL = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const { start } = reminderTimes(form);
  let when = '';
  try { when = start.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }); }
  catch (e) { when = start.toLocaleString(); }

  document.getElementById('pd-cal-sheet')?.remove();
  if (!document.getElementById('pd-cal-style')) {
    const st = document.createElement('style');
    st.id = 'pd-cal-style';
    st.textContent = `
#pd-cal-sheet{position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.5);animation:pdcf .2s ease;font-family:var(--font-th),system-ui,sans-serif}
@keyframes pdcf{from{opacity:0}to{opacity:1}}
@keyframes pdcs{from{transform:translateY(24px)}to{transform:translateY(0)}}
#pd-cal-sheet .pd-card{background:#fff;width:100%;max-width:430px;border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -10px 50px rgba(0,0,0,.25);animation:pdcs .26s cubic-bezier(.2,.8,.2,1);max-height:92%;overflow:auto;box-sizing:border-box}
#pd-cal-sheet h3{margin:0;font-size:17px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:8px}
#pd-cal-sheet .pd-x{margin-left:auto;border:none;background:#f1f5f9;width:30px;height:30px;border-radius:50%;cursor:pointer;color:#475569;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center}
#pd-cal-sheet .pd-priv{display:flex;gap:8px;align-items:flex-start;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:12px;padding:9px 11px;font-size:12px;line-height:1.45;margin:13px 0}
#pd-cal-sheet .pd-when{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin-bottom:14px}
#pd-cal-sheet .pd-when .t{font-size:14px;font-weight:700;color:#0f172a}
#pd-cal-sheet .pd-when .d{font-size:13px;color:#475569;margin-top:3px}
#pd-cal-sheet .pd-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:50px;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;border:none;text-decoration:none;box-sizing:border-box;margin-bottom:9px}
#pd-cal-sheet .pd-primary{background:var(--teal-600,#0d9488);color:#fff}
#pd-cal-sheet .pd-secondary{background:#fff;border:1.5px solid #cbd5e1;color:#1e293b}
#pd-cal-sheet .pd-hint{font-size:12px;color:#64748b;line-height:1.5;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:9px 11px;margin-bottom:10px;display:flex;gap:8px}
#pd-cal-sheet .pd-toggle{font-size:12px;color:#64748b;text-align:center;cursor:pointer;text-decoration:underline;text-underline-offset:2px;margin-top:4px;user-select:none}
#pd-cal-sheet pre{background:#0f172a;color:#cbd5e1;border-radius:12px;padding:12px;font-size:11px;line-height:1.5;overflow:auto;margin:10px 0 0;white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Menlo,monospace}
#pd-cal-sheet .pd-sims{margin-top:12px;border-top:1px dashed #e2e8f0;padding-top:10px}
#pd-cal-sheet .pd-sims .lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:7px}
#pd-cal-sheet .pd-sims .row{display:flex;flex-wrap:wrap;gap:6px}
#pd-cal-sheet .pd-sim{flex:1 1 calc(50% - 3px);min-height:34px;border:1px solid #cbd5e1;background:#f8fafc;color:#475569;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer}
#pd-cal-sheet .pd-sim.on{background:#0f172a;color:#fff;border-color:#0f172a}`;
    document.head.appendChild(st);
  }

  const wrap = document.createElement('div');
  wrap.id = 'pd-cal-sheet';
  const dl = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`;
  const ext = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
  const lock = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const safari = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>`;
  // Static-host (GitHub Pages) lander that re-builds the PII-free .ics INSIDE Safari.
  // This is what makes Apple Calendar reachable from LINE's in-app browser: LINE reads
  // openExternalBrowser=1 and kicks the link out to Safari, where the .ics MIME intercept
  // works. Carries only date+time in the query string — no personal data.
  const lander = new URL('add.html', location.href);
  lander.searchParams.set('d', form.date || '');
  lander.searchParams.set('t', form.time || '10:00');
  const landerLine = lander.href + '&openExternalBrowser=1';

  const appleBtn = plat.inWKWebView
    ? `<a class="pd-btn pd-primary" id="pd-apple" href="${landerLine}" target="_blank" rel="noopener">${safari} เพิ่มลง Apple Calendar · via Safari</a>`
    : '';
  const hint = plat.inWKWebView
    ? `<div class="pd-hint">${safari}<span>ในแอป LINE ปุ่มด้านบนจะเปิดหน้านี้ใน Safari ก่อน แล้วจึงเพิ่มลง Apple Calendar · In LINE this opens in Safari first, then adds to Apple Calendar.</span></div>`
    : '';
  const dlClass = plat.inWKWebView ? 'pd-secondary' : 'pd-primary';
  wrap.innerHTML = `
    <div class="pd-card" role="dialog" aria-modal="true">
      <h3>🐾 เพิ่มลงปฏิทิน · Add reminder<button class="pd-x" aria-label="Close">✕</button></h3>
      <div class="pd-priv">${lock}<span>ปฏิทินจะบันทึก<strong>เฉพาะการเตือนเวลา</strong> ไม่มีชื่อสัตว์เลี้ยง คลินิก หรือข้อมูลส่วนตัว — ปลอดภัยแม้แชร์ต่อ · Reminder time only — no pet, clinic or personal data. Safe to share.</span></div>
      <div class="pd-when"><div class="t">🔔 เตือนนัดหมาย PawsDee · PawsDee appointment</div><div class="d">${when}</div></div>
      ${appleBtn}
      ${hint}
      <a class="pd-btn ${dlClass}" id="pd-dl" href="${icsURL}" download="pawsdee-reminder.ics">${dl} ดาวน์โหลด .ics · Apple / Outlook</a>
      <a class="pd-btn pd-secondary" id="pd-gc" href="${gcal}" target="_blank" rel="noopener">${ext} Google Calendar</a>
      <div class="pd-toggle" id="pd-peek">ดูข้อมูลที่จะบันทึก · View exactly what gets saved</div>
      <pre id="pd-ics" hidden></pre>
      <div class="pd-sims">
        <div class="lbl">🧪 จำลองเส้นทาง · Simulate route</div>
        <div class="row">
          <button class="pd-sim${plat.simulated==='ios'?' on':''}" data-sim="ios">iOS Safari</button>
          <button class="pd-sim${plat.simulated==='line'?' on':''}" data-sim="line">LINE / Chrome iOS</button>
          <button class="pd-sim${plat.simulated==='android'?' on':''}" data-sim="android">Android</button>
          <button class="pd-sim${plat.simulated==='desktop'||!plat.simulated?' on':''}" data-sim="desktop">Desktop (this sheet)</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#pd-ics').textContent = ics;

  const close = () => { wrap.remove(); setTimeout(() => URL.revokeObjectURL(icsURL), 1500); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('.pd-x').addEventListener('click', close);
  const peek = wrap.querySelector('#pd-peek');
  const pre = wrap.querySelector('#pd-ics');
  peek.addEventListener('click', () => {
    pre.hidden = !pre.hidden;
    peek.textContent = pre.hidden ? 'ดูข้อมูลที่จะบันทึก · View exactly what gets saved' : 'ซ่อน · Hide';
  });
  wrap.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', () => {
    window.__PD_SIM = b.getAttribute('data-sim');
    window.__PD_SIM_LINE = false;
    close();
    if (window.__PD_SIM === 'desktop') openCalSheet(form);
    else addToCalendar(form);
  }));
}
const futureISO = (addDays) => {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  return d.toISOString().split('T')[0];
};
const todayISO = () => new Date().toISOString().split('T')[0];

// Generate realistic slots for a date. A couple are "full" (2/2 booked).
function buildSlots(seed) {
  const times = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30'];
  const full = new Set([2 + (seed % 3), 5, 9 - (seed % 2)]);
  return times.map((t, i) => ({ time: t, available: !full.has(i) }));
}
// When date is today, mark slots whose time has already passed as unavailable.
function filterPastSlots(slots, date) {
  if (!date || date !== todayISO()) return slots;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return slots.map((s) => {
    const [h, m] = s.time.split(':').map(Number);
    const past = (h * 60 + m) <= nowMins;
    return past ? { ...s, available: false, past: true } : s;
  });
}

// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 18, style, className = '' }) {
  return <i className={`ti ti-${name}${className ? ' ' + className : ''}`} style={{ fontSize: size, ...style }} aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────
// One section header for ALL screens — same position, size, alignment.
// Only words + accent change. tone: 'default' | 'success' | 'line'
// ─────────────────────────────────────────────────────────────
function SectionHeader({ icon, titleTh, titleEn, descTh, descEn, tone = 'default' }) {
  const accent = {
    default: { bg:'transparent', border:'transparent', chip:'var(--teal-600)', title:'var(--neutral-900)', desc:'var(--neutral-500)' },
    success: { bg:'var(--success-light)', border:'#A7F3D0', chip:'var(--success)', title:'#065F46', desc:'#047857' },
    line:    { bg:'#E7FBEF', border:'#A7F3D0', chip:'var(--line-green)', title:'var(--neutral-900)', desc:'var(--line-green)' },
  }[tone];
  const tinted = tone !== 'default';
  return (
    <div style={{
      display:'flex', alignItems:'flex-start', gap:'var(--space-3)',
      padding: tinted ? 'var(--space-3) var(--space-4)' : 0,
      background: accent.bg,
      border: tinted ? `1px solid ${accent.border}` : 'none',
      borderRadius: tinted ? 'var(--radius-lg)' : 0,
    }}>
      {icon && (
        <div style={{
          width:34, height:34, borderRadius:'var(--radius-full)', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background: accent.chip, color:'white',
        }}>
          <Icon name={icon} size={19}/>
        </div>
      )}
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:'var(--text-lg)', fontWeight:700, color:accent.title, lineHeight:1.2 }}>
          {titleTh}{titleEn && <span style={{ color:accent.title, fontWeight:600 }}> · {titleEn}</span>}
        </div>
        {(descTh || descEn) && (
          <div style={{ fontSize:'var(--text-sm)', color:accent.desc, marginTop:2, lineHeight:1.45 }}>
            {descTh}{descEn && ` · ${descEn}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function AppHeader() {
  return (
    <div className="app-header">
      <div className="brand">
        <div className="brand-name" style={{ fontSize:'var(--text-sm)', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{TENANT}</div>
        <div className="poweredby" style={{ marginTop:1 }}>Powered by <span className="poweredby-mark">🐾 PawsDee</span></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// C1 fix — clinic identity block: builds trust at arrival (Stage 1)
// and gives directions at confirmation (Stage 3). From tenant config.
// ─────────────────────────────────────────────────────────────
function ClinicIdentity({ compact = false }) {
  return (
    <div style={{
      display:'flex', flexDirection:'column', gap:6,
      padding:'var(--space-3) var(--space-4)',
      background:'white', border:'1px solid var(--neutral-200)',
      borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-sm)',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
        <Icon name="map-pin" size={15} style={{ color:'var(--teal-600)', marginTop:2, flexShrink:0 }} />
        <span style={{ fontSize:'var(--text-xs)', color:'var(--neutral-600)', lineHeight:1.5 }}>{CLINIC.address}</span>
      </div>
      {!compact && (
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Icon name="clock-hour-4" size={15} style={{ color:'var(--teal-600)', flexShrink:0 }} />
          <span style={{ fontSize:'var(--text-xs)', color:'var(--neutral-600)' }}>{CLINIC.hours}</span>
        </div>
      )}
      <div style={{ display:'flex', gap:8, marginTop:2 }}>
        <a href={`tel:${CLINIC.phoneTel}`} style={chipLink}>
          <Icon name="phone" size={13} /> โทร · Call
        </a>
        <a href={CLINIC.mapUrl} target="_blank" rel="noopener" style={chipLink}>
          <Icon name="map-2" size={13} /> แผนที่ · Map
        </a>
      </div>
    </div>
  );
}
const chipLink = {
  display:'inline-flex', alignItems:'center', gap:5,
  fontSize:'var(--text-xs)', fontWeight:600, textDecoration:'none',
  color:'var(--teal-700)', background:'var(--teal-50)',
  border:'1px solid var(--teal-200)', borderRadius:'var(--radius-full)',
  padding:'5px 11px', minHeight:32, fontFamily:'var(--font-en)',
};

// ─────────────────────────────────────────────────────────────
// STAGE 1 + 2 — Booking form
// ─────────────────────────────────────────────────────────────
function BookingScreen({ form, setForm, onSubmit }) {
  const [slots, setSlots] = useState(() => filterPastSlots(buildSlots(parseInt((form.date||'').replace(/-/g,'').slice(-4),10)||0), form.date));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const onDate = (e) => {
    const date = e.target.value;
    setForm((f) => ({ ...f, date, time:'' }));
    if (date) {
      const seed = parseInt(date.replace(/-/g,'').slice(-4),10)||0;
      setSlots(filterPastSlots(
        CLINIC.closedDays.includes(new Date(date+'T00:00:00').getDay()) ? [] : buildSlots(seed),
        date
      ));
    }
  };

  // B2 fix — jump to the next open day from a closed/empty day
  const jumpToNextOpen = () => {
    const d = nextOpenISO(form.date);
    setForm((f) => ({ ...f, date:d, time:'' }));
    const seed = parseInt(d.replace(/-/g,'').slice(-4),10)||0;
    setSlots(buildSlots(seed));
  };

  const validate = () => {
    const er = {};
    // C1 fix: no ASCII-only guard — Thai names (Unicode) are fully valid
    if (!form.nickname.trim()) er.nickname = true;
    // Thai phone: mobile = 0[689]XXXXXXXX (10 digits); landline = 0[2-7]XXXXXXX (9 digits).
    // +66 international prefix is normalised to local 0XX before checking.
    // Foreign E.164 numbers (+44…, +1…) are ACCEPTED — long-stay expats on foreign
    // SIMs must still be able to book; reminders route via LINE (SMS assumes Thai SIM).
    const rawPhone = form.phone.trim().replace(/[\s\-().]/g, '');
    const localPhone = rawPhone.startsWith('+66') ? '0' + rawPhone.slice(3) : rawPhone;
    const isForeignMobile = /^\+(?!66)\d{7,14}$/.test(rawPhone);
    if (!/^0[689]\d{8}$/.test(localPhone) && !isForeignMobile) {
      er.phone = /^0[2-7]\d{7}$/.test(localPhone) ? 'landline' : 'invalid';
    }
    if (!form.petName.trim()) er.petName = true;
    if (!form.reason) er.reason = true;
    if (!form.species) er.species = true;
    if (!form.date) er.date = true;
    if (!form.time) er.time = true;
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  // NOTE for backend integration: this only advances the client to Review — it does not
  // (and should not) write to the server yet. The PDPA notice above is shown here because
  // that's the point of COLLECTION (the person typing the data), independent of when the
  // backend actually persists it. Real POST/write belongs at ReviewScreen's confirm() below,
  // so an abandoned review never leaves a partial booking in the DB.
  const submit = () => {
    if (!validate()) return;
    setSubmitting(true);
    setTimeout(()=>{setSubmitting(false);onSubmit();},600);
  };

  // Type scale — all via DS tokens for consistency across all screens
  const lbl  = { fontSize:'var(--text-sm)', fontWeight:600, color:'var(--neutral-700)', marginBottom:4, display:'block' };
  const hint = { fontSize:'var(--text-xs)', color:'var(--neutral-500)', marginTop:3, display:'block' };
  const err  = { fontSize:'var(--text-xs)', color:'var(--danger)', marginTop:3, display:'flex', alignItems:'center', gap:3 };
  const inp  = (hasErr) => ({
    width:'100%', height:52, padding:'0 14px', fontSize:16,
    fontFamily:'var(--font-en)', color:'var(--neutral-800)',
    background: hasErr ? '#FFF7F7' : 'white',
    border: `1.5px solid ${hasErr ? 'var(--danger)' : 'var(--neutral-300)'}`,
    borderRadius:'var(--radius-md)', outline:'none', boxSizing:'border-box',
    transition:'border-color 120ms ease-out, box-shadow 120ms ease-out',
  });
  const sel  = (hasErr) => ({
    ...inp(hasErr), paddingRight:32,
    appearance:'none',
    backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2378716C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center',
  });

  return (
    <>
    {/* 🟡 M — aria-live region: screen readers hear validation summary (C-Low aria-live) */}
    <div role="alert" aria-live="polite" style={{ position:'absolute', width:1, height:1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap' }}>
      {Object.keys(errors).length > 0 && 'กรุณากรอกข้อมูลที่ต้องการให้ครบ · Please complete all required fields.'}
    </div>
    <div className="form-scroll" style={{ padding:'var(--space-5) var(--space-5) 12px', display:'flex', flexDirection:'column', gap:6, flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', boxSizing:'border-box', WebkitOverflowScrolling:'touch' }}>

      {/* Header — concise: every word renders twice (TH + EN). No step cue at 2 steps. */}
      <div style={{ flexShrink:0 }}>
        <SectionHeader icon="calendar-plus" titleTh="จองนัดหมาย" titleEn="Book"
          descTh="เลือกเวลาก่อน" descEn="Pick a time first" />
      </div>

      {/* C1 fix — one-line "right place" trust confirmation (they came from Maps;
          full address/call/map live on the Confirmed screen where they're next needed) */}

      {/* B1 fix — AVAILABILITY FIRST: date before any PII */}
      <div style={{ flexShrink:0 }}>
        <span style={lbl}>วันที่นัด · Date <span style={{color:'var(--danger)'}}>*</span></span>
        {/* Overflow wrapper: lets iOS render locale date (e.g. 'BE 2569') naturally;
            the container clips it cleanly without shrinking the text or icon. */}
        <div style={{ position:'relative', overflow:'hidden', borderRadius:'var(--radius-md)', border:`1.5px solid ${errors.date ? 'var(--danger)' : 'var(--neutral-300)'}`, background:'white' }}>
          <input type="date"
            style={{ width:'100%', height:'auto', padding:'12px 14px', paddingRight:44,
              fontSize:16, fontFamily:'var(--font-en)', color:'var(--neutral-800)',
              border:'none', outline:'none', background:'transparent',
              lineHeight:1.2, boxSizing:'border-box', display:'block' }}
            value={form.date} min={todayISO()} onChange={onDate} />
        </div>
      </div>

      {/* slots */}
      <div style={{ flexShrink:0 }}>
        <span style={lbl}>ช่วงเวลา · Timeslots <span style={{color:'var(--danger)'}}>*</span></span>
        {slots.length === 0
          ? /* B2 fix — closed/empty day explains itself and offers the nearest open day */
            <div style={{ padding:'12px', border:'1.5px dashed var(--neutral-300)', borderRadius:'var(--radius-md)', background:'var(--neutral-50)', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Icon name="calendar-off" size={15} style={{color:'var(--neutral-400)', flexShrink:0}}/>
                <span style={{fontSize:13, color:'var(--neutral-600)', fontWeight:600}}>
                  {form.date && CLINIC.closedDays.includes(new Date(form.date+'T00:00:00').getDay())
                    ? 'คลินิกปิดวันนี้ · Clinic closed this day'
                    : 'ไม่มีช่วงเวลาว่าง · No slots available'}
                </span>
              </div>
              <button type="button" onClick={jumpToNextOpen} style={{ alignSelf:'flex-start', display:'inline-flex', alignItems:'center', gap:6, minHeight:40, padding:'8px 14px', fontSize:13, fontWeight:600, fontFamily:'var(--font-en)', color:'white', background:'var(--teal-600)', border:'none', borderRadius:'var(--radius-md)', cursor:'pointer' }}>
                <Icon name="arrow-right" size={14}/> วันว่างถัดไป · Next open: {FMT_DOW(nextOpenISO(form.date))} {FMT_DATE(nextOpenISO(form.date))}
              </button>
            </div>
          : <div className="slot-scroll" style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:2, WebkitOverflowScrolling:'touch' }}>
              {/* 🟠 High — was padding:'5px 9px' (~30px tall); minHeight:44 meets touch targets */}
              {slots.map((s)=>(
                <button key={s.time} type="button"
                  style={{
                    flexShrink:0, padding:'12px 11px', minHeight:48, fontSize:14, fontWeight:500,
                    borderRadius:'var(--radius-md)',
                    border: form.time===s.time ? 'none' : `1.5px solid ${s.available ? 'var(--neutral-300)' : 'var(--neutral-200)'}`,
                    background: form.time===s.time ? 'var(--teal-600)' : s.available ? 'white' : 'var(--neutral-100)',
                    color: form.time===s.time ? 'white' : s.available ? 'var(--neutral-700)' : 'var(--neutral-400)',
                    cursor: s.available ? 'pointer' : 'not-allowed',
                    textDecoration: s.available ? 'none' : 'line-through',
                    opacity: s.past ? 0.35 : 1,
                    whiteSpace:'nowrap', fontFamily:'var(--font-en)',
                  }}
                  disabled={!s.available}
                  onClick={()=>s.available&&setForm((f)=>({...f,time:s.time}))}>{s.time}</button>
              ))}
            </div>
        }
        {errors.time && <span style={err}><Icon name="alert-circle" size={11}/> กรุณาเลือกเวลา · Select a time</span>}
      </div>

      {/* B1 fix — contact + pet AFTER a slot is chosen */}
      {/* name + mobile */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, flexShrink:0 }}>
        <div>
          <span style={lbl}>ชื่อ · Name <span style={{color:'var(--danger)'}}>*</span></span>
          <input type="text" style={inp(errors.nickname)} value={form.nickname}
            onChange={(e)=>setForm((f)=>({...f,nickname:e.target.value}))} placeholder="ชื่อของคุณ · Your name" />
          {errors.nickname && <span style={err}><Icon name="alert-circle" size={11}/> จำเป็น · Required</span>}
        </div>
        <div>
          <span style={lbl}>เบอร์โทร · Mobile <span style={{color:'var(--danger)'}}>*</span></span>
          <input type="tel" style={inp(errors.phone)} value={form.phone}
            onChange={(e)=>setForm((f)=>({...f,phone:e.target.value}))} placeholder="08x-xxx-xxxx / +…" />
          {errors.phone === 'landline' && <span style={err}><Icon name="alert-circle" size={11}/> เบอร์บ้าน/ออฟฟิศ · Use a mobile: 06x, 08x or 09x</span>}
          {errors.phone === 'invalid' && <span style={err}><Icon name="alert-circle" size={11}/> เบอร์ไม่ถูกต้อง · Thai mobile (06x/08x/09x) or +country code</span>}
          {!errors.phone && /^\+(?!66)\d{7,14}$/.test(form.phone.trim().replace(/[\s\-().]/g,'')) &&
            <span style={hint}>เบอร์ต่างประเทศ — แนะนำรับการเตือนทาง LINE · Intl. number — LINE reminders recommended</span>}
        </div>
      </div>

      {/* pet + species */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, flexShrink:0 }}>
        <div>
          <span style={lbl}>ชื่อสัตว์ · Pet <span style={{color:'var(--danger)'}}>*</span></span>
          <input type="text" style={inp(errors.petName)} value={form.petName}
            onChange={(e)=>setForm((f)=>({...f,petName:e.target.value}))} placeholder="ชื่อสัตว์เลี้ยง · Pet's name" />
          {errors.petName && <span style={err}><Icon name="alert-circle" size={11}/> จำเป็น · Required</span>}
        </div>
        <div>
          <span style={lbl}>ประเภท · Species <span style={{color:'var(--danger)'}}>*</span></span>
          <select style={sel(errors.species)} value={form.species}
            onChange={(e)=>setForm((f)=>({...f,species:e.target.value}))}>
            <option value="" disabled>เลือก</option>
            <option value="cat">Cat 🐱</option>
            <option value="dog">Dog 🐶</option>
            <option value="rabbit">Rabbit 🐰</option>
            <option value="bird">Bird 🐦</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* reason — dropdown; ทำหมัน replaces ผ่าตัด; อาบน้ำ/ตัดขน/ฝากเลี้ยง are separate options */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <span style={lbl}>สาเหตุที่มา · Reason for visit <span style={{color:'var(--danger)'}}>*</span></span>
        <select
          value={form.reason}
          onChange={(e)=>setForm((f)=>({...f,reason:e.target.value}))}
          aria-label="Reason for visit"
          style={{ width:'100%', padding:'10px 14px', fontSize:14,
            fontFamily:'var(--font-en)', color: form.reason ? 'var(--neutral-800)' : 'var(--neutral-400)',
            border:`1.5px solid ${errors.reason ? 'var(--danger)' : 'var(--neutral-300)'}`, borderRadius:'var(--radius-md)',
            background:'white', outline:'none', WebkitAppearance:'none', appearance:'none',
            backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat:'no-repeat', backgroundPosition:'right 12px center',
            paddingRight:36, cursor:'pointer', boxSizing:'border-box' }}>
          <option value="">เลือกสาเหตุ · Select reason</option>
          <option value="ตรวจทั่วไป">ตรวจทั่วไป · General check-up</option>
          <option value="ตรวจเฉพาะทาง">ตรวจเฉพาะทาง · Specialist visit</option>
          <option value="ทำหมัน">ทำหมัน · Spay / Neuter</option>
          <option value="จ่ายยา">จ่ายยา · Medication</option>
          <option value="ฉีดวัคซีน">ฉีดวัคซีน · Vaccination</option>
          <option value="อาบน้ำ">อาบน้ำ · Bath</option>
          <option value="ตัดขน">ตัดขน · Grooming</option>
          <option value="ฝากเลี้ยง">ฝากเลี้ยง · Boarding</option>
          <option value="บริการอื่นๆ">บริการอื่นๆ · Other</option>
        </select>
        {errors.reason && <span style={err}><Icon name="alert-circle" size={11}/> จำเป็น · Required</span>}
      </div>

      {/* U1 fix — PDPA collection notice at POINT OF COLLECTION (§23: purpose, retention,
          rights). Lawful basis is contract performance, so this is a NOTICE, not a consent
          checkbox — booking proceeds without ticking anything. Labeled the same as the
          Link-LINE screen's consent block so "your data rights" reads as one standard
          disclosure wherever it appears, not a one-off box. */}
      <div className="consent-block" style={{ flexShrink:0 }}>
        <div className="consent-title"><Icon name="shield-check" size={14} /> สิทธิ์ข้อมูลของคุณ · Your data rights (PDPA)</div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-start', background:'var(--neutral-50)', border:'1px solid var(--neutral-200)', borderRadius:'var(--radius-md)', padding:'10px 12px' }}>
          <Icon name="lock" size={15} style={{ color:'var(--teal-600)', marginTop:1, flexShrink:0 }} />
          <div style={{ fontSize:'var(--text-xs)', color:'var(--neutral-500)', lineHeight:1.55 }}>
            PawsDee เก็บชื่อ เบอร์โทร และข้อมูลสัตว์เลี้ยงเพื่อ<strong style={{ color:'var(--neutral-700)' }}>จองและแจ้งเตือนนัดหมาย</strong>เท่านั้น · เก็บ 24 เดือน · ขอดูหรือลบได้ทุกเมื่อ.{' '}
            <span style={{ display:'block', marginTop:3 }}>We use your name, phone &amp; pet info only to <strong style={{ color:'var(--neutral-700)' }}>book &amp; send reminders for this visit</strong>, kept 24 months. View or delete anytime.</span>
            <a href="#" onClick={(e)=>e.preventDefault()} style={{ color:'var(--teal-700)', fontWeight:600, textDecoration:'underline', display:'inline-block', marginTop:3 }}>นโยบายความเป็นส่วนตัว · Privacy policy</a>
          </div>
        </div>
      </div>

    </div>

    <div className="cta-bar">
      <button className="btn btn-primary" disabled={submitting} onClick={submit}>
        {submitting ? <><Icon name="loader-2" className="spin" size={16}/> ดำเนินการ…</> : <><Icon name="arrow-right" size={16}/> ถัดไป · Next</>}
      </button>
    </div>
    </>
  );
}



// ─────────────────────────────────────────────────────────────
// STAGE 2 — Review & confirm
// ─────────────────────────────────────────────────────────────
function ReviewScreen({ form, onConfirm, onBack }) {
  const [confirming, setConfirming] = useState(false);
  // NOTE for backend integration: THIS is where the real POST to the server should happen —
  // the booking form (submit(), above) only advances the client to this review step.
  const confirm = () => {
    setConfirming(true);
    setTimeout(()=>{ setConfirming(false); onConfirm(); }, 700);
  };
  // A1 fix — every row is tappable; tapping returns to the form to edit
  const row = (icon, label, value, small) => (
    <button type="button" onClick={onBack} className="summary-row" style={{
      width:'100%', background:'none', border:'none', borderBottom:'1px solid var(--neutral-200)',
      font:'inherit', textAlign:'left', cursor:'pointer', padding:'var(--space-3) 0',
    }}>
      <span className="summary-label"><Icon name={icon} size={15}/> {label}</span>
      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
        <span className="summary-value" style={small?{fontSize:'var(--text-sm)'}:undefined}>{value}</span>
        <Icon name="pencil" size={13} style={{ color:'var(--neutral-400)' }}/>
      </span>
    </button>
  );
  return (
    <>
    <div className="screen">
      {/* Section header opens the screen (DS: nothing renders above the header slot).
          A1 recovery is provided by tappable rows + the ghost "Edit" below the CTA. */}
      <div style={{ marginBottom:'var(--space-4)' }}>
        <SectionHeader icon="clipboard-check" titleTh="ตรวจสอบนัดหมาย" titleEn="Review"
          descTh="แตะเพื่อแก้ไข" descEn="Tap to edit" />
      </div>
      <div className="summary" style={{ marginBottom:'var(--space-5)' }}>
        {row('user','ชื่อ · Name', form.nickname||'—')}
        {row('phone','เบอร์โทร · Mobile', form.phone||'—', true)}
        {row('paw','สัตว์เลี้ยง · Pet', form.petName||'—')}
        {row('calendar-event','วันที่ · Date', FMT_DATE(form.date))}
        {row('clock','เวลา · Time', form.time||'—')}
        {form.reason && row('stethoscope','สาเหตุ · Reason', form.reason)}
        <div className="summary-row">
          <span className="summary-label"><Icon name="map-pin" size={15}/> คลินิก · Clinic</span>
          <span className="summary-value" style={{fontSize:'var(--text-sm)'}}>{TENANT}</span>
        </div>
      </div>
    </div>

    <div className="cta-bar">
      <button className="btn btn-primary" disabled={confirming} onClick={confirm}>
        {confirming ? <><Icon name="loader-2" className="spin"/> ยืนยัน…</> : <><Icon name="calendar-check"/> ยืนยันนัดหมาย · Confirm booking</>}
      </button>
      {/* A1 fix — single edit verb: matches the inline row-tap; one ghost below the primary */}
      <button type="button" onClick={onBack} style={{
        width:'100%', marginTop:8, fontSize:'var(--text-md)', fontWeight:600, padding:'12px 8px',
        background:'white', border:'1.5px solid var(--neutral-300)', borderRadius:'var(--radius-lg)',
        color:'var(--neutral-500)', cursor:'pointer', fontFamily:'var(--font-en)',
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        <Icon name="pencil" size={16}/> แก้ไขข้อมูล · Edit
      </button>
    </div>
    </>
  );
}

// C2 fix — token timer stays HIDDEN until the final 5 minutes, then warns.
// Manufactured urgency at the success peak is removed; the booking is already safe.
function TokenTimer({ initialSeconds = 900, threshold = 300 }) {
  const [remaining, setRemaining] = useState(initialSeconds);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);
  if (remaining > threshold) return null; // hidden during the goodwill window
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, '0');
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:'var(--text-xs)', color:'var(--amber-700)', background:'var(--amber-50)', border:'1px solid var(--amber-200)', borderRadius:'var(--radius-md)', padding:'6px 10px' }}>
      <Icon name="clock" size={13}/> ลิงก์ LINE จะหมดอายุใน · LINE link expires in
      <span style={{ fontFamily:'var(--font-mono)', fontWeight:700 }}>{remaining > 0 ? `${m}:${s}` : '0:00'}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STAGE 3 — Appointment confirmed + LINE persuasion
// ─────────────────────────────────────────────────────────────
function SuccessScreen({ form, onLink, onSkip, onCancel = () => {} }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <>
    <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', display:'flex', flexDirection:'column', gap:'var(--space-3)', padding:'var(--space-4) var(--space-4) var(--space-10)' }}>

      {/* Unified section header — LINE tone (one green across stages 3–5). C2: lead with safety, not urgency */}
      <SectionHeader tone="line" icon="check" titleTh="นัดหมายสำเร็จ" titleEn="Confirmed!"
        descTh="นัดถูกบันทึกแล้ว" descEn="Booking saved" />

      {/* Appointment summary — now includes clinic directions (C1) */}
      <div className="summary">
        <div className="summary-row">
          <span className="summary-label"><Icon name="paw" size={14}/> สัตว์เลี้ยง · Pet</span>
          <span className="summary-value">{form.petName||'—'}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label"><Icon name="calendar-event" size={14}/> วันที่ · Date</span>
          <span className="summary-value">{FMT_DATE(form.date)}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label"><Icon name="clock" size={14}/> เวลา · Time</span>
          <span className="summary-value">{form.time||'—'}</span>
        </div>
        {form.reason && (
          <div className="summary-row">
            <span className="summary-label"><Icon name="stethoscope" size={14}/> สาเหตุ · Reason</span>
            <span className="summary-value">{form.reason}</span>
          </div>
        )}
        <div className="summary-row" style={{ alignItems:'flex-start' }}>
          <span className="summary-label"><Icon name="map-pin" size={14}/> สถานที่ · Place</span>
          <a href={CLINIC.mapUrl} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'var(--text-xs)', fontWeight:600, color:'var(--teal-700)', textDecoration:'none', textAlign:'right', maxWidth:170, lineHeight:1.4 }}>
            เปิดแผนที่ · Open map <Icon name="external-link" size={12}/>
          </a>
        </div>
      </div>

      {/* C (review) — self-service change/cancel: a future booking just frees its
          slot, so no phone call is needed. Routes back to the booking screen
          (reschedule = cancel + rebook). */}
      <button type="button" onClick={()=>setConfirmCancel(true)} style={{
        alignSelf:'center', display:'inline-flex', alignItems:'center', gap:6,
        background:'none', border:'none', cursor:'pointer', padding:'6px 8px', marginTop:2,
        fontSize:'var(--text-xs)', fontWeight:600, fontFamily:'var(--font-en)',
        color:'var(--neutral-500)', textDecoration:'underline', textUnderlineOffset:3,
      }}>
        <Icon name="calendar-x" size={14}/> เปลี่ยน/ยกเลิกนัด · Change or cancel
      </button>

    </div>

    {/* CTA bar — LINE link is the only call to action; Skip is the lone secondary.
        (SMS backup is a Phase 2 channel and lives in its own journey.) */}
    <div style={{ flexShrink:0, padding:'12px 16px 18px', background:'white', borderTop:'1px solid var(--neutral-200)', boxShadow:'0 -4px 12px rgba(0,0,0,0.06)', display:'flex', flexDirection:'column', gap:8 }}>
      <button className="btn btn-line" onClick={onLink} style={{ fontWeight:700 }}>
        <Icon name="brand-line" size={20}/> เชื่อม LINE รับการเตือนของ {form.petName||'น้อง'}
      </button>
      {/* D1 fix, folded in — the one non-redundant bit (free / cancel anytime) as a caption,
          instead of a whole separate box repeating what the button above already says */}
      <div style={{ textAlign:'center', fontSize:'var(--text-xs)', color:'var(--neutral-400)', marginTop:-4 }}>
        ฟรี ยกเลิกได้ตลอด · Free, cancel anytime
      </div>
      {/* A (review) — Add to calendar: NEUTRAL secondary so the LINE button is the only accent in the stack */}
      <button type="button" className="btn" onClick={()=>addToCalendar(form)} style={{ background:'white', border:'1.5px solid var(--neutral-300)', color:'var(--neutral-700)' }}>
        <Icon name="calendar-plus" size={18}/> เพิ่มลงปฏิทิน · Add to calendar
      </button>
      {/* Skip — the genuine last resort — plain text, lowest weight */}
      <button onClick={onSkip} style={{
        width:'100%', fontSize:'var(--text-sm)', fontWeight:600, padding:'8px',
        background:'none', border:'none',
        color:'var(--neutral-400)', cursor:'pointer', fontFamily:'var(--font-en)',
        display:'flex', alignItems:'center', justifyContent:'center', gap:6, whiteSpace:'nowrap',
      }}>
        ข้ามไปก่อน · Skip for now
      </button>
      {/* C2 fix — reassurance, not a countdown. Timer surfaces only in the final 5 min. */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:'var(--text-xs)', color:'var(--line-green)' }}>
        <Icon name="circle-check" size={13}/> นัดของคุณถูกบันทึกแล้ว · Your booking is safe
      </div>
      <TokenTimer />
    </div>

    {/* C (review) — destructive confirm: cancel never fires on a single tap.
        Restates pet · date · time + the consequence; Keep is the safe default,
        Cancel is the only btn-danger in the flow. */}
    {confirmCancel && (
      <div role="dialog" aria-modal="true" aria-label="Cancel booking"
        onClick={()=>setConfirmCancel(false)}
        style={{ position:'absolute', inset:0, zIndex:60, display:'flex', alignItems:'flex-end',
          justifyContent:'center', background:'rgba(15,23,42,0.45)', padding:14, boxSizing:'border-box' }}>
        <div onClick={(e)=>e.stopPropagation()} style={{ width:'100%', background:'white',
          borderRadius:'var(--radius-xl)', boxShadow:'var(--shadow-xl)', padding:'var(--space-5)', textAlign:'center' }}>
          <div style={{ width:46, height:46, borderRadius:'var(--radius-full)', background:'#FEF2F2',
            color:'var(--danger)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
            <Icon name="calendar-x" size={23}/>
          </div>
          <div style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'var(--neutral-900)', lineHeight:1.2 }}>ยกเลิกนัดหมาย? · Cancel this booking?</div>
          <div style={{ fontSize:'var(--text-xs)', color:'var(--neutral-500)', marginTop:6, lineHeight:1.5 }}>
            {form.petName||'น้อง'} · {FMT_DATE(form.date)} {form.time||''} — ช่วงเวลานี้จะถูกปล่อยคืน · this slot is released. จองใหม่ได้ทุกเมื่อ · book again anytime.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:'var(--space-4)' }}>
            <button className="btn btn-secondary" style={{ width:'100%', justifyContent:'center' }} onClick={()=>setConfirmCancel(false)}>
              <Icon name="arrow-back-up" size={16}/> เก็บนัดไว้ · Keep booking
            </button>
            <button className="btn btn-danger" style={{ width:'100%', justifyContent:'center' }} onClick={()=>{ setConfirmCancel(false); onCancel(); }}>
              <Icon name="calendar-x" size={16}/> ยกเลิกนัด · Cancel booking
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// STAGE 4 — LINE linking + PDPA consent (+ expired/OTP recovery)
// ─────────────────────────────────────────────────────────────
function LinkingScreen({ nickname, petName, onDone, expired = false }) {
  const [view, setView] = useState('consent'); // consent | otp
  // PDPA: reminders = contract performance (Art. 24(3)) — not a consent item.
  // Only marketing requires explicit consent; it is optional and non-blocking.
  const [consent, setConsent] = useState({ marketing: false });
  const [linking, setLinking] = useState(false);

  const link = () => {
    setLinking(true);
    // Linking succeeds → advance straight to the single linked terminal (Stage 5,
    // AccountLinkedScreen) via onDone(). No separate in-screen "linked" view — that
    // duplicated the confirmed screen that follows.
    setTimeout(() => { setLinking(false); onDone(); }, 900);
  };

  if (view === 'otp') {
    return <OtpRecovery onBack={() => setView('consent')} onVerified={onDone} />;
  }

  return (
    <>
    <div className="screen stack" style={{ gap:'var(--space-3)', paddingBottom:'var(--space-16)', overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
      <SectionHeader tone="line" icon="brand-line" titleTh="เชื่อม LINE" titleEn="Link LINE"
        descTh={expired ? 'ลิงก์หมดอายุ' : `รับการเตือนนัดของ ${petName || 'น้อง'}`}
        descEn={expired ? 'Link expired' : 'Get reminders on LINE'} />

      {/* A4 fix — proactive expired state: don't make the user self-diagnose */}
      {expired ? (
        <div className="alert alert-warning">
          <Icon name="clock-exclamation" style={{ fontSize:18, marginTop:1, flexShrink:0 }} />
          <div>
            ลิงก์หมดอายุ แต่นัดยังอยู่ · Link expired — booking is safe. ยืนยันด้วยโทรศัพท์ · Verify by phone.
          </div>
        </div>
      ) : (
        <>
        <div className="consent-block" style={{ gap:'var(--space-3)' }}>
          <div className="consent-title"><Icon name="shield-check" size={14} /> สิทธิ์ข้อมูลของคุณ · Your data rights (PDPA)</div>

          {/* One factual notice — the reminders channel (LINE-specific, so it belongs here).
              Data collection/retention is stated ONCE on the booking page — not duplicated here. */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', background:'var(--neutral-50)', border:'1px solid var(--neutral-200)', borderRadius:'var(--radius-md)' }}>
            <Icon name="bell" size={15} style={{ color:'var(--teal-600)', marginTop:1, flexShrink:0 }} />
            <span style={{ fontSize:'var(--text-xs)', color:'var(--neutral-500)', lineHeight:1.55 }}>
              การแจ้งเตือนนัดหมายจะส่งผ่าน LINE นี้ · Appointment reminders will be sent via this LINE — เป็นส่วนหนึ่งของบริการที่คุณจองไว้ · part of the service you booked.
            </span>
          </div>

          {/* The ONLY opt-in here — separated from the read-only notices above and placed last,
              right by the CTA, so the one actionable choice isn't buried in the middle. */}
          <div style={{ borderTop:'1px solid var(--neutral-200)', marginTop:2, paddingTop:'var(--space-3)' }}>
            <label className="checkbox-row">
              <input type="checkbox" checked={consent.marketing}
                onChange={(e) => setConsent((c) => ({ ...c, marketing: e.target.checked }))} />
              <span className="checkbox-text">รับข่าวสารและโปรโมชันผ่าน LINE · News &amp; promotions via LINE <span style={{color:'var(--neutral-400)', fontSize:'var(--text-xs)'}}>(ไม่บังคับ · Optional)</span></span>
            </label>
            <div style={{ fontSize:'var(--text-xs)', color:'var(--neutral-400)', lineHeight:1.5, marginTop:6 }}>
              ถอนความยินยอมโปรโมชั่นได้ทุกเมื่อ · Withdraw marketing consent anytime (PDPA).
            </div>
          </div>
        </div>

        <div className="divider-or">เซสชันหมดอายุ? · Session expired?</div>
        <button className="link-btn" style={{ alignSelf:'center', textAlign:'center' }} onClick={() => setView('otp')}>
          ยืนยันด้วยโทรศัพท์แทน · Verify by phone →
        </button>
        </>
      )}
    </div>

    <div className="cta-bar">
      {expired ? (
        <button className="btn btn-primary" onClick={() => setView('otp')}>
          <Icon name="shield-check" size={18} /> ยืนยันด้วยโทรศัพท์ · Verify by phone
        </button>
      ) : (
        <button className="btn btn-line" disabled={linking} onClick={link}>
          {linking ? <><Icon name="loader-2" className="spin" /> กำลังเชื่อมต่อ…</> : <><Icon name="brand-line" size={20} /> เชื่อมบัญชี LINE</>}
        </button>
      )}
    </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// OTP verification — shared by two entry points:
//   • token-expiry recovery on the LINE path (mode='recover')
//   • enabling the SMS backup channel (mode='enable')
// Copy + tone adapt to the entry point; the mechanic is identical.
// ─────────────────────────────────────────────────────────────
function OtpRecovery({ onBack, onVerified, phoneMask = '08x-xxx-5678', mode = 'recover', verifyLabel }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [remaining, setRemaining] = useState(180);
  const [err, setErr] = useState('');
  const refs = useRef([]);

  const COPY = mode === 'enable'
    ? {
        title: 'ยืนยันเบอร์โทร · Verify your number',
        sub: 'กรอกรหัส 6 หลักที่ส่งทาง SMS เพื่อเปิดรับการเตือน · Enter the 6-digit SMS code to switch on reminders.',
        alertIcon: 'message-2',
        alertText: <>ส่งรหัสทาง SMS ไปที่ · We texted a code to <strong>{phoneMask}</strong>.</>,
      }
    : {
        title: 'ยืนยันตัวตนด้วยโทรศัพท์ · Verify by phone',
        sub: 'เซสชันหมดอายุแล้ว กรุณากรอกรหัส 6 หลักที่ส่งไปยังโทรศัพท์ · Session expired. Enter the 6-digit code sent to your phone.',
        alertIcon: 'clock-exclamation',
        alertText: <>ส่ง OTP ทาง SMS ไปที่ · An OTP was sent via SMS to <strong>{phoneMask}</strong>.</>,
      };

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');

  const setDigit = (i, v) => {
    if (!/^\d?$/.test(v)) return;
    setDigits((d) => { const n = [...d]; n[i] = v; return n; });
    setErr('');
    if (v && i < 5) refs.current[i + 1]?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const verify = () => {
    const code = digits.join('');
    if (!/^\d{6}$/.test(code)) { setErr('กรุณากรอกรหัส 6 หลัก · Enter all 6 digits.'); return; }
    if (remaining <= 0) { setErr('รหัสหมดอายุ · Code expired — request a new one.'); return; }
    onVerified();
  };

  return (
    <>
    <div className="screen stack" style={{ gap:'var(--space-3)', paddingBottom:'var(--space-16)', overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
      <div>
        <button className="link-btn" onClick={onBack}>← กลับ · Back</button>
        <div className="screen-title" style={{ marginTop:'var(--space-3)' }}>{COPY.title}</div>
        <div className="screen-sub">{COPY.sub}</div>
      </div>

      <div className={`alert alert-${mode === 'enable' ? 'info' : 'warning'}`}>
        <Icon name={COPY.alertIcon} style={{ fontSize:18, marginTop:1, flexShrink:0 }} />
        <div>{COPY.alertText}</div>
      </div>

      <div className="field">
        <label className="field-label">รหัสยืนยัน / Verification code</label>
        <div className="otp-group">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => (refs.current[i] = el)}
              className={`otp-cell ${d ? 'filled' : ''}`} value={d} inputMode="numeric" maxLength={1}
              onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
              aria-label={`OTP digit ${i + 1}`} />
          ))}
        </div>
        <div className={`otp-timer ${remaining <= 0 ? 'expired' : ''}`}>
          <Icon name="clock" size={14} /> {remaining > 0 ? `Expires in ${mm}:${ss}` : 'รหัสหมดอายุ · Expired'}
        </div>
        {err && <span className="err-text"><Icon name="alert-circle" size={12} /> {err}</span>}
      </div>
    </div>

    <div className="cta-bar">
      <button className="btn btn-primary" onClick={verify}>
        <Icon name="shield-check" /> {verifyLabel || <>ยืนยันและเชื่อมบัญชี · Verify &amp; link</>}
      </button>
      <button className="btn btn-secondary" style={{ marginTop:6 }}
        onClick={() => { setRemaining(180); setDigits(['','','','','','']); setErr(''); }}>
        <Icon name="refresh" /> ส่งรหัสใหม่ · Resend code
      </button>
    </div>
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// BACKUP PATH — Stage B1: Confirm number for SMS reminders
// Reached from Stage 3 ("No LINE? Get reminders by SMS") or from an expired
// LINE link. SMS is a real reminder channel here — not a dead-end skip.
// ─────────────────────────────────────────────────────────────
function SmsConfirmScreen({ form, onSend, onEditPhone, onPreferLine }) {
  const [sending, setSending] = useState(false);
  const send = () => { setSending(true); setTimeout(() => { setSending(false); onSend && onSend(); }, 700); };
  return (
    <>
    <div className="screen stack" style={{ gap:'var(--space-3)', overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
      <SectionHeader icon="message-2" titleTh="รับการเตือนทาง SMS" titleEn="SMS reminders"
        descTh="ไม่ต้องใช้ LINE" descEn="No LINE needed" />

      {/* Plain-language promise: this is a real channel, tied to the pet */}
      <p style={{ fontSize:'var(--text-sm)', color:'var(--neutral-600)', lineHeight:1.55, margin:0 }}>
        เราจะส่งข้อความเตือนนัดของ <strong style={{ color:'var(--neutral-800)' }}>{form.petName || 'น้อง'}</strong> ไปที่เบอร์นี้
        · We’ll text {form.petName || 'your pet'}’s appointment reminders to this number.
      </p>

      {/* The number, with an edit affordance — the phone is the whole recovery channel */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:'var(--space-3)',
        padding:'var(--space-3) var(--space-4)', background:'white',
        border:'1px solid var(--neutral-200)', borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-sm)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', minWidth:0 }}>
          <Icon name="device-mobile" size={20} style={{ color:'var(--teal-600)', flexShrink:0 }} />
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:'var(--text-xs)', color:'var(--neutral-500)' }}>เบอร์มือถือ · Mobile</div>
            <div style={{ fontSize:'var(--text-md)', fontWeight:700, fontFamily:'var(--font-mono)', color:'var(--neutral-900)' }}>{form.phone || '—'}</div>
          </div>
        </div>
        <button type="button" onClick={onEditPhone} style={{
          display:'inline-flex', alignItems:'center', gap:5, flexShrink:0, minHeight:36, padding:'6px 12px',
          fontSize:'var(--text-xs)', fontWeight:600, fontFamily:'var(--font-en)', cursor:'pointer',
          color:'var(--teal-700)', background:'var(--teal-50)', border:'1px solid var(--teal-200)', borderRadius:'var(--radius-full)',
        }}>
          <Icon name="pencil" size={13} /> แก้ไข · Edit
        </button>
      </div>

      {/* PDPA: the notice-only block reappears here — same standard component as the
          Booking form (see BookingScreen), not a one-off. This screen UPDATES how an
          already-collected number is used (activating a new SMS channel), and PDPA
          requires the same purpose/retention/rights disclosure whenever collected data
          is updated or repurposed, not only at first collection. */}
      <div className="consent-block" style={{ padding:'var(--space-3) var(--space-4)' }}>
        <div className="consent-title"><Icon name="shield-check" size={14} /> สิทธิ์ข้อมูลของคุณ · Your data rights (PDPA)</div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-start', background:'var(--neutral-50)', border:'1px solid var(--neutral-200)', borderRadius:'var(--radius-md)', padding:'10px 12px' }}>
          <Icon name="lock" size={15} style={{ color:'var(--teal-600)', marginTop:1, flexShrink:0 }} />
          <div style={{ fontSize:'var(--text-xs)', color:'var(--neutral-500)', lineHeight:1.55 }}>
            เบอร์นี้จะถูกใช้เพื่อ<strong style={{ color:'var(--neutral-700)' }}>แจ้งเตือนนัดหมายทาง SMS</strong>เท่านั้น · เก็บ 24 เดือน · ขอดูหรือลบได้ทุกเมื่อ.
            <span style={{ display:'block', marginTop:3 }}>This number will only be used to <strong style={{ color:'var(--neutral-700)' }}>send SMS appointment reminders</strong>, kept 24 months. View or delete anytime.</span>
          </div>
        </div>
      </div>

      {/* Reassurance — free, reversible, plus what SMS gives vs LINE */}
      <div className="alert alert-info">
        <Icon name="info-circle" style={{ fontSize:18, marginTop:1, flexShrink:0 }} />
        <div style={{ fontSize:'var(--text-xs)', lineHeight:1.55 }}>
          ฟรี ยกเลิกได้ทุกเมื่อ — แค่ยืนยันเบอร์หนึ่งครั้ง · Free, cancel anytime — just one verification.
        </div>
      </div>
    </div>

    <div className="cta-bar" style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <button className="btn btn-primary" disabled={sending} onClick={send}>
        {sending ? <><Icon name="loader-2" className="spin" size={16}/> กำลังส่ง…</> : <><Icon name="send" size={16}/> ส่งรหัสทาง SMS · Send SMS code</>}
      </button>
      {/* Always offer the way back to the premium channel */}
      <button type="button" onClick={onPreferLine} style={{
        width:'100%', fontSize:'var(--text-sm)', fontWeight:600, padding:'10px 8px',
        background:'none', border:'none', color:'var(--line-green)', cursor:'pointer',
        fontFamily:'var(--font-en)', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        <Icon name="brand-line" size={16}/> มี LINE อยู่แล้ว? เชื่อแทน · Have LINE? Use it instead
      </button>
    </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// BACKUP PATH — Stage B3: SMS reminders active (success)
// The backup path's own peak moment — dignified, not a consolation prize.
// ─────────────────────────────────────────────────────────────
function SmsActiveScreen({ form, onDone, onUpgradeLine }) {
  return (
    <>
    <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', display:'flex', flexDirection:'column', gap:'var(--space-3)', padding:'var(--space-4) var(--space-4) var(--space-4)' }}>
      <SectionHeader tone="success" icon="message-check" titleTh="เปิดใช้ SMS แล้ว" titleEn="SMS reminders on"
        descTh="ไม่พลาดนัดแน่นอน" descEn="You won’t miss it" />

      <div className="summary">
        <div className="summary-row">
          <span className="summary-label"><Icon name="paw" size={14}/> สัตว์เลี้ยง · Pet</span>
          <span className="summary-value">{form.petName || '—'}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label"><Icon name="calendar-event" size={14}/> วันที่ · Date</span>
          <span className="summary-value">{FMT_DATE(form.date)}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label"><Icon name="device-mobile" size={14}/> ส่งไปที่ · Texts to</span>
          <span className="summary-value" style={{ fontFamily:'var(--font-mono)', fontSize:'var(--text-sm)' }}>{maskPhone(form.phone)}</span>
        </div>
      </div>

      {/* What SMS will actually do — promise only what ships */}
      <div className="next-box">
        <Icon name="bell" className="next-box-icon" size={18}/>
        <div>
          <div className="next-box-title">ขั้นตอนต่อไป · What’s next</div>
          <div className="next-box-body">คลินิกจะส่ง SMS เตือนนัดก่อนถึงวัน · The clinic will text you before the visit</div>
        </div>
      </div>

      {/* A record for everyone (same .ics affordance as the LINE path) */}
      <button type="button" onClick={()=>addToCalendar(form)} style={{
        width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, minHeight:46,
        fontSize:'var(--text-sm)', fontWeight:600, fontFamily:'var(--font-en)',
        color:'var(--neutral-700)', background:'white', border:'1.5px solid var(--neutral-300)',
        borderRadius:'var(--radius-lg)', cursor:'pointer',
      }}>
        <Icon name="calendar-plus" size={16}/> เพิ่มลงปฏิทิน · Add to calendar
      </button>

      {/* Change/cancel path */}
      <a href={`tel:${CLINIC.phoneTel}`} style={{
        display:'flex', alignItems:'center', gap:10, padding:'10px 14px', textDecoration:'none',
        background:'var(--neutral-50)', border:'1px solid var(--neutral-200)', borderRadius:'var(--radius-lg)',
      }}>
        <Icon name="phone" size={16} style={{ color:'var(--teal-600)', flexShrink:0 }}/>
        <span style={{ fontSize:'var(--text-xs)', color:'var(--neutral-600)', lineHeight:1.45 }}>
          <strong style={{ color:'var(--neutral-800)' }}>เปลี่ยน/ยกเลิกนัด?</strong> โทรหาคลินิก · Changes? Call the clinic
        </span>
      </a>
    </div>

    {/* CTA — Done primary; gentle LINE upgrade as the optional better channel */}
    <div className="cta-bar" style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <button className="btn btn-primary" onClick={onDone}><Icon name="check" size={18}/> เสร็จสิ้น · Done</button>
      <button type="button" onClick={onUpgradeLine} style={{
        width:'100%', fontSize:'var(--text-sm)', fontWeight:600, padding:'10px 8px',
        background:'#E7FBEF', border:'1px solid #A7F3D0', borderRadius:'var(--radius-lg)',
        color:'#065F46', cursor:'pointer', fontFamily:'var(--font-en)',
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        <Icon name="brand-line" size={16} style={{ color:'var(--line-green)' }}/> อัปเกรดเป็น LINE ได้ภายหลัง · Add LINE later for more
      </button>
    </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Dynamic phone size — measures the actual phone-row box and fits
// the full iPhone 13 (390:844) inside it. No chrome guessing.
// ─────────────────────────────────────────────────────────────
function usePhoneSize(N, rowRef) {
  const [size, setSize] = useState({ w: 300, h: 649 });
  useEffect(() => {
    const calc = () => {
      const el = rowRef.current;
      if (!el) return;
      const rowH = el.clientHeight;
      const rowW = el.clientWidth;
      const PILL = 40;              // stage pill + gap sitting above each phone
      const GAP  = 16 * (N - 1);    // gaps between phones
      const RATIO = 844 / 390;      // iPhone 13 — locked ratio
      // Fit by measured height first, then clamp by width if N phones won't fit.
      let h = rowH - PILL;
      let w = h / RATIO;
      if (w * N + GAP > rowW) {
        w = (rowW - GAP) / N;
        h = w * RATIO;
      }
      setSize({ w: Math.max(Math.round(w), 0), h: Math.max(Math.round(h), 0) });
    };
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null;
    if (ro && rowRef.current) ro.observe(rowRef.current);
    window.addEventListener('resize', calc);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', calc); };
  }, [N, rowRef]);
  return size;
}

// ─────────────────────────────────────────────────────────────
// Lane sizing — each lane keeps a FULL-size phone (one lane ≈ one viewport).
// The map scrolls vertically so the SMS backup lane sits below the LINE lane.
// ─────────────────────────────────────────────────────────────
const BL = { LANE_TITLE: 26, PILL: 26, COLGAP: 16, ROWGAP: 36, COLS: 5, RATIO: 844 / 390 };
function usePhoneBranch(rowRef) {
  const [size, setSize] = useState({ w: 180, h: 389 });
  useEffect(() => {
    const calc = () => {
      const el = rowRef.current;
      if (!el) return;
      const H = el.clientHeight, W = el.clientWidth;
      const RO = BL.LANE_TITLE + BL.PILL + 16;           // lane title + phone pill + gaps
      const wFromW = (W - BL.COLGAP * (BL.COLS - 1)) / BL.COLS;
      let h = Math.min(wFromW * BL.RATIO, H - RO - 6);   // a full lane fits the visible area
      let w = h / BL.RATIO;
      setSize({ w: Math.max(Math.round(w), 0), h: Math.max(Math.round(h), 0) });
    };
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null;
    if (ro && rowRef.current) ro.observe(rowRef.current);
    window.addEventListener('resize', calc);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', calc); };
  }, [rowRef]);
  return size;
}

// ─────────────────────────────────────────────────────────────
// STAGE 5 — Account Linked Successfully
// ─────────────────────────────────────────────────────────────
function AccountLinkedScreen({ form, onDone }) {
  return (
    <>
    {/* Same pattern as stages 1/2/4: custom scroll area + cta-bar */}
    <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'var(--space-3) var(--space-4) var(--space-4)' }}>

      <SectionHeader
        tone="line"
        icon="link"
        titleTh="เชื่อมสำเร็จ"
        titleEn="Linked!"
        descTh="LINE เชื่อมแล้ว"
        descEn="LINE connected"
      />

      {/* D3 fix — close the loop inside LINE: point to the confirmation card */}
      <div className="next-box" style={{ background:'#E7FBEF', borderColor:'#A7F3D0', color:'#065F46', marginTop:'var(--space-3)' }}>
        <Icon name="brand-line" className="next-box-icon" size={18} style={{ color:'var(--line-green)' }}/>
        <div>
          <div className="next-box-title" style={{ color:'#065F46' }}>บัตรนัดอยู่ใน LINE แล้ว · Your card is in LINE</div>
          <div className="next-box-body" style={{ color:'#047857' }}>เปิดแชทเพื่อดูบัตรนัดของ {form.petName||'น้อง'} · Open the chat anytime</div>
        </div>
      </div>

      {/* C3 fix — promise only what the system actually ships today */}
      <div className="next-box" style={{ marginTop:'var(--space-3)' }}>
        <Icon name="bell" className="next-box-icon" size={18}/>
        <div>
          <div className="next-box-title">ขั้นตอนต่อไป · What's next</div>
          <div className="next-box-body">คลินิกจะเตือนนัดทาง LINE · Your reminder will arrive on LINE</div>
        </div>
      </div>

    </div>

    {/* CTA bar — D3: open LINE chat is primary; Done is the ghost secondary. C4: no auto-close. */}
    <div className="cta-bar" style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <button className="btn btn-line" onClick={onDone} style={{ fontWeight:700 }}>
        <Icon name="brand-line" size={20}/> เปิดแชท LINE · Open LINE chat
      </button>
      <button type="button" onClick={onDone} style={{
        width:'100%', fontSize:'var(--text-md)', fontWeight:600, padding:'12px 8px',
        background:'white', border:'1.5px solid var(--neutral-300)', borderRadius:'var(--radius-lg)',
        color:'var(--neutral-500)', cursor:'pointer', fontFamily:'var(--font-en)',
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        <Icon name="check" size={16}/> เสร็จสิ้น · Done
      </button>
    </div>
    </>
  );
}

// Demo data for right-side phones
const DEMO_FORM = {
  nickname: 'Nida', phone: '0982345678',
  petName: 'Mochi', species: 'cat',
  date: futureISO(3), time: '10:00', reason: '',
};

// ─────────────────────────────────────────────────────────────
// App shell — branching journey map: shared trunk → LINE lane + SMS backup lane
// ─────────────────────────────────────────────────────────────
const PILL_TONE = {
  trunk: { bg:'var(--teal-50)', border:'var(--teal-400)', color:'var(--teal-800)', numBg:'var(--teal-600)', numColor:'#fff' },
  fork:  { bg:'#FFFBEB',        border:'var(--amber-300)', color:'var(--amber-700)', numBg:'var(--amber-500)', numColor:'#fff' },
  line:  { bg:'#E7FBEF',        border:'#A7F3D0',          color:'#047857',          numBg:'var(--line-green)', numColor:'#fff' },
  sms:   { bg:'var(--neutral-50)', border:'var(--neutral-300)', color:'var(--neutral-600)', numBg:'var(--neutral-500)', numColor:'#fff' },
};

function MapPhone({ label, tone = 'trunk', w, h, children }) {
  const t = PILL_TONE[tone];
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flexShrink:0, width:w }}>
      <div style={{
        maxWidth:w, display:'inline-flex', alignItems:'center', gap:6, height:BL.PILL - 4,
        fontSize:'var(--text-xs)', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden',
        background:t.bg, color:t.color, border:`1px solid ${t.border}`,
        borderRadius:'var(--radius-full)', padding:'0 11px 0 5px',
      }}>
        <span style={{
          width:18, height:18, borderRadius:'var(--radius-full)', flexShrink:0,
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          fontSize:10, fontWeight:700, fontFamily:'var(--font-mono)',
          background:t.numBg, color:t.numColor,
        }}>{label.num}</span>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{label.th} <span style={{ opacity:.6 }}>· {label.en}</span></span>
      </div>
      <IOSDevice width={w} height={h}>
        <div className="app"><AppHeader />{children}</div>
      </IOSDevice>
    </div>
  );
}

function LaneTitle({ icon, th, en, badge, tone }) {
  const c = tone === 'line' ? 'var(--line-green)' : 'var(--teal-700)';
  const bg = tone === 'line' ? '#E7FBEF' : 'var(--teal-50)';
  const bd = tone === 'line' ? '#A7F3D0' : 'var(--teal-200)';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, height:BL.LANE_TITLE, paddingLeft:2 }}>
      <span style={{
        display:'inline-flex', alignItems:'center', gap:7, fontSize:'var(--text-sm)', fontWeight:700,
        color:c, background:bg, border:`1px solid ${bd}`, borderRadius:'var(--radius-full)', padding:'3px 12px',
      }}>
        <i className={`ti ti-${icon}`} style={{ fontSize:15 }} aria-hidden="true"></i>
        {th} <span style={{ fontWeight:600, opacity:.75 }}>· {en}</span>
      </span>
      {badge && (
        <span style={{ fontSize:'var(--text-xs)', fontWeight:600, color:'var(--neutral-500)' }}>{badge}</span>
      )}
    </div>
  );
}

// Vertical fork connector — drops from the LINE lane's Stage 3 down to the
// SMS lane's first phone (B1), which sits directly beneath it (col 3).
function LaneConnector({ w, indent }) {
  // Sits in the ROWGAP band; centered on the Stage-3 / B1 column.
  const cx = indent + w / 2;
  return (
    <svg width="100%" height={BL.ROWGAP} style={{ display:'block', overflow:'visible' }} aria-hidden="true">
      <defs>
        <marker id="lc-sms" markerWidth="8" markerHeight="8" refX="4" refY="6" orient="auto">
          <path d="M0 0L4 6L8 0" fill="none" stroke="var(--teal-600)" strokeWidth="2"/>
        </marker>
      </defs>
      <path d={`M ${cx} 0 L ${cx} ${BL.ROWGAP - 6}`} fill="none" stroke="var(--teal-600)" strokeWidth="2.5" strokeDasharray="7 5" markerEnd="url(#lc-sms)"/>
      <circle cx={cx} cy="1" r="4.5" fill="var(--amber-500)" stroke="#fff" strokeWidth="2"/>
      <text x={cx + 12} y={BL.ROWGAP / 2 + 4} fontSize="12" fontWeight="700" fill="var(--teal-700)" fontFamily="var(--font-en, sans-serif)">ไม่มี LINE? · No LINE → สำรองด้วย SMS</text>
    </svg>
  );
}

function App() {
  const rowRef = useRef(null);
  const { w, h } = usePhoneBranch(rowRef);
  // Date-locale toggle state — changing it re-renders every screen so FMT_DATE/FMT_DOW
  // pick up the new setting immediately.
  const [locale, setLocaleState] = useState(LOCALE_PREF);
  const changeLocale = (v) => {
    LOCALE_PREF = v;
    try { localStorage.setItem('pd-locale', v); } catch (e) {}
    setLocaleState(v);
  };
  const [form, setForm] = useState({
    nickname: 'Nida', phone: '0982345678',
    petName: 'Mochi', species: 'cat',
    date: futureISO(3), time: '', reason: '',
  });

  const df = Object.assign({}, DEMO_FORM, {
    petName: form.petName || 'Mochi',
    date: form.date || DEMO_FORM.date,
    time: form.time || '10:00',
    nickname: form.nickname || 'Nida',
    phone: form.phone || DEMO_FORM.phone,
  });

  const noop = () => {};
  const laneWidth = BL.COLS * w + (BL.COLS - 1) * BL.COLGAP;
  const indent = 2 * (w + BL.COLGAP); // B1 sits under Stage 3 (col 3)

  return (
    <div style={{
      height:'100vh', overflow:'hidden', display:'flex', flexDirection:'column',
      background:'radial-gradient(at 0% 0%,var(--teal-50) 0,transparent 45%),radial-gradient(at 100% 100%,var(--amber-50) 0,transparent 45%),var(--neutral-200)',
      fontFamily:'var(--font-en)', color:'var(--neutral-800)',
      padding:'12px 24px 8px', boxSizing:'border-box',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, marginBottom:8, flexShrink:0, height:44 }}>
        <span style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'var(--neutral-900)', letterSpacing:'-0.01em' }}>
          เส้นทางการจองนัด · Booking Journey <span style={{ fontSize:'var(--text-xs)', fontWeight:600, color:'var(--teal-700)', background:'var(--teal-50)', border:'1px solid var(--teal-200)', borderRadius:'var(--radius-full)', padding:'3px 9px', marginLeft:8, verticalAlign:'middle', whiteSpace:'nowrap' }}>LINE only · Phase 1</span>
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          {/* Date-locale setting — journey chrome, NOT part of the phone UI.
              Auto follows the browser; ไทย forces B.E., EN forces C.E. */}
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontSize:'var(--text-xs)', fontWeight:600, color:'var(--neutral-500)', whiteSpace:'nowrap' }}>วันที่ · Dates</span>
            <div style={{ display:'flex', background:'white', border:'1px solid var(--neutral-300)', borderRadius:'var(--radius-full)', padding:2, gap:2 }}>
              {[{ v:'auto', label:'Auto' }, { v:'th', label:'ไทย พ.ศ.' }, { v:'en', label:'EN' }].map((o) => (
                <button key={o.v} type="button" onClick={()=>changeLocale(o.v)} style={{
                  border:'none', cursor:'pointer', borderRadius:'var(--radius-full)',
                  padding:'4px 10px', fontSize:11, fontWeight:700, fontFamily:'var(--font-en)', whiteSpace:'nowrap',
                  background: locale===o.v ? 'var(--teal-600)' : 'transparent',
                  color: locale===o.v ? 'white' : 'var(--neutral-600)',
                }}>{o.label}</button>
              ))}
            </div>
          </div>
          <a className="ds-link" href="CX Review - PawsDee Journey.html" target="_blank" rel="noopener">
            <i className="ti ti-clipboard-check" aria-hidden="true"></i> CX Review
          </a>
          <a className="ds-link" href="PawsDee Design System v1.6.html" target="_blank" rel="noopener">
            <i className="ti ti-palette" aria-hidden="true"></i> DS v1.6
          </a>
        </div>
      </div>

      {/* LINE-only booking journey — single happy path, 5 stages (Phase 1).
          SMS backup is a separate Phase 2 journey. */}
      <div ref={rowRef} style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        <div style={{ width:laneWidth, minWidth:laneWidth, margin:'0 auto', display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100%', paddingBottom:8 }}>
          <div style={{ display:'flex', gap:BL.COLGAP }}>
            <MapPhone label={{ num:'1', th:'จองนัด', en:'Booking' }} tone="trunk" w={w} h={h}>
              <BookingScreen form={form} setForm={setForm} onSubmit={noop} />
            </MapPhone>
            <MapPhone label={{ num:'2', th:'ตรวจสอบ', en:'Review' }} tone="trunk" w={w} h={h}>
              <ReviewScreen form={df} onConfirm={noop} onBack={noop} />
            </MapPhone>
            <MapPhone label={{ num:'3', th:'นัดสำเร็จ', en:'Confirmed' }} tone="line" w={w} h={h}>
              <SuccessScreen form={df} onLink={noop} onSkip={noop} />
            </MapPhone>
            <MapPhone label={{ num:'4', th:'เชื่อม LINE', en:'Link LINE' }} tone="line" w={w} h={h}>
              <LinkingScreen nickname={df.nickname} petName={df.petName} onDone={noop} />
            </MapPhone>
            <MapPhone label={{ num:'5', th:'เชื่อมสำเร็จ', en:'Linked' }} tone="line" w={w} h={h}>
              <AccountLinkedScreen form={df} onDone={noop} />
            </MapPhone>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="page-foot" style={{ flexShrink:0, padding:'4px 0' }}>
        <code>booking.hbs</code> · <code>success.hbs</code> · <code>linking.hbs</code> · <code>linked.hbs</code> — Phase 1 · LINE only · PawsDee Design System v1.6
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
