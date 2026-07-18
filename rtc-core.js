// Supabase kurulumu (Kendi proje URL'ni ve Anon Key'ini girmelisin)
const supabaseUrl = 'https://roiwxcecevfigomtopgb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvaXd4Y2VjZXZmaWdvbXRvcGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODYyNDEsImV4cCI6MjA5OTk2MjI0MX0.3RRbvEjWXjTBFlgNXyMGGhcKWvlaApqQieEgA7hLJMY';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// WebRTC Ayarları (Ücretsiz Google STUN sunucuları)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let peerConnection;
let dataChannel;
let currentRoomId = null;
const localSenderId = Math.random().toString(36).substring(2, 15); // Cihaza özel geçici kimlik

// ==========================================
// 1. ODA OLUŞTURMA (Gönderici Tarafı)
// ==========================================
async function createRoomAndGenerateQR() {
    // Veritabanında yeni oda oluştur
    const { data, error } = await supabase.from('rooms').insert([{}]).select().single();
    if (error) {
        console.error("Oda oluşturulamadı:", error);
        return;
    }
    
    currentRoomId = data.id;
    console.log("Oda Oluşturuldu ID:", currentRoomId);
    
    // QR Kodu oluşturulacak link (Arayüzde bu linki QR'a çevireceksin)
    const joinLink = `${window.location.origin}/?room=${currentRoomId}`;
    console.log("QR Kod için link:", joinLink);

    setupWebRTC();
    setupRealtimeListener();
    
    // Bağlantı teklifi (Offer) oluştur ve veritabanına yaz
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendSignal('offer', offer);
}

// ==========================================
// 2. ODAYA KATILMA (Alıcı Tarafı - QR Okutulunca)
// ==========================================
async function joinRoom(roomId) {
    currentRoomId = roomId;
    console.log("Odaya Katılınıyor ID:", currentRoomId);
    
    setupWebRTC();
    setupRealtimeListener();
}

// ==========================================
// 3. WEBRTC ALTYAPISI
// ==========================================
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Veri Kanalı (Data Channel) Ayarı - Dosya buradan akacak
    dataChannel = peerConnection.createDataChannel("fileTransferChannel");
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onopen = () => console.log("VERİ KANALI AÇILDI! Cihazlar bağlandı.");
    dataChannel.onclose = () => console.log("Veri kanalı kapandı.");
    
    // Karşıdan veri/dosya geldiğinde tetiklenir
    peerConnection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.binaryType = "arraybuffer";
        receiveChannel.onmessage = (e) => {
            console.log("Dosya parçası alındı, boyutu:", e.data.byteLength);
            // Burada dosyayı birleştirme mantığı çalışacak
        };
    };

    // Bağlantı yollarını (ICE) bulduğunda veritabanına gönder
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal('candidate', event.candidate);
        }
    };
}

// ==========================================
// 4. SUPABASE REALTIME DİNLEYİCİSİ
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
    
    // Kendi gönderdiğimiz sinyalleri yoksay
    if (msg.sender_id === localSenderId) return;

    if (msg.message_type === 'offer') {
        console.log("Teklif (Offer) alındı, Cevap (Answer) oluşturuluyor...");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignal('answer', answer);
    } 
    else if (msg.message_type === 'answer') {
        console.log("Cevap (Answer) alındı.");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload));
    } 
    else if (msg.message_type === 'candidate') {
        console.log("ICE Adayı alındı.");
        await peerConnection.addIceCandidate(new RTCIceCandidate(msg.payload));
    }
}

// ==========================================
// 5. YARDIMCI FONKSİYON: VERİTABANINA SİNYAL YAZ
// ==========================================
async function sendSignal(type, payloadData) {
    await supabase.from('signaling_messages').insert([{
        room_id: currentRoomId,
        sender_id: localSenderId,
        message_type: type,
        payload: payloadData
    }]);
}
