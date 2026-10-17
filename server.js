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
// TEFAS 2026'da eski BindHistoryInfo adresini kapattı; yeni JSON API:
// POST https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir  {"fonKodu":"TTE","dil":"TR","periyod":<ay>}
// periyod sadece 1, 3, 6, 12, 36, 60 olabilir. Not: TEFAS yurt dışı sunucuları engelleyebiliyor;
// uygulama bu yüzden önce telefondan bağlanıyor, burası yedek yol.
const TEFAS_PERIODS = [1, 3, 6, 12, 36, 60];
function parseTefasDate(v) {
  if (v == null) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const m2 = String(v).match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m2) return Date.UTC(+m2[3], +m2[2] - 1, +m2[1]);
  const t = Date.parse(v); return isNaN(t) ? null : t;
}
app.get('/api/fund/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const days = Math.min(1825, Math.max(7, parseInt(req.query.days, 10) || 14));
  const periyod = TEFAS_PERIODS.find(p => p * 30 >= days) || 60;
  const debug = req.query.debug === '1';
  if (!/^[A-Z0-9]{2,6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
  try {
    const data = await cached(`fund2:${code}:${periyod}`, 30 * 60 * 1000, async () => {
      const response = await axios.post('https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir',
        { fonKodu: code, dil: 'TR', periyod },
        { timeout: 20000, validateStatus: () => true,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*', 'User-Agent': YAHOO_HEADERS['User-Agent'], 'Origin': 'https://www.tefas.gov.tr', 'Referer': 'https://www.tefas.gov.tr/' } });
      const body = response.data;
      if (response.status < 200 || response.status >= 300 || !body || typeof body !== 'object') {
        return { reached: false, history: [], diag: `HTTP ${response.status}${typeof body === 'string' ? ' (JSON değil)' : ''}` };
      }
      const list = Array.isArray(body) ? body : (body.resultList || body.data || []);
      let name = null;
      const history = list.map(r => { if (!name && r.fonUnvan) name = r.fonUnvan; return { t: parseTefasDate(r.tarih), c: Number(r.fiyat) }; })
        .filter(x => x.t != null && x.c > 0).sort((a, b) => a.t - b.t);
      return { reached: true, name, history, diag: `${history.length} kayıt` };
    });
    if (!data.history.length) {
      cache.delete(`fund2:${code}:${periyod}`);
      return res.status(data.reached ? 404 : 502).json({ error: data.reached ? 'not_found' : 'tefas_unreachable', code, ...(debug ? { diag: data.diag } : {}) });
    }
    const last = data.history[data.history.length - 1];
    res.json({ code, name: data.name, price: last.c, date: new Date(last.t).toISOString().slice(0, 10), history: data.history, ...(debug ? { diag: data.diag } : {}) });
  } catch (error) {
    console.error(`🔥 TEFAS hatası (${code}):`, error.message);
    res.status(502).json({ error: 'upstream_error', code, ...(debug ? { diag: error.message } : {}) });
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
