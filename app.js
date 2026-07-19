// ==========================================
// 1. ARAYÜZ (UI) ELEMENTLERİNİ YAKALAMA 
// ==========================================
const btnSend = document.getElementById('btn-send');
const btnReceive = document.getElementById('btn-receive');
const btnBeamoAir = document.getElementById('btn-beamoair'); // YENİ: BeamoAir Butonu

const actionButtons = document.getElementById('action-buttons');
const senderSection = document.getElementById('sender-section');
const receiverSection = document.getElementById('receiver-section');
const beamoAirSection = document.getElementById('beamoair-section'); // YENİ: Radar Bölümü
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
const radarList = document.getElementById('radar-list'); // YENİ: Radar Listesi Container'ı

const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');

// ==========================================
// 2. DURUM (STATE) VE KİMLİK DEĞİŞKENLERİ
// ==========================================
let fileQueue = []; 
let currentFileIndex = 0; 
let isTransferring = false;
let isConnected = false;

// YENİ: Otomatik Cihaz Adı Bulma (İşletim Sistemi / Tarayıcı)
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
// 4. TEMEL BUTON VE RESET OLAYLARI
// ==========================================
btnSend.addEventListener('click', () => {
    activateSenderMode();
    createRoomAndGenerateQR();
});

btnReceive.addEventListener('click', () => {
    activateReceiverMode();
    startQRScanner();
});

btnBeamoAir.addEventListener('click', () => {
    actionButtons.classList.add('hidden');
    beamoAirSection.classList.remove('hidden');
    btnBack.classList.remove('hidden');
    startBeamoAirRadar();
});

btnBack.addEventListener('click', resetApp);

btnSelectFile.addEventListener('click', () => {
    if (dataChannel && dataChannel.readyState === 'open') {
        fileInput.click();
    }
});

btnStartTransfer.addEventListener('click', startTransfer);

function activateSenderMode(hideQR = false) {
    actionButtons.classList.add('hidden');
    beamoAirSection.classList.add('hidden');
    senderSection.classList.remove('hidden');
    btnBack.classList.remove('hidden');
    if(hideQR) qrBox.classList.add('hidden');
    else qrBox.classList.remove('hidden');
}

function activateReceiverMode(hideScanner = false) {
    actionButtons.classList.add('hidden');
    beamoAirSection.classList.add('hidden');
    receiverSection.classList.remove('hidden');
    btnBack.classList.remove('hidden');
    if(hideScanner) scannerContainer.classList.add('hidden');
    else scannerContainer.classList.remove('hidden');
}

function resetApp() {
    if (dataChannel) dataChannel.close();
    if (peerConnection) peerConnection.close();
    isConnected = false;
    
    supabaseClient.removeAllChannels();
    beamoAirChannel = null;
    closeModal();

    if (html5QrCode) {
        html5QrCode.stop().catch(e => console.log("Kamera zaten kapalı."));
    }

    fileQueue = [];
    isTransferring = false;
    fileInput.value = '';
    
    actionButtons.classList.remove('hidden');
    senderSection.classList.add('hidden');
    receiverSection.classList.add('hidden');
    beamoAirSection.classList.add('hidden');
    btnBack.classList.add('hidden');
    progressContainer.classList.add('hidden');
    stagingArea.classList.add('hidden');
    receivedGallery.classList.add('hidden');
    
    qrBox.classList.remove('hidden');
    scannerContainer.classList.remove('hidden');
    receivedList.innerHTML = '';
}

