import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { EmbedBuilder } from 'discord.js';

const WIKI_URL = 'https://wiki.guildwars.com/wiki/Feedback:Game_updates';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const LAST_UPDATE_FILE = './data/lastUpdate.json';
const CHANNELS_FILE = './data/channels.json';

function sanitizeImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://wiki.guildwars.com' + url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return null;
}

function splitTextIntoChunks(text, maxLength = 4000) {
    if (!text) return [''];
    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLength) {
        let cut = remaining.lastIndexOf('\n', maxLength);
        if (cut === -1) cut = maxLength;
        chunks.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut).trim();
    }

    if (remaining.length) chunks.push(remaining);
    return chunks;
}

export default function guildWarsCog(client) {
    let updateChannels = {};
    let lastPosted = null; // { title, link }
    let isChecking = false;

    // Load channels
    if (fs.existsSync(CHANNELS_FILE)) {
        updateChannels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
    }

    // Load last update
    if (fs.existsSync(LAST_UPDATE_FILE)) {
        lastPosted = JSON.parse(fs.readFileSync(LAST_UPDATE_FILE, 'utf8'));
    }

    async function fetchUpdates() {
        console.log('[GuildWars Cog] Fetching updates from wiki...');
        const res = await fetch(WIKI_URL);
        const html = await res.text();
        const $ = cheerio.load(html);

        const updates = [];

        // This targets the actual update list on the page
        $('.mw-parser-output > ul li').each((_, el) => {
            const linkEl = $(el).find('a').first();
            if (!linkEl.length) return;

            const title = linkEl.text().trim();
            const href = linkEl.attr('href');
            if (!title || !href) return;

            const link = href.startsWith('http')
                ? href
                : 'https://wiki.guildwars.com' + href;

            updates.push({ title, link });
        });

        console.log(`[GuildWars Cog] Found ${updates.length} updates.`);
        return updates;
    }

    async function fetchUpdateDetails(url) {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        const content = [];
        const header = $('h2 .mw-headline').first().closest('h2');
        let el = header.next();

        while (el.length && el[0].tagName !== 'h2') {
            if (el.is('p')) {
                const text = el.text().trim();
                if (text) content.push(text);
            } else if (el.is('ul')) {
                el.find('li').each((_, li) => {
                    content.push(`• ${$(li).text().trim()}`);
                });
            } else if (el.is('h3, h4')) {
                content.push(`\n**${el.text().replace('[edit]', '').trim()}**\n`);
            }
            el = el.next();
        }

        const imageEl = $('.mw-parser-output img').first();
        return {
            description: content.join('\n') || 'No summary available.',
            imageUrl: sanitizeImageUrl(imageEl?.attr('src'))
        };
    }

    async function postUpdate(update) {
        console.log(`[GuildWars Cog] Posting update: ${update.title}`);
        const { description, imageUrl } = await fetchUpdateDetails(update.link);
        const chunks = splitTextIntoChunks(description);

        for (const guildId in updateChannels) {
            const channelId = updateChannels[guildId];
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) continue;

            for (let i = 0; i < chunks.length; i++) {
                const embed = new EmbedBuilder()
                    .setTitle(i === 0 ? update.title : `${update.title} (cont.)`)
                    .setURL(update.link)
                    .setDescription(chunks[i])
                    .setFooter({
                        text: `Date: ${new Date().toLocaleDateString()} | Full patch notes via link above`
                    });

                if (i === 0 && imageUrl) embed.setImage(imageUrl);

                await channel.send({ embeds: [embed] });
                console.log(`[GuildWars Cog] Sent ${i + 1}/${chunks.length} to ${channelId}`);
            }
        }
    }

    async function checkForNewUpdates() {
        if (isChecking) return;
        isChecking = true;

        try {
            console.log('[GuildWars Cog] Checking for new updates...');
            const updates = await fetchUpdates();
            if (!updates.length) return;

            const newest = updates[0];

            // First run: store only, don't spam
            if (!lastPosted) {
                console.log('[GuildWars Cog] Initial run detected, storing latest update only.');
                lastPosted = newest;
                fs.writeFileSync(LAST_UPDATE_FILE, JSON.stringify(lastPosted, null, 2));
                return;
            }

            if (newest.link === lastPosted.link && newest.title === lastPosted.title) {
                console.log('[GuildWars Cog] No new updates.');
                return;
            }

            console.log('[GuildWars Cog] New update detected!');
            await postUpdate(newest);

            lastPosted = newest;
            fs.writeFileSync(LAST_UPDATE_FILE, JSON.stringify(lastPosted, null, 2));
        } catch (err) {
            console.error('[GuildWars Cog] Update check failed:', err);
        } finally {
            isChecking = false;
        }
    }

    client.once('clientReady', async () => {
        console.log('[GuildWars Cog] Loaded and running.');
        await checkForNewUpdates();
        setInterval(checkForNewUpdates, CHECK_INTERVAL);
    });
}
