const state = { rooms: [], guests: [], bookings: [] };

function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
  if(tabId === 'bookings') updateSelects();
}

document.getElementById('roomForm').addEventListener('submit', e => {
  e.preventDefault();
  state.rooms.push({ id: Date.now(), num: document.getElementById('roomNum').value, type: document.getElementById('roomType').value });
  e.target.reset();
  renderRooms();
});

document.getElementById('guestForm').addEventListener('submit', e => {
  e.preventDefault();
  state.guests.push({ id: Date.now(), name: document.getElementById('guestName').value, email: document.getElementById('guestEmail').value });
  e.target.reset();
  renderGuests();
});

document.getElementById('bookingForm').addEventListener('submit', e => {
  e.preventDefault();
  state.bookings.push({ id: Date.now(), guestId: document.getElementById('bookGuest').value, roomId: document.getElementById('bookRoom').value });
  e.target.reset();
  renderBookings();
});

function renderRooms() {
  const list = document.getElementById('roomList');
  list.innerHTML = state.rooms.map(r => `<li>Room ${r.num} (${r.type}) <button onclick="removeItem('rooms', ${r.id})">Delete</button></li>`).join('');
}

function renderGuests() {
  const list = document.getElementById('guestList');
  list.innerHTML = state.guests.map(g => `<li>${g.name} - ${g.email} <button onclick="removeItem('guests', ${g.id})">Delete</button></li>`).join('');
}

function renderBookings() {
  const list = document.getElementById('bookingList');
  list.innerHTML = state.bookings.map(b => {
    const g = state.guests.find(x => x.id == b.guestId);
    const r = state.rooms.find(x => x.id == b.roomId);
    return `<li>Guest: ${g ? g.name : 'Unknown'} | Room: ${r ? r.num : 'Unknown'} <button onclick="removeItem('bookings', ${b.id})">Cancel</button></li>`;
  }).join('');
}

function updateSelects() {
  document.getElementById('bookGuest').innerHTML = '<option value="">Select Guest</option>' + state.guests.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  document.getElementById('bookRoom').innerHTML = '<option value="">Select Room</option>' + state.rooms.map(r => `<option value="${r.id}">Room ${r.num}</option>`).join('');
}

function removeItem(type, id) {
  state[type] = state[type].filter(item => item.id !== id);
  if(type === 'rooms') renderRooms();
  if(type === 'guests') renderGuests();
  if(type === 'bookings') renderBookings();
}