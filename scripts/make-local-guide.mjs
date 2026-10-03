// Generates "Running-Locally.pdf" — how to run the Classic and International
// Pro builds, and the full project, on a local machine.
//
//   npm install --no-save pdfkit
//   node scripts/make-local-guide.mjs [outputPath]

import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

let PDFDocument;
try {
  ({ default: PDFDocument } = await import('pdfkit'));
} catch {
  console.error('pdfkit is not installed. Run:  npm install --no-save pdfkit');
  process.exit(1);
}

const repo = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
const out = path.resolve(process.argv[2] ?? path.join(repo, 'Running-Locally.pdf'));
await mkdir(path.dirname(out), { recursive: true });

const INK = '#1f2937';
const MUTED = '#6b7280';
const TEAL = '#0f766e';
const DEEP = '#173c34';
const ORANGE = '#c2410c';
const RULE = '#d1d5db';
const CODE_BG = '#f3f4f6';
const NOTE_BG = '#ecfdf5';
const WARN_BG = '#fff7ed';

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 64, bottom: 64, left: 64, right: 64 },
  bufferPages: true,
  info: {
    Title: 'Rajshahi Tours & Travels — Running Locally',
    Author: 'Rajshahi Tours & Travels',
    Subject: 'How to run the Classic and International Pro editions on your own machine',
  },
});
doc.pipe(createWriteStream(out));

const LEFT = doc.page.margins.left;
const WIDTH = doc.page.width - doc.page.margins.left - doc.page.margins.right;
const BOTTOM = () => doc.page.height - doc.page.margins.bottom;

function space(h) {
  if (doc.y + h > BOTTOM()) doc.addPage();
}

function h1(text) {
  space(70);
  doc.moveDown(0.6);
  doc.fillColor(DEEP).font('Helvetica-Bold').fontSize(19).text(text, LEFT, doc.y, { width: WIDTH });
  const y = doc.y + 6;
  doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(2).strokeColor(TEAL).stroke();
  doc.y = y + 14;
}

function h2(text) {
  space(52);
  doc.moveDown(0.5);
  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13).text(text, LEFT, doc.y, { width: WIDTH });
  doc.moveDown(0.35);
}

function para(text, opts = {}) {
  space(30);
  doc
    .fillColor(opts.color ?? INK)
    .font(opts.font ?? 'Helvetica')
    .fontSize(opts.size ?? 10.5)
    .text(text, LEFT + (opts.indent ?? 0), doc.y, {
      width: WIDTH - (opts.indent ?? 0),
      align: 'left',
      lineGap: 2.5,
    });
  doc.moveDown(0.45);
}

function bullets(items) {
  for (const item of items) {
    space(26);
    const y = doc.y;
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(10.5).text('\u2022', LEFT + 4, y, { width: 12 });
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(10.5)
      .text(item, LEFT + 20, y, { width: WIDTH - 20, lineGap: 2.5 });
    doc.moveDown(0.3);
  }
  doc.moveDown(0.25);
}

function steps(items) {
  items.forEach((item, i) => {
    space(26);
    const y = doc.y;
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(10.5).text(`${i + 1}.`, LEFT + 2, y, { width: 16 });
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(10.5)
      .text(item, LEFT + 22, y, { width: WIDTH - 22, lineGap: 2.5 });
    doc.moveDown(0.3);
  });
  doc.moveDown(0.25);
}

function code(lines) {
  const rows = Array.isArray(lines) ? lines : [lines];
  const lh = 13.5;
  const pad = 10;
  const h = rows.length * lh + pad * 2;
  space(h + 6);
  // Capture the top first: text() below mutates doc.y as it draws.
  const top = doc.y;
  doc.roundedRect(LEFT, top, WIDTH, h, 4).fill(CODE_BG);
  let y = top + pad;
  for (const row of rows) {
    const comment = row.trimStart().startsWith('#');
    doc
      .fillColor(comment ? MUTED : '#111827')
      .font('Courier')
      .fontSize(9.5)
      .text(row, LEFT + pad, y, { width: WIDTH - pad * 2, lineBreak: false });
    y += lh;
  }
  doc.y = top + h + 8;
}

