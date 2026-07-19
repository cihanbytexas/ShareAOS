// ==========================================
// 1. ARAYÜZ (UI) ELEMENTLERİNİ YAKALAMA 
// ==========================================
const btnSend = document.getElementById('btn-send');
const btnReceive = document.getElementById('btn-receive');
const actionButtons = document.getElementById('action-buttons');
const senderSection = document.getElementById('sender-section');
const receiverSection = document.getElementById('receiver-section');
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

// ==========================================
// 2. DURUM (STATE) VE KUYRUK DEĞİŞKENLERİ
// ==========================================
let fileQueue = []; 
let currentFileIndex = 0; 
let isTransferring = false;
let isConnected = false;

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
const localSenderId = Math.random().toString(36).substring(2, 15);

// ==========================================
// 4. TEMEL BUTON VE RESET OLAYLARI
// ==========================================
btnSend.addEventListener('click', () => {
    actionButtons.classList.add('hidden');
    senderSection.classList.remove('hidden');
    btnBack.classList.remove('hidden');
    createRoomAndGenerateQR();
});

btnReceive.addEventListener('click', () => {
    actionButtons.classList.add('hidden');
    receiverSection.classList.remove('hidden');
    btnBack.classList.remove('hidden');
    startQRScanner();
});

btnBack.addEventListener('click', resetApp);

btnSelectFile.addEventListener('click', () => {
    if (dataChannel && dataChannel.readyState === 'open') {
        fileInput.click();
    }
});

btnStartTransfer.addEventListener('click', startTransfer);

function resetApp() {
    // 1. WebRTC'yi kapat
    if (dataChannel) dataChannel.close();
    if (peerConnection) peerConnection.close();
    isConnected = false;
    
    // 2. Supabase dinlemeyi kes
    supabaseClient.removeAllChannels();

    // 3. Kamerayı kapat
    if (html5QrCode) {
        html5QrCode.stop().catch(e => console.log("Kamera zaten kapalı."));
    }

    // 4. Değişkenleri ve Arayüzü Sıfırla
    fileQueue = [];
    isTransferring = false;
    fileInput.value = '';
    
    actionButtons.classList.remove('hidden');
    senderSection.classList.add('hidden');
    receiverSection.classList.add('hidden');
    btnBack.classList.add('hidden');
    progressContainer.classList.add('hidden');
    stagingArea.classList.add('hidden');
    receivedGallery.classList.add('hidden');
    qrBox.classList.remove('hidden');
    scannerContainer.classList.remove('hidden');
    receivedList.innerHTML = '';
}

// ==========================================
// 5. SİNYALLEŞME & KAMERA (QR)
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
            scannerContainer.classList.add('hidden'); // QR okununca kamerayı gizle
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
    setupWebRTC();
    setupRealtimeListener();

    setTimeout(async () => {
        await sendSignal('join', { message: 'Alıcı katıldı' });
    }, 1000);
}

// ==========================================
// 6. WEBRTC ALICI/GÖNDERİCİ MOTORU
// ==========================================
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    dataChannel = peerConnection.createDataChannel("fileTransferChannel");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => {
        isConnected = true;
        qrBox.classList.add('hidden'); // BAĞLANTI KURULUNCA QR KODU GİZLE
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

            // Dosya tamamen alındığında -> İNDİR & VİTRİNE EKLE (ÖNİZLEME)
            if (receivedSize === expectedFileSize) {
                statusText.innerText = `${fileName} başarıyla alındı.`;
                const blob = new Blob(receivedBuffers, { type: fileType });
                const blobUrl = URL.createObjectURL(blob);
                
                // İndirmeyi tetikle
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = fileName;
                downloadLink.click();
                
                // Medya Galerisine Ekle
                renderReceivedMedia(fileName, fileType, blobUrl);

                receiveChannel.send(JSON.stringify({ type: 'file_received_ack' }));
            }
        };
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) sendSignal('candidate', event.candidate);
    };
}

// Alıcı tarafı galeri oluşturucu
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
// 7. YENİ DOSYA SEÇİMİ VE GÖNDERİCİ ÖNİZLEMESİ
// ==========================================
fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;

    fileQueue = [...fileQueue, ...newFiles];
    updateVitrinUI();
    
    // INPUT'UN HAFIZASINI TEMİZLE (Aynı dosyayı tekrar seçebilmek için)
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
        
        // Medya Önizleme İçeriği
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
        btnStartTransfer.classList.remove('hidden'); // Aktarımı başlat butonu tekrar görünür olmalı
        btnSelectFile.innerText = "Daha Fazla Dosya Ekle";
    } else {
        stagingArea.classList.add('hidden');
        btnSelectFile.innerText = "Dosya Seç";
    }
}

// ==========================================
// 8. AKTARIM MOTORU
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
        btnSelectFile.classList.remove('hidden'); // Tekrar dosya seçilebilmesi için görünür yap
        return; 
    }

    const file = fileQueue[currentFileIndex];
    statusText.innerText = `${file.name} gönderiliyor (${currentFileIndex + 1}/${fileQueue.length})`;

    // Alıcıya MIME type da gönderiyoruz ki medyaları tanısın
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
// 9. SUPABASE REALTIME (SİNYALLEŞME)
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

    // EĞER BAĞLANTI ZATEN KURULU YSA YENİ KATILIMLARI (3.KİŞİLERİ) REDDET
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
