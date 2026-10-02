class HotelApp {
  constructor() {
    this.rooms = new Map();
    this.guests = new Map();
    this.bookings = new Map();
  }

  addRoom(roomNumber, type, price) {
    if (this.rooms.has(roomNumber)) {
      throw new Error('Room already exists');
    }
    this.rooms.set(roomNumber, { roomNumber, type, price, status: 'available' });
  }

  registerGuest(guestId, name, email) {
    if (this.guests.has(guestId)) {
      throw new Error('Guest already registered');
    }
    this.guests.set(guestId, { guestId, name, email });
  }

  bookRoom(bookingId, guestId, roomNumber, checkInDate, checkOutDate) {
    if (!this.guests.has(guestId)) {
      throw new Error('Guest not found');
    }
    const room = this.rooms.get(roomNumber);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.status !== 'available') {
      throw new Error('Room is not available');
    }

    room.status = 'booked';
    this.bookings.set(bookingId, {
      bookingId,
      guestId,
      roomNumber,
      checkInDate,
      checkOutDate,
      status: 'confirmed'
    });
    return true;
  }

  cancelBooking(bookingId) {
    const booking = this.bookings.get(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }
    const room = this.rooms.get(booking.roomNumber);
    if (room) {
      room.status = 'available';
    }
    booking.status = 'cancelled';
    return true;
  }

  getBooking(bookingId) {
    return this.bookings.get(bookingId);
  }
}

module.exports = HotelApp;
