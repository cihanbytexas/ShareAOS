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
// 4. TEMEL BUTON OLAYLARI VE RESET LOGIC
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
            <h3 style="margin-bottom: 8px;">Gönderici Ayrıldı</h3>
            <p style="color: var(--text-lo); font-size: 0.9rem;">Karşı cihaz bağlantıyı kesti. Ancak aktarılan dosyalar belleğe alındı.</p>
            <div style="display: flex; gap: 10px; margin-top: 15px; justify-content: center;">
                <button class="btn primary-blue" onclick="closeModal()">Devam Et</button>
                <button class="btn outline-blue" onclick="resetApp(); closeModal();">Ana Menü</button>
            </div>
        `);
    } else {
        resetApp();
        showModal(`
            <h3 style="margin-bottom: 8px;">Bağlantı Koptu</h3>
            <p style="color: var(--text-lo); font-size: 0.9rem;">Karşı cihaz bağlantıyı sonlandırdı.</p>
            <div style="margin-top: 15px;">
                <button class="btn primary-blue" onclick="closeModal()">Tamam</button>
            </div>
        `);
    }
}

// ==========================================
// 5. BEAMOAIR (RADAR) MOTORU
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
            updateRadarUI(beamoAirChannel.presenceState());
        });

        beamoAirChannel.on('broadcast', { event: 'connection_request' }, (payload) => {
            const data = payload.payload;
            if (data.targetId === localSenderId) {
                showModal(`
                    <h3 style="margin-bottom: 8px;">Bağlantı İsteği</h3>
                    <p style="color: var(--text-lo); font-size: 0.9rem;"><strong>${data.senderName}</strong> bağlanmak istiyor.</p>
                    <div style="display: flex; gap: 10px; margin-top: 15px; justify-content: center;">
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
                    showModal(`<h3>Reddedildi</h3><p style="margin-top:8px;">Bağlantı isteği kabul edilmedi.</p><button class="btn outline-blue mt-2" onclick="closeModal()">Kapat</button>`);
                }
            }
        });

        beamoAirChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') { 
                await beamoAirChannel.track({ device_name: myDeviceName, peer_id: localSenderId, status: 'online' }); 
            }
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
        item.innerHTML = `
            <div class="radar-info">
                <div class="radar-name">${userData.device_name}</div>
            </div>
            <button onclick="sendConnectionRequest('${userData.peer_id}', '${userData.device_name}')">Bağlan</button>
        `;
        radarList.appendChild(item);
    }
    if (!found) radarList.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-lo); font-size: 0.85rem;">Ağda başka cihaz bulunamadı.</div>`;
}

async function sendConnectionRequest(targetPeerId, targetName) {
    const roomId = 'room_' + Math.random().toString(36).substring(2, 12);
    showModal(`<h3>İstek Gönderildi</h3><p style="margin-top:8px; color:var(--text-lo);">${targetName} cihazının onayı bekleniyor...</p>`);
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
// 6. SİNYALLEŞME & KOD / QR
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
// 7. WEBRTC & SOHBET MOTORU
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
                renderReceivedMedia(fileName, blobUrl);
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

function renderReceivedMedia(name, url) {
    receivedGallery.classList.remove('hidden');
    const item = document.createElement('div');
    item.style.margin = "8px 0";
    item.innerHTML = `<a href="${url}" download="${name}" class="btn primary-blue">⬇️ İndir: ${name}</a>`;
    receivedList.appendChild(item);
}

// ==========================================
// 8. DOSYA SEÇİMİ VE TRANSFER
// ==========================================
fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;
    fileQueue = [...fileQueue, ...newFiles];
    stagingArea.classList.remove('hidden');
    btnStartTransfer.classList.remove('hidden');
    fileCountBadge.innerText = fileQueue.length;
    fileInput.value = ''; 
});

function startTransfer() {
    if (fileQueue.length === 0 || isTransferring) return;
    isTransferring = true; currentFileIndex = 0;
    btnStartTransfer.classList.add('hidden');
    const manifesto = fileQueue.map(f => ({ name: f.name, size: f.size, type: f.type }));
    dataChannel.send(JSON.stringify({ type: 'manifest', totalFiles: fileQueue.length, files: manifesto }));
}

async function sendNextFile() {
    if (currentFileIndex >= fileQueue.length) {
        statusText.innerText = "Aktarım Tamamlandı! 🚀";
        progressPercentage.innerText = "100%";
        isTransferring = false; fileQueue = []; 
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
// 9. SUPABASE REALTIME SİNYALLEŞME
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
