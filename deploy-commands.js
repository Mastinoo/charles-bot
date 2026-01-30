import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const commands = [];

// Recursive function to get all command files
async function getCommandFiles(dir = './commands') {
    const files = fs.readdirSync(dir);
    let commandFiles = [];

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            const subFiles = await getCommandFiles(fullPath);
            commandFiles = commandFiles.concat(subFiles);
        } else if (file.endsWith('.js')) {
            commandFiles.push(fullPath);
        }
    }

    return commandFiles;
}

const commandFiles = await getCommandFiles();

for (const file of commandFiles) {
    try {
        const command = await import(pathToFileURL(file).href);
        if (command.data) commands.push(command.data.toJSON());
    } catch (err) {
        console.error(`Failed to load command ${file}:`, err);
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Deploying ${commands.length} commands...`);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ Commands deployed.');
    } catch (err) {
        console.error(err);
    }
})();
