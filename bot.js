import { Client, GatewayIntentBits, Collection, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
dotenv.config();

import { handleTwitchEvent } from './services/twitchEventSub.js';
import { subscribeTwitchStreamer } from './services/twitchSubscribe.js';
import { checkStreams } from './services/streamManager.js';
import db from './database.js';

// ==========================
// Create Discord client
// ==========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});
client.commands = new Collection();

// ==========================
// Load commands recursively
// ==========================
async function loadCommands(dir = './commands') {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
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
// Load cogs
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
// Initialize bot
// ==========================
(async () => {
    await loadCommands();
    await loadCogs();
    client.login(process.env.DISCORD_TOKEN);
})();

// ==========================
// Interaction listener
// ==========================
client.on('interactionCreate', async interaction => {
    try {
        const ownerId = process.env.OWNER_ID;

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            const restrictedCommands = [
                'listallupdates', 'latestupdate', 'set-update-channel', 'allowrole',
                'stream-add', 'stream-remove', 'stream-setchannel', 'stream-setrole', 'stream-setgame'
            ];

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
        else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command || !command.autocomplete) return;
            await command.autocomplete(interaction);
        }
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

// ==========================
// Express server for Twitch
// ==========================
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.all('/twitch/webhook', async (req, res) => {
    if (req.method === 'GET') {
    const challenge = req.query['hub.challenge'];
    if (challenge) {
        console.log('✅ Twitch verification challenge received:', challenge);
        // Make sure response is plain text
        res.set('Content-Type', 'text/plain');
        return res.status(200).send(challenge);
    }
    return res.status(400).send('Missing hub.challenge');
    } else if (req.method === 'POST') {
        // Normal webhook payloads
        handleTwitchEvent(req.body, client);
        return res.status(200).end();
    } else {
        return res.status(405).send('Method Not Allowed');
    }
});

app.listen(3000, () => console.log('🌐 Twitch webhook running on port 3000'));

// ==========================
// Bot ready
// ==========================
client.once('clientReady', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);

    // Poll YouTube/Kick every 60s
    setInterval(async () => {
        try { await checkStreams(client); } 
        catch(err) { console.error('Stream check failed:', err); }
    }, 60_000);

    // 🔁 Auto-resubscribe Twitch streamers
    const twitchStreamers = db.prepare(
        "SELECT platformUserId FROM streamers WHERE platform='twitch'"
    ).all();

    console.log(`🔁 Resubscribing ${twitchStreamers.length} Twitch streamers...`);
    for (const s of twitchStreamers) {
        await subscribeTwitchStreamer(s.platformUserId);
    }
});


