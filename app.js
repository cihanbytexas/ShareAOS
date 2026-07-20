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

const displayRoomCode = document.getElementById('display-room-code');
const shareLinkInput = document.getElementById('share-link-input');
const manualCodeInput = document.getElementById('manual-code-input');
const linkShareBox = document.getElementById('link-share-box');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

// ==========================================
// 2. DURUM (STATE) VE KİMLİK DEĞİŞKENLERİ
// ==========================================
let fileQueue = []; 
let currentFileIndex = 0; 
let isTransferring = false;
let isConnected = false;
let activeObjectUrls = []; 
let iceCandidateQueue = []; 
let filePreviewCache = new Map(); // File -> object URL (gönderilecek dosya önizlemeleri)

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
let signalingChannel = null;

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
    ],
    iceCandidatePoolSize: 10 
};

let peerConnection;
let dataChannel;
let currentRoomId = null;
let html5QrCode = null;

// ==========================================
// 4. UI YARDIMCILARI (İKONLAR / BOYUT FORMATLAMA)
// ==========================================
const ICON_FILE_GENERIC = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
const ICON_DOWNLOAD = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
const ICON_CLOSE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_RADAR_DEVICE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;
const ICON_SEARCH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const ICON_WARN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
const ICON_CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6 9 17l-5-5"></path></svg>`;
const ICON_LINK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Gönderilecek dosya için önbelleğe alınmış önizleme URL'si döndürür (resim/video ise)
function getFilePreviewUrl(file) {
    if (filePreviewCache.has(file)) return filePreviewCache.get(file);
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        filePreviewCache.set(file, url);
        activeObjectUrls.push(url);
        return url;
    }
    return null;
}

function revokeFilePreview(file) {
    if (filePreviewCache.has(file)) {
        const url = filePreviewCache.get(file);
        URL.revokeObjectURL(url);
        activeObjectUrls = activeObjectUrls.filter(u => u !== url);
        filePreviewCache.delete(file);
    }
}

function clearAllFilePreviews() {
    filePreviewCache.forEach((url) => URL.revokeObjectURL(url));
    filePreviewCache.clear();
}

function buildThumbHTML(url, type, sizePx) {
    if (url && type.startsWith('image/')) return `<img src="${url}" alt="" width="${sizePx}" height="${sizePx}">`;
    if (url && type.startsWith('video/')) return `<video src="${url}" muted></video>`;
    return ICON_FILE_GENERIC;
}

// ==========================================
// 5. TEMEL BUTON OLAYLARI VE RESET LOGIC
// ==========================================
btnSend.addEventListener('click', () => { activateSenderMode(); createRoomAndGenerateQR(); });
btnReceive.addEventListener('click', () => { activateReceiverMode(); startQRScanner(); });
btnBeamoAir.addEventListener('click', () => { 
    actionButtons.classList.add('hidden'); 
    beamoAirSection.classList.remove('hidden'); 
    btnBack.classList.remove('hidden'); 
    startBeamoAirRadar(); 
});

btnSelectFile.addEventListener('click', () => { 
    if (dataChannel && dataChannel.readyState === 'open') { 
        fileInput.click(); 
    }
});

btnStartTransfer.addEventListener('click', startTransfer);

btnBack.addEventListener('click', () => {
    if (dataChannel && dataChannel.readyState === 'open') {
        try { dataChannel.send(JSON.stringify({ type: 'disconnect' })); } catch(e) {}
    }
    resetApp();
});

