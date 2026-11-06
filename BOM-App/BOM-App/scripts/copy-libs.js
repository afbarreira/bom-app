// Copia as bibliotecas de PDF para www/libs, para o app funcionar sem internet.
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, '..', 'www', 'libs');
fs.mkdirSync(out, {recursive: true});
const files = [
  ['node_modules/pdfjs-dist/build/pdf.min.js', 'pdf.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js'],
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js']
];
for (const [from, to] of files) {
  const src = path.join(__dirname, '..', from);
  if (!fs.existsSync(src)) { console.error('Não encontrado: ' + from + ' (rode "npm install" antes)'); process.exit(1); }
  fs.copyFileSync(src, path.join(out, to));
  console.log('ok  libs/' + to);
}
