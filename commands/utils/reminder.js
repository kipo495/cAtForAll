const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { bumpBotUserId } = require('../../config.json');

const REMINDER_DELAY_MS = 2 * 60 * 60 * 1000;
const REMINDER_CHANNELS_PATH = path.join(__dirname, '../../data/reminder-channels.json');

function loadReminderChannels() {
    try {
        const savedChannels = JSON.parse(fs.readFileSync(REMINDER_CHANNELS_PATH, 'utf8'));
        return new Map(Object.entries(savedChannels));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('[reminder] 保存済みの通知先を読み込めませんでした。', error);
        }
        return new Map();
    }
}

function saveReminderChannels(channels) {
    fs.mkdirSync(path.dirname(REMINDER_CHANNELS_PATH), { recursive: true });
    fs.writeFileSync(REMINDER_CHANNELS_PATH, `${JSON.stringify(Object.fromEntries(channels), null, 2)}\n`);
}

function setup(client) {
    client.reminderChannels = loadReminderChannels();
    client.reminderTimers = new Map();
    console.log(`[reminder] 保存済みの通知先を読み込みました: ${client.reminderChannels.size}件`);
    console.log('[reminder] 監視を開始しました。対象Bot ID:', bumpBotUserId);

    client.on('messageCreate', message => {
        if (!message.guildId || !message.author.bot) {
            return;
        }

        const isTargetBot = Array.isArray(bumpBotUserId) && bumpBotUserId.includes(message.author.id);
        console.log(`[reminder] Botメッセージ受信: author=${message.author.id}, guild=${message.guildId}, 対象=${isTargetBot}`);

        if (!isTargetBot) {
            return;
        }

        const channelId = client.reminderChannels.get(message.guildId);
        if (!channelId) {
            console.log(`[reminder] 通知先未登録: guild=${message.guildId}。先に/reminderを実行してください。`);
            return;
        }

        const previousTimer = client.reminderTimers.get(message.guildId);
        if (previousTimer) {
            clearTimeout(previousTimer.timeout);
            console.log(`[reminder] 既存タイマーを解除しました: guild=${message.guildId}`);
        }

        const notifyAt = Date.now() + REMINDER_DELAY_MS;
        const timeout = setTimeout(async () => {
            client.reminderTimers.delete(message.guildId);
            console.log(`[reminder] タイマー発火: guild=${message.guildId}, channel=${channelId}`);

            try {
                const channel = await client.channels.fetch(channelId);
                if (channel?.isTextBased()) {
                    await channel.send('Bumpから2時間経過しました。再度Bumpできます。');
                    console.log(`[reminder] 通知を送信しました: guild=${message.guildId}, channel=${channelId}`);
                }
            } catch (error) {
                console.error(`Bump通知の送信に失敗しました (guild: ${message.guildId})`, error);
            }
        }, REMINDER_DELAY_MS);

        client.reminderTimers.set(message.guildId, { channelId, notifyAt, timeout });
        console.log(`[reminder] タイマーを保存しました: guild=${message.guildId}, channel=${channelId}, notifyAt=${new Date(notifyAt).toISOString()}`);
    });
}

module.exports = {
    setup,
    data: new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('Bump通知の対象チャンネルを設定します。')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'このコマンドはサーバー管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
            return;
        }

        interaction.client.reminderChannels.set(interaction.guildId, interaction.channelId);
        saveReminderChannels(interaction.client.reminderChannels);
        console.log(`[reminder] 通知先を登録しました: guild=${interaction.guildId}, channel=${interaction.channelId}`);

        const timer = interaction.client.reminderTimers.get(interaction.guildId);
        const status = timer
            ? `次回通知予定: <t:${Math.floor(timer.notifyAt / 1000)}:F>`
            : '現在、通知待ちのタイマーはありません。';

        await interaction.reply({
            content: `このチャンネルをBump通知先に設定しました。\n${status}`,
            flags: MessageFlags.Ephemeral,
        });
        console.log(`[reminder] 状態確認: guild=${interaction.guildId}, timer=${timer ? 'あり' : 'なし'}`);
    },
};