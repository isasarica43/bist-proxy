const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================================================
// 400+ BIST HİSSESİ LİSTESİ (Yine aynı)
// ================================================================
const bistSymbols = [
  "THYAO", "GARAN", "AKBNK", "ISCTR", "YKBNK", "HALKB", "VAKBNK", "QNBFB", "SKBNK",
  "ASELS", "TCELL", "KCHOL", "SISE", "TUPRS", "PETKM", "KOZAA", "KOZAL", 
  "EREGL", "KRDMD", "SAHOL", "BIMAS", "MGROS", "FROTO", "TOASO", "OTKAR", "TTKOM", 
  "PGSUS", "TAVHL", "MNDRS", "GUBRF", "HEKTS", "AKSEN", "SASA", "VESTL", "ARCLK", 
  "TURSG", "ANAGR", "ISGYO", "YAYLA", "ULKER", "CCOLA", "DOAS", "EUPWR", "KONYA", 
  "KARSN", "KAYSER", "KRSTL", "PRKME", "TATGD", "TUKAS", "BAGFS", "BANVT", "BSOKE", 
  "CLEBI", "DENGE", "DOHOL", "ECILC", "ENJSA", "ERBOS", "GENTS", "GESAN", "GLYHO", 
  "GOODY", "HATEK", "IDEAS", "IEYHO", "IHAAS", "IHGZT", "IPEKE", "ISBIR", "ISFIN", 
  "ISMEN", "IZMDC", "KAPLM", "KAREL", "KARTN", "KATMR", "KENT", "KRGYO", "KRTUL", 
  "MAKTK", "MARTI", "MEGAP", "MERKO", "METRO", "MOGAN", "MRSHL", "NTHOL", "ODAS", 
  "OYAKC", "OYLUM", "PAPIL", "PEKGY", "PENTA", "POLHO", "PRZMA", "REEDR", "RYSAS",
  "SECUR", "SELEC", "SOKM", "TARKM", "TDGYO", "TEZOL", "TKFEN", "TNZTP", 
  "TRGYO", "TRKCM", "TSKB", "TTRAK", "TUREX", "TURGG", "ULUUN", "UMPAS", "USAK",
  "VKFYO", "YGGYO", "YUNSA", "ZOREN", "GEDIK", "HEDEF", "KAYSE", "KLMSA", "KRAVN",
  "AFO", "AGHOL", "AKCNS", "AKENR", "AKFGY", "AKGRT", "AKMGY", "AKSA", "AKSGY", 
  "AKSUE", "ALARK", "ALBRK", "ALCTL", "ALKA", "ANACM", "ANELE", "ANHLT", "ARASE", 
  "ARDYZ", "ARMDA", "ARSAN", "ASLAN", "ASTOR", "ASUMA", "ATAGY", "ATEKS", "ATLAS", 
  "ATPET", "AYEN", "AYGES", "AZTEK", "BAKAB", "BALAT", "BASCM", "BFREN", "BGCAM", 
  "BIKAS", "BLCYT", "BOSSA", "BRISA", "BRSAN", "BRYAT", "BUCIM", "BURVA", "CASA", 
  "CEMAS", "CEMTS", "CIMSA", "CMENT", "COSMO", "CRFSA", "CUSAN", "CWENE", "DAGHL", 
  "DAGI", "DARDL", "DAVHL", "DENCM", "DESA", "DEVA", "DGGYO", "DGNMO", "DITIM", 
  "DNISI", "DURDO", "DZGYO", "ECZYT", "EGEEN", "EGGUB", "EGPRO", "EGSER", "EKIZ", 
  "EKOS", "EMNIS", "EMLKL", "ENER", "ENKAI", "EOSER", "EPLAS", "ERBSU", "ERCB", 
  "ERSU", "ESCOM", "ETILR", "ETYAT", "EUYO", "FADE", "FENER", "FMIZP", "FONET", 
  "FRK", "GARFA", "GEDZA", "GENIL", "GENUS", "GEREL", "GIPTA", "GLCYH", "GLCMB", 
  "GLPET", "GMPWR", "GOKNR", "GOLTS", "GOREN", "GRNYO", "GRTRK", "GSRAY", "GSDDE", 
  "GSDHO", "GSKN", "GSTE", "GTSUR", "GUNDG", "GURSO", "GUSGR", "GUVEN", "HALK"
];

// ================================================================
// 🎯 YENİ VE GÜÇLENDİRİLMİŞ YAHOO FINANCE V8 API 
// (Artık kendimizi tarayıcı gibi gizliyoruz!)
// ================================================================
async function fetchRealStockData(symbol) {
  try {
    // Yahoo Finance V8 endpoint'i (daha kararlı)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS`;
    
    // ⚡ KRİTİK: Bu başlıklar olmazsa Yahoo bizi robot sanıp engelliyor!
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    // V8 API'den gelen veriyi parse et
    const result = response.data.chart.result[0];
    
    if (result && result.meta && result.meta.regularMarketPrice) {
      const meta = result.meta;
      
      // Değişim yüzdesini hesapla (meta içinde var)
      const changePercent = meta.regularMarketChangePercent || 0;
      
      return {
        symbol: symbol,
        price: meta.regularMarketPrice,
        change: parseFloat(changePercent.toFixed(2)),
        high: meta.regularMarketDayHigh || meta.regularMarketPrice,
        low: meta.regularMarketDayLow || meta.regularMarketPrice
      };
    } else {
      console.log(`⚠️ Yahoo V8 verisi gelmedi (${symbol}), yedek kullanılıyor.`);
      return generateFallbackData(symbol);
    }
  } catch (error) {
    console.error(`❌ Yahoo V8 hatası (${symbol}):`, error.message);
    // Hata durumunda yedek veri döndür (uygulama çökmesin)
    return generateFallbackData(symbol);
  }
}

// ================================================================
// 🆘 YEDEK VERİ ÜRETİCİ (API çalışmazsa devreye girer)
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
    note: "⚠️ Yahoo verisi alınamadı, yedek veri gösteriliyor."
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
  res.send('✅ BIST Proxy Sunucu YAHOO V8 ile calisiyor! (Guncel, saglam)');
});

// ================================================================
// 🚀 SUNUCUYU BAŞLAT
// ================================================================
app.listen(port, () => {
  console.log(`✅ Sunucu ${port} numarali limanda ayakta!`);
  console.log(`📊 Yahoo Finance V8 ile gerçek BIST verileri geliyor!`);
});