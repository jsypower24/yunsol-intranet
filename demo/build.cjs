const esbuild = require('esbuild'); const fs = require('fs'); const path = require('path');
const S = __dirname; const R = path.join(S, '..');
const shim = { name: 'shim', setup(b) {
  b.onResolve({ filter: /^node:crypto$|\/password$/ }, () => ({ path: S + '/shims.ts' }));
  b.onResolve({ filter: /^\/(figtree|noto-sans-kr)\.woff2$/ }, a => ({ path: R + '/public' + a.path }));
}};
esbuild.build({ entryPoints: [S + '/demo.tsx'], bundle: true, minify: true, outdir: S + '/.out', format: 'iife', jsx: 'automatic',
  loader: { '.woff2': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [shim], nodePaths: [R + '/node_modules'],
  alias: { '@': R + '/src' }, logLevel: 'warning' }).then(() => {
  const js = fs.readFileSync(S + '/.out/demo.js', 'utf8').replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(S + '/.out/demo.css', 'utf8');
  const extra = `.demo-banner{position:relative;z-index:50;background:#1d4ed8;color:#fff;font-size:13px;padding:8px 16px;text-align:center;line-height:1.5}`;
  fs.writeFileSync(S + '/yunsol-demo.html', `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>윤솔 인트라넷 체험판</title><style>${css}${extra}</style></head><body><script>${js}</script></body></html>`);
  console.log('size', fs.statSync(S + '/yunsol-demo.html').size);
});
