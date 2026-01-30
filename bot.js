import { Client, GatewayIntentBits, Collection, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { pathToFileURL } from 'url';
import { handleTwitchEvent } from './services/twitchEventSub.js';
import { checkStreams } from './services/streamManager.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});
client.commands = new Collection();


// ==========================
// Load Commands Recursively
// ==========================
async function loadCommands(dir = './commands') {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Recursively load subfolders
            await loadCommands(fullPath);
        } else if (file.endsWith('.js')) {
            try {
                const command = await import(pathToFileURL(fullPath).href);
                if (command.data && command.execute) {
                    client.commands.set(command.data.name, command);
                    console.log(`[COMMAND] Loaded: ${command.data.name}`);
                } else {
                    console.warn(`[WARN] Missing data or execute: ${fullPath}`);
                }
            } catch (err) {
                console.error(`[ERROR] Failed to load command: ${fullPath}`, err);
            }
        }
    }
}

// ==========================
// Load Cogs
// ==========================
async function loadCogs(dir = './cogs') {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

    for (const file of files) {
        try {
            const cog = await import(pathToFileURL(path.join(dir, file)).href);
            if (cog.default) cog.default(client);
            console.log(`[COG] Loaded: ${file}`);
        } catch (err) {
            console.error(`[ERROR] Failed to load cog: ${file}`, err);
        }
    }
}

// ==========================
// Initialize Bot
// ==========================
(async () => {
    await loadCommands();
    await loadCogs();

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
            const restrictedCommands = ['listallupdates', 'latestupdate', 'set-update-channel', 'allowrole', 'stream-add', 'stream-remove', 'stream-setchannel', 'stream-setrole', 'stream-setgame' ];
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

// Express server
const app = express();
app.use(bodyParser.json());
app.post('/twitch/webhook',(req,res)=>{ handleTwitchEvent(req.body, client); res.status(200).end(); });
app.listen(3000,()=>console.log('Twitch webhook running on port 3000'));

// Bot ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    setInterval(async () => {
        try { await checkStreams(client); } 
        catch(err) { console.error('Stream check failed:', err); }
    }, 60_000);

});

