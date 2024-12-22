const CLI = require('./CLI.js');
const Participant = require('./Participant.js');
const Room = require('./Room.js');
const Socket = require('./Socket.js');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

class Server {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        
        // Serve static files - update paths
        this.app.use(express.static(__dirname + '/../'));
        this.app.use('/piano', express.static(__dirname + '/../'));

        // Handle all piano routes
        this.app.get('/', (req, res) => {
            res.redirect('/piano/lobby');
        });

        this.app.get('/piano', (req, res) => {
            res.redirect('/piano/lobby');
        });

        this.app.get('/piano/lobby', (req, res) => {
            res.sendFile('index.html', { root: __dirname + '/../' });
        });

        this.app.get('/piano/*', (req, res) => {
            res.redirect('/piano/lobby');
        });

        // Add CORS headers
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.header('Pragma', 'no-cache');
            res.header('Expires', '0');
            next();
        });

        // Create WebSocket server
        this.wss = new WebSocket.Server({ 
            server: this.server,
            path: '/',
            perMessageDeflate: false,
            clientTracking: true,
            handleProtocols: () => 'websocket'
        });
        
        this.cli = new CLI(this);
        console.log('Server Launched');
        this.sockets = new Set();
        this.participants = new Map();
        this.rooms = new Map();

        // Create initial lobby
        const lobbyRoom = new Room(null, this, 'lobby', 0, {
            visible: true,
            chat: true,
            crownsolo: false,
            color: "#3b5054",
            lobby: true,
            'no cussing': false,
            black: false,
            original: false
        });
        this.rooms.set('lobby', lobbyRoom);
        console.log('Created lobby room');

        // Handle WebSocket connections
        this.wss.on('connection', (ws, req) => {
            console.log('New WebSocket connection');
            
            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });

            const socket = new Socket(this, ws, req);
            console.log('Client connected:', socket.id);
            this.sockets.add(socket);
            
            setTimeout(() => {
                socket.sendObject({
                    m: "connected"
                });
            }, 100);
        });

        // Start server
        this.server.listen(8080, '0.0.0.0', () => {
            console.log('Server running on port 8080');
        });

        // Keep-alive ping
        const pingInterval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    console.log('Terminating inactive client');
                    return ws.terminate();
                }
                ws.isAlive = false;
                try {
                    ws.ping(() => {});
                } catch (e) {
                    console.error('Error sending ping:', e);
                }
            });
        }, 10000);

        this.server.on('close', () => {
            clearInterval(pingInterval);
        });
    }

    removeTextHell(text) {
        return text.replace(/[^\w\s`1234567890\-=~!@#$%^&*()_+,.\/<>?\[\]\\\{}|;':"]/g, '');
    }

    broadcast(item, ignore = []) {
        this.sockets.forEach(s => {
            if (ignore.includes(s.id)) return;
            if (Array.isArray(item)) return s.sendArray(item);
            else return s.sendObject(item);
        });
    }

    broadcastTo(item, ppl, ignore = []) {
        this.sockets.forEach(s => {
            const participant = this.getParticipant(s);
            if (!participant) return;
            
            // Check if this participant should receive the message
            if (!ppl.includes(participant._id) || ignore.includes(participant._id)) return;
            
            if (Array.isArray(item)) {
                s.sendArray(item);
            } else {
                s.sendObject(item);
            }
        });
    }

    handleData(s, data) {
        if (!data || !data.hasOwnProperty('m')) return;
        console.log('Processing message:', data.m, data);

        if (data.m == 'hi') {
            console.log('Handling hi message from client:', s.id);
            
            // Check if participant already exists
            let p = this.getParticipant(s);
            if (p) {
                console.log('Participant already exists, cleaning up old state:', p._id);
                // Clean up old room if any
                if (p.room) {
                    const oldRoom = this.getRoom(p.room);
                    if (oldRoom) {
                        oldRoom.removeParticipant(p._id);
                    }
                }
            }
            
            // Create new participant
            p = this.newParticipant(s);
            console.log('Created new participant:', p._id);
            
            const serverTime = Date.now();
            
            // Send hi response
            s.sendObject({
                m: 'hi',
                u: {
                    _id: p._id,
                    name: p.name,
                    color: p.color,
                    x: 0,
                    y: 0
                },
                t: serverTime,
                token: p._id,
                permissions: {},
                accountInfo: {
                    type: 0
                }
            });

            // Send channel list
            s.sendObject({
                m: 'ls',
                c: true,
                u: Array.from(this.rooms.values()).map(r => r.generateJSON())
            });

            return;
        }

        if (data.m == 'ch') {
            const p = this.getParticipant(s);
            if (!p) {
                console.log('No participant found for socket:', s.id);
                return;
            }

            const roomId = data._id || 'lobby';
            console.log('Joining room:', roomId);
            
            // Don't rejoin the same room
            if (p.room === roomId && this.getRoom(roomId).findParticipant(p._id)) {
                console.log('Already in room:', roomId);
                return;
            }

            let r = this.getRoom(roomId);
            if (!r) {
                r = new Room(p, this, roomId, 0, {
                    visible: true,
                    chat: true,
                    crownsolo: false,
                    color: "#3b5054",
                    lobby: roomId === 'lobby',
                    'no cussing': false,
                    black: roomId.toLowerCase().includes('black'),
                    original: false
                });
                this.rooms.set(roomId, r);
            }

            // Remove from old room if any
            if (p.room && p.room !== roomId) {
                const oldRoom = this.getRoom(p.room);
                if (oldRoom) {
                    oldRoom.removeParticipant(p._id);
                }
            }

            // Join new room
            p.room = roomId;
            const pR = r.findParticipant(p._id) || r.newParticipant(p);

            // Send note quota based on room type
            const serverTime = Date.now();
            s.sendObject({
                m: 'nq',
                allowance: r.settings.black ? 8000 : 200,
                max: r.settings.black ? 24000 : 600,
                histLen: r.settings.black ? 3 : 0,
                t: serverTime
            });

            // Send channel join confirmation
            const joinResponse = {
                m: 'ch',
                ch: {
                    _id: r._id,
                    settings: r.settings,
                    count: r.count,
                    crown: r.crown
                },
                p: pR.id,
                ppl: r.ppl.map(p => ({
                    _id: p._id,
                    name: p.name,
                    color: p.color,
                    id: p.id,
                    x: p.x || 0,
                    y: p.y || 0
                }))
            };
            console.log('Sending join response:', joinResponse);
            s.sendObject(joinResponse);

            return;
        }

        // For other messages, make sure we have a valid participant
        const p = this.getParticipant(s);
        if (!p) {
            console.log('No participant found for socket:', s.id);
            return;
        }

        if (data.m == 'chset') {
            if (data.set.name) {
                if (data.set.name.length > 250 || !data.set.name.replace(/\s/g, '')) data.set.name = 'Invalid';
                p.updateUser(this.removeTextHell(data.set.name));
            }
            const r = this.getRoom(p.room);
            if (!r) return;
            const pR = r.findParticipant(p._id);
            if (!pR) return;
            pR.updateUser(data.set.name || 'Anonymous');
            return this.broadcastTo({
                m: 'p',
                color: p.color,
                id: pR.id,
                name: p.name,
                _id: p._id
            }, r.ppl.map(tpR => tpR._id));
        }
        if (data.m == 't') {
            return s.sendObject({
                m: 't',
                t: Date.now(),
                echo: data.e - Date.now()
            });
        }
    }

    newParticipant(s) {
        try {
            const p = new Participant(
                s.id,
                'Anonymous',
                `#${Math.floor(Math.random() * 16777215).toString(16)}`
            );
            console.log('Creating new participant:', s.id, p._id);
            this.participants.set(s.id, p);
            return p;
        } catch (e) {
            console.error('Error creating participant:', e);
            return null;
        }
    }

    getParticipant(s) {
        return this.participants.get(s.id);
    }

    newRoom(data, p) {
        const room = new Room(p, this, data._id, 0, data.set);
        this.rooms.set(room._id, room);
        return room;
    }

    getRoom(id) {
        return this.rooms.get(id);
    }
}

module.exports = Server;