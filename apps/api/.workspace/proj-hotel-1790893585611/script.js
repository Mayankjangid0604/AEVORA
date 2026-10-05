const rooms = [];
const guests = [];

function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
}

document.getElementById('roomForm').addEventListener('submit', e => {
  e.preventDefault();
  const num = document.getElementById('roomNum').value;
  const type = document.getElementById('roomType').value;
  rooms.push({ num, type });
  renderRooms();
  e.target.reset();
});

document.getElementById('guestForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('guestName').value;
  const room = document.getElementById('guestRoom').value;
  guests.push({ name, room });
  renderGuests();
  e.target.reset();
});

function renderRooms() {
  const list = document.getElementById('roomList');
  list.innerHTML = rooms.map(r => `<li>Room ${r.num} (${r.type})</li>`).join('');
}

function renderGuests() {
  const list = document.getElementById('guestList');
  list.innerHTML = guests.map(g => `<li>${g.name} - Room ${g.room}</li>`).join('');
}