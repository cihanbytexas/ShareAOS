// ==========================================
// 1. ARAYÜZ (UI) ELEMENTLERİNİ YAKALAMA 
// ==========================================
const btnSend = document.getElementById('btn-send');
const btnReceive = document.getElementById('btn-receive');
const btnBeamoAir = document.getElementById('btn-beamoair');

const actionButtons = document.getElementById('action-buttons');
const senderSection = document.getElementById('sender-section');
const receiverSection = document.getElementById('receiver-section');
const beamoAirSection = document.getElementById('beamoair-section');
const btnBack = document.getElementById('btn-back');

const fileInput = document.getElementById('file-input');
const btnSelectFile = document.getElementById('btn-select-file');
const qrBox = document.getElementById('qr-box');
const qrCanvas = document.getElementById('qr-canvas');

const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');
const progressPercentage = document.getElementById('progress-percentage');

const stagingArea = document.getElementById('staging-area');
const fileListContainer = document.getElementById('file-list');
const btnStartTransfer = document.getElementById('btn-start-transfer');
const fileCountBadge = document.getElementById('file-count-badge');

const scannerContainer = document.getElementById('scanner-container');
const receivedGallery = document.getElementById('received-gallery');
const receivedList = document.getElementById('received-list');
const radarList = document.getElementById('radar-list');

const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');

// ==========================================
// 2. DURUM (STATE) VE KİMLİK DEĞİŞKENLERİ
// ==========================================
let fileQueue = []; 
let currentFileIndex = 0; 
let isTransferring = false;
let isConnected = false;
let activeObjectUrls = []; // RAM Sızıntısını Önlemek İçin Bellek Yönetimi

function getDeviceName() {
    const ua = navigator.userAgent;
    let browser = "Tarayıcı";
    if (/Firefox/i.test(ua)) browser = "Firefox";
    else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Int.";
    else if (/Opera|OPR/i.test(ua)) browser = "Opera";
    else if (/Edg/i.test(ua)) browser = "Edge";
    else if (/Chrome/i.test(ua)) browser = "Chrome";
    else if (/Safari/i.test(ua)) browser = "Safari";

    let os = "Cihaz";
    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Mac/i.test(ua)) os = "Mac";
    else if (/iPhone/i.test(ua)) os = "iPhone";
    else if (/iPad/i.test(ua)) os = "iPad";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/Linux/i.test(ua)) os = "Linux";

    return `${os} / ${browser}`;
}

const myDeviceName = getDeviceName();
const localSenderId = "peer_" + Math.random().toString(36).substring(2, 15);
let beamoAirChannel = null;

// ==========================================
// 3. SUPABASE & WEBRTC AYARLARI
// ==========================================
const supabaseUrl = 'https://roiwxcecevfigomtopgb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvaXd4Y2VjZXZmaWdvbXRvcGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODYyNDEsImV4cCI6MjA5OTk2MjI0MX0.3RRbvEjWXjTBFlgNXyMGGhcKWvlaApqQieEgA7hLJMY';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let peerConnection;
let dataChannel;
let currentRoomId = null;
let html5QrCode = null;

// ==========================================
// 4. TEMEL BUTON OLAYLARI VE YENİ RESET (BAĞLANTIYI KES) LOGIC
// ==========================================
btnSend.addEventListener('click', () => { activateSenderMode(); createRoomAndGenerateQR(); });
btnReceive.addEventListener('click', () => { activateReceiverMode(); startQRScanner(); });
btnBeamoAir.addEventListener('click', () => { 
    actionButtons.classList.add('hidden'); beamoAirSection.classList.remove('hidden'); 
    btnBack.classList.remove('hidden'); startBeamoAirRadar(); 
});
btnSelectFile.addEventListener('click', () => { if (dataChannel && dataChannel.readyState === 'open') { fileInput.click(); }});
btnStartTransfer.addEventListener('click', startTransfer);

// Bağlantıyı Kes Butonu
btnBack.addEventListener('click', () => {
    // 1. Karşı tarafa bağlantıyı kestiğimizi kibarca bildiriyoruz (Eğer kanal açıksa)
    if (dataChannel && dataChannel.readyState === 'open') {
        try { dataChannel.send(JSON.stringify({ type: 'disconnect' })); } catch(e) {}
    }
    // 2. Uygulamayı sıfırla
    resetApp();
});

