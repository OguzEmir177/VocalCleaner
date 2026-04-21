/**
 * ============================================
 * VocalCleaner — AI Ses İyileştirme Stüdyosu
 * Ana Uygulama JavaScript Dosyası
 * ============================================
 * 
 * Bu dosya uygulamanın tüm frontend mantığını içerir.
 * Gerçek ses işleme için Node.js proxy sunucusu (server.js) kullanılır.
 * 
 * Kurulum:
 *   1. .env dosyasında CLEANVOICE_API_KEY değişkenini tanımlayın.
 *   2. "npm start" ile sunucuyu başlatın.
 *   3. Uygulamaya http://localhost:3456 adresinden erişin.
 */

// ===== GLOBAL STATE =====
const AppState = {
    currentFile: null,           // Yüklenen dosya objesi
    originalAudioUrl: null,      // Orijinal ses URL'i
    enhancedAudioUrl: null,      // İyileştirilmiş ses URL'i
    audioContext: null,          // Web Audio API context
    originalBuffer: null,        // Orijinal ses buffer
    enhancedBuffer: null,        // İyileştirilmiş ses buffer
    currentMode: 'original',     // 'original' veya 'enhanced'
    isPlaying: false,
    currentAudio: null,          // Aktif HTMLAudioElement
    originalAudio: null,
    enhancedAudio: null,
    selectedIntensity: 'orta',    // 'hafif', 'orta', 'agresif'
};

