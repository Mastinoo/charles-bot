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

  const getJSON = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
  const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

  const tempFactionMap = new Map(); // userId => faction
  const appLocks = new Map(); // applicantId => { by, expires, timeout }

  client.on('interactionCreate', async interaction => {
    try {
      // 1️⃣ Start Application
      if (interaction.isButton() && interaction.customId === 'guild_apply_start') {
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

        return await interaction.reply({ content: 'Choose your faction:', components: [selectRow], ephemeral: true });
      }

      // 2️⃣ Faction Selection
      else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('apply_faction_select_')) {
        const userId = interaction.user.id;
        const faction = interaction.values[0];
        tempFactionMap.set(userId, faction);

        const modal = new ModalBuilder()
          .setCustomId('guild_apply_modal')
          .setTitle('Guild Invite Request');

        const ignInput = new TextInputBuilder()
          .setCustomId('apply_ign')
          .setLabel('Your In-Game Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('apply_description')
          .setLabel('Anything you want to tell us? (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Goals, expectations, etc...');

        modal.addComponents(new ActionRowBuilder().addComponents(ignInput), new ActionRowBuilder().addComponents(descriptionInput));
        return await interaction.showModal(modal);
      }

      // 3️⃣ Modal Submission
      else if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'guild_apply_modal') {
        const userId = interaction.user.id;
        const faction = tempFactionMap.get(userId) || 'neutral';
        tempFactionMap.delete(userId);

        const ign = interaction.fields.getTextInputValue('apply_ign');
        const description = interaction.fields.getTextInputValue('apply_description');

        const cfg = getJSON(CONFIG_FILE)[interaction.guildId];
        if (!cfg || !cfg.reviewChannel || !cfg.factions) {
          return await interaction.reply({ content: '❌ Guild application not set up yet.', ephemeral: true });
        }

        const apps = getJSON(APPS_FILE);
        if (!apps[interaction.guildId]) apps[interaction.guildId] = {};

        const reviewChannel = interaction.guild.channels.cache.get(cfg.reviewChannel);
        if (!reviewChannel) return await interaction.reply({ content: '❌ Review channel not found.', ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('New Guild Invite Request')
          .addFields(
            { name: 'Applicant', value: `<@${userId}>`, inline: true },
            { name: 'IGN', value: ign, inline: true },
            { name: 'Faction', value: faction.charAt(0).toUpperCase() + faction.slice(1), inline: true }
          )
          .setColor('Blue')
          .setTimestamp();

        if (description && description.trim().length > 0) {
          embed.addFields({ name: 'Additional Info', value: description.slice(0, 1024) });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`handle_app_${userId}`).setLabel('Handle Request').setStyle(ButtonStyle.Success)
        );

        const leaderRoleId = cfg.factions[faction] || cfg.factions.neutral;
        await reviewChannel.send({ content: `## <@&${leaderRoleId}> New Invite Request!`, embeds: [embed], components: [row] });

        apps[interaction.guildId][userId] = { ign, faction, description: description || '', handled: false, applicantId: userId };
        saveJSON(APPS_FILE, apps);

        return await interaction.reply({ content: '✅ Your request has been submitted!', ephemeral: true });
      }

      // 4️⃣ Leader Handling
      else if (interaction.isButton() && interaction.customId.startsWith('handle_app_')) {
        const applicantId = interaction.customId.split('_')[2];
        const appsAll = getJSON(APPS_FILE);
        const apps = appsAll[interaction.guildId];
        if (!apps || !apps[applicantId]) return await interaction.reply({ content: '❌ Request not found.', ephemeral: true });

        const app = apps[applicantId];
        if (app.handled) return await interaction.reply({ content: '❌ This request has already been handled.', ephemeral: true });

        const cfg = getJSON(CONFIG_FILE)[interaction.guildId];
        const member = interaction.member;
        const leaderRoles = Object.values(cfg.factions);

        if (!member.roles.cache.some(r => leaderRoles.includes(r.id)) && interaction.user.id !== OWNER_ID) {
          return await interaction.reply({ content: '❌ You do not have permission to handle this request.', ephemeral: true });
        }

        const existingLock = appLocks.get(applicantId);
        const now = Date.now();
        if (existingLock && existingLock.expires > now) {
          return await interaction.reply({ content: `⏳ This request is currently being handled by <@${existingLock.by}>.`, ephemeral: true });
        }

        const expires = now + 2 * 60 * 1000;
        const msg = interaction.message;
        if (msg) {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`handle_app_${applicantId}`).setLabel('Being handled...').setStyle(ButtonStyle.Secondary).setDisabled(true)
          );
          await msg.edit({ components: [disabledRow] });
        }

        const timeout = setTimeout(async () => {
          const lock = appLocks.get(applicantId);
          if (!lock) return;

          const appsCheck = getJSON(APPS_FILE)[interaction.guildId];
          if (appsCheck && appsCheck[applicantId] && !appsCheck[applicantId].handled) {
            try {
              const enabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`handle_app_${applicantId}`).setLabel('Handle Request').setStyle(ButtonStyle.Success)
              );
              await msg.edit({ components: [enabledRow] });
            } catch (e) {
              console.warn('Could not re-enable button:', e);
            }
          }
          appLocks.delete(applicantId);
        }, 2 * 60 * 1000);

        appLocks.set(applicantId, { by: interaction.user.id, expires, timeout });

        const guildRolesData = getJSON(ROLES_FILE)[interaction.guildId] || [];
        if (!guildRolesData.length) return await interaction.reply({ content: '❌ No guild roles available to assign.', ephemeral: true });

        const chunks = [];
        for (let i = 0; i < guildRolesData.length; i += 25) chunks.push(guildRolesData.slice(i, i + 25));
        const actionRows = chunks.map((chunk, idx) => {
          return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`select_guild_${applicantId}_${idx}`)
              .setPlaceholder(`Select guild to invite (part ${idx + 1})`)
              .addOptions(chunk.map(r => ({ label: r.name, value: r.id })))
          );
        });

        return await interaction.reply({ content: 'Select a guild role to assign:', components: actionRows, ephemeral: true });
      }

      // 5️⃣ Guild Selection
      else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_guild_')) {
        const applicantId = interaction.customId.split('_')[2];
        const selectedRoleId = interaction.values[0];

        const apps = getJSON(APPS_FILE)[interaction.guildId];
        if (!apps || !apps[applicantId]) return await interaction.reply({ content: '❌ Request not found.', ephemeral: true });

        const app = apps[applicantId];
        if (app.handled) return await interaction.reply({ content: '❌ Already handled.', ephemeral: true });

        const lock = appLocks.get(applicantId);
        const now = Date.now();
        if (lock && lock.by !== interaction.user.id && lock.expires > now) {
          return await interaction.reply({ content: `⏳ This request is currently being handled by <@${lock.by}>.`, ephemeral: true });
        }

        const applicant = await interaction.guild.members.fetch(applicantId);
        const role = interaction.guild.roles.cache.get(selectedRoleId);
        if (!role) return await interaction.reply({ content: '❌ Role not found.', ephemeral: true });

        await applicant.roles.add(role);

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

            // 🔄 Add reset button for GL/officers
            const resetRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`reset_app_${applicantId}`).setLabel('Reset Request').setStyle(ButtonStyle.Danger)
            );

            await msg.edit({ embeds: [embed], components: [resetRow] });
          }
        }

        app.handled = true;
        if (lock) { clearTimeout(lock.timeout); appLocks.delete(applicantId); }
        // Save the updated app data
        apps[interaction.guildId][applicantId] = app;
        saveJSON(APPS_FILE, apps);

        return await interaction.update({ content: `✅ <@${applicantId}> invited to ${role.name}`, components: [] });
      }

      // 6️⃣ Reset Button
      else if (interaction.isButton() && interaction.customId.startsWith('reset_app_')) {
        const applicantId = interaction.customId.split('_')[2];
        const apps = getJSON(APPS_FILE)[interaction.guildId];
        if (!apps || !apps[applicantId]) return await interaction.reply({ content: '❌ Request not found.', ephemeral: true });

        const app = apps[applicantId];
        if (!app.handled) return await interaction.reply({ content: '❌ Request not yet handled.', ephemeral: true });

        const cfg = getJSON(CONFIG_FILE)[interaction.guildId];
        const member = interaction.member;
        const leaderRoles = Object.values(cfg.factions);
        if (!member.roles.cache.some(r => leaderRoles.includes(r.id)) && interaction.user.id !== OWNER_ID) {
          return await interaction.reply({ content: '❌ You do not have permission to reset this request.', ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`reset_modal_${applicantId}`)
          .setTitle('Reset Guild Request');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reset_reason')
          .setLabel('Reason for reset')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Typo, missing info, etc...');

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return await interaction.showModal(modal);
      }

      // 7️⃣ Reset Modal Submission
      else if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('reset_modal_')) {
        const applicantId = interaction.customId.split('_')[2];
        const reason = interaction.fields.getTextInputValue('reset_reason');

        const apps = getJSON(APPS_FILE)[interaction.guildId];
        if (!apps || !apps[applicantId]) return await interaction.reply({ content: '❌ Request not found.', ephemeral: true });

        const app = apps[applicantId];
        if (!app.handled) return await interaction.reply({ content: '❌ Request not yet handled.', ephemeral: true });

        const applicant = await interaction.guild.members.fetch(applicantId);
        const reviewChannel = interaction.guild.channels.cache.get(getJSON(CONFIG_FILE)[interaction.guildId].reviewChannel);
        if (reviewChannel) {
          const messages = await reviewChannel.messages.fetch({ limit: 100 });
          const msg = messages.find(m => m.embeds[0]?.fields?.some(f => f.value === `<@${applicantId}>`));
          if (msg) {
            const assignedRoleName = msg.embeds[0].fields.find(f => f.name === 'Invited To')?.value;
            const role = interaction.guild.roles.cache.find(r => r.name === assignedRoleName);
            if (role && applicant.roles.cache.has(role.id)) await applicant.roles.remove(role);

            const embed = EmbedBuilder.from(msg.embeds[0])
              .setColor('Orange')
              .addFields(
                { name: 'Reset By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Reason', value: reason }
              );

            await msg.edit({ embeds: [embed], components: [] });
          }
        }

        try { await applicant.send(`Your guild invite request has been reset by <@${interaction.user.id}> due to: ${reason}. Please submit a new request if you wish to apply again.`); } 
        catch { await interaction.followUp({ content: `⚠️ Could not DM <@${applicantId}>.`, ephemeral: true }); }

        app.handled = false;
        saveJSON(APPS_FILE, getJSON(APPS_FILE));
        return await interaction.reply({ content: `✅ Application for <@${applicantId}> has been reset.`, ephemeral: true });
      }

    } catch (err) {
      console.error('Guild Application Cog Error:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Error processing interaction.', ephemeral: true });
      }
    }
  });
};