function activateSenderMode(hideQR = false) {
    actionButtons.classList.add('hidden'); beamoAirSection.classList.add('hidden');
    senderSection.classList.remove('hidden'); btnBack.classList.remove('hidden');
    if(hideQR) qrBox.classList.add('hidden'); else qrBox.classList.remove('hidden');
}

function activateReceiverMode(hideScanner = false) {
    actionButtons.classList.add('hidden'); beamoAirSection.classList.add('hidden');
    receiverSection.classList.remove('hidden'); btnBack.classList.remove('hidden');
    if(hideScanner) scannerContainer.classList.add('hidden'); else scannerContainer.classList.remove('hidden');
}

// YENİ VE HATASIZ SIFIRLAMA FONKSİYONU
function resetApp() {
    // RAM Temizliği (Önceki medyaların bellekte yer tutmasını engeller)
    activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
    activeObjectUrls = [];

    // Hata oluşsa bile UI sıfırlamaya devam etmesi için Try-Catch blokları
    try { if (dataChannel) { dataChannel.close(); dataChannel = null; } } catch(e) {}
    try { if (peerConnection) { peerConnection.close(); peerConnection = null; } } catch(e) {}
    
    isConnected = false;
    currentRoomId = null;

    try { supabaseClient.removeAllChannels(); beamoAirChannel = null; } catch(e) {}
    closeModal();

    // QR Tarayıcı durdurulurken hata verirse UI kilitlenmesin
    if (html5QrCode) {
        try {
            html5QrCode.stop().then(() => { html5QrCode = null; }).catch(e => { html5QrCode = null; });
        } catch(e) { html5QrCode = null; }
    }

    fileQueue = [];
    isTransferring = false;
    fileInput.value = '';
    
    // UI Kesin Sıfırlama
    actionButtons.classList.remove('hidden');
    senderSection.classList.add('hidden');
    receiverSection.classList.add('hidden');
    beamoAirSection.classList.add('hidden');
    btnBack.classList.add('hidden');
    
    progressContainer.classList.add('hidden');
    progressFill.style.width = "0%";
    progressPercentage.innerText = "0%";
    statusText.innerText = "Bağlantı bekleniyor...";
    
    stagingArea.classList.add('hidden');
    fileListContainer.innerHTML = '';
    btnStartTransfer.classList.remove('hidden');
    btnSelectFile.classList.add('hidden'); // Yeni eklendi: Dosya ekle butonunu gizle
    
    qrBox.classList.remove('hidden');
    scannerContainer.classList.remove('hidden');
    
    receivedGallery.classList.add('hidden');
    receivedList.innerHTML = '';
}

// KARŞI TARAF BAĞLANTIYI KESTİĞİNDE ÇALIŞACAK FONKSİYON
function handleRemoteDisconnect() {
    if (!isConnected) return; // Zaten kopuksa işlem yapma
    
    // Arkadan sistemi sessizce sıfırla ama kullanıcıya mesajı göster
    resetApp();
    
    showModal(`
        <div class="modal-icon-wrapper reject">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
        </div>
        <h3 style="margin-bottom: 8px;">Bağlantı Koptu</h3>
        <p style="color: var(--text-lo); font-size: 0.9rem;">Karşı cihaz bağlantıyı sonlandırdı veya internetten düştü.</p>
        <div class="modal-actions">
            <button class="btn primary-blue" onclick="closeModal()">Ana Menüye Dön</button>
        </div>
    `);
}

