import React, { useRef, useState } from 'react';
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot
} from 'firebase/firestore';
import { firestore } from './firebaseConfig';

const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

let pc = null;

const VideoCallingApp = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [roomId, setRoomId] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [localStream, setLocalStream] = useState(null);

  const setupMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideoRef.current.srcObject = stream;
    setLocalStream(stream);
  };

  const createPeerConnection = (remoteStream) => {
    pc = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    return pc;
  };

  const startCall = async () => {
    const roomRef = doc(firestore, 'rooms', roomId);
    const candidatesRef = collection(roomRef, 'candidates');

    const remoteStream = new MediaStream();
    remoteVideoRef.current.srcObject = remoteStream;

    pc = createPeerConnection(remoteStream);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(candidatesRef, event.candidate.toJSON());
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    };

    await setDoc(roomRef, roomWithOffer);

    // Listen for answer
    onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answer = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answer);
        setCallStatus('Connected!');
      }
    });

    // Listen for remote ICE candidates
    onSnapshot(candidatesRef, async (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    setCallStatus('Call started. Waiting for other user to join...');
  };

  const joinCall = async () => {
    const roomRef = doc(firestore, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);

    if (!roomSnapshot.exists()) {
      alert('Room does not exist!');
      return;
    }

    const remoteStream = new MediaStream();
    remoteVideoRef.current.srcObject = remoteStream;

    pc = createPeerConnection(remoteStream);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidatesRef = collection(roomRef, 'candidates');
        await addDoc(candidatesRef, event.candidate.toJSON());
      }
    };

    const roomData = roomSnapshot.data();
    const offer = roomData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };

    await updateDoc(roomRef, roomWithAnswer);

    const candidatesRef = collection(roomRef, 'candidates');
    onSnapshot(candidatesRef, async (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    setCallStatus('Connected!');
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>WebRTC Video Chat</h2>
      <input
        type="text"
        placeholder="Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <br /><br />
      <button onClick={setupMedia}>Setup Media</button>
      <button onClick={startCall}>Start Call</button>
      <button onClick={joinCall}>Join Call</button>
      <p>{callStatus}</p>

      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <h4>Local</h4>
          <video ref={localVideoRef} autoPlay muted playsInline width={300} />
        </div>
        <div>
          <h4>Remote</h4>
          <video ref={remoteVideoRef} autoPlay playsInline width={300} />
        </div>
      </div>
    </div>
  );
};

export default VideoCallingApp;