function activateSenderMode(hideQR = false) {
    actionButtons.classList.add('hidden'); 
    beamoAirSection.classList.add('hidden');
    senderSection.classList.remove('hidden'); 
    btnBack.classList.remove('hidden');
    if(hideQR) { 
        qrBox.classList.add('hidden'); 
        linkShareBox.classList.add('hidden'); 
    } else { 
        qrBox.classList.remove('hidden'); 
        linkShareBox.classList.remove('hidden'); 
    }
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
    activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
    activeObjectUrls = [];
    iceCandidateQueue = [];
    filePreviewCache.clear();

    try { if (dataChannel) { dataChannel.close(); dataChannel = null; } } catch(e) {}
    try { if (peerConnection) { peerConnection.close(); peerConnection = null; } } catch(e) {}
    
    isConnected = false;
    currentRoomId = null;

    try {
        if (signalingChannel) { supabaseClient.removeChannel(signalingChannel); signalingChannel = null; }
        if (beamoAirChannel) { supabaseClient.removeChannel(beamoAirChannel); beamoAirChannel = null; }
    } catch(e) {}
    
    closeModal();

    if (html5QrCode) {
        try { html5QrCode.stop().then(() => { html5QrCode = null; }).catch(e => { html5QrCode = null; }); } 
        catch(e) { html5QrCode = null; }
    }

    fileQueue = [];
    isTransferring = false;
    fileInput.value = '';
    chatMessages.innerHTML = ''; 
    chatPanel.classList.add('hidden');
    
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
    btnSelectFile.classList.add('hidden');
    
    qrBox.classList.remove('hidden');
    linkShareBox.classList.remove('hidden');
    scannerContainer.classList.remove('hidden');
    manualCodeInput.value = '';
    
    receivedGallery.classList.add('hidden');
    receivedList.innerHTML = '';
}

function handleRemoteDisconnect() {
    if (!isConnected) return;
    isConnected = false;

    const hasReceivedFiles = receivedList && receivedList.children.length > 0;

    try { if (dataChannel) { dataChannel.close(); dataChannel = null; } } catch(e) {}
    try { if (peerConnection) { peerConnection.close(); peerConnection = null; } } catch(e) {}

    if (hasReceivedFiles) {
        statusText.innerText = "Gönderici ayrıldı. Dosyalarınızı indirebilirsiniz.";
        showModal(`
            <div class="modal-icon">${ICON_CHECK}</div>
            <h3 class="modal-title">Gönderici Ayrıldı</h3>
            <p class="modal-text">Karşı cihaz bağlantıyı kesti. Aktarılan dosyalar bu ekranda kalmaya devam ediyor.</p>
            <div class="modal-actions">
                <button class="btn primary-blue" onclick="closeModal()">Devam Et</button>
                <button class="btn outline-blue" onclick="resetApp(); closeModal();">Ana Menü</button>
            </div>
        `);
    } else {
        resetApp();
        showModal(`
            <div class="modal-icon warn">${ICON_WARN}</div>
            <h3 class="modal-title">Bağlantı Koptu</h3>
            <p class="modal-text">Karşı cihaz bağlantıyı sonlandırdı.</p>
            <div class="modal-actions">
                <button class="btn primary-blue" onclick="closeModal()">Tamam</button>
            </div>
        `);
    }
}

