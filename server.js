const express = require('express');
const cors = require('cors');
const { Ticker } = require('@muhammedaksam/borsats');

const app = express();

// Tüm kaynaklara izin ver (kişisel/tek kullanıcılık bir proje için yeterli).
// İstersen origin: 'https://senin-domainin.com' gibi daraltabilirsin.
app.use(cors());

// Basit bellek içi önbellek: aynı sembolü kısa sürede tekrar tekrar
// dış API'ye sormamak için. Sunucu yeniden başlayınca sıfırlanır.
const cache = new Map();
const CACHE_MS = 60 * 1000; // 1 dakika

app.get('/api/stock/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase().trim();
  if (!symbol) {
    return res.status(400).json({ error: 'missing_symbol' });
  }

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.time < CACHE_MS) {
    return res.json(cached.data);
  }

  try {
    const stock = new Ticker(symbol);
    const fastInfo = await stock.fastInfo;
    const price = fastInfo && (fastInfo.lastPrice != null ? fastInfo.lastPrice : fastInfo.last);

    if (typeof price !== 'number' || Number.isNaN(price)) {
      return res.status(404).json({ error: 'not_found', symbol });
    }

    const data = {
      symbol,
      price,
      currency: 'TRY',
      updatedAt: new Date().toISOString(),
    };
    cache.set(symbol, { data, time: Date.now() });
    res.json(data);
  } catch (err) {
    console.error(`[${symbol}] fetch error:`, err && err.message);
    res.status(502).json({ error: 'fetch_failed', symbol, detail: err && err.message });
  }
});

// Basit sağlık kontrolü / kök sayfa
app.get('/', (req, res) => {
  res.send('BIST proxy API çalışıyor. Örnek: /api/stock/THYAO');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BIST proxy API dinliyor: http://localhost:${PORT}`);
});
