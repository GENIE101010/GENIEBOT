+ const coupefacile = require('../commands/coupefacile');

module.exports = async (message, client) => {
  // ... existant ...
  if (message.body.startsWith('!score') || message.body.startsWith('!classement')) {
    await coupefacile.execute(message, client);
  }
};
