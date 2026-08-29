import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import {
  buildPublicPanel,
  getGuildConfig,
  getReviewerRoleIds,
  saveGuildConfig
} from '../../services/officialGuildLeadershipService.js';

const OWNER_ID = process.env.OWNER_ID;

export const data = new SlashCommandBuilder()
  .setName('officialguildapplication')
  .setDescription('Configure and post Official GWR Guild leadership applications')
  .setDefaultMemberPermissions(null)
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup')
      .setDescription('Configure the Official GWR Guild leadership application workflow')
      .addChannelOption(option =>
        option
          .setName('apply_channel')
          .setDescription('Public channel where the application panel will be posted')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName('review_channel')
          .setDescription('Private staff channel where submitted applications are reviewed')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName('ticket_category')
          .setDescription('Category where private applicant channels will be created')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName('reviewer_role')
          .setDescription('Initial GWR Leadership/reviewer role; more can be added afterwards')
          .setRequired(true)
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('reviewer')
      .setDescription('Manage reviewer roles')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add another role that can review Official GWR Guild applications')
          .addRoleOption(option =>
            option
              .setName('role')
              .setDescription('Reviewer role to add')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove a reviewer role')
          .addRoleOption(option =>
            option
              .setName('role')
              .setDescription('Reviewer role to remove')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('List all configured reviewer roles')
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('panel')
      .setDescription('Post the Official GWR Guild application panel in the configured channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('config')
      .setDescription('Show the current Official GWR Guild application configuration')
  );

function isAdmin(interaction) {
  return interaction.user.id === OWNER_ID || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

function reviewerRolesValue(config) {
  const ids = getReviewerRoleIds(config);
  return ids.length ? ids.map(id => `<@&${id}>`).join('\n') : 'None configured';
}

export async function execute(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({
      content: '❌ Only the bot owner or a server administrator can configure Official GWR Guild applications.',
      ephemeral: true
    });
  }

  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'setup' && !group) {
    const applyChannel = interaction.options.getChannel('apply_channel');
    const reviewChannel = interaction.options.getChannel('review_channel');
    const ticketCategory = interaction.options.getChannel('ticket_category');
    const reviewerRole = interaction.options.getRole('reviewer_role');

    const config = saveGuildConfig(interaction.guildId, {
      applyChannelId: applyChannel.id,
      reviewChannelId: reviewChannel.id,
      ticketCategoryId: ticketCategory.id,
      reviewerRoleId: reviewerRole.id,
      reviewerRoleIds: [reviewerRole.id],
      configuredBy: interaction.user.id
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ Official GWR Guild Applications Configured')
      .setDescription('Charles is ready to run the leadership application workflow. Additional reviewer roles can be added with `/officialguildapplication reviewer add`.')
      .addFields(
        { name: 'Public application channel', value: `<#${config.applyChannelId}>`, inline: true },
        { name: 'Staff review channel', value: `<#${config.reviewChannelId}>`, inline: true },
        { name: 'Application ticket category', value: `<#${config.ticketCategoryId}>`, inline: true },
        { name: 'Reviewer roles', value: reviewerRolesValue(config), inline: true }
      )
      .setFooter({ text: 'Next: add reviewer roles if needed, then /officialguildapplication panel' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (group === 'reviewer') {
    const config = getGuildConfig(interaction.guildId) || {};
    const current = getReviewerRoleIds(config);

    if (subcommand === 'list') {
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle('👥 Official GWR Guild Application Reviewers')
        .setDescription(reviewerRolesValue(config));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const role = interaction.options.getRole('role');

    if (subcommand === 'add') {
      if (current.includes(role.id)) {
        return interaction.reply({ content: `${role} is already a reviewer role.`, ephemeral: true });
      }
      const reviewerRoleIds = [...current, role.id];
      const updated = saveGuildConfig(interaction.guildId, { reviewerRoleIds });
      return interaction.reply({
        content: `✅ Added ${role} as an Official GWR Guild application reviewer.\n\n**Configured reviewer roles:**\n${reviewerRolesValue(updated)}`,
        ephemeral: true
      });
    }

    if (subcommand === 'remove') {
      if (!current.includes(role.id)) {
        return interaction.reply({ content: `${role} is not currently a reviewer role.`, ephemeral: true });
      }
      if (current.length === 1) {
        return interaction.reply({
          content: '❌ Charles must keep at least one reviewer role configured. Add another reviewer role before removing this one.',
          ephemeral: true
        });
      }
      const reviewerRoleIds = current.filter(id => id !== role.id);
      const updated = saveGuildConfig(interaction.guildId, {
        reviewerRoleIds,
        reviewerRoleId: config.reviewerRoleId === role.id ? reviewerRoleIds[0] : config.reviewerRoleId
      });
      return interaction.reply({
        content: `✅ Removed ${role} from the Official GWR Guild application reviewers.\n\n**Configured reviewer roles:**\n${reviewerRolesValue(updated)}`,
        ephemeral: true
      });
    }
  }

  const config = getGuildConfig(interaction.guildId);
  if (!config?.applyChannelId || !config?.reviewChannelId || !config?.ticketCategoryId || getReviewerRoleIds(config).length === 0) {
    return interaction.reply({
      content: '❌ Official GWR Guild applications are not fully configured yet. Run `/officialguildapplication setup` first.',
      ephemeral: true
    });
  }

  if (subcommand === 'panel') {
    const channel = await interaction.guild.channels.fetch(config.applyChannelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: '❌ The configured application channel could not be found.', ephemeral: true });
    }

    const message = await channel.send(buildPublicPanel());
    saveGuildConfig(interaction.guildId, {
      panelMessageId: message.id,
      panelPostedBy: interaction.user.id,
      panelPostedAt: new Date().toISOString()
    });

    return interaction.reply({
      content: `✅ Official GWR Guild application panel posted in ${channel}.`,
      ephemeral: true
    });
  }

  if (subcommand === 'config') {
    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle('⚙️ Official GWR Guild Application Configuration')
      .addFields(
        { name: 'Public application channel', value: `<#${config.applyChannelId}>`, inline: true },
        { name: 'Staff review channel', value: `<#${config.reviewChannelId}>`, inline: true },
        { name: 'Application ticket category', value: `<#${config.ticketCategoryId}>`, inline: true },
        { name: 'Reviewer roles', value: reviewerRolesValue(config), inline: false },
        { name: 'Panel posted', value: config.panelMessageId ? 'Yes' : 'Not yet', inline: true }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
