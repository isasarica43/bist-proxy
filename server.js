const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================================================
// 🧠 AKILLI VERİ ÇEKİCİ (Liste olmadan! Önce BIST dene, olmazsa ABD)
// ================================================================
async function fetchRealStockData(symbol) {
  // 1. DENEME: BIST olarak sorgula (sonuna .IS ekle)
  let attempts = [
    { suffix: '.IS', label: 'BIST' },
    { suffix: '', label: 'ABD' }
  ];

  for (let attempt of attempts) {
    try {
      const querySymbol = symbol + attempt.suffix;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      const result = response.data.chart.result[0];
      
      if (result && result.meta && result.meta.regularMarketPrice) {
        const meta = result.meta;
        const changePercent = meta.regularMarketChangePercent || 0;
        
        console.log(`✅ ${attempt.label} hissesi bulundu: ${querySymbol}`);
        return {
          symbol: symbol, // Kullanıcının girdiği orijinal kodu göster
          price: meta.regularMarketPrice,
          change: parseFloat(changePercent.toFixed(2)),
          high: meta.regularMarketDayHigh || meta.regularMarketPrice,
          low: meta.regularMarketDayLow || meta.regularMarketPrice
        };
      }
    } catch (error) {
      // Bu deneme başarısız oldu, sessizce bir sonrakine geç
      console.log(`⏳ ${attempt.label} deneniyor... (${symbol}${attempt.suffix}) - Olmadı, sıradakine geçiyorum.`);
    }
  }

  // 2. İKİ DENEME DE BAŞARISIZ OLURSA: Yedek (Mock) veri döndür
  console.log(`❌ ${symbol} için BIST ve ABD sorguları başarısız oldu. Yedek veri döndürülüyor.`);
  return generateFallbackData(symbol);
}

// ================================================================
// 🆘 YEDEK VERİ ÜRETİCİ (Hiçbir yerde bulunamazsa)
// ================================================================
function generateFallbackData(symbol) {
  const price = (Math.random() * 400 + 100).toFixed(2);
  const change = (Math.random() * 6 - 3).toFixed(2);
  const high = (parseFloat(price) + (Math.random() * 5)).toFixed(2);
  const low = (parseFloat(price) - (Math.random() * 5)).toFixed(2);
  return {
    symbol: symbol,
    price: parseFloat(price),
    change: parseFloat(change),
    high: parseFloat(high),
    low: parseFloat(low),
    note: "⚠️ Hisse bulunamadı (BIST/ABD), yedek veri gösteriliyor."
  };
}

// ================================================================
// 🌐 API UÇ NOKTASI
// ================================================================
app.get('/api/stock/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  try {
    const realData = await fetchRealStockData(symbol);
    res.json(realData);
  } catch (error) {
    console.error('🔥 Kritik hata:', error.message);
    res.json(generateFallbackData(symbol));
  }
});

// ================================================================
// 🏠 ANA SAYFA
// ================================================================
app.get('/', (req, res) => {
  res.send('✅ AKILLI Proxy Sunucu (Otomatik BIST/ABD ayrimi) calisiyor!');
});

// ================================================================
// 🚀 SUNUCUYU BAŞLAT
// ================================================================
app.listen(port, () => {
  console.log(`✅ Sunucu ${port} numarali limanda ayakta!`);
  console.log(`🧠 Artık liste yok! Önce BIST dener, olmazsa ABD dener.`);
});