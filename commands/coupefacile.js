const { takeScreenshot } = require('../lib/coupefacile/scraper');
const { extractScore } = require('../lib/coupefacile/ocr');

module.exports = {
  command: 'coupefacile',
  description: 'Gestion Coupe Facile',
  async execute(message, client) {
    const [cmd, ...args] = message.body.split(' ');
    switch(cmd) {
      case '!score':
        const media = await message.downloadMedia();
        const scoreData = await extractScore(Buffer.from(media.data, 'base64'));
        if (scoreData) {
          await client.sendMessage(message.from, `✅ Score enregistré : ${scoreData.player1} ${scoreData.score} ${scoreData.player2}`);
        }
        break;
      case '!classement':
        const screenshot = await takeScreenshot(process.env.COUPE_FACILE_URL, '.ranking');
        await client.sendMessage(message.from, { image: screenshot });
        break;
    }
  }
};
