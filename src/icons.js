'use strict';
const moahamIconPaths={
 image:'M3 3h18v18H3z M3 16l6-6 5 5 3-3 4 4 M15 7h.01',
 design:'M12 3l9 9-9 9-9-9z M8 12h8 M12 8v8',
 document:'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',
 spreadsheet:'M3 4h18v16H3z M3 9h18 M8 4v16 M14 9v11 M3 14h18',
 presentation:'M3 3h18v13H3z M12 16v5 M8 21l4-5 4 5 M7 11V8 M12 11V6 M17 11V9',
 text:'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5',
 video:'M3 5h13v14H3z M16 10l5-3v10l-5-3',
 audio:'M9 18V5l11-2v13 M9 8l11-2 M9 18c0 3-6 4-6 1s6-4 6-1 M20 16c0 3-6 4-6 1s6-4 6-1',
 archive:'M3 4h18v4H3z M5 8v13h14V8 M10 12h4',
 other:'M5 3h10l4 4v14H5z M14 3v5h5',
 folder:'M3 6h7l2 2h9v12H3z',
 gallery:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 list:'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01',
 star:'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
 clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
 trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
 tag:'M3 3h8l10 10-8 8L3 11z M7 7h.01',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
 search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
 help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9c0-4 7-4 6 0-.3 2-3 2-3 5 M12 17h.01',
 info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7h.01',
 plus:'M12 4v16 M4 12h16',
 unfiled:'M3 6h7l2 2h9v12H3z M9 14h6',
 untagged:'M3 3h8l10 10-8 8L3 11z M3 21L21 3'
};
function uiIcon(name){return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(moahamIconPaths[name]||moahamIconPaths.other)+'"/></svg>';}
