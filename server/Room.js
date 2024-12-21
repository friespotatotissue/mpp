const bgColor = '#206694';
const Chat = require('./Chat.js');
const ParticipantRoom = require('./ParticipantRoom.js');
const crypto = require('crypto');

/**
 * TODO: ONLY ALLOW ONE BLACK MIDI ROOM AT A TIME
 */

class Room {
  constructor(p, server, _id, count, settings = {}) {
    this.server = server;
    this._id = _id;
    this.count = count;
    const isLobby = this._id.toLowerCase() === 'lobby';
    
    this.settings = {
        chat: settings.chat !== undefined ? settings.chat : true,
        color: settings.color || "#3b5054",
        crownsolo: settings.crownsolo !== undefined ? settings.crownsolo : false,
        lobby: isLobby,
        visible: settings.visible !== undefined ? settings.visible : true,
        'no cussing': false,
        black: isLobby ? false : this._id.toLowerCase().includes('black'),
        original: false
    };

    this.crown = null;
    this.ppl = [];
    this.chat = new Chat();
  }
  newParticipant(p) {
    // Check if participant is already in the room
    const existingParticipant = this.ppl.find(pR => pR._id === p._id);
    if (existingParticipant) {
        console.log('Participant already in room:', p._id);
        return existingParticipant;
    }

    this.count++;
    const id = crypto.createHash('sha1')
      .update(Date.now().toString())
      .digest('hex')
      .substring(0, 20);
      
    const pR = new ParticipantRoom(
      id,
      p.name, p.color, p._id
    );
    this.ppl.push(pR);
    console.log('Broadcasting new participant to room members:', {
      roomId: this._id,
      newParticipant: p._id,
      existingParticipants: this.ppl.map(tpR => tpR._id),
      message: {
        m: 'p',
        color: p.color,
        id: pR.id,
        name: p.name,
        _id: p._id
      }
    });
    this.server.broadcastTo({
      m: 'p',
      color: p.color,
      id: pR.id,
      name: p.name,
      x: 0,
      y: 0,
      _id: p._id
    }, this.ppl.map(tpR => tpR._id), [p._id]);
    return pR;
  }
  findParticipant(_id) {
    return this.ppl.find(p => p._id == _id);
  }
  removeParticipant(_id) {
    const pR = this.findParticipant(_id);
    if (!pR) return;
    this.count--;
    this.ppl = this.ppl.filter(p => p._id != _id);
    this.server.broadcastTo({
      m: 'bye',
      p: pR.id
    }, this.ppl.map(tpR => tpR._id));
  }
  update(settings = {}) {
    this.settings = Object.assign(this.settings, {
      chat: settings.chat != null ? settings.chat : this.settings.chat,
      color: settings.color || this.settings.color,
      crownsolo: settings.crownsolo != null ? settings.crownsolo : this.settings.crownsolo,
      visible: settings.visible != null ? settings.visible : this.settings.visible
    });
  }
  generateJSON() {
    const obj = {
      _id: this._id,
      settings: {
        chat: this.settings.chat,
        visible: this.settings.visible,
        color: this.settings.color || "#3b5054",
        crownsolo: this.settings.crownsolo,
        lobby: this.settings.lobby,
        'no cussing': false,
        black: this.settings.black,
        original: this.settings.original
      },
      count: this.count
    };
    if (this.crown) {
      obj.crown = this.crown;
    }
    return obj;
  }
}

module.exports = Room;