const Tesseract = require('tesseract.js');

module.exports = async (imageBuffer) => {
  const { data: { text } } = await Tesseract.recognize(
    imageBuffer,
    'fra',
    { logger: m => console.log(m.status) }
  );
  const match = text.match(/(\w+)\s*(\d+)[-\s](\d+)\s*(\w+)/);
  return match ? {
    player1: match[1], 
    player2: match[4],
    score: `${match[2]}-${match[3]}`
  } : null;
};
