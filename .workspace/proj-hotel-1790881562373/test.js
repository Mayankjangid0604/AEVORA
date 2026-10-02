const assert = require('assert');
const HotelApp = require('./index.js');

console.log('Running tests...');

const app = new HotelApp();

// Test Room Addition
app.addRoom(101, 'Single', 100);
assert.strictEqual(app.rooms.get(101).type, 'Single');
assert.strictEqual(app.rooms.get(101).status, 'available');

// Test Guest Registration
app.registerGuest('G1', 'John Doe', 'john@example.com');
assert.strictEqual(app.guests.get('G1').name, 'John Doe');

// Test Room Booking
app.bookRoom('B1', 'G1', 101, '2023-11-01', '2023-11-05');
assert.strictEqual(app.rooms.get(101).status, 'booked');
const booking = app.getBooking('B1');
assert.strictEqual(booking.guestId, 'G1');
assert.strictEqual(booking.status, 'confirmed');

// Test Booking Cancellation
app.cancelBooking('B1');
assert.strictEqual(app.rooms.get(101).status, 'available');
assert.strictEqual(app.getBooking('B1').status, 'cancelled');

console.log('All tests passed successfully!');
process.exit(0);
