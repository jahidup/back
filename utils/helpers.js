const { v4: uuidv4 } = require('uuid');

function generateToken() {
  return uuidv4().replace(/-/g, '').substring(0, 16);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { generateToken, shuffleArray };
