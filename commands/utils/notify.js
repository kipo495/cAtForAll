const { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const DATA_PATH = path.join(__dirname, '../../data/notify.json');

function loadNotifyConfig() {
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[notify] データ読み込み失敗', e);
        return {};
    }
}

function saveNotifyConfig(config) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function getNotifyChannelId(guildId, commandName) {
    const config = loadNotifyConfig();
    return config[guildId]?.[commandName] ?? null;
}

module.exports = {
    getNotifyChannelId,
    data: new SlashCommandBuilder()
        .setName('notify')
        .setDescription('コマンドの通知先チャンネルを設定します。')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('command')
                .setDescription('対象のコマンド')
                .setRequired(true)
                .addChoices(
                    { name: 'alarm', value: 'alarm' },
                    { name: 'alert', value: 'alert' },
                )
        )
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('通知先チャンネル')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),
    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'このコマンドはサーバー管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
            return;
        }

        const targetCommand = interaction.options.getString('command');
        const targetChannel = interaction.options.getChannel('channel');

        const config = loadNotifyConfig();
        if (!config[interaction.guildId]) {
            config[interaction.guildId] = {};
        }

        config[interaction.guildId][targetCommand] = targetChannel.id;
        saveNotifyConfig(config);

        await interaction.reply({
            content: `**/${targetCommand}** の通知先を <#${targetChannel.id}> に設定しました。`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
