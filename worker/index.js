// Serves docs/ as static assets. Only .mp4 requests reach this code: Cloudflare's static assets
// ignore Range headers, and Safari (iOS) will not play a video without 206 range responses.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
    const range = request.headers.get("Range");
    const base = new Headers(res.headers);
    base.set("Accept-Ranges", "bytes");
    base.set("Content-Type", "video/mp4");
    if (!res.ok || !range) return new Response(request.method === "HEAD" ? null : res.body, { status: res.status, headers: base });
    const buf = await res.arrayBuffer(), size = buf.byteLength;
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : NaN, end = m && m[2] ? Number(m[2]) : size - 1;
    if (Number.isNaN(start)) { start = Math.max(0, size - (end + 1)); end = size - 1; }   // suffix range "bytes=-N"
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    end = Math.min(end, size - 1);
    base.set("Content-Range", `bytes ${start}-${end}/${size}`);
    base.set("Content-Length", String(end - start + 1));
    return new Response(request.method === "HEAD" ? null : buf.slice(start, end + 1), { status: 206, headers: base });
  },
};
