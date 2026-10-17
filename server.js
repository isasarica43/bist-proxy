const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

// ================================================================
// 🗄️ KÜÇÜK ÖNBELLEK (Yahoo/TEFAS'a aynı isteği tekrar tekrar atmamak için)
// ================================================================
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

// Yahoo'nun iki sunucusu var; biri hata verirse diğerini dene
async function yahooChart(symbol, params) {
  const qs = new URLSearchParams(params || {}).toString();
  let lastErr;
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}${qs ? '?' + qs : ''}`;
      const response = await axios.get(url, { headers: YAHOO_HEADERS, timeout: 15000 });
      const result = response.data && response.data.chart && response.data.chart.result && response.data.chart.result[0];
      if (result) return result;
    } catch (error) {
      lastErr = error;
    }
  }
  throw lastErr || new Error('not_found');
}

// ================================================================
// 🧠 AKILLI VERİ ÇEKİCİ (Önce BIST dene, olmazsa ABD)
// ?market=BIST veya ?market=US verilirse sadece o piyasaya bakar.
// ================================================================
async function fetchRealStockData(symbol, market) {
  const attempts = market === 'US' ? [{ suffix: '', label: 'ABD' }]
    : market === 'BIST' ? [{ suffix: '.IS', label: 'BIST' }]
    : [{ suffix: '.IS', label: 'BIST' }, { suffix: '', label: 'ABD' }];

  for (const attempt of attempts) {
    try {
      const querySymbol = symbol + attempt.suffix;
      const result = await yahooChart(querySymbol);
      if (result && result.meta && result.meta.regularMarketPrice) {
        const meta = result.meta;
        const changePercent = meta.regularMarketChangePercent || 0;
        console.log(`✅ ${attempt.label} hissesi bulundu: ${querySymbol}`);
        return {
          symbol: symbol, // Kullanıcının girdiği orijinal kodu göster
          price: meta.regularMarketPrice,
          change: parseFloat(changePercent.toFixed(2)),
          high: meta.regularMarketDayHigh || meta.regularMarketPrice,
          low: meta.regularMarketDayLow || meta.regularMarketPrice,
          currency: meta.currency || (attempt.suffix === '.IS' ? 'TRY' : 'USD'), // AAPL → USD, THYAO → TRY
          market: attempt.label === 'BIST' ? 'BIST' : 'US',
          yahooSymbol: querySymbol
        };
      }
    } catch (error) {
      console.log(`⏳ ${attempt.label} deneniyor... (${symbol}${attempt.suffix}) - Olmadı, sıradakine geçiyorum.`);
    }
  }
  return null;
}

// ================================================================
// 🌐 ANLIK FİYAT
// Önceki sürüm hisse bulunamayınca RASTGELE (uydurma) fiyat dönüyordu;
// uygulama bunu gerçek fiyat sanıyordu. Artık açıkça 404 dönüyor.
// ================================================================
app.get('/api/stock/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase().trim();
  const market = req.query.market === 'US' ? 'US' : req.query.market === 'BIST' ? 'BIST' : null;
  if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  try {
    const data = await cached(`stock:${symbol}:${market || ''}`, 30 * 1000, () => fetchRealStockData(symbol, market));
    if (!data) {
      cache.delete(`stock:${symbol}:${market || ''}`);
      console.log(`❌ ${symbol} için BIST ve ABD sorguları başarısız oldu.`);
      return res.status(404).json({ error: 'not_found', symbol });
    }
    res.json(data);
  } catch (error) {
    console.error('🔥 Kritik hata:', error.message);
    res.status(502).json({ error: 'upstream_error', symbol });
  }
});

// ================================================================
// 📈 GEÇMİŞ MUMLAR (teknik analiz için)
// /api/history?symbol=THYAO.IS&interval=1d&range=2y
// symbol: Yahoo sembolü (THYAO.IS, AAPL, SI=F, GC=F, GBPTRY=X ...)
// ================================================================
const INTERVALS = new Set(['1h', '1d', '1wk', '1mo']);
const RANGES = new Set(['1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']);
app.get('/api/history', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase().trim();
  const interval = INTERVALS.has(req.query.interval) ? req.query.interval : '1d';
  const range = RANGES.has(req.query.range) ? req.query.range : '2y';
  if (!/^[A-Z0-9.=^\-]{1,20}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  try {
    const ttl = interval === '1h' ? 5 * 60 * 1000 : 15 * 60 * 1000;
    const data = await cached(`hist:${symbol}:${interval}:${range}`, ttl, async () => {
      const result = await yahooChart(symbol, { interval, range, includePrePost: 'false' });
      const ts = result.timestamp || [];
      const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
      const candles = [];
      for (let i = 0; i < ts.length; i++) {
        const c = q.close && q.close[i];
        if (c == null || !isFinite(c)) continue; // tatil / eksik mum
        candles.push({
          t: ts[i] * 1000,
          o: q.open && q.open[i] != null ? q.open[i] : c,
          h: q.high && q.high[i] != null ? q.high[i] : c,
          l: q.low && q.low[i] != null ? q.low[i] : c,
          c,
          v: q.volume && q.volume[i] != null ? q.volume[i] : 0
        });
      }
      return { symbol, currency: (result.meta && result.meta.currency) || null, interval, range, candles };
    });
    if (!data.candles.length) {
      cache.delete(`hist:${symbol}:${interval}:${range}`);
      return res.status(404).json({ error: 'not_found', symbol });
    }
    res.json(data);
  } catch (error) {
    console.error(`🔥 Geçmiş veri hatası (${symbol}):`, error.message);
    const status = error.response && error.response.status === 404 ? 404 : 502;
    res.status(status).json({ error: status === 404 ? 'not_found' : 'upstream_error', symbol });
  }
});

// ================================================================
// 🧺 TEFAS FON FİYATI + GEÇMİŞİ
// Tarayıcı TEFAS'a doğrudan istek atamadığı (CORS) için sunucu üzerinden.
// /api/fund/TTE?days=365
// ================================================================
function trDate(d) {
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}
// TEFAS bazı yurt dışı sunucuları engelleyebiliyor; önce oturum çerezini alıp,
// olmazsa İngilizce sitesi fundturkey.com.tr üzerinden dener.
const TEFAS_HOSTS = ['https://www.tefas.gov.tr', 'https://fundturkey.com.tr'];
const tefasCookies = {};
async function tefasCookie(host) {
  const c = tefasCookies[host];
  if (c && Date.now() - c.at < 20 * 60 * 1000) return c.value;
  try {
    const r = await axios.get(host + '/TarihselVeriler.aspx', { timeout: 15000, headers: { 'User-Agent': YAHOO_HEADERS['User-Agent'] }, validateStatus: () => true });
    const value = (r.headers['set-cookie'] || []).map(x => x.split(';')[0]).join('; ');
    tefasCookies[host] = { at: Date.now(), value };
    return value;
  } catch (e) { return ''; }
}
async function tefasRange(code, start, end, diag) {
  let reached = false;
  for (const host of TEFAS_HOSTS) {
    const cookie = await tefasCookie(host);
    for (const fontip of ['YAT', 'EMK', 'BYF']) {
      try {
        const body = new URLSearchParams({ fontip, sfontur: '', fonkod: code, fongrup: '', bastarih: trDate(start), bittarih: trDate(end), fonturkod: '', fonunvantip: '' }).toString();
        const response = await axios.post(host + '/api/DB/BindHistoryInfo', body, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'User-Agent': YAHOO_HEADERS['User-Agent'],
            'Origin': host,
            'Referer': host + '/TarihselVeriler.aspx',
            ...(cookie ? { Cookie: cookie } : {})
          }
        });
        if (!response.data || typeof response.data !== 'object') { diag.push(`${host} ${fontip}: JSON değil (engel sayfası olabilir)`); continue; }
        reached = true;
        const rows = (response.data.data || []).filter(r => Number(r.FIYAT) > 0);
        diag.push(`${host} ${fontip}: ${rows.length} satır`);
        if (rows.length) return { rows, reached };
      } catch (error) {
        diag.push(`${host} ${fontip}: ${error.response ? 'HTTP ' + error.response.status : error.message}`);
      }
    }
    if (reached) break; // bu sunucu cevap verdi ama fon yok; diğerini denemeye gerek yok
  }
  return { rows: [], reached };
}
app.get('/api/fund/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const days = Math.min(1100, Math.max(7, parseInt(req.query.days, 10) || 14));
  const debug = req.query.debug === '1';
  if (!/^[A-Z0-9]{2,6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
  const diag = [];
  try {
    const data = await cached(`fund:${code}:${days}`, 30 * 60 * 1000, async () => {
      const all = new Map();
      let name = null, anyReached = false;
      // TEFAS tek istekte en fazla ~3 ay veriyor; geriye doğru parça parça çek
      for (let back = 0; back < days; back += 89) {
        const end = new Date(); end.setDate(end.getDate() - back);
        const start = new Date(end); start.setDate(start.getDate() - Math.min(88, days - back));
        const { rows, reached } = await tefasRange(code, start, end, diag);
        anyReached = anyReached || reached;
        if (!rows.length && back === 0) break; // fon hiç yoksa / erişim yoksa uğraşma
        rows.forEach(r => { all.set(Number(r.TARIH), Number(r.FIYAT)); if (!name && r.FONUNVAN) name = r.FONUNVAN; });
      }
      const history = Array.from(all.entries()).sort((a, b) => a[0] - b[0]).map(([t, c]) => ({ t, c }));
      return { code, name, history, reached: anyReached };
    });
    if (!data.history.length) {
      cache.delete(`fund:${code}:${days}`);
      // reached=false → TEFAS bu sunucuya hiç cevap vermedi (engel); true → fon gerçekten bulunamadı
      return res.status(data.reached ? 404 : 502).json({ error: data.reached ? 'not_found' : 'tefas_unreachable', code, ...(debug ? { diag } : {}) });
    }
    const last = data.history[data.history.length - 1];
    res.json({ code, name: data.name, price: last.c, date: new Date(last.t).toISOString().slice(0, 10), history: data.history, ...(debug ? { diag } : {}) });
  } catch (error) {
    console.error(`🔥 TEFAS hatası (${code}):`, error.message);
    res.status(502).json({ error: 'upstream_error', code, ...(debug ? { diag } : {}) });
  }
});

// ================================================================
// 🏠 ANA SAYFA
// ================================================================
app.get('/', (req, res) => {
  res.send('✅ AKILLI Proxy Sunucu calisiyor! Uc noktalar: /api/stock/:symbol, /api/history?symbol=..., /api/fund/:code');
});

// ================================================================
// 🚀 SUNUCUYU BAŞLAT
// ================================================================
app.listen(port, () => {
  console.log(`✅ Sunucu ${port} numarali limanda ayakta!`);
});
