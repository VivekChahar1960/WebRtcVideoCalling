import React, { useRef, useState } from 'react';
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot
} from 'firebase/firestore';
import { firestore } from './firebaseConfig';
import './VideoCallingApp.css';

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

let pc = null;

const VideoCallingApp = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [roomId, setRoomId] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [localStream, setLocalStream] = useState(null);

  const setupMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      setLocalStream(stream);
      setCallStatus('Media setup complete');
      return stream;
    } catch (err) {
      setCallStatus('Error accessing camera/mic');
      console.error('Media error:', err);
      return null;
    }
  };

  const createPeerConnection = (remoteStream) => {
    pc = new RTCPeerConnection(configuration);

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      setCallStatus(`Connection: ${pc.connectionState}`);
    };

    pc.ontrack = (event) => {
      console.log('ontrack triggered');
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
      remoteVideoRef.current.srcObject = remoteStream;
    };

    return pc;
  };

  const startCall = async () => {
    const stream = await setupMedia();
    if (!stream) return;

    const roomRef = doc(firestore, 'rooms', roomId);
    const callerCandidatesRef = collection(roomRef, 'callerCandidates');

    const remoteStream = new MediaStream();
    remoteVideoRef.current.srcObject = remoteStream;

    pc = createPeerConnection(remoteStream);

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(callerCandidatesRef, event.candidate.toJSON());
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    };
    await setDoc(roomRef, roomWithOffer);

    onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        const answer = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answer);
        setCallStatus('Connected!');
      }
    });

    const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');
    onSnapshot(calleeCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    setCallStatus('Call created. Waiting for other user to join...');
  };

  const joinCall = async () => {
    const stream = await setupMedia();
    if (!stream) return;

    const roomRef = doc(firestore, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);
    if (!roomSnapshot.exists()) {
      alert('Room not found!');
      return;
    }

    const callerCandidatesRef = collection(roomRef, 'callerCandidates');
    const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');

    const remoteStream = new MediaStream();
    remoteVideoRef.current.srcObject = remoteStream;

    pc = createPeerConnection(remoteStream);

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(calleeCandidatesRef, event.candidate.toJSON());
      }
    };

    const offer = roomSnapshot.data().offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    };
    await updateDoc(roomRef, roomWithAnswer);

    onSnapshot(callerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    setCallStatus('Connected!');
  };

  const endCall = async () => {
    if (pc) {
      pc.close();
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    localVideoRef.current.srcObject = null;
    remoteVideoRef.current.srcObject = null;
    setCallStatus('Call Ended');

    if (roomId) {
      const roomRef = doc(firestore, 'rooms', roomId);
      await updateDoc(roomRef, { offer: null, answer: null });
    }
  };

  return (
    <div className='main_div_app'>
      <h2>WebRTC Video Chat</h2>
      <input
        type="text"
        placeholder="Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <br /><br />
      <button onClick={startCall}>Start Call</button>
      <button onClick={joinCall}>Join Call</button>
      <button onClick={endCall}>End Call</button>
      <p>{callStatus}</p>

      <div className='both_video_main'>
        <div className='video_user'>
          <h4>Local</h4>
          <video ref={localVideoRef} autoPlay muted playsInline width={300} />
        </div>
        <div className='video_user'>
          <h4>Remote</h4>
          <video ref={remoteVideoRef} autoPlay playsInline width={300} />
        </div>
      </div>
    </div>
  );
};

export default VideoCallingApp;
