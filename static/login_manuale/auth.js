/**
 * auth.js - Autenticazione con IndexedDB nativo.
 * Nessuna dipendenza: usa solo le primitive IndexedDB del browser.
 * Nessuna sessione persistente: ogni accesso a app.html richiede il login.
 *
 * API: Auth.login(u,p), Auth.signup(u,p), Auth.listUsers(), Auth.kill()
 *      Auth.browserInfo() → informazioni browser + IP
 */
const Auth = {

    DB: "LoginManualeDB",
    S_USER: "users",
    _db: null,

    _open: function () {
        if (Auth._db) return Promise.resolve(Auth._db);
        return new Promise(function (resolve, reject) {
            const req = indexedDB.open(Auth.DB, 1);
            req.onupgradeneeded = function (e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(Auth.S_USER))
                    db.createObjectStore(Auth.S_USER, { keyPath: "username" });
            };
            req.onsuccess = function (e) { Auth._db = e.target.result; resolve(Auth._db); };
            req.onerror = function (e) { reject(e.target.error); };
        });
    },

    _get: async function (key) {
        const db = await Auth._open();
        return new Promise(function (resolve, reject) {
            const r = db.transaction(Auth.S_USER, "readonly").objectStore(Auth.S_USER).get(key);
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
        });
    },

    _put: async function (data) {
        const db = await Auth._open();
        return new Promise(function (resolve, reject) {
            const r = db.transaction(Auth.S_USER, "readwrite").objectStore(Auth.S_USER).put(data);
            r.onsuccess = function () { resolve(); };
            r.onerror = function () { reject(r.error); };
        });
    },

    _keys: async function () {
        const db = await Auth._open();
        return new Promise(function (resolve, reject) {
            const r = db.transaction(Auth.S_USER, "readonly").objectStore(Auth.S_USER).getAllKeys();
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
        });
    },

    /** Raccoglie informazioni dal browser. */
    browserInfo: function () {
        const nav = window.navigator;
        const scr = window.screen;
        return {
            userAgent: nav.userAgent,
            language: nav.language,
            platform: nav.platform || "sconosciuto",
            cores: nav.hardwareConcurrency || 0,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screen: scr.width + "x" + scr.height,
            screenDepth: scr.colorDepth + "bit",
            cookieEnabled: nav.cookieEnabled,
            online: nav.online,
            touch: "ontouchstart" in window
        };
    },

    /** Recupera l'IP pubblico del browser. */
    _getIp: async function () {
        try {
            const res = await fetch("https://api.ipify.org?format=json");
            const data = await res.json();
            return data.ip || "sconosciuto";
        } catch (e) {
            return "sconosciuto";
        }
    },

    /** Login: verifica credenziali. Restituisce JSON con username + info browser + IP, oppure null. */
    login: async function (u, p) {
        const rec = await Auth._get(u);
        if (!rec || rec.password !== p) return null;
        const ip = await Auth._getIp();
        const result = {
            username: rec.username,
            loginAt: new Date().toISOString(),
            browser: Auth.browserInfo(),
            ip: ip
        };
        return result;
    },

    /** Registrazione: blocca se utente esiste gia'. "ok" o "already". */
    signup: async function (u, p) {
        const exists = await Auth._get(u);
        if (exists) return "already";
        await Auth._put({ username: u, password: p, createdAt: new Date().toISOString() });
        return "ok";
    },

    /** Lista username registrati, ordinata. */
    listUsers: async function () {
        const k = await Auth._keys();
        return k.sort();
    },

    /** Pulisce tutti gli input della pagina. */
    kill: function () {
        document.querySelectorAll("input").forEach(function (i) { i.value = ""; });
    }
};