// ==========================================
// 5. BEAMOAIR (WIFI RADARI) MOTORU
// ==========================================
async function startBeamoAirRadar() {
    radarList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-lo); font-size: 0.85rem;">IP adresi tespit ediliyor... 🔍</div>';

    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const safeIP = ipData.ip.replace(/\./g, '_'); 
        const radarRoomName = `beamoair_radar_${safeIP}`;

        if (beamoAirChannel) { await supabaseClient.removeChannel(beamoAirChannel); }

        beamoAirChannel = supabaseClient.channel(radarRoomName, { config: { presence: { key: localSenderId } } });

        beamoAirChannel.on('presence', { event: 'sync' }, () => {
            const state = beamoAirChannel.presenceState();
            updateRadarUI(state);
        });

        beamoAirChannel.on('broadcast', { event: 'connection_request' }, (payload) => {
            const data = payload.payload;
            if (data.targetId === localSenderId) {
                showModal(`
                    <div class="modal-icon-wrapper request">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </div>
                    <h3 style="margin-bottom: 8px;">Bağlantı İsteği</h3>
                    <p style="color: var(--text-lo); font-size: 0.9rem;"><strong>${data.senderName}</strong> sana bağlanmak istiyor.</p>
                    <div class="modal-actions">
                        <button class="btn btn-danger" onclick="rejectConnection('${data.senderId}')">Vazgeç</button>
                        <button class="btn primary-blue" onclick="acceptConnection('${data.senderId}', '${data.roomId}')">Onayla</button>
                    </div>
                `);
            }
        });

        beamoAirChannel.on('broadcast', { event: 'connection_response' }, (payload) => {
            const data = payload.payload;
            if (data.targetId === localSenderId) {
                if (data.action === 'reject') {
                    showModal(`
                        <div class="modal-icon-wrapper reject">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </div>
                        <h3 style="margin-bottom: 8px;">Reddedildi</h3>
                        <p style="color: var(--text-lo); font-size: 0.9rem;"><strong>${data.senderName}</strong> bağlanmayı reddetti.</p>
                        <div class="modal-actions">
                            <button class="btn outline-blue" onclick="closeModal()">Kapat</button>
                        </div>
                    `);
                } else if (data.action === 'accept') {
                    closeModal(); activateSenderMode(true);
                    currentRoomId = data.roomId;
                    statusText.innerText = "BeamO Ağı Kuruluyor...";
                    progressContainer.classList.remove('hidden');
                    setupWebRTC(); setupRealtimeListener();
                }
            }
        });

        beamoAirChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') { await beamoAirChannel.track({ device_name: myDeviceName, peer_id: localSenderId, status: 'online' }); }
        });

    } catch (error) {
        radarList.innerHTML = '<div style="color: var(--danger); text-align:center; padding: 20px;">Bağlantı hatası.</div>';
    }
}

