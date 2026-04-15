/**
 * ============================================
 * VocalCleaner — Backend Proxy Server
 * ============================================
 *
 * Pipeline (cerrahi ayarlar):
 *   1. POST /v2/upload?filename=...  → Signed URL al
 *   2. PUT  signedUrl                → Dosyayı CleanVoice'a yükle
 *   3. POST /v2/edits                → İşleme job'ı oluştur (fillers/stutters/long_silences YOK)
 *   4. GET  /v2/edits/{id}  (poll)   → CleanVoice tamamlanana kadar bekle
 *   5. Auphonic production oluştur + başlat
 *      (denoise:false, gate:false — sadece leveler/normloudness/filtering/deess)
 *   6. Auphonic polling → DONE → download_url frontend'e döner
 *
 * Kurulum:
 *   1. .env dosyasına CLEANVOICE_API_KEY, AUPHONIC_USER, AUPHONIC_PASS ekleyin
 *   2. npm install
 *   3. npm start
 */

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const fs      = require('fs');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3456;

// ===== API AYARLARI =====
const CLEANVOICE_BASE_URL = 'https://api.cleanvoice.ai/v2';
const CLEANVOICE_API_KEY  = process.env.CLEANVOICE_API_KEY;
const AUPHONIC_BASE_URL   = 'https://auphonic.com/api';
const AUPHONIC_USER       = process.env.AUPHONIC_USER;
const AUPHONIC_PASS       = process.env.AUPHONIC_PASS;

// Arka planda çalışan zincirlerin durumu (editId → chain state)
const chains = {};

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

const staticPath = fs.existsSync(path.join(__dirname, 'dist'))
    ? path.join(__dirname, 'dist')
    : __dirname;
app.use(express.static(staticPath));

// Multer — bellek üzerinde, max 50 MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = file.originalname.split('.').pop().toLowerCase();
        if (['mp3', 'wav'].includes(ext) ||
            ['audio/mpeg','audio/wav','audio/x-wav','audio/mp3'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece MP3 ve WAV destekleniyor.'));
        }
    },
});

// ===== YARDIMCI =====
function checkKeys() {
    return !!(CLEANVOICE_API_KEY &&
              CLEANVOICE_API_KEY !== 'your_cleanvoice_api_key_here' &&
              AUPHONIC_USER && AUPHONIC_PASS);
}

function auphonicAuth() {
    return `Basic ${Buffer.from(`${AUPHONIC_USER}:${AUPHONIC_PASS}`).toString('base64')}`;
}

// =========================================================================
// ENDPOINT: Ses İyileştirme   POST /api/enhance
//
// • CleanVoice'a dosya yükler ve edit job açar
// • Arka planda zinciri (CleanVoice → Auphonic) asenkron başlatır
// • Frontend'e hemen { editId } döner; durum polling ile takip edilir
// =========================================================================
app.post('/api/enhance', upload.single('audio'), async (req, res) => {
    try {
        if (!CLEANVOICE_API_KEY || CLEANVOICE_API_KEY === 'your_cleanvoice_api_key_here') {
            return res.status(500).json({
                error: 'API_KEY_MISSING',
                message: 'CLEANVOICE_API_KEY .env dosyasında tanımlanmamış.',
            });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'NO_FILE', message: 'Ses dosyası bulunamadı.' });
        }

        const filename  = req.file.originalname;
        const intensity = (req.body?.intensity ?? 'orta').toLowerCase().trim();

        console.log(`\n[VC] ── Yeni İstek ──────────────────────────────────`);
        console.log(`[VC] Dosya    : ${filename} (${(req.file.size/1024/1024).toFixed(1)} MB)`);
        console.log(`[VC] Şiddet   : ${intensity}`);

        // ── 1. Signed URL ──────────────────────────────────────────────
        const upRes = await fetch(
            `${CLEANVOICE_BASE_URL}/upload?filename=${encodeURIComponent(filename)}`,
            { method: 'POST', headers: { 'X-API-Key': CLEANVOICE_API_KEY } }
        );
        if (!upRes.ok) throw new Error(`Upload URL: ${upRes.status} — ${await upRes.text()}`);
        const { signedUrl } = await upRes.json();
        console.log('[VC] Signed URL alındı.');

        // ── 2. Dosyayı yükle ───────────────────────────────────────────
        const putRes = await fetch(signedUrl, {
            method:  'PUT',
            headers: { 'Content-Type': req.file.mimetype || 'application/octet-stream' },
            body:    req.file.buffer,
        });
        if (!putRes.ok) throw new Error(`PUT: ${putRes.status} — ${await putRes.text()}`);
        const fileUrl = signedUrl.split('?')[0];
        console.log('[VC] Dosya yüklendi.');

        // ── 3. CleanVoice edit job ─────────────────────────────────────
        const config = buildCleanvoiceConfig(intensity);
        console.log('[VC] CleanVoice config:', JSON.stringify(config));

        const editRes = await fetch(`${CLEANVOICE_BASE_URL}/edits`, {
            method:  'POST',
            headers: { 'X-API-Key': CLEANVOICE_API_KEY, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ input: { files: [fileUrl], config } }),
        });
        if (!editRes.ok) throw new Error(`Edit: ${editRes.status} — ${await editRes.text()}`);

        const { id: editId } = await editRes.json();
        console.log(`[VC] Edit job: ${editId}`);

        // Zincir kaydı
        chains[editId] = { phase: 'CLEANVOICE', finalUrl: null, error: null };

        // Arka planda başlat (bloklama yok)
        runChain(editId).catch(err => {
            console.error(`[VC] Zincir hatası (${editId}):`, err.message);
            chains[editId].phase = 'FAILURE';
            chains[editId].error = err.message;
        });

        return res.json({ success: true, editId });

    } catch (err) {
        console.error('[VC] /api/enhance hatası:', err.message);
        return res.status(500).json({ error: 'PROCESSING_ERROR', message: err.message });
    }
});

