const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================================================
// 400+ BIST HİSSESİ LİSTESİ (Bu liste, hangilerinin BIST olduğunu anlamak için)
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
// 🎯 AKILLI VERİ ÇEKİCİ (BIST mi, ABD mi otomatik anlar!)
// ================================================================
async function fetchRealStockData(symbol) {
  try {
    let symbolQuery = symbol;
    
    // 📌 AKILLI KONTROL: Eğer bu hisse BIST listesindeyse veya .IS ile bitiyorsa BIST'tir.
    // Değilse direkt ABD hissesi olarak sorgula.
    if (bistSymbols.includes(symbol) || symbol.endsWith('.IS')) {
      // BIST ise, .IS ekle (zaten varsa tekrar ekleme)
      if (!symbol.endsWith('.IS')) {
        symbolQuery = symbol + '.IS';
      }
      console.log(`📊 BIST hissesi sorgulanıyor: ${symbolQuery}`);
    } else {
      // ABD hissesi (Apple, Tesla, Google vs.) direkt sorgulanır.
      console.log(`🇺🇸 ABD hissesi sorgulanıyor: ${symbolQuery}`);
    }

    // Yahoo Finance V8 API'ye istek at
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolQuery}`;
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
      
      return {
        symbol: symbol, // Kullanıcının girdiği orijinal kodu göster (AAPL, THYAO)
        price: meta.regularMarketPrice,
        change: parseFloat(changePercent.toFixed(2)),
        high: meta.regularMarketDayHigh || meta.regularMarketPrice,
        low: meta.regularMarketDayLow || meta.regularMarketPrice
      };
    } else {
      console.log(`⚠️ Veri gelmedi (${symbol}), yedek kullanılıyor.`);
      return generateFallbackData(symbol);
    }
  } catch (error) {
    console.error(`❌ Yahoo hatası (${symbol}):`, error.message);
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
// 🌐 API UÇ NOKTASI - Telefonun çağıracağı adres
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
  res.send('✅ BIST + ABD Proxy Sunucu (Yahoo Finance) calisiyor!');
});

// ================================================================
// 🚀 SUNUCUYU BAŞLAT
// ================================================================
app.listen(port, () => {
  console.log(`✅ Sunucu ${port} numarali limanda ayakta!`);
  console.log(`🌍 BIST ve ABD hisseleri icin hazir!`);
});