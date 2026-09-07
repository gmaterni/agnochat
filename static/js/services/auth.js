/**
 * auth.js - Autenticazione con IndexedDB nativo.
 * Nessuna dipendenza: usa solo le primitive IndexedDB del browser.
 * La sessione vive in sessionStorage (chiavi "authResult"/"authSession")
 * e resta valida per tutta la durata del tab.
 *
 * API: Auth.login(u,p), Auth.signup(u,p), Auth.listUsers(),
 *      Auth.getUser(), Auth.kill()
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

    /** Login: verifica credenziali. Restituisce { username, loginAt }, oppure null. */
    login: async function (u, p) {
        const rec = await Auth._get(u);
        if (!rec || rec.password !== p) return null;
        return {
            username: rec.username,
            loginAt: new Date().toISOString()
        };
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

    /** Restituisce il nome dell'utente attivo, oppure null se nessuna sessione.
     *  Payload malformati, username assenti/non-stringa/vuoti ed errori di
     *  storage valgono come sessione assente: mai eccezioni verso i chiamanti. */
    getUser: function () {
        try {
            const raw = sessionStorage.getItem("authSession") || sessionStorage.getItem("authResult");
            if (!raw) return null;
            const data = JSON.parse(raw);
            const name = (typeof data === "string") ? data : (data && data.username);
            if (typeof name !== "string") return null;
            return name.trim() || null;
        } catch (e) {
            return null;
        }
    },

    /** Pulisce tutti gli input della pagina. */
    kill: function () {
        document.querySelectorAll("input").forEach(function (i) { i.value = ""; });
    }
};
