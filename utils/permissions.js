import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const ROLE_FILE = './data/allowedRoles.json';

export function canUseCommand(interaction) {
    const member = interaction.member;

    // Owner override
    if (interaction.user.id === process.env.OWNER_ID) return true;

    // Admin check
    if (member.permissions.has('Administrator')) return true;

    // Role check
    if (fs.existsSync(ROLE_FILE)) {
        const allowedRoles = JSON.parse(fs.readFileSync(ROLE_FILE, 'utf-8'));
        const roleId = allowedRoles[interaction.guildId];
        if (roleId && member.roles.cache.has(roleId)) return true;
    }

    return false;
}

export function setAllowedRole(guildId, roleId) {
    let allowedRoles = {};
    if (fs.existsSync(ROLE_FILE)) allowedRoles = JSON.parse(fs.readFileSync(ROLE_FILE, 'utf-8'));

    allowedRoles[guildId] = roleId;
    fs.writeFileSync(ROLE_FILE, JSON.stringify(allowedRoles, null, 2));
}

export function getAllowedRole(guildId) {
    if (!fs.existsSync(ROLE_FILE)) return null;
    const allowedRoles = JSON.parse(fs.readFileSync(ROLE_FILE, 'utf-8'));
    return allowedRoles[guildId] || null;
}
