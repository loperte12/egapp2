// Sonda CDP mínima: abre una pestaña, navega, recoge consola/errores y mide el render.
// Uso: node _sonda-cdp.cjs <url> [segundos]
const http = require('http');

const url = process.argv[2] || 'http://localhost:4173';
const SEG = Number(process.argv[3] || 12);
const CDP_PORT = Number(process.argv[4] || 9222);

function jsonNew() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: CDP_PORT, path: '/json/new?' + encodeURIComponent(url),
      method: 'PUT',
    }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject); req.end();
  });
}

(async () => {
  const tab = await jsonNew();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  const errores = [];
  const consola = [];
  let id = 0; const pend = new Map();

  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const e = m.params.exceptionDetails;
      errores.push((e.exception?.description || e.text || JSON.stringify(e)).slice(0, 800));
    }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      consola.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 500));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consola.push('log: ' + (m.params.entry.text || '').slice(0, 300));
    }
  };

  await new Promise(r => { ws.onopen = r; });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });

  await new Promise(r => setTimeout(r, SEG * 1000));

  const med = await send('Runtime.evaluate', {
    expression: `(() => { const r = document.getElementById('root');
      return JSON.stringify({ rootHijos: r ? r.children.length : -1,
        rootLen: r ? r.innerHTML.length : -1,
        bodyTexto: (document.body.innerText || '').slice(0, 200) }); })()`,
    returnByValue: true,
  });

  console.log('== MEDICIÓN ==');
  console.log(med?.result?.value ?? JSON.stringify(med));
  console.log('== EXCEPCIONES (' + errores.length + ') ==');
  errores.slice(0, 8).forEach(e => console.log('·', e));
  console.log('== CONSOLA error/warning (' + consola.length + ') ==');
  consola.slice(0, 10).forEach(c => console.log('·', c));
  ws.close(); process.exit(0);
})().catch(e => { console.error('SONDA FALLO:', e.message); process.exit(1); });