function box(kind, title, text) {
  const bg = kind === 'warn' ? WARN_BG : NOTE_BG;
  const edge = kind === 'warn' ? ORANGE : TEAL;
  const pad = 11;
  doc.font('Helvetica').fontSize(10);
  const th = doc.heightOfString(text, { width: WIDTH - pad * 2 - 6, lineGap: 2 });
  const h = th + pad * 2 + 15;
  space(h + 6);
  const top = doc.y;
  doc.roundedRect(LEFT, top, WIDTH, h, 4).fill(bg);
  doc.rect(LEFT, top, 3.5, h).fill(edge);
  doc
    .fillColor(edge)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(title, LEFT + pad + 4, top + pad, { width: WIDTH - pad * 2 - 6 });
  doc
    .fillColor(INK)
    .font('Helvetica')
    .fontSize(10)
    .text(text, LEFT + pad + 4, top + pad + 14, { width: WIDTH - pad * 2 - 6, lineGap: 2 });
  doc.y = top + h + 10;
}

function table(headers, rows, widths) {
  const cols = widths.map((w) => w * WIDTH);
  const pad = 7;
  const draw = (cells, bold, bg) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
    const h =
      Math.max(
        ...cells.map((c, i) => doc.heightOfString(String(c), { width: cols[i] - pad * 2, lineGap: 1.5 })),
      ) +
      pad * 2;
    space(h);
    const top = doc.y;
    if (bg) doc.rect(LEFT, top, WIDTH, h).fill(bg);
    let x = LEFT;
    cells.forEach((c, i) => {
      doc
        .fillColor(bold ? '#ffffff' : INK)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9.5)
        .text(String(c), x + pad, top + pad, { width: cols[i] - pad * 2, lineGap: 1.5 });
      x += cols[i];
    });
    doc.y = top + h;
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + WIDTH, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
  };
  draw(headers, true, TEAL);
  rows.forEach((r, i) => draw(r, false, i % 2 ? '#f9fafb' : null));
  doc.moveDown(0.8);
}

/* ---------------------------------------------------------------- cover --- */

doc.rect(0, 0, doc.page.width, 190).fill(DEEP);
doc.fillColor('#5eead4').font('Helvetica-Bold').fontSize(10).text('RAJSHAHI TOURS & TRAVELS', LEFT, 56, {
  characterSpacing: 1.6,
});
doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(27).text('Running the site locally', LEFT, 80);
doc
  .fillColor('#a7f3d0')
  .font('Helvetica')
  .fontSize(12)
  .text('Classic and International Pro editions \u2014 a step-by-step setup guide', LEFT, 118, {
    width: WIDTH - 40,
  });
doc.fillColor('#6ee7b7').font('Helvetica').fontSize(9).text(`Version ${version}`, LEFT, 156);

doc.y = 220;
doc.fillColor(INK);

para(
  'This guide covers two separate things: running the ready-made ZIP downloads from the GitHub Release, ' +
    'and running the whole project from source. Start with Part 1 if you only want to look at the websites. ' +
    'Use Part 2 if you want live reloading, the staff dashboard with a real API, or you plan to change the code.',
);

h2('The two editions');
table(
  ['Edition', 'What it is', 'Where it can be served from'],
  [
    ['Classic', 'The original main-site layout.', 'The root of a site only.'],
    [
      'International Pro',
      'Editorial, responsive experience with destination search, journey filters, shortlists and package planning.',
      'Any folder, including a sub-path.',
    ],
  ],
  [0.2, 0.52, 0.28],
);
para(
  'Both editions share the same tour and transport model, a persistent Bangla / EN language switch, ' +
    'teal, sky-blue and orange branding, and locally hosted Bangla and English fonts. No internet connection ' +
    'is needed once a build is downloaded.',
);

box(
  'note',
  'Before you start',
  'Part 1 needs nothing but a web browser and a way to start a tiny local web server (Python and Node both work, ' +
    'and one of them is almost certainly already on your machine). Part 2 needs Node.js 22 and npm.',
);

/* ------------------------------------------------------------- part one --- */

h1('Part 1 \u2014 Run the downloaded ZIPs');

