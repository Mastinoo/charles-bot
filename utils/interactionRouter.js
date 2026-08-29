/**
 * Small reusable router for Discord component/modal interactions.
 *
 * Cogs register a matcher + handler instead of each attaching their own
 * interactionCreate listener. The first matching route owns the interaction.
 */
export function createInteractionRouter(client) {
  if (client.interactionRouter) return client.interactionRouter;

  const routes = [];

  const router = {
    register(name, match, handle) {
      if (!name || typeof match !== 'function' || typeof handle !== 'function') {
        throw new TypeError('Interaction routes require name, match, and handle.');
      }
      routes.push({ name, match, handle });
      return () => {
        const index = routes.findIndex(route => route.name === name && route.handle === handle);
        if (index !== -1) routes.splice(index, 1);
      };
    },

    async dispatch(interaction) {
      if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())) {
        return false;
      }

      for (const route of routes) {
        let matched = false;
        try {
          matched = await route.match(interaction);
        } catch (error) {
          console.error(`[INTERACTION ROUTER] Matcher failed for ${route.name}:`, error);
          continue;
        }

        if (!matched) continue;

        try {
          await route.handle(interaction);
        } catch (error) {
          console.error(`[INTERACTION ROUTER] Handler failed for ${route.name}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ There was an error processing this interaction.',
              ephemeral: true
            }).catch(() => {});
          } else {
            await interaction.followUp({
              content: '❌ There was an error processing this interaction.',
              ephemeral: true
            }).catch(() => {});
          }
        }
        return true;
      }

      return false;
    },

    getRoutes() {
      return routes.map(route => route.name);
    }
  };

  client.interactionRouter = router;
  return router;
}
