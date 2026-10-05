let bookings = [];
let guests = [];

function showTab(tab) {
  document.getElementById('booking-tab').style.display = tab === 'booking' ? 'block' : 'none';
  document.getElementById('guests-tab').style.display = tab === 'guests' ? 'block' : 'none';
  if(tab === 'guests') renderGuests();
}

document.getElementById('booking-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('guest-name').value;
  const room = document.getElementById('room-type').value;
  
  const booking = { id: Date.now(), name, room };
  bookings.push(booking);
  if (!guests.includes(name)) guests.push(name);
  
  document.getElementById('guest-name').value = '';
  renderBookings();
});

function cancelBooking(id) {
  bookings = bookings.filter(b => b.id !== id);
  renderBookings();
}

function renderBookings() {
  const list = document.getElementById('booking-list');
  list.innerHTML = '';
  bookings.forEach(b => {
    const li = document.createElement('li');
    li.innerHTML = `${b.name} - ${b.room} <button onclick="cancelBooking(${b.id})">Cancel</button>`;
    list.appendChild(li);
  });
}

function renderGuests() {
  const list = document.getElementById('guest-list');
  list.innerHTML = '';
  guests.forEach(g => {
    const li = document.createElement('li');
    li.textContent = g;
    list.appendChild(li);
  });
}