// ==========================================
// 5. YENİ: BEAMOAIR (WIFI RADARI) MOTORU
// ==========================================
async function startBeamoAirRadar() {
    radarList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-lo); font-size: 0.85rem;">IP adresi tespit ediliyor... 🔍</div>';

    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const safeIP = ipData.ip.replace(/\./g, '_'); 
        const radarRoomName = `beamoair_radar_${safeIP}`;

        if (beamoAirChannel) { await supabaseClient.removeChannel(beamoAirChannel); }

        beamoAirChannel = supabaseClient.channel(radarRoomName, {
            config: { presence: { key: localSenderId } }
        });

        beamoAirChannel.on('presence', { event: 'sync' }, () => {
            const state = beamoAirChannel.presenceState();
            updateRadarUI(state);
        });

        // BAĞLANTI İSTEKLERİNİ DİNLEME (El sıkışma)
        beamoAirChannel.on('broadcast', { event: 'connection_request' }, (payload) => {
            const data = payload.payload;
            if (data.targetId === localSenderId) {
                showModal(`
                    <div class="modal-icon-wrapper request">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </div>
                    <h3 style="margin-bottom: 8px;">Bağlantı İsteği</h3>
                    <p style="color: var(--text-lo); font-size: 0.9rem;"><strong>${data.senderName}</strong> cihazı sana bağlanmak istiyor, onaylıyor musun?</p>
                    <div class="modal-actions">
                        <button class="btn btn-danger" onclick="rejectConnection('${data.senderId}')">Vazgeç</button>
                        <button class="btn primary-blue" onclick="acceptConnection('${data.senderId}', '${data.roomId}')">Onayla</button>
                    </div>
                `);
            }
        });

        // ONAY VEYA RED CEVAPLARINI DİNLEME
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
                            <button class="btn primary-blue" onclick="sendConnectionRequest('${data.senderId}', '${data.senderName}')">Tekrar Dene</button>
                            <button class="btn outline-blue" onclick="closeModal()">İptal</button>
                        </div>
                    `);
                } else if (data.action === 'accept') {
                    closeModal();
                    // Gönderici ekranına geç, QR'ı gizle
                    activateSenderMode(true);
                    currentRoomId = data.roomId;
                    statusText.innerText = "BeamO Ağı Kuruluyor...";
                    progressContainer.classList.remove('hidden');
                    
                    setupWebRTC();
                    setupRealtimeListener();
                }
            }
        });

        beamoAirChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await beamoAirChannel.track({
                    device_name: myDeviceName,
                    peer_id: localSenderId,
                    status: 'online'
                });
            }
        });

    } catch (error) {
        console.error("Radar Hatası:", error);
        radarList.innerHTML = '<div style="color: var(--danger); text-align:center; padding: 20px;">Bağlantı hatası. Lütfen internetinizi kontrol edin.</div>';
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
        
        // Cihaz tipine göre icon (Basit kontrol)
        let iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`; // Genel cip icon
        if (userData.device_name.includes('iPhone') || userData.device_name.includes('Android')) {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;
        } else if (userData.device_name.includes('Windows') || userData.device_name.includes('Mac')) {
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
        }

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
        radarList.innerHTML = `
        <div style="text-align:center; padding: 25px; color: var(--text-lo); font-size: 0.85rem;">
            <svg width="40" height="40" style="margin-bottom:10px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><br>
            Ağda başka cihaz bulunamadı. <br>Diğer cihazda BeamoAir'i açın.
        </div>`;
    }
}

// Bağlantı İsteği Atan (Gönderici)
function sendConnectionRequest(targetPeerId, targetName) {
    const tempRoomId = 'air_' + Math.random().toString(36).substr(2, 9);
    
    showModal(`
        <div class="modal-icon-wrapper wait">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </div>
        <h3 style="margin-bottom: 8px;">Bağlanılıyor...</h3>
        <p style="color: var(--text-lo); font-size: 0.9rem;"><strong>${targetName}</strong> cihazına istek gönderildi. Onay bekleniyor.</p>
        <div class="modal-actions">
            <button class="btn outline-blue" onclick="closeModal()">İptal Et</button>
        </div>
    `);

    beamoAirChannel.send({
        type: 'broadcast',
        event: 'connection_request',
        payload: {
            senderId: localSenderId,
            senderName: myDeviceName,
            targetId: targetPeerId,
            roomId: tempRoomId
        }
    });
}

// İsteği Kabul Eden (Alıcı)
function acceptConnection(senderId, roomId) {
    beamoAirChannel.send({
        type: 'broadcast',
        event: 'connection_response',
        payload: { targetId: senderId, senderName: myDeviceName, action: 'accept', roomId: roomId }
    });

    closeModal();
    // Alıcı ekranına geç, kamerayı gizle
    activateReceiverMode(true);
    joinRoom(roomId); 
}

