// Generate random room name if needed
let roomId;
const drone = new ScaleDrone("h6unIX8kJz0YGVsh");
let roomName;
let room;
let pc;
const createRoomPage = document.getElementById("create-room");
const roomPage = document.getElementById("room-page");
const button = document.getElementById("create-button");
const joinButton = document.getElementById("join-room-button");

joinButton.addEventListener("click", joinRoomByName);

function joinRoomByName() {
  roomId = document.getElementById("join-room-name").value.toString(16);
  location.hash = roomId.toString(16);
  createRoomPage.style.display = "none";
  roomPage.style.display = "block";
  joinRoom();
}

function handleClick() {
  roomId = createRoom();
  createRoomPage.style.display = "none";
  roomPage.style.display = "block";
  joinRoom();
}

function createRoom() {
  location.hash = document.getElementById("room-name").value.toString(16);
  return location.hash;
}

if (location.hash) {
  roomId = location.hash;
  createRoomPage.style.display = "none";
  roomPage.style.display = "block";
  joinRoom();
} else {
  roomPage.style.display = "none";
  button.addEventListener("click", handleClick);
}

function joinRoom() {
  // Room name needs to be prefixed with 'observable-'
  roomName = "observable-" + roomId;
  drone.on("open", error => {
    if (error) {
      return console.error(error);
    }
    room = drone.subscribe(roomName);

    room.on("open", error => {
      if (error) {
        onError(error);
      }
    });
    // We're connected to the room and received an array of 'members'
    // connected to the room (including us). Signaling server is ready.
    room.on("members", members => {
      console.log("MEMBERS", members);
      // If we are the second user to connect to the room we will be creating the offer
      const isOfferer = members.length === 2;
      startWebRTC(isOfferer);
    });
  });
}

function onSuccess() {
  console.log("connection established");
}

function onError(error) {
  console.error(error);
}

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  const configuration = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302"
      }
    ]
  };
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({ candidate: event.candidate });
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer()
        .then(localDescCreated)
        .catch(onError);
    };
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.ontrack = event => {
    const stream = event.streams[0];
    if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
      remoteVideo.srcObject = stream;
    }
  };

  navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: true
    })
    .then(stream => {
      // Display your local video in #localVideo element
      localVideo.srcObject = stream;
      // Add your stream to be sent to the conneting peer
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }, onError);

  // Listen to signaling data from Scaledrone
  room.on("data", (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(
        new RTCSessionDescription(message.sdp),
        () => {
          // When receiving an offer lets answer it
          if (pc.remoteDescription.type === "offer") {
            pc.createAnswer()
              .then(localDescCreated)
              .catch(onError);
          }
        },
        onError
      );
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate),
        onSuccess,
        onError
      );
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({ sdp: pc.localDescription }),
    onError
  );
}
