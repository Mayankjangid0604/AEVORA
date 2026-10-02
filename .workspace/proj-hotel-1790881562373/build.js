const fs = require('fs');
const HotelApp = require('./index.js');

const app = new HotelApp();
app.addRoom(101, 'Deluxe', 150);
app.registerGuest('g1', 'Alice', 'alice@example.com');

const artifact = JSON.stringify({
  builtAt: new Date().toISOString(),
  roomsCount: app.rooms.size,
  guestsCount: app.guests.size
});

fs.writeFileSync('dist.bin', artifact);
console.log('Build artifact generated successfully.');
