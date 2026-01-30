import { Client, GatewayIntentBits, Collection, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load commands and cogs
(async () => {
    // Commands
    const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = await import(`./commands/${file}`);
        client.commands.set(command.data.name, command);
    }

    // Cogs
    const cogFiles = fs.readdirSync('./cogs').filter(f => f.endsWith('.js'));
    for (const file of cogFiles) {
        const cog = await import(`./cogs/${file}`);
        cog.default(client);
    }

    client.login(process.env.DISCORD_TOKEN);
})();

// Unified interaction listener
client.on('interactionCreate', async interaction => {
    try {
        const ownerId = process.env.OWNER_ID;

        // Slash commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            // Permission check for restricted commands
            const restrictedCommands = ['listallupdates', 'latestupdate', 'set-update-channel', 'allowrole'];
            if (restrictedCommands.includes(command.data.name)) {
                const allowedRoles = fs.existsSync('./data/allowedRoles.json')
                    ? JSON.parse(fs.readFileSync('./data/allowedRoles.json', 'utf-8'))
                    : {};
                const guildRoles = allowedRoles[interaction.guildId] || [];

                const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
                const hasRole = interaction.member.roles.cache.some(r => guildRoles.includes(r.id));
                if (interaction.user.id !== ownerId && !isAdmin && !hasRole) {
                    return await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
                }
            }

            await command.execute(interaction, client);
        }

        // Autocomplete for channels/roles
        else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command || !command.autocomplete) return;

            await command.autocomplete(interaction);
        }

        // Buttons / select menus (if any future feature)
        else if (interaction.isButton() || interaction.isStringSelectMenu()) {
            const command = client.commands.get('set-update-channel'); // example handler
            if (command?.handleSelect) await command.handleSelect(interaction);
        }
    } catch (err) {
        console.error(err);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ There was an error processing your interaction.', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ There was an error processing your interaction.', ephemeral: true });
        }
    }
});

// Bot ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});