// =========================================================================
// ENDPOINT: İşlem Durumu   GET /api/status/:editId
//
// Frontend polling bu endpoint'i kullanır.
// CleanVoice durumu AUPHONIC aşamasına geçene kadar proxy'lenir.
// Auphonic tamamlandığında { status: 'DONE', downloadUrl } döner.
// =========================================================================
app.get('/api/status/:editId', async (req, res) => {
    try {
        const { editId } = req.params;
        const chain = chains[editId];

        // Zincir henüz başlatılmamış
        if (!chain) {
            // CleanVoice'u doğrudan sorgula
            const r = await fetch(`${CLEANVOICE_BASE_URL}/edits/${editId}`, {
                headers: { 'X-API-Key': CLEANVOICE_API_KEY },
            });
            if (!r.ok) throw new Error(`CleanVoice status: ${r.status}`);
            return res.json(await r.json());
        }

        // Auphonic masterin'g sürüyor
        if (chain.phase === 'AUPHONIC_MASTERING') {
            return res.json({ status: 'AUPHONIC_MASTERING', auphonicUuid: chain.auphonicUuid });
        }

        // Tüm zincir bitti
        if (chain.phase === 'DONE') {
            return res.json({ status: 'DONE', downloadUrl: chain.finalUrl });
        }

        // Hata
        if (chain.phase === 'FAILURE') {
            return res.json({ status: 'FAILURE', error: chain.error });
        }

        // Hâlâ CleanVoice aşamasında — doğrudan proxy
        const r = await fetch(`${CLEANVOICE_BASE_URL}/edits/${editId}`, {
            headers: { 'X-API-Key': CLEANVOICE_API_KEY },
        });
        if (!r.ok) throw new Error(`CleanVoice status: ${r.status}`);
        return res.json(await r.json());

    } catch (err) {
        console.error('[VC] /api/status hatası:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ENDPOINT: Proxy İndirme   GET /api/download?url=...
// =========================================================================
app.get('/api/download', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL parametresi gerekli.' });

        console.log(`[VC] Proxy indirme: ${url.substring(0, 80)}...`);

        const extraHeaders = {};
        if (url.includes('auphonic.com')) {
            extraHeaders['Authorization'] = auphonicAuth();
            console.log('[VC] Auphonic auth eklendi.');
        }

        const { buffer, contentType } = await downloadWithRedirects(url, extraHeaders);

        const rawName  = url.split('?')[0].split('/').pop() || 'enhanced_audio.wav';
        const fileName = decodeURIComponent(rawName);

        console.log(`[VC] ✅ İndirme tamamlandı: ${fileName} (${(buffer.length/1024/1024).toFixed(1)} MB)`);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(buffer);

    } catch (err) {
        console.error('[VC] /api/download hatası:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ENDPOINT: API Kontrol   GET /api/check-key
// =========================================================================
app.get('/api/check-key', (_req, res) => {
    res.json({
        configured: checkKeys(),
        cleanvoice: !!(CLEANVOICE_API_KEY && CLEANVOICE_API_KEY !== 'your_cleanvoice_api_key_here'),
        auphonic:   !!(AUPHONIC_USER && AUPHONIC_PASS),
    });
});

// =========================================================================
// ANA ZİNCİR: CleanVoice → Auphonic (arka planda asenkron)
// =========================================================================
async function runChain(editId) {
    // ── CleanVoice tamamlanana kadar bekle ────────────────────────────
    const cvData = await pollCleanvoice(editId);

    const cvUrl =
        cvData.download_url           ||
        cvData.result?.download_url   ||
        cvData.result?.output?.download_url ||
        cvData.output?.download_url   ||
        null;

    if (!cvUrl) throw new Error('CleanVoice download_url bulunamadı: ' + JSON.stringify(cvData));
    console.log(`[VC] ✅ CleanVoice tamamlandı.`);

    // ── Auphonic aşamasına geç ────────────────────────────────────────
    chains[editId].phase = 'AUPHONIC_MASTERING';

    const prod = await createAuphonicProduction(cvUrl);
    chains[editId].auphonicUuid = prod.uuid;
    console.log(`[Auphonic] Production başlatıldı: ${prod.uuid}`);

    const finalData = await pollAuphonic(prod.uuid);

    // ─────────────────────────────────────────────────────────────────
    // Auphonic output_files içindeki download URL'ini bul
    // Alan adı API versiyonuna göre farklı gelebilir:
    //   "download_url" | "download" | "url"
    // ─────────────────────────────────────────────────────────────────
    const outFile  = (finalData.output_files || [])[0];
    const finalUrl = outFile?.download_url || outFile?.download || outFile?.url || null;

    if (!finalUrl) {
        throw new Error('Auphonic output URL bulunamadı: ' + JSON.stringify(finalData.output_files));
    }

    chains[editId].phase    = 'DONE';
    chains[editId].finalUrl = finalUrl;
    console.log(`[VC] ✨ Pipeline tamamlandı: ${finalUrl.substring(0, 80)}...`);
}

// =========================================================================
// CleanVoice Polling
// =========================================================================
async function pollCleanvoice(editId, maxAttempts = 120) {
    console.log('[VC] CleanVoice polling başlıyor...');
    await sleep(5000); // İlk 5 sn bekleme

    for (let i = 1; i <= maxAttempts; i++) {
        const r = await fetch(`${CLEANVOICE_BASE_URL}/edits/${editId}`, {
            headers: { 'X-API-Key': CLEANVOICE_API_KEY },
        });
        if (!r.ok) {
            console.warn(`[VC] Polling hatası #${i}: ${r.status}`);
            await sleep(5000);
            continue;
        }

        const data   = await r.json();
        const status = data.status || data.task_status;
        console.log(`[VC] CleanVoice #${i}: ${status}`);

        if (status === 'SUCCESS') return data;
        if (status === 'FAILURE' || status === 'FAILED') {
            throw new Error('CleanVoice başarısız: ' + JSON.stringify(data));
        }

        await sleep(5000);
    }
    throw new Error(`CleanVoice zaman aşımı (${maxAttempts} deneme).`);
}

// =========================================================================
// Auphonic Production Oluştur + Başlat
//
// ⚠️ Önemli: Auphonic'e presigned S3/R2 URL geçmek güvenilir değil.
//    Güvenilir yol: Dosyayı önce kendi sunucumuza indir, Auphonic'e file upload yap.
//
// 🎯 Auphonic'in rolü: Ham sesi al, "parlat" ve stüdyo tonuna getir.
//
//   ❌ denoise → KAPALI  (CleanVoice zaten temizledi; çift geçiş = artifact compounding)
//   ❌ gate    → KAPALI  (Sessizlik kapısı pump/sıkışma efekti yarattı)
//   ✅ filtering          → 3–8 kHz EQ kurtarma — CleanVoice'un sildiği tizleri geri verir
//   ✅ normloudness        → -16 LUFS broadcast standardı (clipping olmaz)
//   ✅ deess              → Sibilans kontrolü — doğal ses
//   ✅ leveler            → Adaptif vokal seviyeleme
// =========================================================================
async function createAuphonicProduction(cleanvoiceUrl) {
    // ── ADIM A: Dosyayı CleanVoice'tan kendi sunucumuza indir ─────────
    console.log('[Auphonic] CleanVoice çıktısı indiriliyor...');
    const { buffer: audioBuffer } = await downloadWithRedirects(cleanvoiceUrl);
    console.log(`[Auphonic] İndirildi: ${(audioBuffer.length / 1024 / 1024).toFixed(1)} MB`);

    // ── ADIM B: Production oluştur (input_file YOK — file upload gelecek) ──
    console.log('[Auphonic] Production oluşturuluyor...');
    const createRes = await fetch(`${AUPHONIC_BASE_URL}/productions.json`, {
        method:  'POST',
        headers: { 'Authorization': auphonicAuth(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            algorithms: {
                denoise:         false,  // ❌ KAPALI — artifact compounding önlemi
                gate:            false,  // ❌ KAPALI — pump/sıkışma önlemi
                filtering:       true,   // ✅ 3–8 kHz EQ kurtarma + frekans dengeleme
                highpass_filter: true,   // ✅ Düşük frekans rumble/rüzgar temizleme (%75 sub-bass)
                normloudness:    true,   // ✅ Loudness normalizasyonu
                loudnesstarget:  -16,    // -16 LUFS broadcast standardı (clipping olmaz)
                deess:           true,   // ✅ Sibilans kontrolü
                leveler:         true,   // ✅ Adaptif vokal seviyeleme
            },
            output_files: [{ format: 'wav' }],
        }),
    });
    if (!createRes.ok) {
        throw new Error(`Auphonic create: ${createRes.status} — ${await createRes.text()}`);
    }
    const createData = await createRes.json();
    const uuid       = createData.data.uuid;
    console.log(`[Auphonic] Production oluşturuldu: ${uuid}`);

    // ── ADIM C: Dosyayı production'a upload et (URL yerine binary upload) ──
    console.log('[Auphonic] Dosya yükleniyor (file upload)...');
    const formData = new FormData();
    formData.append(
        'input_file',
        new Blob([audioBuffer], { type: 'audio/wav' }),
        'cleaned_audio.wav'
    );
    const uploadRes = await fetch(`${AUPHONIC_BASE_URL}/production/${uuid}/upload.json`, {
        method:  'POST',
        headers: { 'Authorization': auphonicAuth() },
        body:    formData,
    });
    if (!uploadRes.ok) {
        throw new Error(`Auphonic upload: ${uploadRes.status} — ${await uploadRes.text()}`);
    }
    console.log('[Auphonic] Dosya yüklendi.');

    // ── ADIM D: Production'ı başlat ────────────────────────────────────
    const startRes = await fetch(`${AUPHONIC_BASE_URL}/production/${uuid}/start.json`, {
        method:  'POST',
        headers: { 'Authorization': auphonicAuth() },
    });
    if (!startRes.ok) {
        throw new Error(`Auphonic start: ${startRes.status} — ${await startRes.text()}`);
    }
    console.log(`[Auphonic] ✅ Production başlatıldı: ${uuid}`);
    return createData.data;
}

// =========================================================================
// Auphonic Polling
// =========================================================================
async function pollAuphonic(uuid, maxAttempts = 72) {
    // 72 × 5 sn = 6 dakika maksimum
    console.log(`[Auphonic] Polling başlıyor (UUID: ${uuid})...`);

    for (let i = 0; i < maxAttempts; i++) {
        await sleep(5000);

        const r = await fetch(`${AUPHONIC_BASE_URL}/production/${uuid}.json`, {
            headers: { 'Authorization': auphonicAuth() },
        });
        if (!r.ok) {
            console.warn(`[Auphonic] Polling hatası: ${r.status}`);
            continue;
        }

        const json   = await r.json();
        const data   = json.data;
        const status = data.status_string;
        console.log(`[Auphonic] Durum #${i + 1}: ${status}`);

        if (status === 'Done')  return data;
        if (status === 'Error') throw new Error(`Auphonic hatası: ${data.error_message || 'Bilinmeyen hata'}`);
    }
    throw new Error('Auphonic zaman aşımına uğradı.');
}

// =========================================================================
// YARDIMCI: Native https ile redirect takipli indirme
// (built-in fetch SSL/redirect sorunlarını önlemek için)
// =========================================================================
function downloadWithRedirects(targetUrl, extraHeaders = {}, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) return reject(new Error('Çok fazla redirect.'));

        const parsed = new URL(targetUrl);
        const lib    = parsed.protocol === 'https:' ? https : http;

        const req = lib.request({
            hostname: parsed.hostname,
            port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path:     parsed.pathname + parsed.search,
            method:   'GET',
            headers:  { 'User-Agent': 'VocalCleaner-UA', ...extraHeaders },
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                const next = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
                console.log(`[VC] Redirect → ${next.substring(0, 80)}...`);
                const nextHeaders = new URL(next).hostname === parsed.hostname ? extraHeaders : {};
                return resolve(downloadWithRedirects(next, nextHeaders, maxRedirects - 1));
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end',  () => resolve({
                buffer:      Buffer.concat(chunks),
                contentType: res.headers['content-type'] || 'audio/wav',
            }));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
    });
}

// =========================================================================
// CleanVoice Konfigürasyonu — "Altın Oran" Prensibi
//
// 🎯 Rol: Sadece ham gürültü arındırma. Parlatma/EQ → Auphonic yapacak.
//
// ❌ studio_sound → TÜM MODLARDA YOK
//    Robotikliğin ana kaynağı. Yapay "stüdyo parlatma" sesi bozuyor.
//    Frekans restaurasyonu Auphonic filtering tarafından yapılacak.
//
// ❌ normalize → TÜM MODLARDA KAPALI (normalize: false)
//    Ses seviyesi işini sadece Auphonic yapsın (normloudness: -16 LUFS).
//    Çift normalizasyon sesin dinamiğini bozar.
//
// ❌ fillers, stutters, long_silences → YOK (fiziksel kesim yapar)
// =========================================================================
function buildCleanvoiceConfig(intensity) {
    if (intensity === 'hafif') {
        // Mutlak minimum — sadece ham gürültü temizleme
        // Normalizasyon ve EQ tamamen Auphonic'e bırakıldı
        return {
            remove_noise:  true,
            normalize:     false,  // Auphonic yapacak — çift işlem istemiyoruz
            export_format: 'wav',
        };
    }

    if (intensity === 'orta') {
        // Ham temizleme + nefes — studio_sound kesinlikle yok
        // noise_reduction: 0.7 → o son rüzgar pürüzünü robotiklik yaratmadan yakalar
        return {
            remove_noise:    true,
            normalize:       false,  // Auphonic yapacak
            noise_reduction: 0.7,   // ⚠️ Deneysel — 0.5'ten artırıldı (rüzgar artığı)
            breath:          true,
            export_format:   'wav',
        };
    }

    // agresif — studio_sound YOK, remove_noise + ağız/nefes temizleme
    // Tüm frekans şekillendirme ve parlatma Auphonic'te
    return {
        remove_noise:    true,
        normalize:       false,  // Auphonic yapacak
        noise_reduction: 0.7,   // ⚠️ Deneysel — robotiklik sınırın altında, rüzgar üzerinde
        breath:          true,
        mouth_sounds:    true,
        export_format:   'wav',
    };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =========================================================================
// SERVER BAŞLAT
// =========================================================================
app.listen(PORT, () => {
    const cvOk  = !!(CLEANVOICE_API_KEY && CLEANVOICE_API_KEY !== 'your_cleanvoice_api_key_here');
    const auOk  = !!(AUPHONIC_USER && AUPHONIC_PASS);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║                                                  ║');
    console.log('  ║   🎤 VocalCleaner — AI Ses İyileştirme Stüdyosu  ║');
    console.log('  ║                                                  ║');
    console.log(`  ║   🌐 http://localhost:${PORT}                      ║`);
    console.log('  ║                                                  ║');
    console.log(`  ║   🔑 CleanVoice : ${cvOk ? '✅ Yapılandırılmış        ' : '❌ Eksik (.env kontrol et)'}║`);
    console.log(`  ║   🎚  Auphonic  : ${auOk ? '✅ Yapılandırılmış        ' : '❌ Eksik (.env kontrol et)'}║`);
    console.log('  ║                                                  ║');
    console.log('  ║   Pipeline: CleanVoice → Auphonic (cerrahi)     ║');
    console.log('  ║   Devre Dışı: denoise · gate · fillers ·         ║');
    console.log('  ║              stutters · long_silences            ║');
    console.log('  ║                                                  ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
});