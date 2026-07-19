// ==========================================
// 1. ARAYÜZ (UI) ELEMENTLERİNİ YAKALAMA 
// ==========================================
const btnSend = document.getElementById('btn-send');
const btnReceive = document.getElementById('btn-receive');
const senderSection = document.getElementById('sender-section');
const receiverSection = document.getElementById('receiver-section');
const fileInput = document.getElementById('file-input');
const btnSelectFile = document.getElementById('btn-select-file');
const qrCanvas = document.getElementById('qr-canvas');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');
const progressPercentage = document.getElementById('progress-percentage');

const stagingArea = document.getElementById('staging-area');
const fileListContainer = document.getElementById('file-list');
const btnStartTransfer = document.getElementById('btn-start-transfer');
const fileCountBadge = document.getElementById('file-count-badge');

// ==========================================
// 2. DURUM (STATE) VE KUYRUK DEĞİŞKENLERİ
// ==========================================
let fileQueue = []; 
let currentFileIndex = 0; 
let isTransferring = false;

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
const localSenderId = Math.random().toString(36).substring(2, 15);

// ==========================================
// 4. TEMEL BUTON OLAYLARI
// ==========================================
btnSend.addEventListener('click', () => {
    document.querySelector('.action-buttons').classList.add('hidden');
    senderSection.classList.remove('hidden');
    createRoomAndGenerateQR();
});

btnReceive.addEventListener('click', () => {
    document.querySelector('.action-buttons').classList.add('hidden');
    receiverSection.classList.remove('hidden');
    startQRScanner();
});

btnSelectFile.addEventListener('click', () => {
    if (dataChannel && dataChannel.readyState === 'open') {
        fileInput.click();
    }
});

if (btnStartTransfer) {
    btnStartTransfer.addEventListener('click', startTransfer);
}

// ==========================================
// 5. ODA, QR VE SİNYALLEŞME MANTIKLARI
// ==========================================
async function createRoomAndGenerateQR() {
    statusText.innerText = "BeamO Ağı Kuruluyor...";
    progressContainer.classList.remove('hidden');

    const { data, error } = await supabaseClient.from('rooms').insert([{}]).select().single();
    if (error) {
        statusText.innerText = "Hata: Sunucuya bağlanılamadı.";
        return;
    }
    
    currentRoomId = data.id;
    const joinLink = `${window.location.origin}/?room=${currentRoomId}`;
    
    QRCode.toCanvas(qrCanvas, joinLink, { 
        width: 220,
        margin: 1,
        color: { dark: '#090e17', light: '#ffffff' } 
    }, function (error) {
        if (error) console.error(error);
        statusText.innerText = "Alıcı cihazı bekliyor...";
    });

    setupWebRTC();
    setupRealtimeListener();
}