function updateRadarUI(presenceState) {
    radarList.innerHTML = ''; 
    let found = false;

    for (const [key, stateArray] of Object.entries(presenceState)) {
        const userData = stateArray[0];
        if (userData.peer_id === localSenderId) continue; 
        
        found = true;
        const item = document.createElement('div');
        item.className = 'radar-item';
        
        let iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`;
        
        item.innerHTML = `
            <div class="radar-info">
                <div class="radar-icon">${iconSvg}</div>
                <div>
                    <div class="radar-name">${userData.device_name}</div>
                    <div class="radar-status">Aynı Ağda Aktif</div>
                </div>
            </div>
            <button onclick="sendConnectionRequest('${userData.peer_id}', '${userData.device_name}')">Bağlan</button>
        `;
        radarList.appendChild(item);
    }

    if (!found) {
        radarList.innerHTML = `<div style="text-align:center; padding: 25px; color: var(--text-lo); font-size: 0.85rem;">Ağda başka cihaz bulunamadı.</div>`;
    }
}

async function sendConnectionRequest(targetPeerId, targetName) {
    showModal(`<div class="modal-icon-wrapper wait"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div><h3 style="margin-bottom: 8px;">Bağlanılıyor...</h3>`);
    
    const { data, error } = await supabaseClient.from('rooms').insert([{}]).select().single();
    if (error) return;
    
    showModal(`
        <div class="modal-icon-wrapper wait"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
        <h3 style="margin-bottom: 8px;">Onay Bekleniyor</h3>
        <p style="color: var(--text-lo); font-size: 0.9rem;"><strong>${targetName}</strong> cihazına istek gönderildi.</p>
        <div class="modal-actions"><button class="btn outline-blue" onclick="closeModal()">İptal Et</button></div>
    `);

    beamoAirChannel.send({
        type: 'broadcast', event: 'connection_request',
        payload: { senderId: localSenderId, senderName: myDeviceName, targetId: targetPeerId, roomId: data.id }
    });
}

function acceptConnection(senderId, roomId) {
    beamoAirChannel.send({
        type: 'broadcast', event: 'connection_response',
        payload: { targetId: senderId, senderName: myDeviceName, action: 'accept', roomId: roomId }
    });
    closeModal(); activateReceiverMode(true);
    currentRoomId = roomId;
    statusText.innerText = "BeamO Ağı Kuruluyor...";
    progressContainer.classList.remove('hidden');
    setupWebRTC(); setupRealtimeListener();

    setTimeout(async () => { await sendSignal('join', { message: 'Alıcı katıldı' }); }, 1500);
}

function rejectConnection(senderId) {
    beamoAirChannel.send({ type: 'broadcast', event: 'connection_response', payload: { targetId: senderId, senderName: myDeviceName, action: 'reject' } });
    closeModal();
}

function showModal(htmlContent) { modalContent.innerHTML = htmlContent; modalOverlay.classList.remove('hidden'); }
function closeModal() { modalOverlay.classList.add('hidden'); modalContent.innerHTML = ''; }

// ==========================================
// 6. SİNYALLEŞME & KAMERA
// ==========================================
async function createRoomAndGenerateQR() {
    statusText.innerText = "BeamO Ağı Kuruluyor...";
    progressContainer.classList.remove('hidden');

    const { data, error } = await supabaseClient.from('rooms').insert([{}]).select().single();
    if (error) return;
    
    currentRoomId = data.id;
    const joinLink = `${window.location.origin}/?room=${currentRoomId}`;
    
    QRCode.toCanvas(qrCanvas, joinLink, { width: 220, margin: 1, color: { dark: '#04060c', light: '#ffffff' } }, function (error) {
        statusText.innerText = "Alıcı cihazı bekliyor...";
    });

    setupWebRTC(); setupRealtimeListener();
}

function startQRScanner() {
    statusText.innerText = "Kamera başlatılıyor...";
    progressContainer.classList.remove('hidden');

    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" }, { fps: 15, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            html5QrCode.stop().then(() => { html5QrCode = null; }).catch(err => { html5QrCode = null; });
            scannerContainer.classList.add('hidden'); 
            const urlParams = new URLSearchParams(decodedText.split('?')[1]);
            const roomId = urlParams.get('room');
            if(roomId) {
                currentRoomId = roomId;
                statusText.innerText = "BeamO Ağına Bağlanılıyor...";
                setupWebRTC(); setupRealtimeListener();
                setTimeout(async () => { await sendSignal('join', { message: 'Alıcı katıldı' }); }, 1000);
            }
        },
        (errorMessage) => { }
    );
}

// ==========================================
// 7. WEBRTC ALICI/GÖNDERİCİ MOTORU
// ==========================================
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // KABA AYRILIŞ DİNLEYİCİSİ (Ağ koptuğunda veya sayfa kapandığında)
    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'failed' || 
            peerConnection.iceConnectionState === 'closed') {
            handleRemoteDisconnect();
        }
    };

    dataChannel = peerConnection.createDataChannel("fileTransferChannel");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => {
        isConnected = true;
        qrBox.classList.add('hidden'); 
        statusText.innerText = "BeamO Ağı Hazır! Dosya Seçin.";
        btnSelectFile.classList.remove('hidden'); 
        progressPercentage.innerText = "";
    };

    dataChannel.onmessage = (e) => {
        if (typeof e.data === 'string') {
            const data = JSON.parse(e.data);
            
            // KİBAR AYRILIŞ DİNLEYİCİSİ (Karşı taraf butona bastığında)
            if (data.type === 'disconnect') {
                handleRemoteDisconnect();
            }
            else if (data.type === 'file_received_ack') {
                currentFileIndex++;
                sendNextFile(); 
            }
            else if (data.type === 'ready_for_next') {
                 sendNextFile(); 
            }
        }
    };

    let receivedBuffers = [];
    let expectedFileSize = 0;
    let receivedSize = 0;
    let fileName = "gelen_dosya";
    let fileType = "";

    peerConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.binaryType = "arraybuffer";
        
        receiveChannel.onmessage = (e) => {
            if (typeof e.data === 'string') {
                const data = JSON.parse(e.data);
                
                // Alıcı Tarafı - Kibar Ayrılış Sinyali Gelirse
                if (data.type === 'disconnect') {
                    handleRemoteDisconnect();
                }
                else if (data.type === 'manifest') {
                    statusText.innerText = `Gelen BeamO: ${data.totalFiles} Dosya`;
                    receiveChannel.send(JSON.stringify({ type: 'ready_for_next' }));
                }
                else if (data.type === 'start_file') {
                    expectedFileSize = data.size;
                    fileName = data.name;
                    fileType = data.mimeType || ""; 
                    receivedSize = 0;
                    receivedBuffers = [];
                    statusText.innerText = `İndiriliyor: ${fileName}`;
                    progressFill.style.width = "0%";
                    progressPercentage.innerText = "0%";
                }
                return;
            }

            receivedBuffers.push(e.data);
            receivedSize += e.data.byteLength;

            const percentage = Math.floor((receivedSize / expectedFileSize) * 100);
            progressFill.style.width = percentage + "%";
            progressPercentage.innerText = percentage + "%";

            if (receivedSize === expectedFileSize) {
                statusText.innerText = `${fileName} başarıyla alındı.`;
                const blob = new Blob(receivedBuffers, { type: fileType });
                const blobUrl = URL.createObjectURL(blob);
                activeObjectUrls.push(blobUrl); // RAM'den silinebilmesi için listeye ekle
                
                renderReceivedMedia(fileName, fileType, blobUrl);
                receiveChannel.send(JSON.stringify({ type: 'file_received_ack' }));
            }
        };
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) sendSignal('candidate', event.candidate);
    };
}

function renderReceivedMedia(name, type, url) {
    receivedGallery.classList.remove('hidden');
    const item = document.createElement('div');
    item.className = 'received-item';

    let mediaHTML = '';
    if (type.startsWith('image/')) {
        mediaHTML = `<div class="received-media-container"><img src="${url}" class="received-media" alt="${name}"></div>`;
    } else if (type.startsWith('video/')) {
        mediaHTML = `<div class="received-media-container"><video src="${url}" controls class="received-media"></video></div>`;
    } else if (type.startsWith('audio/')) {
        mediaHTML = `<audio src="${url}" controls class="received-audio"></audio>`;
    } else {
        mediaHTML = `<div class="file-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg></div>`;
    }

    item.innerHTML = `
        ${mediaHTML}
        <div class="received-details">
            <span class="received-name" title="${name}">${name}</span>
            <a href="${url}" download="${name}" class="btn primary-blue btn-download">İndir</a>
        </div>
    `;
    receivedList.appendChild(item);
}