para(
  'Download either or both archives from the Releases page of the repository, then unzip them. ' +
    'The Classic archive unpacks into a folder named "classic"; the Pro archive unpacks into "pro".',
);

box(
  'warn',
  'Do not double-click index.html',
  'Opening index.html straight from your file manager uses a file:// address, and the page will stay blank. ' +
    'Browsers refuse to load JavaScript modules over file://, which is how both editions are built. ' +
    'You must serve the folder over http:// using one of the small servers below. This is a browser security ' +
    'rule, not a fault in the build.',
);

h2('Option A \u2014 Python (already installed on macOS and most Linux systems)');
para('Open a terminal, move into the unzipped folder, and start the built-in server:');
code([
  '# International Pro',
  'cd pro',
  'python3 -m http.server 8080',
  '',
  '# Classic \u2014 same command, different folder',
  'cd classic',
  'python3 -m http.server 8080',
]);
para('Then open http://localhost:8080/ in your browser. Press Ctrl+C in the terminal to stop the server.');
para('On Windows, use "py -m http.server 8080" if "python3" is not recognised.', { color: MUTED, size: 10 });

h2('Option B \u2014 Node.js');
para('If you have Node.js installed, no separate install step is needed:');
code(['cd pro', 'npx serve -l 8080', '', '# or', 'npx http-server -p 8080']);
para('npx will ask once to download the package, then print the address to open.');

h2('Which address to open');
table(
  ['Edition', 'Serve this folder', 'Then open'],
  [
    ['Classic', 'classic/', 'http://localhost:8080/'],
    ['International Pro', 'pro/', 'http://localhost:8080/'],
  ],
  [0.26, 0.37, 0.37],
);

box(
  'warn',
  'Classic must sit at the site root',
  'The Classic bundle loads its photography from absolute paths such as /media/sajek-1.webp. If you serve a ' +
    'parent folder and browse to /classic/, the page will load but every photo will be missing. Always point ' +
    'the server at the classic folder itself, so that index.html is at the root of what is being served. ' +
    'The Pro edition has its imagery bundled into assets/, so it does not have this restriction.',
);

h2('Viewing both editions side by side');
para(
  'Run two servers on different ports \u2014 for example Classic on 8080 and Pro on 8081 \u2014 by opening a ' +
    'second terminal window and passing a different port number. Inside the Pro edition, the "Classic edition" ' +
    'link in the header is controlled by a single line in pro/index.html:',
);
code(['<meta name="classic-edition-url" content="../" />']);
para('Change the content value to wherever you put Classic, such as http://localhost:8080/, and reload the page.');

/* ------------------------------------------------------------- part two --- */

h1('Part 2 \u2014 Run the full project from source');

para(
  'This gives you live reloading, the staff dashboard, and a real shared API instead of browser-only demo ' +
    'storage. You need Node.js 22 and npm.',
);

h2('1. Get the code and install dependencies');
code([
  'git clone https://github.com/Salman-Sazid-007/Rajshahi_tour_-_travels.git',
  'cd Rajshahi_tour_-_travels',
  '',
  'npm ci --prefix backend',
  'npm ci --prefix frontend',
]);

h2('2. Static preview of both editions');
para('Build both editions and serve the published output together:');
code(['npm run build:pages', 'npm run preview']);
para(
  'The preview binds 0.0.0.0:4173. Its default page opens Pro at /Rajshahi_tour_-_travels/pro/, and Classic ' +
    'is at /Rajshahi_tour_-_travels/. The paths /pro/ and /docs/ serve the standalone copies.',
);

h2('3. Full stack with the real API');
para('To use shared availability and operator-visible requests instead of demo storage:');
code(['npm run build', 'npm start']);
para('The Express server binds 0.0.0.0:3000 and serves Classic plus /pro/ from one origin.');

h2('4. Development servers with live reload');
para('Start the backend first, then run the edition you are working on in a second terminal:');
code([
  '# terminal 1 \u2014 API',
  'npm run dev',
  '',
  '# terminal 2 \u2014 Classic with live reload',
  'npm --prefix frontend run dev',
  '',
  '# terminal 2 (alternative) \u2014 International Pro',
  'cd frontend && npx vite --config vite.pro.config.js',
]);
para(
  'Development API calls use relative URLs through Vite\u2019s proxy, so the browser never needs to know the ' +
    'backend\u2019s address.',
);