function startQRScanner() {
    statusText.innerText = "Kamera başlatılıyor...";
    progressContainer.classList.remove('hidden');

    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 15, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            html5QrCode.stop();
            document.getElementById('qr-reader').classList.add('hidden');
            const urlParams = new URLSearchParams(decodedText.split('?')[1]);
            const roomId = urlParams.get('room');
            if(roomId) joinRoom(roomId);
        },
        (errorMessage) => { }
    ).catch(err => {
        statusText.innerText = "Kamera izni reddedildi.";
    });
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
        statusText.innerText = "BeamO Ağı Hazır! Dosya Seçin.";
        btnSelectFile.classList.remove('hidden'); 
    };

    // KRİTİK HATA ÇÖZÜMÜ: Göndericinin, Alıcıdan gelen yanıtları duyabilmesi için dinleyici eklendi.
    dataChannel.onmessage = (e) => {
        if (typeof e.data === 'string') {
            const data = JSON.parse(e.data);
            if (data.type === 'file_received_ack') {
                currentFileIndex++;
                sendNextFile(); // Önceki dosya bitti, sonrakine geç
            }
            else if (data.type === 'ready_for_next') {
                 sendNextFile(); // Alıcı manifesto'yu okudu ve hazır, ilk dosyayı yolla
            }
        }
    };

    let receivedBuffers = [];
    let expectedFileSize = 0;
    let receivedSize = 0;
    let fileName = "gelen_dosya";

    peerConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.binaryType = "arraybuffer";
        
        receiveChannel.onmessage = (e) => {
            // METİN SİNYALLERİ (Alıcı Tarafı)
            if (typeof e.data === 'string') {
                const data = JSON.parse(e.data);
                
                if (data.type === 'manifest') {
                    statusText.innerText = `Gelen BeamO: ${data.totalFiles} Dosya`;
                    // Alıcı hazır olduğunu göndericiye bildirir
                    receiveChannel.send(JSON.stringify({ type: 'ready_for_next' }));
                }
                else if (data.type === 'start_file') {
                    expectedFileSize = data.size;
                    fileName = data.name;
                    receivedSize = 0;
                    receivedBuffers = [];
                    statusText.innerText = `İndiriliyor: ${fileName}`;
                    progressFill.style.width = "0%";
                    progressPercentage.innerText = "0%";
                }
                return;
            }

            // ARRAYBUFFER: Dosya Parçaları İşleniyor
            receivedBuffers.push(e.data);
            receivedSize += e.data.byteLength;

            const percentage = Math.floor((receivedSize / expectedFileSize) * 100);
            progressFill.style.width = percentage + "%";
            progressPercentage.innerText = percentage + "%";

            // Dosya tamamen alındı
            if (receivedSize === expectedFileSize) {
                statusText.innerText = `${fileName} başarıyla alındı.`;
                const blob = new Blob(receivedBuffers);
                const downloadLink = document.createElement('a');
                downloadLink.href = URL.createObjectURL(blob);
                downloadLink.download = fileName;
                downloadLink.click();
                
                // Alıcı, dosyayı indirdiğini göndericiye onaylar (ACK)
                receiveChannel.send(JSON.stringify({ type: 'file_received_ack' }));
            }
        };
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) sendSignal('candidate', event.candidate);
    };
}

// ==========================================
// 7. YENİ TASARIMA UYGUN VİTRİN DOM YÖNETİMİ
// ==========================================
fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;

    fileQueue = [...fileQueue, ...newFiles];
    updateVitrinUI();
});

window.removeFileFromQueue = function(index) {
    fileQueue.splice(index, 1);
    updateVitrinUI();
}

function updateVitrinUI() {
    if (!fileListContainer) return;
    fileListContainer.innerHTML = '';
    
    fileQueue.forEach((file, index) => {
        const ext = file.name.split('.').pop().toUpperCase().substring(0, 4);
        
        const item = document.createElement('div');
        item.className = 'file-item';
        
        item.innerHTML = `
            <span class="file-ext">${ext}</span>
            <span class="file-size">${(file.size / (1024*1024)).toFixed(1)}MB</span>
            <button class="btn-remove" onclick="removeFileFromQueue(${index})">X</button>
        `;
        fileListContainer.appendChild(item);
    });

    fileCountBadge.innerText = fileQueue.length;

    if (fileQueue.length > 0) {
        stagingArea.classList.remove('hidden');
        btnSelectFile.innerText = "Daha Fazla Dosya Ekle";
    } else {
        stagingArea.classList.add('hidden');
        btnSelectFile.innerText = "Dosya Seç";
    }
}

// ==========================================
// 8. AKTARIMI BAŞLATMA VE KUYRUK MOTORU (STABİL)
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
    
    // Gönderici manifestoyu yollar (Alıcı bunu alınca 'ready_for_next' diyecek)
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
        size: file.size
    }));

    // Tarayıcı çökmesini engellemek için parça boyutu 16KB
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
            statusText.innerText = "Hata: Bağlantı koptu veya limit aşıldı.";
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