// ==========================================
// 8. GÖNDERİCİ VİTRİN DOM YÖNETİMİ
// ==========================================
fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;
    fileQueue = [...fileQueue, ...newFiles];
    updateVitrinUI(); fileInput.value = ''; 
});

window.removeFileFromQueue = function(index) {
    fileQueue.splice(index, 1); updateVitrinUI();
}

function updateVitrinUI() {
    if (!fileListContainer) return;
    fileListContainer.innerHTML = '';
    
    fileQueue.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        let previewHTML = '';
        if (file.type.startsWith('image/')) {
            const tempUrl = URL.createObjectURL(file);
            activeObjectUrls.push(tempUrl); // RAM listesine ekle
            previewHTML = `<img src="${tempUrl}" class="media-preview">`;
        } else if (file.type.startsWith('video/')) {
            previewHTML = `<div class="media-preview" style="background:#111; display:flex; align-items:center; justify-content:center; color:#5eead4; font-size:0.6rem; font-weight:bold;">VIDEO</div>`;
        } else {
            previewHTML = `<div class="media-preview" style="background:var(--surface-2); display:flex; align-items:center; justify-content:center; color:var(--text-lo); font-size:1.5rem;">📄</div>`;
        }
        
        const ext = file.name.split('.').pop().toUpperCase().substring(0, 4);

        item.innerHTML = `
            ${previewHTML}
            <div class="file-info-overlay"><span class="file-ext">${ext}</span><span class="file-size">${(file.size / (1024*1024)).toFixed(1)}MB</span></div>
            <button class="btn-remove" onclick="removeFileFromQueue(${index})">X</button>
        `;
        fileListContainer.appendChild(item);
    });

    fileCountBadge.innerText = fileQueue.length;

    if (fileQueue.length > 0) {
        stagingArea.classList.remove('hidden'); btnStartTransfer.classList.remove('hidden'); btnSelectFile.innerText = "Daha Fazla Ekle";
    } else {
        stagingArea.classList.add('hidden'); btnSelectFile.innerText = "Dosya Ekle";
    }
}

