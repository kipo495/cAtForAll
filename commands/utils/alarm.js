const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { toJSTDateInt, addDaysToDateInt, getNextFireTimeMs, isPastDateInt } = require('../../lib/datetime');
const { setLongTimeout } = require('../../lib/timer-util');
const { getNotifyChannelId } = require('./notify');

const DATA_PATH = path.join(__dirname, '../../data/alarm.json');
const LOG_PATH = path.join(__dirname, '../../data/log/alarm-log.json');

const activeTimers = new Map();

function loadAlarms() {
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[alarm] データ読み込み失敗', e);
        return [];
    }
}

function saveAlarms(alarms) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, `${JSON.stringify(alarms, null, 2)}\n`);
}

function appendAlarmLogs(logs) {
    if (!logs || logs.length === 0) return;
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    let existing = [];
    try {
        existing = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[alarm] ログ読み込み失敗', e);
    }
    existing.push(...logs);
    fs.writeFileSync(LOG_PATH, `${JSON.stringify(existing, null, 2)}\n`);
}

async function sendDigest(client, guildId, when, isExpiredCatchUp = false) {
    const channelId = getNotifyChannelId(guildId, 'alarm');
    if (!channelId) {
        console.warn(`[alarm] 通知先チャンネルが設定されていません: guild=${guildId}`);
        return;
    }

    const todayInt = toJSTDateInt();
    const alarms = loadAlarms();

    const dueByUser = new Map();
    const completedRecords = [];
    const logsToSave = [];

    for (const item of alarms) {
        if (item.guildId !== guildId || item.when !== when) continue;

        for (const dateInt of item.pendingDates) {
            const isTarget = isExpiredCatchUp ? isPastDateInt(dateInt) : dateInt === todayInt;
            if (isTarget) {
                if (!dueByUser.has(item.userId)) dueByUser.set(item.userId, []);
                dueByUser.get(item.userId).push(item.name);
                completedRecords.push({ id: item.id, dateInt });
                logsToSave.push({
                    id: item.id,
                    guildId,
                    userId: item.userId,
                    name: item.name,
                    completedDate: dateInt,
                    notifiedAt: new Date().toISOString(),
                });
            }
        }
    }

    if (dueByUser.size === 0) return;

    const lines = [...dueByUser.entries()].map(
        ([userId, names]) => `<@${userId}> ${[...new Set(names)].map(n => `**${n}**`).join('・')}`
    );

    const title = isExpiredCatchUp ? '⚠️ 未消化のアラームダイジェスト' : '⏰ 本日のアラームダイジェスト';

    try {
        const channel = await client.channels.fetch(channelId);
        if (channel?.isTextBased()) {
            await channel.send(`${title}\n${lines.join('\n')}`);
            appendAlarmLogs(logsToSave);

            for (const rec of completedRecords) {
                const target = alarms.find(a => a.id === rec.id);
                if (target) {
                    target.pendingDates = target.pendingDates.filter(d => d !== rec.dateInt);
                }
            }

            const remaining = alarms.filter(a => a.pendingDates.length > 0);
            saveAlarms(remaining);
        }
    } catch (e) {
        console.error(`[alarm] 通知送信エラー: guild=${guildId}, channel=${channelId}`, e);
    }
}

function scheduleDailyAlarm(client, guildId, when) {
    const key = `${guildId}-${when}`;
    const previous = activeTimers.get(key);
    if (previous) clearTimeout(previous);

    const delay = getNextFireTimeMs(when);

    const timer = setLongTimeout(async () => {
        await sendDigest(client, guildId, when);

        const current = loadAlarms();
        const hasRemaining = current.some(
            a => a.guildId === guildId && a.when === when && a.pendingDates.length > 0
        );
        if (hasRemaining) {
            scheduleDailyAlarm(client, guildId, when);
        } else {
            activeTimers.delete(key);
        }
    }, delay);

    activeTimers.set(key, timer);
}

