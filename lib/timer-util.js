const MAX_TIMEOUT_MS = 2147483647;

function setLongTimeout(callback, delay) {
    if (delay > MAX_TIMEOUT_MS) {
        return setTimeout(() => setLongTimeout(callback, delay - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
    }
    return setTimeout(callback, delay);
}

module.exports = {
    setLongTimeout,
    MAX_TIMEOUT_MS,
};