h2('Ports at a glance');
table(
  ['Port', 'Started by', 'Serves'],
  [
    ['8080', 'python3 -m http.server (Part 1)', 'A single unzipped edition'],
    ['4173', 'npm run preview', 'Static preview of both editions'],
    ['3000', 'npm start / npm run dev', 'Express API, Classic and /pro/'],
    ['5173', 'npm --prefix frontend run dev', 'Classic dev server with live reload'],
  ],
  [0.12, 0.42, 0.46],
);

/* ------------------------------------------------------------ reference --- */

h1('Troubleshooting');

table(
  ['Symptom', 'Cause and fix'],
  [
    [
      'Page is completely blank',
      'You opened index.html as a file:// address. Serve the folder over http:// instead \u2014 see Part 1.',
    ],
    [
      'Photos missing in Classic',
      'Classic is not being served at the site root. Point the server at the classic folder itself, not its parent.',
    ],
    [
      'Port already in use',
      'Another program holds that port. Pass a different number, for example 8081.',
    ],
    [
      '"python3: command not found"',
      'Use Option B with Node, or try "py -m http.server 8080" on Windows.',
    ],
    [
      'Bookings vanish after a refresh',
      'Expected without a running API. The static builds fall back to browser-local demo storage. Use Part 2, step 3.',
    ],
    [
      'Another device cannot connect',
      'Localhost only serves your own machine. Bind to 0.0.0.0 and use your machine\u2019s LAN address.',
    ],
  ],
  [0.3, 0.7],
);

h1('Important: demo data versus real sales');

box(
  'warn',
  'Nothing here takes real payments',
  'All bKash handling in this project is manual. Entering a transaction reference does not charge money, ' +
    'verify a payment, or confirm a reservation. No payment gateway has been integrated, and cancelling a ' +
    'booking does not refund anything automatically.',
);

bullets([
  'A static build with no API reachable uses clearly labelled browser-local demo storage. Bookings, seat maps and ' +
    'approvals made in your browser are not visible to anyone else.',
  'WhatsApp links open a prepared message; the customer still has to send it.',
  'Seeded tours, statistics, traveler stories and staff accounts are demonstration content. Fictional demo phone ' +
    'numbers start with 000.',
  'Pro\u2019s optional USD display uses a fixed demo conversion, not a live exchange rate. Final prices remain BDT.',
  'Before running a real backend, read the "Before operating a real backend" section of README.md. Prototype role ' +
    'shortcuts are not real authentication.',
]);

h1('Rebuilding the archives yourself');

para('The two ZIPs on the Releases page are produced from source by:');
code(['npm ci --prefix frontend', 'npm run package:editions']);
para('The archives are written to release-artifacts/. To regenerate this PDF:');
code(['npm install --no-save pdfkit', 'node scripts/make-local-guide.mjs']);

para(
  'Verification commands, publishing paths and the full operational notes live in README.md at the root of the ' +
    'repository.',
  { color: MUTED, size: 10 },
);

/* --------------------------------------------------------------- footer --- */

const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i += 1) {
  doc.switchToPage(range.start + i);
  // The footer sits below the bottom margin; without this pdfkit treats it as
  // overflow and appends a fresh page for every footer it draws.
  const keep = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const y = doc.page.height - 44;
  doc.moveTo(LEFT, y - 10).lineTo(LEFT + WIDTH, y - 10).lineWidth(0.5).strokeColor(RULE).stroke();
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8.5)
    .text('Rajshahi Tours & Travels \u2014 Running the site locally', LEFT, y, {
      width: WIDTH / 2,
      lineBreak: false,
    });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8.5)
    .text(`Page ${i + 1} of ${range.count}`, LEFT + WIDTH / 2, y, {
      width: WIDTH / 2,
      align: 'right',
      lineBreak: false,
    });
  doc.page.margins.bottom = keep;
}

doc.flushPages();
doc.end();
console.log(path.relative(repo, out));
