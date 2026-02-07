import {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  InteractionType
} from 'discord.js';
import fs from 'fs';

const CONFIG_FILE = './data/guildApplyConfig.json';
const ROLES_FILE = './data/guildRoles.json';
const APPS_FILE = './data/guildApplications.json';
const OWNER_ID = process.env.OWNER_ID;

export default (client = new Client()) => {

  // Load or create JSONs
  const getJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
  const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

  // Temporary map to store faction before modal submission
  const tempFactionMap = new Map(); // userId => faction

  client.on('interactionCreate', async interaction => {
    try {
      // 1️⃣ Button: Start application
      if (interaction.isButton() && interaction.customId === 'guild_apply_start') {

        // Send ephemeral select menu for faction
        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`apply_faction_select_${interaction.user.id}`)
            .setPlaceholder('Select your faction')
            .addOptions([
              { label: 'Kurzick', value: 'kurzick' },
              { label: 'Luxon', value: 'luxon' },
              { label: 'No Preference', value: 'neutral' }
            ])
        );

        await interaction.reply({
          content: 'Choose your faction:',
          components: [selectRow],
          ephemeral: true
        });
      }

      // 2️⃣ Faction selection
      else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('apply_faction_select_')) {
        const userId = interaction.user.id;
        const faction = interaction.values[0];

        tempFactionMap.set(userId, faction);

        // Show modal for in-game name
        const modal = new ModalBuilder()
          .setCustomId('guild_apply_modal')
          .setTitle('Guild Application');

        const ignInput = new TextInputBuilder()
          .setCustomId('apply_ign')
          .setLabel('Your In-Game Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(ignInput));
        await interaction.showModal(modal);
      }

      // 3️⃣ Modal submission: User application
      else if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'guild_apply_modal') {
        const userId = interaction.user.id;
        const faction = tempFactionMap.get(userId) || 'neutral'; // fallback to neutral
        tempFactionMap.delete(userId);

        const ign = interaction.fields.getTextInputValue('apply_ign');

        const cfg = getJSON(CONFIG_FILE)[interaction.guildId];
        if (!cfg || !cfg.reviewChannel || !cfg.factions) {
          return interaction.reply({ content: '❌ Guild application not set up yet.', ephemeral: true });
        }

        const apps = getJSON(APPS_FILE);
        if (!apps[interaction.guildId]) apps[interaction.guildId] = {};

        const reviewChannel = interaction.guild.channels.cache.get(cfg.reviewChannel);
        if (!reviewChannel) return interaction.reply({ content: '❌ Review channel not found.', ephemeral: true });

        // Embed for review
        const embed = new EmbedBuilder()
          .setTitle('New Guild Application')
          .addFields(
            { name: 'Applicant', value: `<@${userId}>`, inline: true },
            { name: 'IGN', value: ign, inline: true },
            { name: 'Faction', value: faction.charAt(0).toUpperCase() + faction.slice(1), inline: true }
          )
          .setColor('Blue')
          .setTimestamp();

        // Button for leaders
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`handle_app_${userId}`)
            .setLabel('Handle Request')
            .setStyle(ButtonStyle.Success)
        );

        // Ping correct leader role
        const leaderRoleId = cfg.factions[faction] || cfg.factions.neutral;
        await reviewChannel.send({ content: `<@&${leaderRoleId}> New application!`, embeds: [embed], components: [row] });

        // Save application for locking
        apps[interaction.guildId][userId] = {
          ign, faction, handled: false, applicantId: userId
        };
        saveJSON(APPS_FILE, apps);

        await interaction.reply({ content: '✅ Your application has been submitted!', ephemeral: true });
      }

      // 4️⃣ Leader handling button
      else if (interaction.isButton() && interaction.customId.startsWith('handle_app_')) {
        const applicantId = interaction.customId.split('_')[2];
        const apps = getJSON(APPS_FILE)[interaction.guildId];
        if (!apps || !apps[applicantId]) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });

        const app = apps[applicantId];
        if (app.handled) return interaction.reply({ content: '❌ This application has already been handled.', ephemeral: true });

        const cfg = getJSON(CONFIG_FILE)[interaction.guildId];
        const member = interaction.member;

        // Check if member is one of the faction leaders or OWNER
        const leaderRoles = Object.values(cfg.factions);
        if (!member.roles.cache.some(r => leaderRoles.includes(r.id)) && interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: '❌ You do not have permission to handle this application.', ephemeral: true });
        }

        // Show select menu with available guild roles
        const guildRolesData = getJSON(ROLES_FILE)[interaction.guildId] || [];
        if (guildRolesData.length === 0) return interaction.reply({ content: '❌ No guild roles available to assign.', ephemeral: true });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`select_guild_${applicantId}`)
          .setPlaceholder('Select guild to invite')
          .addOptions(guildRolesData.map(r => ({ label: r.name, value: r.id })));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ content: 'Select a guild role to assign:', components: [row], ephemeral: true });
      }

      // 5️⃣ Guild selection
      else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_guild_')) {
        const applicantId = interaction.customId.split('_')[2];
        const selectedRoleId = interaction.values[0];

        const apps = getJSON(APPS_FILE)[interaction.guildId];
        if (!apps || !apps[applicantId]) return interaction.reply({ content: '❌ Application not found.', ephemeral: true });

        const app = apps[applicantId];
        if (app.handled) return interaction.reply({ content: '❌ Already handled.', ephemeral: true });

        const applicant = await interaction.guild.members.fetch(applicantId);
        const role = interaction.guild.roles.cache.get(selectedRoleId);
        if (!role) return interaction.reply({ content: '❌ Role not found.', ephemeral: true });

        // Give role to applicant
        await applicant.roles.add(role);

        // Update embed in review channel
        const cfg = getJSON(CONFIG_FILE)[interaction.guildId];
        const reviewChannel = interaction.guild.channels.cache.get(cfg.reviewChannel);
        if (reviewChannel) {
          const messages = await reviewChannel.messages.fetch({ limit: 100 });
          const msg = messages.find(m => m.embeds[0]?.fields?.some(f => f.value === `<@${applicantId}>`));
          if (msg) {
            const embed = EmbedBuilder.from(msg.embeds[0])
              .setColor('Green')
              .addFields({ name: 'Handled By', value: `<@${interaction.user.id}>`, inline: true })
              .addFields({ name: 'Invited To', value: role.name, inline: true });
            await msg.edit({ embeds: [embed], components: [] });
          }
        }

        // Lock application
        app.handled = true;
        saveJSON(APPS_FILE, getJSON(APPS_FILE));

        await interaction.update({ content: `✅ <@${applicantId}> invited to ${role.name}`, components: [] });
      }

    } catch (err) {
      console.error('Guild Application Cog Error:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Error processing interaction.', ephemeral: true });
      }
    }
  });
};
