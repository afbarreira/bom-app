// Copia as bibliotecas para www/libs, para o app funcionar sem internet.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www', 'libs');
fs.mkdirSync(out, {recursive: true});
const files = [
  ['node_modules/pdfjs-dist/build/pdf.min.js', 'pdf.min.js', true],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js', true],
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js', true],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js', false],
  ['node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js', false],
  ['node_modules/firebase/firebase-app-compat.js', 'firebase-app-compat.js', false],
  ['node_modules/firebase/firebase-auth-compat.js', 'firebase-auth-compat.js', false],
  ['node_modules/firebase/firebase-firestore-compat.js', 'firebase-firestore-compat.js', false]
];
for (const [from, to, required] of files) {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) {
    if (required) { console.error('Não encontrado: ' + from + ' (rode "npm install" antes)'); process.exit(1); }
    console.warn('aviso: ' + from + ' não encontrado; o app vai buscar pela internet'); continue;
  }
  fs.copyFileSync(src, path.join(out, to));
  console.log('ok  libs/' + to);
}
