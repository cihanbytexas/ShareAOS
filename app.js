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

// Başlangıçta Dosya Seç butonunu gizle (Sadece tünel açılınca görünecek)
btnSelectFile.classList.add('hidden');

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
    // Güvenlik: Tünel açık değilse butona basılmasını engelle
    if (dataChannel && dataChannel.readyState === 'open') {
        fileInput.click();
    }
});

// ==========================================
// 2. SUPABASE & WEBRTC AYARLARI
// ==========================================
const supabaseUrl = 'https://roiwxcecevfigomtopgb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvaXd4Y2VjZXZmaWdvbXRvcGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODYyNDEsImV4cCI6MjA5OTk2MjI0MX0.3RRbvEjWXjTBFlgNXyMGGhcKWvlaApqQieEgA7hLJMY';

// ÇAKIŞMA ÇÖZÜLDÜ: Değişken adı supabaseClient olarak değiştirildi.
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
// 3. ODA VE QR OLUŞTURMA (Gönderici)
// ==========================================
async function createRoomAndGenerateQR() {
    statusText.innerText = "Oda oluşturuluyor...";
    progressContainer.classList.remove('hidden');

    const { data, error } = await supabaseClient.from('rooms').insert([{}]).select().single();
    if (error) {
        statusText.innerText = "Hata: Veritabanı bağlantısı kurulamadı.";
        console.error("Supabase Hatası:", error);
        return;
    }
    
    currentRoomId = data.id;
    const joinLink = `${window.location.origin}/?room=${currentRoomId}`;
    
    QRCode.toCanvas(qrCanvas, joinLink, { 
        width: 200,
        color: { dark: '#000000', light: '#ffffff' } 
    }, function (error) {
        if (error) console.error(error);
        statusText.innerText = "QR Kod hazır. Alıcı cihazdan okutun.";
    });

    setupWebRTC();
    setupRealtimeListener();
}

// ==========================================
// 4. QR OKUMA VE ODAYA KATILMA (Alıcı)
// ==========================================
function startQRScanner() {
    statusText.innerText = "Kamera başlatılıyor...";
    progressContainer.classList.remove('hidden');

    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            html5QrCode.stop();
            document.getElementById('qr-reader').classList.add('hidden');
            
            const urlParams = new URLSearchParams(decodedText.split('?')[1]);
            const roomId = urlParams.get('room');
            
            if(roomId) joinRoom(roomId);
        },
        (errorMessage) => { }
    ).catch(err => {
        statusText.innerText = "Kamera izni reddedildi veya hata oluştu.";
        console.error("Kamera Hatası:", err);
    });
}

async function joinRoom(roomId) {
    currentRoomId = roomId;
    statusText.innerText = "Göndericiye bağlanılıyor...";
    setupWebRTC();
    setupRealtimeListener();

    // Alıcı odaya girince dinlemeye başlaması için kısa bir süre verip "Ben geldim" sinyali atıyor.
    setTimeout(async () => {
        await sendSignal('join', { message: 'Alıcı katıldı' });
    }, 1000);
}

// ==========================================
// 5. WEBRTC VE DOSYA TRANSFER MOTORU
// ==========================================
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    dataChannel = peerConnection.createDataChannel("fileTransferChannel");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => {
        statusText.innerText = "Bağlantı Kuruldu! Dosya seçebilirsiniz.";
        btnSelectFile.classList.remove('hidden'); // Tünel açılınca buton görünür
    };

    let receivedBuffers = [];
    let expectedFileSize = 0;
    let receivedSize = 0;
    let fileName = "gelen_dosya";

    peerConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.binaryType = "arraybuffer";
        
        receiveChannel.onmessage = (e) => {
            if (typeof e.data === 'string') {
                const meta = JSON.parse(e.data);
                expectedFileSize = meta.size;
                fileName = meta.name;
                statusText.innerText = "Dosya alınıyor...";
                return;
            }

            receivedBuffers.push(e.data);
            receivedSize += e.data.byteLength;

            const percentage = (receivedSize / expectedFileSize) * 100;
            progressFill.style.width = percentage + "%";

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
// 6. DOSYAYI PARÇALAYARAK GÖNDERME (OPTİMİZE EDİLDİ)
// ==========================================
fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    statusText.innerText = "Dosya gönderiliyor...";
    btnSelectFile.classList.add('hidden'); 
    
    dataChannel.send(JSON.stringify({
        name: file.name,
        size: file.size
    }));

    // 64KB'lık parçalar (Hız artışı için)
    const chunkSize = 65536; 
    let offset = 0;
    let lastProgress = 0; 

    // Buffer limiti: 1 MB'ı geçerse göndermeyi geçici olarak durdur.
    dataChannel.bufferedAmountLowThreshold = 1024 * 1024; 

    const fileReader = new FileReader();
    fileReader.onerror = error => console.error('Dosya okuma hatası:', error);
    
    const readSlice = o => {
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };

    fileReader.onload = e => {
        // Tünelin tıkanıp tıkanmadığını kontrol et (Backpressure kontrolü)
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
        dataChannel.send(data);
        offset += data.byteLength;

        // İlerleme çubuğunu grafik motorunu yormamak için her %1'de bir güncelle
        const currentProgress = Math.floor((offset / totalSize) * 100);
        if (currentProgress > lastProgress) {
            progressFill.style.width = currentProgress + "%";
            lastProgress = currentProgress;
        }

        if (offset < totalSize) {
            readSlice(offset);
        } else {
            statusText.innerText = "Gönderim Tamamlandı!";
        }
    };

    readSlice(0);
});

// ==========================================
// 7. SİNYALLEŞME (SUPABASE REALTIME)
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
        // Alıcı geldi, şimdi tüneli başlat (Offer oluştur)
        statusText.innerText = "Alıcı cihaz bulundu, güvenli bağ kuruluyor...";
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
