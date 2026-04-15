const fs = require('fs');
const path = require('path');

// Hedef klasör
const distDir = path.join(__dirname, 'dist');

// Klasörü oluştur (varsa siler/temizlemez, sadece oluşturur)
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
    console.log('[Build] dist klasörü oluşturuldu.');
}

// Kopyalanacak dosyalar
const filesToCopy = [
    'index.html',
    'style.css',
    'app.js'
];

// Dosyaları kopyala
filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(distDir, file);
    
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`[Build] ${file} -> dist/${file} kopyalandı.`);
    } else {
        console.warn(`[Build] Uyarı: ${file} bulunamadı!`);
    }
});

console.log('[Build] Tamamlandı! Proje Render.com için hazır.');
