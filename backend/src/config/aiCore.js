function getAiCoreBaseUrl() {
    const raw = process.env.AI_CORE_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '');
}

function getAiCoreApiUrl(path = '') {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${getAiCoreBaseUrl()}/api/v1${normalizedPath}`;
}

module.exports = {
    getAiCoreBaseUrl,
    getAiCoreApiUrl,
};
