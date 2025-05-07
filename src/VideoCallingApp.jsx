import React, { useRef, useState } from 'react';
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot
} from 'firebase/firestore';
import { firestore } from './firebaseConfig';
import './VideoCalingApp.css';

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:relay1.expressturn.com:3478',
      username: 'ef1Z3Xgt1GDVjCP9',
      credential: 'm4N1MZQvYp5Lyo0e'
    }
  ]
};

let pc = null;

const VideoCallingApp = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [roomId, setRoomId] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [localStream, setLocalStream] = useState(null);

  const setupMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }, // front camera
        audio: true,
      });
      localVideoRef.current.srcObject = stream;
      setLocalStream(stream);
      console.log('Media stream set up');
    } catch (err) {
      console.error('Media error:', err);
      setCallStatus('Permission denied / media error');
    }
  };

  const createPeerConnection = (remoteStream) => {
    const peer = new RTCPeerConnection(iceServers);

    peer.onicecandidate = async (event) => {
      if (event.candidate) {
        const ref = collection(firestore, 'rooms', roomId, 'iceCandidates');
        await addDoc(ref, event.candidate.toJSON());
      }
    };

    peer.ontrack = (event) => {
      console.log('Remote track added');
      remoteStream.addTrack(event.track);
    };

    localStream?.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });

    return peer;
  };

  const startCall = async () => {
    await setupMedia();
    const roomRef = doc(firestore, 'rooms', roomId);
    const callerCandidatesRef = collection(roomRef, 'callerCandidates');

    const remoteStream = new MediaStream();
    remoteVideoRef.current.srcObject = remoteStream;

    pc = createPeerConnection(remoteStream);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(callerCandidatesRef, event.candidate.toJSON());
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await setDoc(roomRef, {
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    });

    onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        const answerDesc = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answerDesc);
        console.log('Answer set');
      }
    });

    const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');
    onSnapshot(calleeCandidatesRef, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    setCallStatus('Call started. Waiting for other user...');
  };

  const joinCall = async () => {
    await setupMedia();

    const roomRef = doc(firestore, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);

    if (!roomSnapshot.exists()) {
      alert('Room does not exist!');
      return;
    }

    const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');
    const remoteStream = new MediaStream();
    remoteVideoRef.current.srcObject = remoteStream;

    pc = createPeerConnection(remoteStream);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(calleeCandidatesRef, event.candidate.toJSON());
      }
    };

    const roomData = roomSnapshot.data();
    const offerDesc = new RTCSessionDescription(roomData.offer);
    await pc.setRemoteDescription(offerDesc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(roomRef, {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      }
    });

    const callerCandidatesRef = collection(roomRef, 'callerCandidates');
    onSnapshot(callerCandidatesRef, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    setCallStatus('Connected!');
  };

  const endCall = () => {
    if (pc) {
      pc.close();
      pc = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localVideoRef.current.srcObject = null;
    }

    remoteVideoRef.current.srcObject = null;
    setCallStatus('Call ended');
  };

  return (
    <div className='main_div_app'>
      <h2>📱📞 WebRTC Video Chat</h2>
      <input
        type="text"
        placeholder="Enter Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <div style={{ margin: '10px 0' }}>
        <button onClick={startCall}>Start Call</button>
        <button onClick={joinCall}>Join Call</button>
        <button onClick={endCall}>End Call</button>
      </div>
      <p>Status: {callStatus}</p>

      <div className="both_video_main">
        <div className="video_user">
          <h4>Local</h4>
          <video ref={localVideoRef} autoPlay muted playsInline width="300" />
        </div>
        <div className="video_user">
          <h4>Remote</h4>
          <video ref={remoteVideoRef} autoPlay playsInline width="300" />
        </div>
      </div>
    </div>
  );
};

export default VideoCallingApp;
