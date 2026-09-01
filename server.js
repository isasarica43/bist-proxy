const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================================================
// 400+ BIST HİSSESİ LİSTESİ (Sadece referans amaçlı, kodun çalışması için şart değil)
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
// 🎯 YAHOO FINANCE'DEN GERÇEK VERİ ÇEKEN FONKSİYON
// (Hiçbir API anahtarı gerekmez!)
// ================================================================
async function fetchRealStockData(symbol) {
  try {
    // Yahoo Finance BIST hisseleri için hisse kodunun sonuna .IS eklenir
    // Örnek: THYAO -> THYAO.IS
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.IS`;
    const response = await axios.get(url);
    
    // Yahoo'dan gelen verinin içindeki ilk sonucu al
    const result = response.data.quoteResponse.result[0];
    
    // Eğer veri varsa ve fiyat bilgisi gelmişse işle
    if (result && result.regularMarketPrice) {
      // Değişim yüzdesini 2 haneli yuvarla
      const changePercent = result.regularMarketChangePercent ? 
        parseFloat(result.regularMarketChangePercent.toFixed(2)) : 0;
      
      return {
        symbol: symbol,
        price: result.regularMarketPrice,
        change: changePercent,
        high: result.regularMarketDayHigh || result.regularMarketPrice,
        low: result.regularMarketDayLow || result.regularMarketPrice
      };
    } else {
      // Eğer veri gelmezse (yanlış kod veya borsa kapalıysa) yedek gönder
      console.log(`⚠️ Yahoo verisi gelmedi (${symbol}), yedek kullanılıyor.`);
      return generateFallbackData(symbol);
    }
  } catch (error) {
    console.error(`❌ Yahoo hatası (${symbol}):`, error.message);
    // Hata durumunda uygulamanın çökmemesi için yedek veri döndür
    return generateFallbackData(symbol);
  }
}

// ================================================================
// 🆘 YEDEK VERİ ÜRETİCİ (API çalışmazsa veya veri gelmezse)
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
    // Yahoo'dan gerçek veriyi çek
    const realData = await fetchRealStockData(symbol);
    res.json(realData);
  } catch (error) {
    // Her şey patlarsa yine yedek döndür
    console.error('🔥 Kritik hata:', error.message);
    res.json(generateFallbackData(symbol));
  }
});

// ================================================================
// 🏠 ANA SAYFA
// ================================================================
app.get('/', (req, res) => {
  res.send('✅ BIST Proxy Sunucu YAHOO FINANCE ile calisiyor! (Ucretsiz, anahtar yok)');
});

// ================================================================
// 🚀 SUNUCUYU BAŞLAT
// ================================================================
app.listen(port, () => {
  console.log(`✅ Sunucu ${port} numarali limanda ayakta!`);
  console.log(`📊 Yahoo Finance üzerinden gerçek BIST verileri geliyor!`);
  console.log(`🔑 API anahtarı GEREKMİYOR! Tamamen ücretsiz.`);
});