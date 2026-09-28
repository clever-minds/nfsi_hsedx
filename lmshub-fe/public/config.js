/**
 * Runtime configuration for LMS Hub.
 *
 * Edit this file on your server after deploying. It is read by the browser when
 * the page loads, so a change takes effect on the next refresh — no rebuild, no
 * Node toolchain, no terminal. The file lives at the root of the built site
 * (next to index.html).
 *
 * apiUrl — where the backend answers, including the /api/v1 path.
 *
 *   Same server, behind one reverse proxy (most common):
 *     leave it empty. Requests go to /api/v1 on this same domain.
 *
 *   Backend on its own domain:
 *     apiUrl: "https://api.your-domain.com/api/v1"
 *
 * Nothing secret belongs in this file — every visitor can read it.
 */
window.__LMSHUB_CONFIG__ = {
  apiUrl: '',
};