// İsteği Reddeden
function rejectConnection(senderId) {
    beamoAirChannel.send({
        type: 'broadcast',
        event: 'connection_response',
        payload: { targetId: senderId, senderName: myDeviceName, action: 'reject' }
    });
    closeModal();
}

// Modal Kontrolleri
function showModal(htmlContent) {
    modalContent.innerHTML = htmlContent;
    modalOverlay.classList.remove('hidden');
}
function closeModal() {
    modalOverlay.classList.add('hidden');
    modalContent.innerHTML = '';
}

// ==========================================
// 6. SİNYALLEŞME & KAMERA (QR - Eski BeamoDrop)
// ==========================================
async function createRoomAndGenerateQR() {
    statusText.innerText = "BeamO Ağı Kuruluyor...";
    progressContainer.classList.remove('hidden');

    const { data, error } = await supabaseClient.from('rooms').insert([{}]).select().single();
    if (error) return;
    
    currentRoomId = data.id;
    const joinLink = `${window.location.origin}/?room=${currentRoomId}`;
    
    QRCode.toCanvas(qrCanvas, joinLink, { 
        width: 220, margin: 1, color: { dark: '#04060c', light: '#ffffff' } 
    }, function (error) {
        statusText.innerText = "Alıcı cihazı bekliyor...";
    });

    setupWebRTC();
    setupRealtimeListener();
}

function startQRScanner() {
    statusText.innerText = "Kamera başlatılıyor...";
    progressContainer.classList.remove('hidden');

    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 15, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            html5QrCode.stop();
            scannerContainer.classList.add('hidden'); 
            const urlParams = new URLSearchParams(decodedText.split('?')[1]);
            const roomId = urlParams.get('room');
            if(roomId) joinRoom(roomId);
        },
        (errorMessage) => { }
    );
}

async function joinRoom(roomId) {
    currentRoomId = roomId;
    statusText.innerText = "BeamO Ağına Bağlanılıyor...";
    progressContainer.classList.remove('hidden');
    
    setupWebRTC();
    setupRealtimeListener();

    setTimeout(async () => {
        await sendSignal('join', { message: 'Alıcı katıldı' });
    }, 1000);
}

// ==========================================
// 7. WEBRTC ALICI/GÖNDERİCİ MOTORU
// ==========================================
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

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
            if (data.type === 'file_received_ack') {
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
                
                if (data.type === 'manifest') {
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
                
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = fileName;
                downloadLink.click();
                
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
        mediaHTML = `<img src="${url}" class="received-media" alt="${name}">`;
    } else if (type.startsWith('video/')) {
        mediaHTML = `<video src="${url}" controls class="received-media"></video>`;
    } else if (type.startsWith('audio/')) {
        mediaHTML = `<audio src="${url}" controls class="received-audio"></audio>`;
    }

    item.innerHTML = `
        ${mediaHTML}
        <span style="font-size: 0.8rem; word-break: break-all;">${name}</span>
    `;
    receivedList.appendChild(item);
}

// ==========================================
// 8. YENİ DOSYA SEÇİMİ VE GÖNDERİCİ ÖNİZLEMESİ
// ==========================================
fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;

    fileQueue = [...fileQueue, ...newFiles];
    updateVitrinUI();
    fileInput.value = ''; 
});

window.removeFileFromQueue = function(index) {
    fileQueue.splice(index, 1);
    updateVitrinUI();
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
            previewHTML = `<img src="${tempUrl}" class="media-preview">`;
        } else if (file.type.startsWith('video/')) {
            previewHTML = `<div class="media-preview" style="background:#111; display:flex; align-items:center; justify-content:center; color:#5eead4; font-size:0.6rem;">VIDEO</div>`;
        } else {
            const ext = file.name.split('.').pop().toUpperCase().substring(0, 4);
            previewHTML = `<span class="file-ext" style="margin: 15px 0;">${ext}</span>`;
        }
        
        item.innerHTML = `
            ${previewHTML}
            <span class="file-size">${(file.size / (1024*1024)).toFixed(1)}MB</span>
            <button class="btn-remove" onclick="removeFileFromQueue(${index})">X</button>
        `;
        fileListContainer.appendChild(item);
    });

    fileCountBadge.innerText = fileQueue.length;

    if (fileQueue.length > 0) {
        stagingArea.classList.remove('hidden');
        btnStartTransfer.classList.remove('hidden'); 
        btnSelectFile.innerText = "Daha Fazla Dosya Ekle";
    } else {
        stagingArea.classList.add('hidden');
        btnSelectFile.innerText = "Dosya Seç";
    }
}