// ==========================================
// 6. BEAMOAIR (RADAR) MOTORU
// ==========================================
async function startBeamoAirRadar() {
    radarList.innerHTML = `<div class="radar-loading">${ICON_SEARCH}IP adresi tespit ediliyor...</div>`;
    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const safeIP = ipData.ip.replace(/\./g, '_'); 
        const radarRoomName = `beamoair_radar_${safeIP}`;

        if (beamoAirChannel) { await supabaseClient.removeChannel(beamoAirChannel); }
        beamoAirChannel = supabaseClient.channel(radarRoomName, { config: { presence: { key: localSenderId } } });

        beamoAirChannel.on('presence', { event: 'sync' }, () => {
            updateRadarUI(beamoAirChannel.presenceState());
        });

        beamoAirChannel.on('broadcast', { event: 'connection_request' }, (payload) => {
            const data = payload.payload;
            if (data.targetId === localSenderId) {
                showModal(`
                    <div class="modal-icon">${ICON_LINK}</div>
                    <h3 class="modal-title">Bağlantı İsteği</h3>
                    <p class="modal-text"><strong>${data.senderName}</strong> bağlanmak istiyor.</p>
                    <div class="modal-actions">
                        <button class="btn btn-danger" onclick="rejectConnection('${data.senderId}')">Reddet</button>
                        <button class="btn primary-blue" onclick="acceptConnection('${data.senderId}', '${data.roomId}')">Onayla</button>
                    </div>
                `);
            }
        });

        beamoAirChannel.on('broadcast', { event: 'connection_response' }, (payload) => {
            const data = payload.payload;
            if (data.targetId === localSenderId) {
                if (data.action === 'accept') {
                    closeModal(); activateSenderMode(true);
                    currentRoomId = data.roomId;
                    statusText.innerText = "BeamO Ağı Kuruluyor...";
                    progressContainer.classList.remove('hidden');
                    setupWebRTC(); setupRealtimeListener();
                } else {
                    showModal(`
                        <div class="modal-icon warn">${ICON_WARN}</div>
                        <h3 class="modal-title">Reddedildi</h3>
                        <p class="modal-text">Bağlantı isteği kabul edilmedi.</p>
                        <div class="modal-actions"><button class="btn outline-blue" onclick="closeModal()">Kapat</button></div>
                    `);
                }
            }
        });

        beamoAirChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') { 
                await beamoAirChannel.track({ device_name: myDeviceName, peer_id: localSenderId, status: 'online' }); 
            }
        });

    } catch (error) { 
        radarList.innerHTML = `<div class="radar-error">${ICON_WARN}Bağlantı hatası.</div>`; 
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
        item.innerHTML = `
            <div class="radar-info">
                <span class="radar-icon">${ICON_RADAR_DEVICE}</span>
                <div>
                    <div class="radar-name">${userData.device_name}</div>
                    <div class="radar-status">Bağlanmaya hazır</div>
                </div>
            </div>
            <button onclick="sendConnectionRequest('${userData.peer_id}', '${userData.device_name}')">Bağlan</button>
        `;
        radarList.appendChild(item);
    }
    if (!found) radarList.innerHTML = `<div class="radar-empty">${ICON_SEARCH}Ağda başka cihaz bulunamadı.</div>`;
}

async function sendConnectionRequest(targetPeerId, targetName) {
    const roomId = 'room_' + Math.random().toString(36).substring(2, 12);
    showModal(`
        <div class="modal-icon">${ICON_LINK}</div>
        <h3 class="modal-title">İstek Gönderildi</h3>
        <p class="modal-text"><strong>${targetName}</strong> cihazının onayı bekleniyor...</p>
    `);
    beamoAirChannel.send({ type: 'broadcast', event: 'connection_request', payload: { senderId: localSenderId, senderName: myDeviceName, targetId: targetPeerId, roomId: roomId }});
}

function acceptConnection(senderId, roomId) {
    beamoAirChannel.send({ type: 'broadcast', event: 'connection_response', payload: { targetId: senderId, senderName: myDeviceName, action: 'accept', roomId: roomId }});
    closeModal(); activateReceiverMode(true);
    currentRoomId = roomId;
    statusText.innerText = "BeamO Ağı Kuruluyor...";
    progressContainer.classList.remove('hidden');
    setupWebRTC(); setupRealtimeListener();
    setTimeout(async () => { await sendSignal('join', { message: 'Alıcı katıldı' }); }, 500);
}

function rejectConnection(senderId) {
    beamoAirChannel.send({ type: 'broadcast', event: 'connection_response', payload: { targetId: senderId, senderName: myDeviceName, action: 'reject' } });
    closeModal();
}

function showModal(htmlContent) { modalContent.innerHTML = htmlContent; modalOverlay.classList.remove('hidden'); }
function closeModal() { modalOverlay.classList.add('hidden'); modalContent.innerHTML = ''; }