// ===== DOM ELEMENTS =====
const DOM = {
    // Upload
    uploadZone: document.getElementById('uploadZone'),
    fileInput: document.getElementById('fileInput'),
    uploadBtn: document.getElementById('uploadBtn'),
    fileInfoCard: document.getElementById('fileInfoCard'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    removeFileBtn: document.getElementById('removeFileBtn'),
    enhanceBtn: document.getElementById('enhanceBtn'),
    intensityBtns: document.querySelectorAll('.intensity-btn'),
    waveformCanvas: document.getElementById('waveformCanvas'),

    // Sections
    heroSection: document.getElementById('heroSection'),
    uploadSection: document.getElementById('uploadSection'),
    processingSection: document.getElementById('processingSection'),
    resultSection: document.getElementById('resultSection'),

    // Processing
    ringProgress: document.getElementById('ringProgress'),
    ringPercent: document.getElementById('ringPercent'),
    processingTitle: document.getElementById('processingTitle'),
    processingStage: document.getElementById('processingStage'),
    visualizerBars: document.getElementById('visualizerBars'),
    steps: [
        document.getElementById('step1'),
        document.getElementById('step2'),
        document.getElementById('step3'),
        document.getElementById('step4'),
        document.getElementById('step5'),
    ],

    // Player
    abOriginal: document.getElementById('abOriginal'),
    abEnhanced: document.getElementById('abEnhanced'),
    abThumb: document.getElementById('abThumb'),
    activeModeLabel: document.getElementById('activeModeLabel'),
    modeLabelText: document.getElementById('modeLabelText'),
    playerWaveformCanvas: document.getElementById('playerWaveformCanvas'),
    playhead: document.getElementById('playhead'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    progressFill: document.getElementById('progressFill'),
    progressBarContainer: document.getElementById('progressBarContainer'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    playIcon: document.getElementById('playIcon'),
    skipBackBtn: document.getElementById('skipBackBtn'),
    skipForwardBtn: document.getElementById('skipForwardBtn'),
    volumeBtn: document.getElementById('volumeBtn'),
    volumeSlider: document.getElementById('volumeSlider'),

    // Download
    downloadWav: document.getElementById('downloadWav'),
    downloadMp3: document.getElementById('downloadMp3'),
    newFileBtn: document.getElementById('newFileBtn'),

    // Other
    bgParticles: document.getElementById('bgParticles'),
    toastContainer: document.getElementById('toastContainer'),
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initLucideIcons();
    initParticles();
    initVisualizerBars();
    addSVGGradient();
    bindEvents();
});

/** Lucide ikonlarını aktifleştir */
function initLucideIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

/** Arka plan parçacıkları oluştur */
function initParticles() {
    const container = DOM.bgParticles;
    const colors = ['rgba(139, 92, 246, 0.3)', 'rgba(6, 214, 160, 0.2)', 'rgba(236, 72, 153, 0.15)'];

    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        const size = Math.random() * 4 + 2;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100;
        const duration = Math.random() * 15 + 10;
        const delay = Math.random() * 10;

        particle.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            left: ${left}%;
            background: ${color};
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
        `;
        container.appendChild(particle);
    }
}

/** İşleme animasyonu için bar'lar oluştur */
function initVisualizerBars() {
    const container = DOM.visualizerBars;
    for (let i = 0; i < 40; i++) {
        const bar = document.createElement('div');
        bar.classList.add('v-bar');
        bar.style.animationDuration = `${0.5 + Math.random() * 1}s`;
        bar.style.animationDelay = `${Math.random() * 0.5}s`;
        bar.style.height = `${20 + Math.random() * 60}%`;
        container.appendChild(bar);
    }
}

/** SVG gradient tanımı ekle (ring-progress için) */
function addSVGGradient() {
    const svg = document.querySelector('.ring-svg');
    if (!svg) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'progressGradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#8b5cf6');

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#06d6a0');

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    svg.insertBefore(defs, svg.firstChild);
}

// ===== EVENT BINDINGS =====
function bindEvents() {
    // --- Upload Events ---
    DOM.uploadZone.addEventListener('click', (e) => {
        if (e.target.closest('#uploadBtn') || e.target === DOM.uploadZone || e.target.closest('.upload-zone-inner')) {
            DOM.fileInput.click();
        }
    });

    DOM.fileInput.addEventListener('change', handleFileSelect);
    DOM.removeFileBtn.addEventListener('click', handleFileRemove);
    DOM.enhanceBtn.addEventListener('click', handleEnhance);

    // Intensity Selector
    DOM.intensityBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.intensityBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.selectedIntensity = btn.dataset.intensity;
        });
    });

    // Drag & Drop
    DOM.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.add('drag-over');
    });

    DOM.uploadZone.addEventListener('dragleave', () => {
        DOM.uploadZone.classList.remove('drag-over');
    });

    DOM.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    });

    // --- A/B Switch ---
    DOM.abOriginal.addEventListener('click', () => switchMode('original'));
    DOM.abEnhanced.addEventListener('click', () => switchMode('enhanced'));
    document.querySelector('.ab-switch-track')?.addEventListener('click', () => {
        switchMode(AppState.currentMode === 'original' ? 'enhanced' : 'original');
    });

    // --- Player Controls ---
    DOM.playPauseBtn.addEventListener('click', togglePlayPause);
    DOM.skipBackBtn.addEventListener('click', () => skipTime(-5));
    DOM.skipForwardBtn.addEventListener('click', () => skipTime(5));
    DOM.volumeSlider.addEventListener('input', handleVolumeChange);
    DOM.volumeBtn.addEventListener('click', toggleMute);

    // Progress bar click
    DOM.progressBarContainer.addEventListener('click', handleProgressClick);

    // Player waveform click
    DOM.playerWaveformCanvas?.parentElement?.addEventListener('click', handleWaveformClick);

    // --- Download ---
    DOM.downloadWav.addEventListener('click', () => handleDownload('wav'));
    DOM.downloadMp3.addEventListener('click', () => handleDownload('mp3'));

    // --- New File ---
    DOM.newFileBtn.addEventListener('click', handleNewFile);
}

// ===== FILE HANDLING =====

/** Dosya seçimi işleyicisi */
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

/** Dosya işleme ve doğrulama */
function processFile(file) {
    // Format kontrolü
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3'];
    const ext = file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(file.type) && !['mp3', 'wav'].includes(ext)) {
        showToast('Lütfen MP3 veya WAV formatında bir dosya seçin.', 'error');
        return;
    }

    // Boyut kontrolü (500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast('Dosya boyutu 500MB sınırını aşıyor.', 'error');
        return;
    }

    AppState.currentFile = file;
    AppState.originalAudioUrl = URL.createObjectURL(file);

    // UI güncelle
    DOM.fileName.textContent = file.name;
    DOM.fileSize.textContent = `${formatFileSize(file.size)} • ${ext.toUpperCase()}`;

    DOM.uploadZone.classList.add('hidden');
    DOM.fileInfoCard.classList.add('visible');

    // Waveform çiz
    drawUploadWaveform(file);

    showToast(`"${file.name}" başarıyla yüklendi.`, 'success');
}

/** Dosyayı kaldır */
function handleFileRemove(e) {
    e.stopPropagation();
    resetUpload();
}

/** Upload alanını sıfırla */
function resetUpload() {
    if (AppState.originalAudioUrl) {
        URL.revokeObjectURL(AppState.originalAudioUrl);
    }
    if (AppState.enhancedAudioUrl) {
        URL.revokeObjectURL(AppState.enhancedAudioUrl);
    }

    AppState.currentFile = null;
    AppState.originalAudioUrl = null;
    AppState.enhancedAudioUrl = null;
    AppState.originalBuffer = null;
    AppState.enhancedBuffer = null;

    DOM.fileInput.value = '';
    DOM.fileInfoCard.classList.remove('visible');
    DOM.uploadZone.classList.remove('hidden');
}

// ===== WAVEFORM DRAWING =====

/** Yükleme waveform'u çiz */
async function drawUploadWaveform(file) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        AppState.originalBuffer = audioBuffer;
        drawWaveform(DOM.waveformCanvas, audioBuffer, '#8b5cf6', '#a78bfa');
        audioContext.close();
    } catch (err) {
        console.warn('Waveform çizimi başarısız:', err);
    }
}

/** Canvas üzerine waveform çiz */
function drawWaveform(canvas, audioBuffer, colorStart, colorEnd) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum !== undefined) {
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
        }
        const y1 = (1 + min) * amp;
        const y2 = (1 + max) * amp;

        ctx.fillStyle = gradient;
        ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }
}

/** Player waveform çiz */
function drawPlayerWaveform(audioBuffer, mode) {
    const colors = mode === 'enhanced'
        ? ['#06d6a0', '#34e8b8']
        : ['#8b5cf6', '#a78bfa'];
    drawWaveform(DOM.playerWaveformCanvas, audioBuffer, colors[0], colors[1]);
}

// ===== API INTEGRATION =====
// =========================================================================
// 🔑 CLEANVOICE AI API ENTEGRASYONU
// =========================================================================
// Bu bölüm, Node.js tabanlı proxy sunucumuz üzerinden (server.js)
// Cleanvoice AI API'sine bağlanır.
//
// Proxy kullanılmasının nedeni, API anahtarını güvenli tutmak (expose etmemek)
// ve CORS sorunlarını aşmaktır.
// =========================================================================

/**
 * Gerçek API ile ses iyileştirme
 * 
 * Bu fonksiyon, ses dosyasını Node.js backend'ine (proxy) gönderir.
 * Backend; Cleanvoice API'ye yükler, işler ve download_url döndürür.
 * 
 * @param {File} audioFile - İyileştirilecek ses dosyası
 * @param {Function} onProgress - Animasyon aşamalarını senkronize etmek için callback
 * @returns {Promise<string>} İyileştirilmiş sesin URL'i
 */
async function enhanceAudioWithAPI(audioFile, intensity) {
    const formData = new FormData();
    formData.append('intensity', intensity); // Metin alanı dosyadan önce olmalı
    formData.append('audio', audioFile);

    try {
        // Backend'e istek at
        const response = await fetch('/api/enhance', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Backend Hatası: ${response.status}`);
        }

        const data = await response.json();
        return data.editId; // Sadece editId dönüyoruz

    } catch (error) {
        console.error('API / Backend başlatma hatası:', error);
        throw error;
    }
}

