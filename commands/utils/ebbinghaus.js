const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const MAX_TIMEOUT_MS = 2147483647;

function setLongTimeout(callback, delay) {
    if (delay > MAX_TIMEOUT_MS) {
        setTimeout(() => setLongTimeout(callback, delay - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
    } else {
        setTimeout(callback, delay);
    }
}
const { pace_intervals } = require('../../variables.json');

const DATA_PATH = path.join(__dirname, '../../data/ebbinghaus.json');

function loadData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[ebbinghaus] データ読み込み失敗', e);
        return [];
    }
}

function saveData(data) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

function scheduleReview(client, entry) {
    const studiedAt = new Date(entry.studiedAt).getTime();

    for (const dayOffset of entry.pendingReviews) {
        const reviewAt = studiedAt + dayOffset * 24 * 60 * 60 * 1000;
        const delay = Math.max(0, reviewAt - Date.now());

        setTimeout(async () => {
            try {
                const channel = await client.channels.fetch(entry.channelId);
                if (channel?.isTextBased()) {
                    await channel.send(
                        `<@${entry.userId}> 📚 **${entry.name}** の復習タイミングです！（学習から${dayOffset}日後）`
                    );
                    console.log(`[ebbinghaus] 通知送信: user=${entry.userId}, name=${entry.name}, day=${dayOffset}`);
                }
            } catch (e) {
                console.error(`[ebbinghaus] 通知失敗: ${e.message}`);
            }

            const data = loadData();
            const idx = data.findIndex(d => d.id === entry.id);
            if (idx !== -1) {
                data[idx].pendingReviews = data[idx].pendingReviews.filter(d => d !== dayOffset);
                if (data[idx].pendingReviews.length === 0) {
                    data.splice(idx, 1);
                }
                saveData(data);
            }
        }, delay);

        const label = delay === 0 ? '即時通知（期限超過）' : `${new Date(Date.now() + delay).toLocaleString('ja-JP')}`;
        console.log(`[ebbinghaus] スケジュール: user=${entry.userId}, name=${entry.name}, day=${dayOffset}, at=${label}`);
    }
}

function setup(client) {
    const data = loadData();
    console.log(`[ebbinghaus] 保存済みエントリを読み込みました: ${data.length}件`);
    for (const entry of data) {
        scheduleReview(client, entry);
    }
}

module.exports = {
    setup,
    data: new SlashCommandBuilder()
        .setName('ebbinghaus')
        .setDescription('エビングハウスの忘却曲線に基づく復習リマインダーを設定します。')
        .addStringOption(opt =>
            opt.setName('name')
                .setDescription('学習した内容の名前')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('pace')
                .setDescription('復習ペース')
                .setRequired(true)
                .addChoices(
                    { name: '標準 (1・3・7・21・30日後)', value: 'normal' },
                    { name: '集中 (1・2・4・7・14日後)', value: 'short' },
                    { name: '長期 (1・7・30・90日後)', value: 'long' },
                )
        ),
    async execute(interaction) {
        const name = interaction.options.getString('name');
        const pace = interaction.options.getString('pace');
        const intervals = pace_intervals[pace];

        const entry = {
            id: `${interaction.user.id}-${Date.now()}`,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            name,
            pace,
            studiedAt: new Date().toISOString(),
            pendingReviews: [...intervals],
        };

        const data = loadData();
        data.push(entry);
        saveData(data);

        scheduleReview(interaction.client, entry);

        const reviewList = intervals.map(d => `${d}日後`).join('・');
        await interaction.reply({
            content: `✅ **${name}** の復習リマインダーを設定しました。\n📅 通知タイミング: ${reviewList}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