// ==========================================
// 7. SİNYALLEŞME & KOD / QR
// ==========================================
function createRoomAndGenerateQR() {
    statusText.innerText = "BeamO Ağı Kuruluyor...";
    progressContainer.classList.remove('hidden');

    currentRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    displayRoomCode.innerText = currentRoomId;
    const joinLink = `${window.location.origin}/?room=${currentRoomId}`;
    shareLinkInput.value = joinLink;
    
    QRCode.toCanvas(qrCanvas, joinLink, { width: 180, margin: 1, color: { dark: '#04060c', light: '#ffffff' } }, function () {
        statusText.innerText = "Alıcı bekleniyor...";
    });

    setupWebRTC(); 
    setupRealtimeListener();
}

function copyShareLink() {
    shareLinkInput.select();
    navigator.clipboard.writeText(shareLinkInput.value);
    alert('Bağlantı kopyalandı!');
}

function joinWithManualCode() {
    const code = manualCodeInput.value.trim().toUpperCase();
    if (!code) return;
    
    if (html5QrCode) {
        html5QrCode.stop().then(() => { html5QrCode = null; }).catch(e => { html5QrCode = null; });
    }
    scannerContainer.classList.add('hidden');

    currentRoomId = code;
    statusText.innerText = "Koda Bağlanılıyor...";
    progressContainer.classList.remove('hidden');
    setupWebRTC(); 
    setupRealtimeListener();
    setTimeout(async () => { await sendSignal('join', { message: 'Alıcı katıldı' }); }, 300);
}

function startQRScanner() {
    statusText.innerText = "Kamera açılıyor...";
    progressContainer.classList.remove('hidden');

    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" }, { fps: 20, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
            html5QrCode.stop().then(() => { html5QrCode = null; }).catch(err => { html5QrCode = null; });
            scannerContainer.classList.add('hidden'); 
            const urlParams = new URLSearchParams(decodedText.split('?')[1] || decodedText);
            const roomId = urlParams.get('room') || decodedText;
            if(roomId) {
                currentRoomId = roomId;
                statusText.innerText = "Ağa Bağlanılıyor...";
                setupWebRTC(); 
                setupRealtimeListener();
                setTimeout(async () => { await sendSignal('join', { message: 'Alıcı katıldı' }); }, 300);
            }
        },
        () => {}
    );
}

window.addEventListener('load', () => {
    resetApp(); // Sayfa yüklendiğinde tüm ekranları sıfırla ve gizle
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
        activateReceiverMode();
        manualCodeInput.value = room;
        joinWithManualCode();
    }
});

