const state = { rooms: [], guests: [], bookings: [] };

function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
  if(tabId === 'bookings') updateSelects();
}

document.getElementById('room-form').addEventListener('submit', e => {
  e.preventDefault();
  state.rooms.push({
    id: Date.now(),
    number: document.getElementById('room-no').value,
    type: document.getElementById('room-type').value
  });
  e.target.reset();
  renderRooms();
});

document.getElementById('guest-form').addEventListener('submit', e => {
  e.preventDefault();
  state.guests.push({
    id: Date.now(),
    name: document.getElementById('guest-name').value,
    email: document.getElementById('guest-email').value
  });
  e.target.reset();
  renderGuests();
});

document.getElementById('booking-form').addEventListener('submit', e => {
  e.preventDefault();
  state.bookings.push({
    id: Date.now(),
    guestId: document.getElementById('booking-guest').value,
    roomId: document.getElementById('booking-room').value
  });
  e.target.reset();
  renderBookings();
});

function renderRooms() {
  const list = document.getElementById('room-list');
  list.innerHTML = state.rooms.map(r => `<li>Room ${r.number} (${r.type})</li>`).join('');
}

function renderGuests() {
  const list = document.getElementById('guest-list');
  list.innerHTML = state.guests.map(g => `<li>${g.name} - ${g.email}</li>`).join('');
}

function renderBookings() {
  const list = document.getElementById('booking-list');
  list.innerHTML = state.bookings.map(b => {
    const g = state.guests.find(x => x.id == b.guestId);
    const r = state.rooms.find(x => x.id == b.roomId);
    return `<li>Guest: ${g ? g.name : 'Unknown'} -> Room: ${r ? r.number : 'Unknown'}</li>`;
  }).join('');
}

function updateSelects() {
  document.getElementById('booking-guest').innerHTML = '<option value="">Select Guest</option>' + state.guests.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  document.getElementById('booking-room').innerHTML = '<option value="">Select Room</option>' + state.rooms.map(r => `<option value="${r.id}">Room ${r.number}</option>`).join('');
}