import React, { useState, useRef } from 'react';
import { firestore } from './firebaseConfig'; // Firebase config
import { doc, setDoc, updateDoc, getDoc, collection, addDoc, onSnapshot } from 'firebase/firestore';

const VideoCallingApp = () => {
  const [clientId, setClientId] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  // Set up media stream
  const setupMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
  };

  // User 1: Start Call (Create Offer)
  const startCall = async (roomId) => {
    const pc = new RTCPeerConnection(configuration);
    setPeerConnection(pc);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Store the offer in Firestore
    await setDoc(doc(firestore, 'rooms', roomId), {
      offer: JSON.stringify(offer),
      callerId: clientId,
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(collection(firestore, `rooms/${roomId}/candidates`), event.candidate.toJSON());
      }
    };

    setCallStatus('Call started, waiting for other user to join...');
  };

  // User 2: Join Call (Fetch Offer, Create Answer)
  const joinCall = async (roomId) => {
    const pc = new RTCPeerConnection(configuration);
    setPeerConnection(pc);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Fetch the offer from Firestore
    const roomRef = doc(firestore, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    const offer = roomSnap.data().offer;

    // Set remote description (Offer)
    await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));

    // Create and send Answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(roomRef, {
      answer: JSON.stringify(answer),
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(collection(firestore, `rooms/${roomId}/candidates`), event.candidate.toJSON());
      }
    };

    setCallStatus('Waiting for the caller to connect...');
  };

  // User 1: Fetch Answer and Set Remote Description
  const fetchAnswer = async (roomId) => {
    const roomRef = doc(firestore, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    const answer = roomSnap.data().answer;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));

    setCallStatus('Call connected');
  };

  // ICE Candidate exchange
  const handleICECandidates = (roomId) => {
    onSnapshot(collection(firestore, `rooms/${roomId}/candidates`), (snapshot) => {
      snapshot.forEach(async (doc) => {
        const candidate = doc.data();
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      });
    });
  };

  return (
    <div>
      <h1>Video Calling App</h1>
      <input type="text" placeholder="Enter Room ID" onChange={(e) => setClientId(e.target.value)} />
      <button onClick={() => setupMedia()}>Setup Media</button>
      <button onClick={() => startCall('room1')}>Start Call</button>
      <button onClick={() => joinCall('room1')}>Join Call</button>
      <button onClick={() => fetchAnswer('room1')}>Fetch Answer</button>
      <p>{callStatus}</p>

      <div>
        <video ref={localVideoRef} autoPlay muted playsInline />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>
    </div>
  );
};

export default VideoCallingApp;
