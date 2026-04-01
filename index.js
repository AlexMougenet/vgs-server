const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocketServer({ port: PORT });

// roomCode → Set<{ ws, playerName }>
const rooms = new Map();

function broadcast(roomCode, message, excludeWs) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const member of room) {
    if (member.ws !== excludeWs && member.ws.readyState === 1) {
      member.ws.send(data);
    }
  }
}

function removeFromRoom(ws) {
  for (const [roomCode, room] of rooms) {
    for (const member of room) {
      if (member.ws === ws) {
        room.delete(member);
        broadcast(roomCode, { type: 'player_left', playerName: member.playerName });
        console.log(`[${roomCode}] ${member.playerName} left (${room.size} remaining)`);
        if (room.size === 0) {
          rooms.delete(roomCode);
          console.log(`[${roomCode}] Room deleted (empty)`);
        }
        return;
      }
    }
  }
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentName = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      // Remove from previous room if any
      removeFromRoom(ws);

      const { roomCode, playerName } = msg;
      currentRoom = roomCode;
      currentName = playerName;

      if (!rooms.has(roomCode)) {
        rooms.set(roomCode, new Set());
      }
      const room = rooms.get(roomCode);
      room.add({ ws, playerName });

      // Send current player list to the joining client
      const players = [];
      for (const member of room) {
        if (member.ws !== ws) {
          players.push(member.playerName);
        }
      }
      ws.send(JSON.stringify({ type: 'room_state', players }));

      // Broadcast join to others
      broadcast(roomCode, { type: 'player_joined', playerName }, ws);
      console.log(`[${roomCode}] ${playerName} joined (${room.size} in room)`);
    }

    if (msg.type === 'vgs_event') {
      const { roomCode, playerName, playerColor, command, commandId, voicePackId, label, sound } = msg;
      broadcast(roomCode, { type: 'vgs_event', playerName, playerColor, command, commandId, voicePackId, label, sound }, ws);
    }
  });

  ws.on('close', () => {
    removeFromRoom(ws);
  });
});

console.log(`VGS server listening on port ${PORT}`);