/**
 * Cleanvoice'dan dönen status değerini UI adımlarına eşler
 * @param {string} status - Cleanvoice status (PENDING, PREPROCESSING, CLASSIFICATION, EDITING, POSTPROCESSING, EXPORT, SUCCESS)
 * @returns {number} Step index (0-4)
 */
function mapStatusToStep(status) {
    const statusMap = {
        'PENDING': 0,
        'PREPROCESSING': 1,
        'CLASSIFICATION': 1,
        'EDITING': 2,
        'POSTPROCESSING': 3,
        'EXPORT': 3,
        'AUPHONIC_MASTERING': 4,  // Auphonic devrede
        'DONE': 4,
        'SUCCESS': 4
    };
    return statusMap[status] !== undefined ? statusMap[status] : 0;
}

// ===== ENHANCE PROCESS =====

/** Enhance butonuna basıldığında çalışır */
async function handleEnhance() {
    if (!AppState.currentFile) {
        showToast('Lütfen önce bir dosya yükleyin.', 'error');
        return;
    }

    // UI geçişi: Upload → Processing
    DOM.heroSection.classList.add('hidden');
    DOM.uploadSection.classList.add('hidden');
    DOM.processingSection.classList.add('visible');
    DOM.resultSection.classList.remove('visible');

    // Navigasyon güncelle
    document.querySelector('.nav-link[data-section="studio"]')?.classList.add('active');
    document.querySelector('.nav-link[data-section="upload"]')?.classList.remove('active');

    try {
        // İşleme animasyonunu başlat ve API çağrısını yürüt
        const enhancedUrl = await runProcessingAnimation(AppState.currentFile, AppState.selectedIntensity);

        AppState.enhancedAudioUrl = enhancedUrl;

        // İşlem tamamlandı — sonuç ekranına geç
        showResultSection();
        showToast('Ses başarıyla iyileştirildi!', 'success');

    } catch (error) {
        console.error('İyileştirme hatası:', error);

        const msg = error.message || '';
        let userMsg = '';

        if (msg.includes('402') || msg.includes('quota') || msg.includes('credit') || msg.includes('limit') || msg.includes('insufficient')) {
            userMsg = '⚠️ CleanVoice API kredisi bitti. Lütfen yöneticiye bildirin: "CleanVoice API\'si bitmiş."';
        } else if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY')) {
            userMsg = '⚠️ API anahtarı geçersiz. Lütfen yöneticiye bildirin: "CleanVoice API anahtarı geçersiz."';
        } else if (msg.includes('Auphonic')) {
            userMsg = '⚠️ Lütfen yöneticiye bildirin: "Auphonic API\'si bitti veya hatalı."';
        } else if (msg.includes('zaman aşımı') || msg.includes('timeout')) {
            userMsg = '⏱️ İşlem çok uzun sürdü. Lütfen tekrar deneyin.';
        } else {
            userMsg = `❌ Bir hata oluştu. Lütfen tekrar deneyin. (${msg})`;
        }

        showToast(userMsg, 'error');

        // Upload ekranına geri dön
        DOM.processingSection.classList.remove('visible');
        DOM.heroSection.classList.remove('hidden');
        DOM.uploadSection.classList.remove('hidden');
    }
}

