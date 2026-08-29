import { handleRevivalMessage } from '../services/revivalRankService.js';

export default function revivalRanksCog(client) {
  client.on('messageCreate', async message => {
    try {
      await handleRevivalMessage(message);
    } catch (error) {
      console.error('[REVIVAL] messageCreate handler failed:', error);
    }
  });
}
