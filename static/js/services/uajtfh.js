/**
 * uajtfh.js — Joint Text From Hierarchy: builder testuale concatenabile.
 *
 * Utility per costruire stringhe o frammenti HTML in modo ordinato.
 * Alternativa a concatenazioni complesse e template literal annidati.
 *
 * @module  UaJtfh
 * @version 1.0.0
 * @date    2026-06-16
 */

/** @format */
"use strict";

const UaJtfh = function() {
  const _rows = [];

  const init = function() {
    _rows.length = 0;
    return api;
  };

  const append = function(s) {
    _rows.push(s);
    return api;
  };

  const html = function(ln = "") {
    const r = _rows.join(ln).replace(/\s+|\[rn\]/g, " ");
    return r;
  };

  const api = {
    init: init,
    append: append,
    html: html,
  };

  return api;
};

export { UaJtfh };
