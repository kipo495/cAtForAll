const JST = 'Asia/Tokyo';
const fmt = new Intl.DateTimeFormat('sv', { timeZone: JST });

function toJSTDateString(date = new Date()) {
    return fmt.format(date);
}

function toJSTDateInt(date = new Date()) {
    return parseInt(fmt.format(date).replace(/-/g, ''), 10);
}

function dateIntToISO(dateInt) {
    const s = String(dateInt);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function addDaysToDateInt(dateInt, days) {
    const d = new Date(dateIntToISO(dateInt) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return toJSTDateInt(d);
}

function getNextFireTimeMs(when) {
    const hh = when.slice(0, 2).padStart(2, '0');
    const mm = when.slice(2, 4).padStart(2, '0');
    const now = new Date();
    const todayFire = new Date(`${toJSTDateString(now)}T${hh}:${mm}:00+09:00`);
    if (todayFire.getTime() > now.getTime()) {
        return todayFire.getTime() - now.getTime();
    }
    return todayFire.getTime() + 24 * 60 * 60 * 1000 - now.getTime();
}

function isPastDateInt(dateInt) {
    return dateInt < toJSTDateInt();
}

module.exports = {
    toJSTDateString,
    toJSTDateInt,
    dateIntToISO,
    addDaysToDateInt,
    getNextFireTimeMs,
    isPastDateInt,
};
