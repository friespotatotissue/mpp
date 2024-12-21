class Socket {
    constructor(server, ws, req) {
        this.server = server;
        this.ws = ws;
        this.req = req;
        this.id = Math.random().toString(36).substring(2, 9);
        this.isAlive = true;
        this.connected = false;
        this.lastMessageTime = Date.now();
        this.reconnectAttempts = 0;
        this.cleanedUp = false;

        console.log('New socket created:', this.id);
        this.bindEventListeners();
    }

    bindEventListeners() {
        this.ws.on('message', (msg) => {
            try {
                const data = JSON.parse(msg);
                console.log('Received message from', this.id, ':', msg.toString());
                
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        if (item && typeof item === 'object') {
                            this.server.handleData(this, item);
                        }
                    });
                } else if (data && typeof data === 'object') {
                    this.server.handleData(this, data);
                }
                
                this.reconnectAttempts = 0;
                this.lastMessageTime = Date.now();
            } catch (e) {
                console.error('Error processing message:', e);
            }
        });

        this.ws.on('error', (error) => {
            console.error('Socket error for', this.id, ':', error);
            this.cleanup();
        });

        this.ws.on('close', () => {
            console.log('Socket closed for:', this.id);
            this.connected = false;
            this.cleanup();
        });

        this.ws.on('pong', () => {
            this.isAlive = true;
            this.lastMessageTime = Date.now();
        });
    }

    cleanup() {
        if (this.cleanedUp) return;
        this.cleanedUp = true;

        const participant = this.server.getParticipant(this);
        if (participant) {
            if (participant.room) {
                const room = this.server.getRoom(participant.room);
                if (room) {
                    room.removeParticipant(participant._id);
                    console.log('Removed participant from room:', participant._id, room._id);
                }
            }
            this.server.participants.delete(this.id);
            console.log('Removed participant:', this.id);
        }
        this.server.sockets.delete(this);
        console.log('Removed socket:', this.id);
    }

    sendObject(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('Cannot send to socket', this.id, '- not open');
            return;
        }
        try {
            const message = JSON.stringify([obj]);
            console.log('Sending message to client:', {
                socketId: this.id,
                messageType: obj.m,
                fullMessage: message
            });
            this.ws.send(message);
        } catch (e) {
            console.error('Error sending to', this.id, ':', e);
            this.cleanup();
        }
    }
}

module.exports = Socket; 