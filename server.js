const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Telefonun erişebilmesi için gerekli ayarlar
app.use(cors());
app.use(express.json());

// Buraya dikkat et! HISSE VERİLERİ burada duruyor.
const mockData = {
  "THYAO": { "symbol": "THYAO", "price": 287.50, "change": 2.30, "high": 289.00, "low": 285.00 },
  "GARAN": { "symbol": "GARAN", "price": 125.75, "change": -1.20, "high": 127.00, "low": 124.50 },
  "AKBNK": { "symbol": "AKBNK", "price": 68.40, "change": 0.85, "high": 69.00, "low": 67.90 },
  "EKGYO": { "symbol": "EKGYO", "price": 15.60, "change": 0.45, "high": 15.80, "low": 15.40 }
};

// Telefonun çağırdığı yer: https://.../api/stock/THYAO
app.get('/api/stock/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase(); // THYAO yapar
  const data = mockData[symbol];
  
  if (data) {
    // Eğer veri varsa bunu gönder
    res.json(data);
  } else {
    // Eğer veri yoksa ASLA hata döndürme! Rastgele veri üret ve gönder.
    res.json({ 
      "symbol": symbol, 
      "price": (Math.random() * 100 + 50).toFixed(2), 
      "change": (Math.random() * 10 - 5).toFixed(2),
      "message": "Bu örnek veridir, gerçek zamanlı değildir."
    });
  }
});

// Ana sayfa kontrolü
app.get('/', (req, res) => {
  res.send('BIST Proxy Sunucu basariyla calisiyor!');
});

// Sunucuyu başlat
app.listen(port, () => {
  console.log(`Sunucu ${port} numarali limanda (port) ayakta!`);
});