// ==========================================
// 9. AKTARIM MOTORU
// ==========================================
function startTransfer() {
    if (fileQueue.length === 0 || isTransferring) return;
    isTransferring = true; currentFileIndex = 0;
    
    btnStartTransfer.classList.add('hidden'); btnSelectFile.classList.add('hidden');
    document.querySelectorAll('.btn-remove').forEach(btn => btn.style.display = 'none');
    
    const manifesto = fileQueue.map(file => ({ name: file.name, size: file.size, type: file.type }));
    statusText.innerText = "BeamO Aktarımı Hazırlanıyor...";
    
    dataChannel.send(JSON.stringify({ type: 'manifest', totalFiles: fileQueue.length, files: manifesto }));
}

async function sendNextFile() {
    if (currentFileIndex >= fileQueue.length) {
        statusText.innerText = "Tüm BeamO Aktarımları Tamamlandı! 🚀";
        progressPercentage.innerText = "100%";
        isTransferring = false; fileQueue = []; 
        updateVitrinUI(); btnSelectFile.classList.remove('hidden'); 
        return; 
    }

    const file = fileQueue[currentFileIndex];
    statusText.innerText = `${file.name} gönderiliyor (${currentFileIndex + 1}/${fileQueue.length})`;

    dataChannel.send(JSON.stringify({ type: 'start_file', name: file.name, size: file.size, mimeType: file.type }));

    const chunkSize = 65536; dataChannel.bufferedAmountLowThreshold = 1048576; 
    let offset = 0; let lastProgress = 0;

    while (offset < file.size) {
        if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
            await new Promise(resolve => {
                const listener = () => { dataChannel.removeEventListener('bufferedamountlow', listener); resolve(); };
                dataChannel.addEventListener('bufferedamountlow', listener);
            });
        }

        const slice = file.slice(offset, offset + chunkSize);
        const buffer = await slice.arrayBuffer();

        try { dataChannel.send(buffer); } catch (err) { statusText.innerText = "Hata: Bağlantı koptu."; return; }

        offset += buffer.byteLength;
        const currentProgress = Math.floor((offset / file.size) * 100);
        if (currentProgress > lastProgress) {
            progressFill.style.width = currentProgress + "%"; progressPercentage.innerText = currentProgress + "%";
            lastProgress = currentProgress;
        }
    }
    statusText.innerText = `Alıcının dosyayı işlemesi bekleniyor...`;
}

// ==========================================
// 10. SUPABASE WEBRTC SİNYALLEŞMESİ
// ==========================================
function setupRealtimeListener() {
    if(!currentRoomId) return;

    supabaseClient.channel('signaling_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signaling_messages', filter: `room_id=eq.${currentRoomId}` }, handleIncomingSignal)
        .subscribe();
}

async function handleIncomingSignal(payload) {
    const msg = payload.new;
    if (msg.sender_id === localSenderId) return;

    if (isConnected && msg.message_type === 'join') return; 

    if (msg.message_type === 'join') {
        statusText.innerText = "Alıcı cihaz bulundu, BeamO kuruluyor...";
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await sendSignal('offer', offer);
    }
    else if (msg.message_type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignal('answer', answer);
    } 
    else if (msg.message_type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload));
    } 
    else if (msg.message_type === 'candidate') {
        await peerConnection.addIceCandidate(new RTCIceCandidate(msg.payload));
    }
}

async function sendSignal(type, payloadData) {
    if(!currentRoomId) return;
    await supabaseClient.from('signaling_messages').insert([{ room_id: currentRoomId, sender_id: localSenderId, message_type: type, payload: payloadData }]);
}
