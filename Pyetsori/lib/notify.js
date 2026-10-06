'use strict';
/*
 * Njoftim opsional: "ka një dorëzim të ri" (pa përgjigje dhe pa foto).
 * Dorëzimi konfirmohet nga ruajtja, jo nga njoftimi: nëse njoftimi dështon, dorëzimi mbetet i ruajtur.
 */
function isPlaceholder(v) { return !v || /\[EMAIL_YT\]|example\.com|domeni-yt|your-domain/i.test(v); }

function notifyConfig(env) {
  var to = (env.NOTIFY_EMAIL_TO || '').trim();
  if (isPlaceholder(to)) return { enabled: false };
  var provider = String(env.EMAIL_PROVIDER || (env.SMTP_HOST ? 'smtp' : 'resend')).toLowerCase() === 'smtp' ? 'smtp' : 'resend';
  var cfg = {
    enabled: true, provider: provider, to: to,
    from: (env.EMAIL_FROM || env.SMTP_USER || '').trim(),
    apiKey: env.RESEND_API_KEY || '',
    smtp: { host: (env.SMTP_HOST || '').trim(), port: parseInt(env.SMTP_PORT || '465', 10), user: (env.SMTP_USER || '').trim(), pass: env.SMTP_PASS || '' },
    panelUrl: (env.PANEL_URL || '').trim()
  };
  var ok = !isPlaceholder(cfg.from) && (provider === 'resend' ? !!cfg.apiKey : (cfg.smtp.host && cfg.smtp.user && cfg.smtp.pass));
  if (!ok) return { enabled: false, misconfigured: true };
  return cfg;
}

function message(m) {
  var date = new Intl.DateTimeFormat('sq-AL', { timeZone: 'Europe/Tirane', dateStyle: 'long', timeStyle: 'short' }).format(new Date(m.submittedAt));
  return {
    subject: 'Dorëzim i ri: Pyetësori XAUUSD — ' + m.id + (m.mode === 'test' ? ' (provë)' : ''),
    text: [
      'Ka një dorëzim të ri te pyetësori XAUUSD.',
      '',
      'ID: ' + m.id,
      'Data: ' + date,
      'Lloji: ' + (m.mode === 'test' ? 'Provë' : 'Dorëzim real'),
      'Fotot: ' + m.photoCount,
      'Gati për programim: ' + (m.ready ? 'Po' : 'Jo (' + m.openItems + ' çështje të hapura)'),
      '',
      'Përgjigjet dhe fotot janë vetëm te paneli privat.'
    ].join('\n')
  };
}

async function sendNotification(cfg, manifest, deps) {
  deps = deps || {};
  var msg = message(manifest);
  if (cfg.panelUrl) msg.text += '\nPaneli: ' + cfg.panelUrl.replace(/\/$/, '') + '/admin';
  if (cfg.provider === 'smtp') {
    var send = deps.smtpSend || function (smtp, mail) {
      var nodemailer = require('nodemailer');
      return nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, requireTLS: smtp.port !== 465, auth: { user: smtp.user, pass: smtp.pass }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000 }).sendMail(mail);
    };
    await send(cfg.smtp, { from: cfg.from, to: cfg.to, subject: msg.subject, text: msg.text });
    return true;
  }
  var f = deps.fetch || fetch;
  var res = await f('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': 'xau-q-notify-' + manifest.submissionKey },
    body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject: msg.subject, text: msg.text })
  });
  if (!res.ok) throw new Error('Resend ' + res.status);
  return true;
}

module.exports = { notifyConfig: notifyConfig, sendNotification: sendNotification, notificationMessage: message };
