function hasX(str) {
  return typeof str === 'string' && str.toUpperCase().includes('X');
}

module.exports = { hasX };