// ==========================================
// 8. WEBRTC & SOHBET MOTORU
// ==========================================
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.oniceconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
            handleRemoteDisconnect();
        }
    };

    dataChannel = peerConnection.createDataChannel("fileTransferChannel");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => {
        isConnected = true;
        qrBox.classList.add('hidden'); 
        linkShareBox.classList.add('hidden'); 
        chatPanel.classList.remove('hidden'); 
        
        statusText.innerText = "Bağlantı Başarılı! Dosya Gönderebilirsiniz.";
        btnSelectFile.classList.remove('hidden'); 
        progressPercentage.innerText = "";
    };

    dataChannel.onclose = () => handleRemoteDisconnect();

    dataChannel.onmessage = (e) => {
        if (typeof e.data === 'string') {
            const data = JSON.parse(e.data);
            if (data.type === 'disconnect') handleRemoteDisconnect();
            else if (data.type === 'file_received_ack') { currentFileIndex++; sendNextFile(); }
            else if (data.type === 'ready_for_next') { sendNextFile(); }
            else if (data.type === 'chat') { appendChatMessage(data.text, 'incoming'); }
        }
    };

    let receivedBuffers = []; let expectedFileSize = 0; let receivedSize = 0; let fileName = "dosya"; let fileType = "";

    peerConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.binaryType = "arraybuffer";
        
        receiveChannel.onmessage = (e) => {
            if (typeof e.data === 'string') {
                const data = JSON.parse(e.data);
                if (data.type === 'disconnect') handleRemoteDisconnect();
                else if (data.type === 'manifest') { statusText.innerText = `Gelen: ${data.totalFiles} Dosya`; receiveChannel.send(JSON.stringify({ type: 'ready_for_next' })); }
                else if (data.type === 'start_file') {
                    expectedFileSize = data.size; fileName = data.name; fileType = data.mimeType || ""; 
                    receivedSize = 0; receivedBuffers = [];
                    statusText.innerText = `İndiriliyor: ${fileName}`;
                }
                else if (data.type === 'chat') { appendChatMessage(data.text, 'incoming'); }
                return;
            }

            receivedBuffers.push(e.data);
            receivedSize += e.data.byteLength;
            const percentage = Math.floor((receivedSize / expectedFileSize) * 100);
            progressFill.style.width = percentage + "%"; progressPercentage.innerText = percentage + "%";

            if (receivedSize === expectedFileSize) {
                statusText.innerText = `${fileName} alındı.`;
                const blob = new Blob(receivedBuffers, { type: fileType });
                const blobUrl = URL.createObjectURL(blob);
                activeObjectUrls.push(blobUrl); 
                renderReceivedMedia(fileName, blobUrl, fileType); // MIME Tipi eklendi
                receiveChannel.send(JSON.stringify({ type: 'file_received_ack' }));
            }
        };
    };

    peerConnection.onicecandidate = (event) => { if (event.candidate) sendSignal('candidate', event.candidate); };
}

function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text || !isConnected || !dataChannel) return;
    
    dataChannel.send(JSON.stringify({ type: 'chat', text: text }));
    appendChatMessage(text, 'outgoing');
    chatInput.value = '';
}

function appendChatMessage(text, type) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;
    bubble.innerText = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Alınan dosyaları thumbnail + indirme butonuyla render eden fonksiyon
function renderReceivedMedia(name, url, type) {
    receivedGallery.classList.remove('hidden');
    
    const item = document.createElement('div');
    item.className = 'received-item';

    const thumbHTML = buildThumbHTML(url, type || "", 52);

    item.innerHTML = `
        <div class="file-thumb">${thumbHTML}</div>
        <div class="received-info">
            <span class="file-name">${name}</span>
        </div>
        <a href="${url}" download="${name}" class="btn-download" title="İndir">${ICON_DOWNLOAD}</a>
    `;
    receivedList.appendChild(item);
}

// ==========================================
// 9. DOSYA SEÇİMİ VE TRANSFER
// ==========================================
fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;
    fileQueue = [...fileQueue, ...newFiles];
    stagingArea.classList.remove('hidden');
    btnStartTransfer.classList.remove('hidden');
    renderFileList(); // Seçilenleri ekrana bas (thumbnail önizlemeli)
    fileInput.value = ''; 
});