// ==========================================
// 9. AKTARIM MOTORU
// ==========================================
function startTransfer() {
    if (fileQueue.length === 0 || isTransferring) return;
    isTransferring = true;
    currentFileIndex = 0;
    
    btnStartTransfer.classList.add('hidden');
    btnSelectFile.classList.add('hidden');
    document.querySelectorAll('.btn-remove').forEach(btn => btn.style.display = 'none');
    
    const manifesto = fileQueue.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type
    }));

    statusText.innerText = "BeamO Aktarımı Hazırlanıyor...";
    
    dataChannel.send(JSON.stringify({ 
        type: 'manifest', 
        totalFiles: fileQueue.length, 
        files: manifesto 
    }));
}

function sendNextFile() {
    if (currentFileIndex >= fileQueue.length) {
        statusText.innerText = "Tüm BeamO Aktarımları Tamamlandı! 🚀";
        progressPercentage.innerText = "100%";
        isTransferring = false;
        fileQueue = []; 
        updateVitrinUI();
        btnSelectFile.classList.remove('hidden'); 
        return; 
    }

    const file = fileQueue[currentFileIndex];
    statusText.innerText = `${file.name} gönderiliyor (${currentFileIndex + 1}/${fileQueue.length})`;

    dataChannel.send(JSON.stringify({
        type: 'start_file',
        name: file.name,
        size: file.size,
        mimeType: file.type
    }));

    const chunkSize = 16384; 
    let offset = 0;
    let lastProgress = 0; 
    dataChannel.bufferedAmountLowThreshold = 262144; 

    const fileReader = new FileReader();
    fileReader.onerror = error => console.error('Dosya okuma hatası:', error);
    
    const readSlice = o => {
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };

    fileReader.onload = e => {
        if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
            dataChannel.addEventListener('bufferedamountlow', function listener() {
                dataChannel.removeEventListener('bufferedamountlow', listener);
                sendAndContinue(e.target.result, file.size);
            });
        } else {
            sendAndContinue(e.target.result, file.size);
        }
    };

    const sendAndContinue = (data, totalSize) => {
        try {
            dataChannel.send(data);
            offset += data.byteLength;

            const currentProgress = Math.floor((offset / totalSize) * 100);
            if (currentProgress > lastProgress) {
                progressFill.style.width = currentProgress + "%";
                progressPercentage.innerText = currentProgress + "%";
                lastProgress = currentProgress;
            }

            if (offset < totalSize) {
                readSlice(offset);
            } else {
                statusText.innerText = `Alıcının dosyayı kaydetmesi bekleniyor...`;
            }
        } catch (err) {
            console.error("Gönderim motoru hata verdi:", err);
            statusText.innerText = "Hata: Bağlantı koptu.";
        }
    };

    readSlice(0);
}

// ==========================================
// 10. SUPABASE WEBRTC SİNYALLEŞMESİ
// ==========================================
function setupRealtimeListener() {
    supabaseClient.channel('signaling_channel')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'signaling_messages', 
            filter: `room_id=eq.${currentRoomId}` 
        }, handleIncomingSignal)
        .subscribe();
}

async function handleIncomingSignal(payload) {
    const msg = payload.new;
    if (msg.sender_id === localSenderId) return;

    if (isConnected && msg.message_type === 'join') {
        console.warn("Bağlantı dolu, 3. kişi reddedildi.");
        return; 
    }

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
    await supabaseClient.from('signaling_messages').insert([{
        room_id: currentRoomId,
        sender_id: localSenderId,
        message_type: type,
        payload: payloadData
    }]);
}
