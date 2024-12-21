const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    path: '/piano/socket.io',
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the current directory
app.use(express.static('./'));

// Add CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Keep track of connected users and rooms
const users = new Map();
const rooms = new Map();

// Create default lobby
const lobby = {
    _id: 'lobby',
    settings: {
        chat: true,
        visible: true,
        crownsolo: false,
        color: "#3b5054",
        lobby: true,
        'no cussing': false
    },
    crown: null,
    participants: new Set(),
    count: 0
};
rooms.set('lobby', lobby);

function broadcast(room, msg, excludeId) {
    if (!room || !room.participants) return;
    Array.from(room.participants).forEach(participant => {
        if (participant.socket && participant._id !== excludeId) {
            try {
                participant.socket.emit('message', [msg]);
            } catch (err) {
                console.error('Error broadcasting to participant:', err);
            }
        }
    });
}

io.on('connection', (socket) => {
    console.log('Client connected');
    const userId = Math.random().toString(36).substr(2, 9);
    
    // Create user object
    const user = {
        _id: userId,
        name: "Anonymous",
        color: "#ffffff",
        socket: socket
    };
    users.set(userId, user);
    
    // Send initial hi message
    socket.emit('message', [{
        m: "hi",
        u: {
            _id: userId,
            name: user.name,
            color: user.color
        },
        t: Date.now()
    }]);
    
    socket.on('message', (data) => {
        try {
            if (!Array.isArray(data)) return;
            
            data.forEach(msg => {
                console.log('Received message:', msg.m);
                
                switch(msg.m) {
                    case 't': // Timing message
                        socket.emit('message', [{
                            m: "t",
                            t: Date.now(),
                            e: msg.e
                        }]);
                        break;
                        
                    case 'n': // Note message
                        const noteUser = users.get(userId);
                        if (!noteUser || !noteUser.room) return;
                        const noteRoom = rooms.get(noteUser.room);
                        if (!noteRoom) return;
                        
                        // Broadcast note to all participants in the room
                        broadcast(noteRoom, {
                            m: 'n',
                            t: msg.t,
                            n: msg.n,
                            p: userId
                        }, userId);
                        break;
                        
                    case 'm': // Mouse movement
                        const moveUser = users.get(userId);
                        if (!moveUser || !moveUser.room) return;
                        const moveRoom = rooms.get(moveUser.room);
                        if (!moveRoom) return;
                        
                        // Update user position
                        moveUser.x = msg.x;
                        moveUser.y = msg.y;
                        
                        // Broadcast to all participants in room
                        broadcast(moveRoom, {
                            m: "m",
                            id: userId,
                            x: msg.x,
                            y: msg.y
                        }, userId);
                        break;
                        
                    case 'ch': // Channel join
                        const roomId = msg._id || 'lobby';
                        const joinUser = users.get(userId);
                        if (!joinUser) return;
                        
                        // Leave current room
                        if (joinUser.room) {
                            const oldRoom = rooms.get(joinUser.room);
                            if (oldRoom) {
                                oldRoom.participants.delete(joinUser);
                                oldRoom.count--;
                                broadcast(oldRoom, {
                                    m: "bye",
                                    p: userId
                                });
                            }
                        }
                        
                        // Join new room
                        let room = rooms.get(roomId);
                        if (!room) {
                            room = {
                                _id: roomId,
                                settings: msg.set || {
                                    visible: true,
                                    chat: true,
                                    crownsolo: false,
                                    color: "#3b5054",
                                    lobby: false
                                },
                                crown: {
                                    participantId: userId,
                                    userId: userId,
                                    time: Date.now()
                                },
                                participants: new Set(),
                                count: 0
                            };
                            rooms.set(roomId, room);
                        }
                        
                        room.participants.add(joinUser);
                        room.count++;
                        joinUser.room = roomId;
                        
                        // Send room info
                        socket.emit('message', [{
                            m: "ch",
                            ch: {
                                _id: room._id,
                                settings: room.settings,
                                crown: room.crown,
                                count: room.count
                            },
                            p: userId,
                            ppl: Array.from(room.participants).map(p => ({
                                _id: p._id,
                                name: p.name,
                                color: p.color,
                                x: p.x || 0,
                                y: p.y || 0,
                                id: p._id
                            }))
                        }]);
                        
                        // Broadcast join to others
                        broadcast(room, {
                            m: "p",
                            _id: joinUser._id,
                            name: joinUser.name,
                            color: joinUser.color,
                            x: joinUser.x || 0,
                            y: joinUser.y || 0,
                            id: joinUser._id
                        });
                        break;
                        
                    case 'a': // Chat
                        const chatUser = users.get(userId);
                        if (!chatUser || !chatUser.room) return;
                        const chatRoom = rooms.get(chatUser.room);
                        if (!chatRoom) return;
                        broadcast(chatRoom, {
                            m: "a",
                            a: msg.message,
                            p: {
                                _id: chatUser._id,
                                name: chatUser.name,
                                color: chatUser.color
                            }
                        });
                        break;
                        
                    case '+ls': // Room list
                        socket.emit('message', [{
                            m: "ls",
                            c: true,
                            u: Array.from(rooms.values()).filter(room => room.settings.visible).map(room => ({
                                _id: room._id,
                                count: room.count,
                                settings: room.settings,
                                crown: room.crown,
                                ppl: Array.from(room.participants).map(p => ({
                                    _id: p._id,
                                    name: p.name,
                                    color: p.color
                                }))
                            }))
                        }]);
                        break;
                        
                    case 'userset': // Update user
                        const setUser = users.get(userId);
                        if (!setUser || !msg.set) return;
                        if (msg.set.name) setUser.name = msg.set.name;
                        if (msg.set.color) setUser.color = msg.set.color;
                        if (setUser.room) {
                            const userRoom = rooms.get(setUser.room);
                            if (userRoom) {
                                broadcast(userRoom, {
                                    m: "p",
                                    _id: setUser._id,
                                    name: setUser.name,
                                    color: setUser.color,
                                    x: setUser.x || 0,
                                    y: setUser.y || 0,
                                    id: setUser._id
                                });
                            }
                        }
                        break;
                }
            });
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', userId);
        const user = users.get(userId);
        if (user && user.room) {
            const room = rooms.get(user.room);
            if (room) {
                room.participants.delete(user);
                room.count--;
                broadcast(room, {
                    m: "bye",
                    p: userId
                });
            }
        }
        users.delete(userId);
    });
});

// Start server
const PORT = process.env.PORT || 8080;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 