// Seçilen dosyaları thumbnail önizlemesiyle listeleyen fonksiyon
function renderFileList() {
    fileListContainer.innerHTML = '';
    fileQueue.forEach((file, index) => {
        const previewUrl = getFilePreviewUrl(file);
        const thumbHTML = buildThumbHTML(previewUrl, file.type || "", 46);

        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-thumb">${thumbHTML}</div>
            <div class="file-info">
                <span class="file-name" title="${file.name}">${file.name}</span>
                <span class="file-size">${formatBytes(file.size)}</span>
            </div>
            <button class="btn-remove" onclick="removeFile(${index})" title="Kaldır">${ICON_CLOSE}</button>
        `;
        fileListContainer.appendChild(item);
    });
    fileCountBadge.innerText = fileQueue.length;
    
    if (fileQueue.length === 0) {
        stagingArea.classList.add('hidden');
        btnStartTransfer.classList.add('hidden');
    }
}

// Seçili dosyayı kuyruktan çıkarma fonksiyonu
function removeFile(index) {
    if (isTransferring) return; // Aktarım sırasındaysa silmeyi engelle
    const [removed] = fileQueue.splice(index, 1);
    if (removed) revokeFilePreview(removed);
    renderFileList();
}

function startTransfer() {
    if (fileQueue.length === 0 || isTransferring) return;
    isTransferring = true; currentFileIndex = 0;
    btnStartTransfer.classList.add('hidden');
    
    // Aktarım başladığında silme butonlarını gizleyelim (güvenlik için)
    document.querySelectorAll('.btn-remove').forEach(btn => btn.style.display = 'none');

    const manifesto = fileQueue.map(f => ({ name: f.name, size: f.size, type: f.type }));
    dataChannel.send(JSON.stringify({ type: 'manifest', totalFiles: fileQueue.length, files: manifesto }));
}

async function sendNextFile() {
    if (currentFileIndex >= fileQueue.length) {
        statusText.innerText = "Aktarım Tamamlandı";
        progressPercentage.innerText = "100%";
        isTransferring = false; 
        clearAllFilePreviews();
        fileQueue = []; 
        stagingArea.classList.add('hidden');
        return; 
    }

    const file = fileQueue[currentFileIndex];
    statusText.innerText = `Gönderiliyor: ${file.name}`;
    dataChannel.send(JSON.stringify({ type: 'start_file', name: file.name, size: file.size, mimeType: file.type }));

    const chunkSize = 262144; 
    dataChannel.bufferedAmountLowThreshold = 8388608; 
    let offset = 0;

    while (offset < file.size) {
        if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
            await new Promise(resolve => {
                const listener = () => { dataChannel.removeEventListener('bufferedamountlow', listener); resolve(); };
                dataChannel.addEventListener('bufferedamountlow', listener);
            });
        }

        const slice = file.slice(offset, offset + chunkSize);
        const buffer = await slice.arrayBuffer();

        try { dataChannel.send(buffer); } catch (err) { handleRemoteDisconnect(); return; }

        offset += buffer.byteLength;
        const currentProgress = Math.floor((offset / file.size) * 100);
        progressFill.style.width = currentProgress + "%"; 
        progressPercentage.innerText = currentProgress + "%";
    }
}

// ==========================================
// 10. SUPABASE REALTIME SİNYALLEŞME
// ==========================================
function setupRealtimeListener() {
    if (!currentRoomId) return;

    if (signalingChannel) supabaseClient.removeChannel(signalingChannel);
    signalingChannel = supabaseClient.channel(`signaling_${currentRoomId}`);

    signalingChannel.on('broadcast', { event: 'signal' }, (payload) => { handleIncomingSignal(payload.payload); });
    signalingChannel.subscribe();
}

async function handleIncomingSignal(msg) {
    if (!msg || msg.sender_id === localSenderId) return;

    if (msg.message_type === 'join') {
        statusText.innerText = "Alıcı bağlandı, ağ kuruluyor...";
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await sendSignal('offer', offer);
    }
    else if (msg.message_type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload));
        while (iceCandidateQueue.length > 0) { const cand = iceCandidateQueue.shift(); await peerConnection.addIceCandidate(cand); }
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignal('answer', answer);
    } 
    else if (msg.message_type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload));
        while (iceCandidateQueue.length > 0) { const cand = iceCandidateQueue.shift(); await peerConnection.addIceCandidate(cand); }
    } 
    else if (msg.message_type === 'candidate') {
        const candidate = new RTCIceCandidate(msg.payload);
        if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) await peerConnection.addIceCandidate(candidate);
        else iceCandidateQueue.push(candidate);
    }
}

async function sendSignal(type, payloadData) {
    if (!currentRoomId || !signalingChannel) return;
    await signalingChannel.send({ type: 'broadcast', event: 'signal', payload: { sender_id: localSenderId, message_type: type, payload: payloadData } });
}