function setup(client) {
    const alarms = loadAlarms();
    console.log(`[alarm] アラームエントリ読み込み: ${alarms.length}件`);

    const pairs = new Set(alarms.map(a => `${a.guildId}|${a.when}`));

    for (const pair of pairs) {
        const [guildId, when] = pair.split('|');
        sendDigest(client, guildId, when, true).catch(err => {
            console.error(`[alarm] 起動時リカバリ通知エラー: guild=${guildId}, when=${when}`, err);
        });
        scheduleDailyAlarm(client, guildId, when);
    }
}

module.exports = {
    setup,
    data: new SlashCommandBuilder()
        .setName('alarm')
        .setDescription('指定日数後に通知を行うアラームを登録します。')
        .addStringOption(opt =>
            opt.setName('name')
                .setDescription('アラーム内容')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('days')
                .setDescription('何日後に通知するか (カンマ区切り 例: 1,3,7,21,30)')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('when')
                .setDescription('通知時刻 (JST・4桁数字 例: 0900)')
                .setRequired(true)
                .setMinLength(4)
                .setMaxLength(4)
        ),
    async execute(interaction) {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'サーバー内でのみ使用できます。', flags: MessageFlags.Ephemeral });
            return;
        }

        const notifyChannelId = getNotifyChannelId(interaction.guildId, 'alarm');
        if (!notifyChannelId) {
            await interaction.reply({
                content: '通知先チャンネルが未設定です。先に管理者が `/notify command:alarm` で通知先を設定してください。',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const name = interaction.options.getString('name').trim();
        const daysRaw = interaction.options.getString('days').trim();
        const when = interaction.options.getString('when').trim();

        if (!/^\d{4}$/.test(when)) {
            await interaction.reply({ content: '`when` は4桁の数字（例: 0900）で指定してください。', flags: MessageFlags.Ephemeral });
            return;
        }
        const hours = parseInt(when.slice(0, 2), 10);
        const minutes = parseInt(when.slice(2, 4), 10);
        if (hours > 23 || minutes > 59) {
            await interaction.reply({ content: '`when` の時刻が無効です（0000〜2359）。', flags: MessageFlags.Ephemeral });
            return;
        }

        const dayTokens = daysRaw.split(',').map(s => s.trim()).filter(Boolean);
        if (dayTokens.length === 0) {
            await interaction.reply({ content: '`days` をカンマ区切りの数字で指定してください（例: 1,3,7）。', flags: MessageFlags.Ephemeral });
            return;
        }

        const parsedDays = [];
        for (const token of dayTokens) {
            if (!/^\d+$/.test(token)) {
                await interaction.reply({ content: `不正な日数指定が含まれています: "${token}"`, flags: MessageFlags.Ephemeral });
                return;
            }
            const val = parseInt(token, 10);
            if (val <= 0) {
                await interaction.reply({ content: '日数は1以上の整数を指定してください。', flags: MessageFlags.Ephemeral });
                return;
            }
            parsedDays.push(val);
        }

        const uniqueDays = [...new Set(parsedDays)].sort((a, b) => a - b);
        const todayInt = toJSTDateInt();
        const pendingDates = uniqueDays.map(d => addDaysToDateInt(todayInt, d));

        const entry = {
            id: `${interaction.user.id}-${Date.now()}`,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            name,
            when,
            pendingDates,
        };

        const alarms = loadAlarms();
        alarms.push(entry);
        saveAlarms(alarms);

        scheduleDailyAlarm(interaction.client, interaction.guildId, when);

        const daysFormatted = uniqueDays.map(d => `${d}日後`).join('、');
        await interaction.reply({
            content: `✅ アラーム **${name}** を設定しました。\n📅 通知タイミング: ${daysFormatted} (${when.slice(0, 2)}:${when.slice(2, 4)} JST)\n📢 通知先: <#${notifyChannelId}>`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
