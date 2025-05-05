// File: VideoCallingApp.js

import React, { useRef, useState, useEffect } from 'react';
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { firestore } from './firebaseConfig';
import './VideoCalingApp.css';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:relay1.expressturn.com:3478',
      username: 'ef1Z3Xgt1GDVjCP9',
      credential: 'm4N1MZQvYp5Lyo0e'
    }
  ]
};

const VideoCallingApp = () => {
  const localVideoRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [peerConnections, setPeerConnections] = useState({});

  useEffect(() => {
    if (roomId) listenForPeers(roomId);
  }, [roomId]);

  const setupMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      setLocalStream(stream);
      setCallStatus('Media setup done');
    } catch (err) {
      console.error(err);
      setCallStatus('Failed to access camera/mic');
    }
  };

  const startCall = async () => {
    const roomRef = doc(firestore, 'rooms', roomId);
    await setDoc(roomRef, { createdAt: serverTimestamp() });
    setCallStatus('Call started, waiting for others to join...');
  };

  const listenForPeers = async (roomId) => {
    const peersRef = collection(firestore, `rooms/${roomId}/peers`);

    onSnapshot(peersRef, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const peerId = change.doc.id;
        const data = change.doc.data();

        if (change.type === 'added' && !peerConnections[peerId]) {
          const remoteStream = new MediaStream();
          const videoEl = document.createElement('video');
          videoEl.autoplay = true;
          videoEl.playsInline = true;
          videoEl.srcObject = remoteStream;
          videoEl.style.width = '300px';
          videoEl.style.margin = '10px';
          document.getElementById('remoteVideos').appendChild(videoEl);

          const pc = new RTCPeerConnection(configuration);

          localStream.getTracks().forEach((track) => {
            pc.addTrack(track, localStream);
          });

          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              const candRef = collection(firestore, `rooms/${roomId}/peers/${peerId}/callerCandidates`);
              await addDoc(candRef, event.candidate.toJSON());
            }
          };

          pc.ontrack = (event) => {
            event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          await setDoc(doc(firestore, `rooms/${roomId}/peers/${peerId}`), {
            offer: { type: offer.type, sdp: offer.sdp }
          });

          onSnapshot(doc(firestore, `rooms/${roomId}/peers/${peerId}`), async (snap) => {
            const d = snap.data();
            if (d?.answer && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
              setCallStatus(`Connected to ${peerId}`);
            }
          });

          const calleeCandidatesRef = collection(firestore, `rooms/${roomId}/peers/${peerId}/calleeCandidates`);
          onSnapshot(calleeCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                pc.addIceCandidate(new RTCIceCandidate(data));
              }
            });
          });

          setPeerConnections(prev => ({ ...prev, [peerId]: pc }));
        }
      });
    });
  };

  const joinCall = async () => {
    const peerId = crypto.randomUUID();
    const peerRef = doc(firestore, `rooms/${roomId}/peers/${peerId}`);
    const peerSnap = await getDoc(peerRef);
    if (!peerSnap.exists()) {
      alert('Invalid room or peer not initialized yet');
      return;
    }

    const remoteStream = new MediaStream();
    const videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.srcObject = remoteStream;
    videoEl.style.width = '300px';
    videoEl.style.margin = '10px';
    document.getElementById('remoteVideos').appendChild(videoEl);

    const pc = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candRef = collection(firestore, `rooms/${roomId}/peers/${peerId}/calleeCandidates`);
        await addDoc(candRef, event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    const offer = peerSnap.data().offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(peerRef, {
      answer: { type: answer.type, sdp: answer.sdp }
    });

    const callerCandidatesRef = collection(firestore, `rooms/${roomId}/peers/${peerId}/callerCandidates`);
    onSnapshot(callerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });

    setCallStatus('Connected to host');
  };

  return (
    <div className='main_div_app'>
      <h2>Group Video Call</h2>
      <input
        type='text'
        placeholder='Room ID'
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      /><br /><br />
      <button onClick={setupMedia}>Setup Media</button>
      <button onClick={startCall}>Start Call</button>
      <button onClick={joinCall}>Join Call</button>
      <p>{callStatus}</p>
      <div>
        <h4>Local</h4>
        <video ref={localVideoRef} autoPlay muted playsInline width={300} />
      </div>
      <div id='remoteVideos' className='both_video_main'></div>
    </div>
  );
};

export default VideoCallingApp;