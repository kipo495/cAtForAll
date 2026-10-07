const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { bumpBotUserId } = require('../../config.json');
const { getNotifyChannelId } = require('./notify');

const DATA_PATH = path.join(__dirname, '../../data/alert.json');
const BUMP_DELAY_MS = 2 * 60 * 60 * 1000;

const activeTimers = new Map();

function loadAlertConfig() {
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[alert] 設定読み込み失敗', e);
        return {};
    }
}

function saveAlertConfig(config) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function isAlertEnabled(guildId, trigger = 'bump') {
    const config = loadAlertConfig();
    return Boolean(config[guildId]?.[trigger]);
}

async function checkBumpStatus(client, guildId) {
    if (!isAlertEnabled(guildId, 'bump')) return;

    const channelId = getNotifyChannelId(guildId, 'alert');
    if (!channelId) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased()) return;

        const messages = await channel.messages.fetch({ limit: 50 });
        const targetBotIds = Array.isArray(bumpBotUserId) ? bumpBotUserId : [bumpBotUserId];

        let lastBumpMessage = null;
        let lastBotNoticeTime = 0;

        for (const msg of messages.values()) {
            if (targetBotIds.includes(msg.author.id)) {
                if (!lastBumpMessage || msg.createdTimestamp > lastBumpMessage.createdTimestamp) {
                    lastBumpMessage = msg;
                }
            } else if (msg.author.id === client.user.id && msg.content.includes('Bumpから2時間経過しました')) {
                if (msg.createdTimestamp > lastBotNoticeTime) {
                    lastBotNoticeTime = msg.createdTimestamp;
                }
            }
        }

        if (!lastBumpMessage) return;

        if (lastBotNoticeTime > lastBumpMessage.createdTimestamp) {
            return;
        }

        const elapsed = Date.now() - lastBumpMessage.createdTimestamp;
        const previousTimer = activeTimers.get(guildId);
        if (previousTimer) {
            clearTimeout(previousTimer);
            activeTimers.delete(guildId);
        }

        if (elapsed >= BUMP_DELAY_MS) {
            await channel.send('Bumpから2時間経過しました。再度Bumpできます。');
        } else {
            const remaining = BUMP_DELAY_MS - elapsed;
            const timer = setTimeout(async () => {
                activeTimers.delete(guildId);
                try {
                    await channel.send('Bumpから2時間経過しました。再度Bumpできます。');
                } catch (err) {
                    console.error(`[alert] Bump通知送信エラー: guild=${guildId}`, err);
                }
            }, remaining);
            activeTimers.set(guildId, timer);
        }
    } catch (e) {
        console.error(`[alert] Bump履歴確認エラー: guild=${guildId}`, e);
    }
}

function setup(client) {
    const config = loadAlertConfig();
    const enabledGuildIds = Object.keys(config).filter(gid => config[gid]?.bump);

    for (const guildId of enabledGuildIds) {
        checkBumpStatus(client, guildId);
    }

    client.on('messageCreate', message => {
        if (!message.guildId || !message.author.bot) return;

        const targetBotIds = Array.isArray(bumpBotUserId) ? bumpBotUserId : [bumpBotUserId];
        if (!targetBotIds.includes(message.author.id)) return;

        checkBumpStatus(client, message.guildId);
    });
}

module.exports = {
    setup,
    data: new SlashCommandBuilder()
        .setName('alert')
        .setDescription('自動監視アラートを設定します。')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('trigger')
                .setDescription('トリガー条件')
                .setRequired(true)
                .addChoices(
                    { name: 'bump', value: 'bump' },
                )
        )
        .addBooleanOption(opt =>
            opt.setName('enabled')
                .setDescription('有効にするかどうか')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'このコマンドはサーバー管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
            return;
        }

        const trigger = interaction.options.getString('trigger');
        const enabled = interaction.options.getBoolean('enabled');

        const notifyChannelId = getNotifyChannelId(interaction.guildId, 'alert');
        if (!notifyChannelId && enabled) {
            await interaction.reply({
                content: '通知先チャンネルが未設定です。先に `/notify command:alert` で通知先を設定してください。',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const config = loadAlertConfig();
        if (!config[interaction.guildId]) {
            config[interaction.guildId] = {};
        }

        config[interaction.guildId][trigger] = enabled;
        saveAlertConfig(config);

        if (enabled) {
            await checkBumpStatus(interaction.client, interaction.guildId);
        } else {
            const timer = activeTimers.get(interaction.guildId);
            if (timer) {
                clearTimeout(timer);
                activeTimers.delete(interaction.guildId);
            }
        }

        await interaction.reply({
            content: `**/${trigger}** アラートを **${enabled ? '有効' : '無効'}** に設定しました。${enabled && notifyChannelId ? `\n📢 通知先: <#${notifyChannelId}>` : ''}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