/** 
 * İşleme animasyonunu çalıştır ve API çağrısını senkronize yap
 */
async function runProcessingAnimation(file, intensity) {
    // 1. API İşlemini Başlat
    const editId = await enhanceAudioWithAPI(file, intensity);
    console.log(`[VocalCleaner] İşlem Id: ${editId} — Şiddet: ${intensity} — Polling başlıyor...`);

    // UI Durum Başlıkları
    const stageInfo = [
        { title: 'Dosya Analiz Ediliyor...', sub: 'Yapay zeka ses profilinizi çıkarıyor' },
        { title: 'Vokal Temizleniyor...', sub: 'Gürültüler ve gereksiz sesler ayıklanıyor' },
        { title: 'Ses Dengeleniyor...', sub: 'EQ ve dinamik aralık optimize ediliyor' },
        { title: 'Vokal Parlatılıyor...', sub: 'Nefes ve ağız sesleri yok ediliyor' },
        { title: 'Auphonic Mastering...', sub: 'Profesyonel ses imzası ve normalizasyon uygulanıyor' },
        { title: 'Dosya Hazırlanıyor...', sub: 'İşlenmiş ses tarayıcınıza indiriliyor' },
        { title: 'İşlem Tamamlandı!', sub: 'Temizlenmiş ses dosyanız hazır' }
    ];

    let currentStep = 0;
    let progressPercent = 0;
    let isFinished = false;

    // UI'ı başlangıç durumuna getir
    updateRingProgress(5);
    DOM.steps.forEach(s => s.classList.remove('active', 'completed'));
    DOM.steps[0].classList.add('active');

    // Polling Döngüsü
    while (!isFinished) {
        try {
            const response = await fetch(`/api/status/${editId}`);
            if (!response.ok) throw new Error(`Status error: ${response.status}`);

            const data = await response.json();
            const currentStatus = data.status || data.task_status;
            console.log(`[VocalCleaner] Status: ${currentStatus}`);

            const stepIdx = mapStatusToStep(currentStatus);

            // UI Güncelle
            if (stepIdx > currentStep) {
                // Önceki adımları tamamlandı yap
                for (let i = 0; i < stepIdx; i++) {
                    DOM.steps[i].classList.remove('active');
                    DOM.steps[i].classList.add('completed');
                }
                currentStep = stepIdx;
                DOM.steps[currentStep].classList.add('active');

                DOM.processingTitle.textContent = stageInfo[currentStep].title;
                DOM.processingStage.textContent = stageInfo[currentStep].sub;
            }

            // Progress bar yapay ama mantıklı ilerlesin
            const targetPercent = (stepIdx + 1) * 20 - 5;
            if (progressPercent < targetPercent) {
                progressPercent += 0.8;
            } else if (progressPercent < 98) {
                progressPercent += 0.25; // Daha akıcı ilerleme (donmuş gibi durmasın)
            }
            updateRingProgress(progressPercent);

            // Auphonic mastering sürüyor — bekle, indirme ekranını açma
            if (currentStatus === 'AUPHONIC_MASTERING' || currentStatus === 'SUCCESS') {
                DOM.processingTitle.textContent = stageInfo[4].title;
                DOM.processingStage.textContent = stageInfo[4].sub;
                if (DOM.steps[3]) { DOM.steps[3].classList.remove('active'); DOM.steps[3].classList.add('completed'); }
                if (DOM.steps[4]) { DOM.steps[4].classList.add('active'); }
                progressPercent = Math.min(progressPercent + 0.3, 94);
                updateRingProgress(progressPercent);
                await delay(2500);
                continue;
            }

            // Tüm pipeline bitti (CleanVoice + Auphonic) — sadece şimdi indirme ekranı
            if (currentStatus === 'DONE') {
                isFinished = true;

                const downloadUrl = data.downloadUrl || data.download_url;
                console.log('[VocalCleaner] ✅ Pipeline tamamlandı. Download URL:', downloadUrl);

                if (!downloadUrl) throw new Error('Download URL alınamadı.');

                DOM.steps.forEach(s => s.classList.add('completed'));
                DOM.processingTitle.textContent = stageInfo[5].title;
                DOM.processingStage.textContent = stageInfo[5].sub;
                updateRingProgress(95);

                const finalUrl = await downloadEnhancedAudio(downloadUrl);

                updateRingProgress(100);
                DOM.processingTitle.textContent = stageInfo[6].title;
                DOM.processingStage.textContent = stageInfo[6].sub;

                return finalUrl;
            }

            if (currentStatus === 'FAILURE' || currentStatus === 'FAILED') {
                throw new Error('İşlem başarısız oldu.');
            }

            // 1.5 saniye bekle (daha hızlı tepki için 2000'den düşürdük)
            await delay(1500);

        } catch (err) {
            console.error('[VocalCleaner] Polling hatası:', err);
            throw err;
        }
    }
}

