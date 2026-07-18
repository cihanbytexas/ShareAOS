// ==========================================
// 1. SUPABASE & WEBRTC AYARLARI
// ==========================================
const supabaseUrl = 'https://roiwxcecevfigomtopgb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvaXd4Y2VjZXZmaWdvbXRvcGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODYyNDEsImV4cCI6MjA5OTk2MjI0MX0.3RRbvEjWXjTBFlgNXyMGGhcKWvlaApqQieEgA7hLJMY';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

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
// 2. ARAYÜZ (UI) ELEMENTLERİNİ YAKALAMA
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

// Buton Tıklama Olayları
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
    fileInput.click();
});

// ==========================================
// 3. ODA VE QR OLUŞTURMA (Gönderici)
// ==========================================
async function createRoomAndGenerateQR() {
    statusText.innerText = "Oda oluşturuluyor...";
    progressContainer.classList.remove('hidden');

    const { data, error } = await supabase.from('rooms').insert([{}]).select().single();
    if (error) {
        statusText.innerText = "Hata: Oda oluşturulamadı!";
        return;
    }
    
    currentRoomId = data.id;
    const joinLink = `${window.location.origin}/?room=${currentRoomId}`;
    
    // QR Kodu Çizdirme
    QRCode.toCanvas(qrCanvas, joinLink, { 
        width: 200,
        color: { dark: '#000000', light: '#ffffff' } 
    }, function (error) {
        if (error) console.error(error);
        statusText.innerText = "QR Kod hazır. Alıcı cihazdan okutun.";
    });

    setupWebRTC();
    setupRealtimeListener();
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendSignal('offer', offer);
}

// ==========================================
// 4. QR OKUMA VE ODAYA KATILMA (Alıcı)
// ==========================================
function startQRScanner() {
    statusText.innerText = "Kamera başlatılıyor...";
    progressContainer.classList.remove('hidden');

    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" }, // Arka kamerayı kullan
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            // QR okunduğunda
            html5QrCode.stop();
            document.getElementById('qr-reader').classList.add('hidden');
            
            // Linkten Room ID'yi al
            const urlParams = new URLSearchParams(decodedText.split('?')[1]);
            const roomId = urlParams.get('room');
            
            if(roomId) joinRoom(roomId);
        },
        (errorMessage) => { /* Tarama devam ediyor, hataları yoksay */ }
    ).catch(err => {
        statusText.innerText = "Kamera izni reddedildi veya hata oluştu.";
    });
}

async function joinRoom(roomId) {
    currentRoomId = roomId;
    statusText.innerText = "Göndericiye bağlanılıyor...";
    setupWebRTC();
    setupRealtimeListener();
}

// ==========================================
// 5. WEBRTC VE DOSYA TRANSFER MOTORU
// ==========================================
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Veri Kanalı (Dosya gönderimi için)
    dataChannel = peerConnection.createDataChannel("fileTransferChannel");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => {
        statusText.innerText = "Bağlantı Kuruldu! Dosya seçebilirsiniz.";
        btnSelectFile.classList.remove('hidden'); // Bağlantı kurulunca dosya seçme aktif olur
    };

    // Dosya Alma İşlemi (Alıcı Tarafı)
    let receivedBuffers = [];
    let expectedFileSize = 0;
    let receivedSize = 0;
    let fileName = "gelen_dosya";

    peerConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.binaryType = "arraybuffer";
        
        receiveChannel.onmessage = (e) => {
            // İlk mesaj metadata (dosya adı ve boyutu) string olarak gelir
            if (typeof e.data === 'string') {
                const meta = JSON.parse(e.data);
                expectedFileSize = meta.size;
                fileName = meta.name;
                statusText.innerText = "Dosya alınıyor...";
                return;
            }

            // Gelen veri parçalarını (chunk) biriktir
            receivedBuffers.push(e.data);
            receivedSize += e.data.byteLength;

            // İlerleme çubuğunu güncelle
            const percentage = (receivedSize / expectedFileSize) * 100;
            progressFill.style.width = percentage + "%";

            // Dosya tamamlandıysa birleştir ve indir
            if (receivedSize === expectedFileSize) {
                statusText.innerText = "Transfer Tamamlandı!";
                const blob = new Blob(receivedBuffers);
                const downloadLink = document.createElement('a');
                downloadLink.href = URL.createObjectURL(blob);
                downloadLink.download = fileName;
                downloadLink.click();
            }
        };
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) sendSignal('candidate', event.candidate);
    };
}

// ==========================================
// 6. DOSYAYI PARÇALAYARAK GÖNDERME (Gönderici)
// ==========================================
fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    statusText.innerText = "Dosya gönderiliyor...";
    
    // Önce karşı tarafa dosya bilgisini gönder
    dataChannel.send(JSON.stringify({
        name: file.name,
        size: file.size
    }));

    const chunkSize = 16384; // 16KB parçalar (WebRTC sınırı için en güvenlisi)
    let offset = 0;

    const fileReader = new FileReader();
    fileReader.onerror = error => console.error('Dosya okuma hatası:', error);
    
    fileReader.onload = e => {
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;

        // İlerleme çubuğunu güncelle
        const percentage = (offset / file.size) * 100;
        progressFill.style.width = percentage + "%";

        if (offset < file.size) {
            readSlice(offset);
        } else {
            statusText.innerText = "Gönderim Tamamlandı!";
        }
    };

    const readSlice = o => {
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };

    readSlice(0);
});

// ==========================================
// 7. SİNYALLEŞME (SUPABASE)
// ==========================================
function setupRealtimeListener() {
    supabase.channel('signaling_channel')
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

    if (msg.message_type === 'offer') {
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
    await supabase.from('signaling_messages').insert([{
        room_id: currentRoomId,
        sender_id: localSenderId,
        message_type: type,
        payload: payloadData
    }]);
}
