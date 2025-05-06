import React, { useRef, useState } from 'react';
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot
} from 'firebase/firestore';
import { firestore } from './firebaseConfig';
import './VideoCalingApp.css';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:relay1.expressturn.com:3478',
      username: 'ef1Z3Xgt1GDVjCP9',
      credential: 'm4N1MZQvYp5Lyo0e',
    },
  ],
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
      setCallStatus('Media setup done');
    } catch (err) {
      setCallStatus('Error accessing camera/mic');
      console.error(err);
    }
  };

  const createPeerConnection = (remoteStream) => {
    pc = new RTCPeerConnection(configuration);

    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
      setCallStatus(`ICE State: ${pc.iceConnectionState}`);
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection State:', pc.connectionState);
      setCallStatus(`Connection State: ${pc.connectionState}`);
    };

    localStream?.getTracks().forEach((track) => {
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
    await setupMedia(); // Set up media before starting the call

    const roomRef = doc(firestore, 'rooms', roomId);
    const candidatesRef = collection(roomRef, 'callerCandidates');

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

    onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answer = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(answer);
        setCallStatus('Connected!');
      }
    });

    const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');
    onSnapshot(calleeCandidatesRef, async (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    setCallStatus('Call started. Waiting for user to join...');
  };

  const joinCall = async () => {
    await setupMedia(); // Set up media before joining the call

    const roomRef = doc(firestore, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);

    if (!roomSnapshot.exists()) {
      alert('Room does not exist!');
      return;
    }

    const remoteStream = new MediaStream();
    remoteVideoRef.current.srcObject = remoteStream;

    pc = createPeerConnection(remoteStream);

    const callerCandidatesRef = collection(roomRef, 'callerCandidates');
    const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(calleeCandidatesRef, event.candidate.toJSON());
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

    onSnapshot(callerCandidatesRef, async (snapshot) => {
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
      localVideoRef.current.srcObject = null;
    }

    remoteVideoRef.current.srcObject = null;

    setCallStatus('Call Ended.');

    if (roomId) {
      const roomRef = doc(firestore, 'rooms', roomId);
      await updateDoc(roomRef, { offer: null, answer: null });
    }
  };

  return (
    <div className="main_div_app">
      <h2>Video Calling App</h2>
      <input
        type="text"
        placeholder="Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <br />
      <br />
      <button onClick={startCall}>Start Call</button>
      <button onClick={joinCall}>Join Call</button>
      <button onClick={endCall}>End Call</button>
      <p>{callStatus}</p>

      <div className="both_video_main">
        <div className="video_user">
          <h4>Local</h4>
          <video ref={localVideoRef} autoPlay muted playsInline width={300} />
        </div>
        <div className="video_user">
          <h4>Remote</h4>
          <video ref={remoteVideoRef} autoPlay playsInline width={300} />
        </div>
      </div>
      <p>CopyRight @Vivek Chahar 2025</p>
    </div>
  );
};

export default VideoCallingApp;
