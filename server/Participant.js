const fs = require('fs');
const path = require('path');

/**
 * TODO: Impliment a system in which users will get their
 * user saved to MongoDB, and users who have not been seen
 * within 7 days will get their userinfo deleted. Similar to how
 * when your IP changes, you're a completely different user.
 */

class Participant {
  constructor(id, name, color) {
    this._id = id;
    this.name = name;
    this.color = color;
    this.room = null;

    // Create database directory if it doesn't exist
    const dbDir = path.join(process.cwd(), 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Create participants.json if it doesn't exist
    const dbFile = path.join(dbDir, 'participants.json');
    if (!fs.existsSync(dbFile)) {
      fs.writeFileSync(dbFile, '{}', 'utf8');
    }

    try {
      this.requestFile();
    } catch (e) {
      console.log('Could not load participant data, using defaults');
    }
  }

  requestFile() {
    const dbFile = path.join(process.cwd(), 'database', 'participants.json');
    try {
      const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      if (data[this._id]) {
        this.name = data[this._id].name;
        this.color = data[this._id].color;
      }
    } catch (e) {
      console.log('Error reading participant data:', e.message);
    }
  }

  updateUser(name) {
    this.name = name;
    this.saveToFile();
  }

  saveToFile() {
    const dbFile = path.join(process.cwd(), 'database', 'participants.json');
    try {
      let data = {};
      if (fs.existsSync(dbFile)) {
        data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      }
      data[this._id] = {
        name: this.name,
        color: this.color
      };
      fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.log('Error saving participant data:', e.message);
    }
  }
}

module.exports = Participant;