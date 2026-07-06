// Общие помощники для чтения/записи data.json в репозитории через GitHub API.
// Токен и параметры берутся из localStorage (задаются в admin.html).
// У обычных посетителей токена нет — GH.isAdmin() для них false.
const GH = (() => {
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // owner/repo можно вывести из адреса вида <owner>.github.io/<repo>/
  function derive() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if (!m) return null;
    const seg = location.pathname.split('/').filter(Boolean);
    return { owner: m[1], repo: seg[0] || '' };
  }

  function config() {
    const d = derive();
    return {
      token: localStorage.getItem('ghToken') || '',
      owner: localStorage.getItem('ghOwner') || (d && d.owner) || 'GileadDev',
      repo: localStorage.getItem('ghRepo') || (d && d.repo) || 'filmoteka',
      branch: localStorage.getItem('ghBranch') || 'main'
    };
  }

  function isAdmin() {
    return !!config().token;
  }

  function headers() {
    return { Authorization: 'Bearer ' + config().token, Accept: 'application/vnd.github+json' };
  }

  function apiUrl() {
    const { owner, repo } = config();
    return `https://api.github.com/repos/${owner}/${repo}/contents/data.json`;
  }

  // Текущее содержимое data.json из репозитория (+ sha для обновления)
  async function loadData() {
    const res = await fetch(`${apiUrl()}?ref=${encodeURIComponent(config().branch)}`, { headers: headers() });
    if (res.status === 404) return { data: [], sha: null };
    if (!res.ok) throw new Error('чтение data.json: HTTP ' + res.status);
    const j = await res.json();
    let data = [];
    try { data = JSON.parse(base64ToUtf8(j.content)); } catch (_) {}
    if (!Array.isArray(data)) data = [];
    return { data, sha: j.sha };
  }

  // Коммит обновлённого data.json
  async function saveData(data, sha, message) {
    const body = {
      message,
      content: utf8ToBase64(JSON.stringify(data, null, 2) + '\n'),
      branch: config().branch
    };
    if (sha) body.sha = sha;
    const res = await fetch(apiUrl(), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) {
      let detail = 'HTTP ' + res.status;
      try { const e = await res.json(); if (e.message) detail += ' — ' + e.message; } catch (_) {}
      throw new Error('запись data.json: ' + detail);
    }
  }

  return { config, isAdmin, loadData, saveData, utf8ToBase64, base64ToUtf8 };
})();