/**
 * İşlenmiş sesi proxy üzerinden indirir ve Audio URL döner
 * @param {string} rawUrl - Cleanvoice'dan gelen ham download URL
 */
async function downloadEnhancedAudio(rawUrl) {
    console.log('[Frontend] Temizlenmiş ses indiriliyor...');
    const proxyUrl = `/api/download?url=${encodeURIComponent(rawUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) {
        let errMsg = 'Ses dosyası indirilemedi.';
        try {
            const errData = await response.json();
            errMsg += ` (${errData.error || response.status})`;
        } catch (e) {
            errMsg += ` (${response.status})`;
        }
        throw new Error(errMsg);
    }

    const audioBlob = await response.blob();
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Waveform çizimi için buffer'ı decode et
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    AppState.enhancedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    return URL.createObjectURL(audioBlob);
}

/** 
 * Ring progress animasyonu
 * @param {number} startMs - Başlangıç mili-saniyesi (total üzerinden)
 * @param {number} endMs - Bitiş mili-saniyesi (total üzerinden)
 * @param {number} totalMs - Toplam animasyon süresi
 * @param {number} durationMs - Bu aşamanın süresi
 * @param {Function} isApiCompleted - API'nin bitip bitmediğini kontrol eden fonksiyon
 */
function animateProgress(startMs, endMs, totalMs, durationMs, isApiCompleted) {
    return new Promise(resolve => {
        let startPercent = (startMs / totalMs) * 100;
        let endPercent = (endMs / totalMs) * 100;

        // Sonlara doğru %100'e vurmasın, son adımı beklesin
        if (endPercent > 98 && startPercent < 98) {
            endPercent = 98;
        }

        const startTime = performance.now();

        function animate(currentTime) {
            let progress = Math.min((currentTime - startTime) / durationMs, 1);

            // Eğer API bitmişse animasyonu hızlandır
            if (isApiCompleted && isApiCompleted()) {
                progress = Math.min(progress * 3, 1);
            }

            const currentPercent = startPercent + (endPercent - startPercent) * easeInOutCubic(progress);
            updateRingProgress(currentPercent);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(animate);
    });
}

/** Ring SVG progress güncelle */
function updateRingProgress(percent) {
    const circumference = 2 * Math.PI * 54; // r=54
    const offset = circumference - (percent / 100) * circumference;
    DOM.ringProgress.style.strokeDashoffset = offset;
    DOM.ringPercent.textContent = `${Math.round(percent)}%`;
}

// ===== RESULT SECTION =====

/** Sonuç ekranını göster */
function showResultSection() {
    DOM.processingSection.classList.remove('visible');
    DOM.resultSection.classList.add('visible');

    // Audio elementlerini oluştur
    AppState.originalAudio = new Audio(AppState.originalAudioUrl);
    AppState.enhancedAudio = new Audio(AppState.enhancedAudioUrl);
    AppState.currentAudio = AppState.originalAudio;
    AppState.currentMode = 'original';

    // Volume ayarla
    const vol = DOM.volumeSlider.value / 100;
    AppState.originalAudio.volume = vol;
    AppState.enhancedAudio.volume = vol;

    // Ses yüklendiğinde süreyi göster
    AppState.originalAudio.addEventListener('loadedmetadata', () => {
        DOM.totalTime.textContent = formatTime(AppState.originalAudio.duration);
    });

    // Zaman güncellemeleri
    AppState.originalAudio.addEventListener('timeupdate', updatePlayerUI);
    AppState.enhancedAudio.addEventListener('timeupdate', updatePlayerUI);

    // Çalma bittiğinde
    AppState.originalAudio.addEventListener('ended', handleAudioEnded);
    AppState.enhancedAudio.addEventListener('ended', handleAudioEnded);

    // Player waveform çiz
    if (AppState.originalBuffer) {
        drawPlayerWaveform(AppState.originalBuffer, 'original');
    }

    // A/B modunu sıfırla
    switchMode('original');

    // Lucide ikonlarını yenile
    lucide.createIcons();
}

/** Player UI güncelle (timeupdate) */
function updatePlayerUI() {
    const audio = AppState.currentAudio;
    if (!audio || !audio.duration) return;

    const percent = (audio.currentTime / audio.duration) * 100;
    DOM.progressFill.style.width = `${percent}%`;
    DOM.currentTime.textContent = formatTime(audio.currentTime);

    // Playhead pozisyonu
    const waveformWidth = DOM.playerWaveformCanvas?.parentElement?.offsetWidth || 0;
    const playheadPos = (percent / 100) * waveformWidth;
    DOM.playhead.style.left = `${playheadPos}px`;
}

/** Ses bittiğinde */
function handleAudioEnded() {
    AppState.isPlaying = false;
    updatePlayPauseIcon();
}

// ===== A/B MODE SWITCHING =====

/** Original veya Enhanced moduna geç */
function switchMode(mode) {
    const wasPlaying = AppState.isPlaying;
    const currentTime = AppState.currentAudio?.currentTime || 0;

    // Eğer çalıyorsa durdur
    if (wasPlaying) {
        AppState.currentAudio.pause();
    }

    AppState.currentMode = mode;

    if (mode === 'enhanced') {
        AppState.currentAudio = AppState.enhancedAudio;
        DOM.abEnhanced.classList.add('active');
        DOM.abOriginal.classList.remove('active');
        DOM.abThumb.classList.add('enhanced');
        DOM.modeLabelText.textContent = 'Temizlenmiş Ses';
        DOM.activeModeLabel.querySelector('.mode-dot').className = 'mode-dot enhanced';
        DOM.playhead.classList.add('enhanced-mode');

        if (AppState.enhancedBuffer) {
            drawPlayerWaveform(AppState.enhancedBuffer, 'enhanced');
        }
    } else {
        AppState.currentAudio = AppState.originalAudio;
        DOM.abOriginal.classList.add('active');
        DOM.abEnhanced.classList.remove('active');
        DOM.abThumb.classList.remove('enhanced');
        DOM.modeLabelText.textContent = 'Orijinal Ses';
        DOM.activeModeLabel.querySelector('.mode-dot').className = 'mode-dot original';
        DOM.playhead.classList.remove('enhanced-mode');

        if (AppState.originalBuffer) {
            drawPlayerWaveform(AppState.originalBuffer, 'original');
        }
    }

    // Zaman pozisyonunu koru (A/B karşılaştırma için)
    AppState.currentAudio.currentTime = currentTime;

    // Volume koru
    const vol = DOM.volumeSlider.value / 100;
    AppState.currentAudio.volume = vol;

    // Eğer çalıyorduysa devam et
    if (wasPlaying) {
        AppState.currentAudio.play();
    }

    updatePlayerUI();
}

// ===== PLAYER CONTROLS =====

/** Play/Pause toggle */
function togglePlayPause() {
    if (!AppState.currentAudio) return;

    if (AppState.isPlaying) {
        AppState.currentAudio.pause();
        AppState.isPlaying = false;
    } else {
        AppState.currentAudio.play();
        AppState.isPlaying = true;
    }

    updatePlayPauseIcon();
}

/** Play/Pause ikon güncelle */
function updatePlayPauseIcon() {
    const iconEl = DOM.playIcon;
    if (AppState.isPlaying) {
        iconEl.setAttribute('data-lucide', 'pause');
    } else {
        iconEl.setAttribute('data-lucide', 'play');
    }
    lucide.createIcons();
}

/** Zaman atlama */
function skipTime(seconds) {
    if (!AppState.currentAudio) return;
    AppState.currentAudio.currentTime = Math.max(0,
        Math.min(AppState.currentAudio.duration, AppState.currentAudio.currentTime + seconds)
    );
    // Senkronize tut
    const otherAudio = AppState.currentMode === 'original'
        ? AppState.enhancedAudio
        : AppState.originalAudio;
    if (otherAudio) {
        otherAudio.currentTime = AppState.currentAudio.currentTime;
    }
}

/** Volume değişimi */
function handleVolumeChange(e) {
    const vol = e.target.value / 100;
    if (AppState.originalAudio) AppState.originalAudio.volume = vol;
    if (AppState.enhancedAudio) AppState.enhancedAudio.volume = vol;
    updateVolumeIcon(vol);
}

/** Mute toggle */
function toggleMute() {
    const slider = DOM.volumeSlider;
    if (parseFloat(slider.value) > 0) {
        slider.dataset.prevValue = slider.value;
        slider.value = 0;
    } else {
        slider.value = slider.dataset.prevValue || 80;
    }
    handleVolumeChange({ target: slider });
}

/** Volume ikonunu güncelle */
function updateVolumeIcon(vol) {
    const iconEl = document.getElementById('volumeIcon');
    if (vol === 0) {
        iconEl.setAttribute('data-lucide', 'volume-x');
    } else if (vol < 0.5) {
        iconEl.setAttribute('data-lucide', 'volume-1');
    } else {
        iconEl.setAttribute('data-lucide', 'volume-2');
    }
    lucide.createIcons();
}

/** Progress bar tıklama */
function handleProgressClick(e) {
    if (!AppState.currentAudio) return;
    const rect = DOM.progressBarContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * AppState.currentAudio.duration;
    AppState.currentAudio.currentTime = newTime;

    // Diğer audio'yu da senkronize et
    const otherAudio = AppState.currentMode === 'original'
        ? AppState.enhancedAudio
        : AppState.originalAudio;
    if (otherAudio) {
        otherAudio.currentTime = newTime;
    }
}

/** Waveform tıklama */
function handleWaveformClick(e) {
    if (!AppState.currentAudio) return;
    const rect = DOM.playerWaveformCanvas.parentElement.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * AppState.currentAudio.duration;
    AppState.currentAudio.currentTime = newTime;

    const otherAudio = AppState.currentMode === 'original'
        ? AppState.enhancedAudio
        : AppState.originalAudio;
    if (otherAudio) {
        otherAudio.currentTime = newTime;
    }
}

// ===== DOWNLOAD =====

/** İşlenmiş sesi indir */
function handleDownload(format) {
    if (!AppState.enhancedAudioUrl && !AppState.enhancedBuffer) {
        showToast('İndirilecek bir işlenmiş ses bulunamadı.', 'error');
        return;
    }

    const fileName = AppState.currentFile?.name?.replace(/\.[^.]+$/, '') || 'vocal_enhanced';
    const finalFileName = `${fileName}_enhanced.wav`;

    // Mobil cihaz kontrolü (iPhone/iPad için kritik)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (format === 'wav') {
        if (AppState.enhancedBuffer) {
            const blob = audioBufferToWav(AppState.enhancedBuffer);
            
            // iPhone/Mobil için Yerel Paylaş Menüsü (Web Share API)
            if (isMobile && navigator.share) {
                const file = new File([blob], finalFileName, { type: 'audio/wav' });
                navigator.share({
                    files: [file],
                    title: 'Temizlenmiş Ses',
                    text: 'VocalCleaner tarafından iyileştirildi'
                }).catch(err => {
                    console.log('Paylaşma iptal edildi veya hata:', err);
                    downloadBlob(blob, finalFileName);
                });
            } else {
                downloadBlob(blob, finalFileName);
            }
        } else {
            downloadFromUrl(AppState.enhancedAudioUrl, finalFileName);
        }
    } else {
        // MP3 (Şu an WAV olarak iner)
        if (AppState.enhancedBuffer) {
            const blob = audioBufferToWav(AppState.enhancedBuffer);
            downloadBlob(blob, `${fileName}_enhanced.wav`);
            showToast('Not: WAV olarak indirildi. MP3 için backend gerekli.', 'info');
        } else {
            downloadFromUrl(AppState.enhancedAudioUrl, `${fileName}_enhanced.mp3`);
        }
    }

    showToast('İndirme başladı!', 'success');
}

/** Blob'u dosya olarak indir */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** URL'den dosya indir */
function downloadFromUrl(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ===== NEW FILE =====

/** Yeni dosya yükleme — sıfırla */
function handleNewFile() {
    // Çalan sesi durdur
    if (AppState.originalAudio) {
        AppState.originalAudio.pause();
        AppState.originalAudio = null;
    }
    if (AppState.enhancedAudio) {
        AppState.enhancedAudio.pause();
        AppState.enhancedAudio = null;
    }
    AppState.isPlaying = false;
    AppState.currentAudio = null;

    // Tüm adımları sıfırla
    DOM.steps.forEach(step => {
        step.classList.remove('active', 'completed');
    });
    updateRingProgress(0);

    // UI sıfırla
    DOM.resultSection.classList.remove('visible');
    DOM.processingSection.classList.remove('visible');
    DOM.heroSection.classList.remove('hidden');
    DOM.uploadSection.classList.remove('hidden');

    resetUpload();

    // Navigasyon
    document.querySelector('.nav-link[data-section="upload"]')?.classList.add('active');
    document.querySelector('.nav-link[data-section="studio"]')?.classList.remove('active');

    lucide.createIcons();
}

// ===== UTILITY FUNCTIONS =====

/** AudioBuffer → WAV Blob dönüştürücü */
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // WAV Header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, val, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/** DataView'a string yaz */
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/** Dosya boyutunu formatla */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/** Zamanı mm:ss formatında göster */
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Easing fonksiyonu */
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Gecikme yardımcısı */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Toast bildirim göster */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.classList.add('toast', type);

    const iconName = {
        success: 'check-circle-2',
        error: 'alert-circle',
        info: 'info',
    }[type] || 'info';

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;

    DOM.toastContainer.appendChild(toast);
    lucide.createIcons();

    // 4 saniye sonra kaldır
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}