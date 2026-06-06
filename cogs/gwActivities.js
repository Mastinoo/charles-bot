import { startGwActivitiesScheduler } from '../services/gwActivitiesService.js';

export default function gwActivitiesCog(client) {
  client.once('clientReady', () => {
    console.log('[GW Activities] Scheduler loaded.');
    startGwActivitiesScheduler(client);
  });
}
