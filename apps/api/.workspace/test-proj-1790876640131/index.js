function hasX(str) {
  return typeof str === 'string' && (str.includes('X') || str.includes('x'));
}

module.exports = { hasX };