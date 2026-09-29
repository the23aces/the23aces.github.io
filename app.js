(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const archive = globalThis.IPAArchive;
  const supplied = globalThis.IPA_CONFIG || {};
  const refresh = $("refresh-button");
  const grid = $("file-grid");
  const state = $("state-panel");
  const status = $("load-status");
  const notice = $("notice");
  const brand = String(supplied.title || "ipa's");
  let config;
  let currentData;
  let busy = false;
  let cacheKey;
  const cacheLifetime = 5 * 60 * 1000;

  document.title = `${brand} — App downloads`;
  document.querySelectorAll("[data-brand]").forEach(node => { node.textContent = brand; });
  document.querySelector(".brand").setAttribute("aria-label", `${brand} home`);

  function showState(title, message, retry = false, setup = false) {
    $("skeleton").hidden = true;
    grid.hidden = true;
    status.hidden = true;
    state.hidden = false;
    $("state-title").textContent = title;
    $("state-message").textContent = message;
    $("retry-button").hidden = !retry;
    $("setup-instructions").hidden = !setup;
  }

  if (!archive) {
    showState("The site could not load", "Make sure github.js and app.js were uploaded alongside index.html.");
    return;
  }

  try {
    config = archive.settings(supplied, location.hostname);
  } catch (error) {
    showState(error.code === "setup" ? "Your collection starts here" : "Check the site configuration", error.message, false, error.code === "setup");
    return;
  }

  const repoURL = archive.repositoryURL(config);
  $("source-link").href = repoURL;
  $("source-link").hidden = false;
  refresh.hidden = false;
  cacheKey = `ipa-archive:v1:${JSON.stringify([config.owner, config.repo, config.branch, config.folder, config.source])}`;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const colors = [
    ["#223021", "#c7ec9b"], ["#202f41", "#a3caff"],
    ["#342a21", "#eec29a"], ["#2d2640", "#cfb5f2"],
    ["#203437", "#9fdbd8"], ["#382532", "#efb1d1"],
  ];

  function formatDisplayName(filename) {
    const original = String(filename).replace(/\.ipa$/i, "").trim();
    // These names describe the same component. Preserve component order,
    // keep spoti.pw's version, and omit Eevee/Spotify's extra build versions.
    const tokens = original.replace(/\beevee[-_\s]+spotify\b/gi, "eeveespotify")
      .split(/[-_+\s]+/).filter(Boolean);
    const components = [];
    let recognized = tokens.length > 0;
    for (const token of tokens) {
      const name = token.toLowerCase();
      if (name === "spoti.pw") {
        components.push({ name: "spoti.pw", version: "" });
      } else if (name === "eevee" || name === "eeveespotify") {
        components.push({ name: "eevee", version: "" });
      } else if (components.length && /^v?\d+(?:\.\d+)*$/i.test(token)) {
        const component = components[components.length - 1];
        if (component.name === "spoti.pw" && !component.version) {
          component.version = token.replace(/^v/i, "");
        }
      } else if (components.length && /^(?:alpha|beta|rc|prerelease|preview|nightly|dev|stable|release)(?:\.?\d+)*$/i.test(token)) {
        // Release-channel labels are omitted from the compact card title.
      } else {
        recognized = false;
        break;
      }
    }
    if (recognized && components.length) {
      return components.map(component => component.name + (component.version ? ` ${component.version}` : "")).join(" + ");
    }
    // For other apps, keep their words and versions instead of guessing what
    // they mean. Only remove a trailing prerelease label when a version exists.
    const cleaned = /\d+\.\d+/.test(original)
      ? original.replace(/[-_\s]+(?:alpha|beta|rc|prerelease|preview|nightly|dev)(?:[-_.\s]*\d+)*$/i, "")
      : original;
    return cleaned.replace(/[-_]+/g, " ").replace(/\s*\+\s*/g, " + ").replace(/\s+/g, " ").trim() || original;
  }

  function card(file) {
    const article = element("article", "file-card");
    const top = element("div", "card-top");
    const displayName = formatDisplayName(file.name);
    const words = displayName.split(/[\s.+-]+/).filter(Boolean);
    const initials = words.length > 1 ? `${[...words[0]][0]}${[...words[1]][0]}` : [...displayName].slice(0, 2).join("");
    const icon = element("span", "file-icon", (initials || "IP").toUpperCase());
    icon.setAttribute("aria-hidden", "true");
    const hash = [...file.name].reduce((value, char) => (value + char.codePointAt(0)) % colors.length, 0);
    icon.style.setProperty("--tile-bg", colors[hash][0]);
    icon.style.setProperty("--tile-fg", colors[hash][1]);
    top.append(icon, element("span", "file-extension", ".IPA"));
    const heading = element("h3", "file-name", displayName || file.name);
    heading.title = file.name;
    const path = element("p", "file-path", file.path);
    const meta = element("div", "file-meta");
    meta.append(element("span", "file-size", archive.formatSize(file.size)), element("span", "file-origin", file.label));
    const bottom = element("div", "card-bottom");
    const download = element("a", "download-button", "Download");
    download.href = file.url;
    download.download = file.name;
    download.setAttribute("aria-label", `Download ${displayName}, ${archive.formatSize(file.size)}`);
    const source = element("a", "file-source");
    source.href = file.sourceURL;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.setAttribute("aria-label", `View ${displayName} on GitHub (opens in a new tab)`);
    source.title = "View on GitHub";
    // Static interface icon; repository names are inserted only as text.
    source.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3h7l4 4v14H5V3h3Zm6 0v5h5M8 12h8M8 16h6" stroke-linejoin="round"/></svg>';
    bottom.append(download, source);
    article.append(top, heading, path, meta, bottom);
    return article;
  }

  function timeLabel(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function render(data, cached = false) {
    currentData = data;
    const fragment = document.createDocumentFragment();
    for (const file of data.files) fragment.append(card(file));
    grid.replaceChildren(fragment);
    $("skeleton").hidden = true;
    state.hidden = true;
    status.hidden = false;
    status.textContent = `${data.files.length} ${data.files.length === 1 ? "file" : "files"} in the collection`;
    status.classList.add("visually-hidden");
    grid.hidden = !data.files.length;
    $("file-count").textContent = data.files.length.toLocaleString();
    const total = data.files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
    $("collection-summary").textContent = `${data.files.length} ${data.files.length === 1 ? "file" : "files"}${data.files.length ? ` · ${archive.formatSize(total)}${data.files.some(file => file.size === null) ? " known size" : " total"}` : ""}`;
    $("sync-status").textContent = `Checked at ${timeLabel(data.checkedAt)}${cached ? " · cached" : ""} · ${config.owner}/${config.repo}`;
    notice.textContent = data.warnings.join(" ");
    notice.hidden = !data.warnings.length;
    if (!data.files.length) {
      showState(data.warnings.length ? "No downloads could be shown" : "The collection is empty", data.warnings.length ? "See the notice above for what could not be loaded." : "No IPA files are available in this collection yet.");
    }
  }

  function readCache() {
    try {
      const data = JSON.parse(sessionStorage.getItem(cacheKey));
      const age = Date.now() - data?.checkedAt;
      if (!data || age < 0 || age > 24 * 60 * 60 * 1000 || !Number.isFinite(age) || !Array.isArray(data.files) || !Array.isArray(data.warnings)) return null;
      if (!data.files.every(file => typeof file.name === "string" && typeof file.path === "string" && typeof file.label === "string" && archive.safeGitHubURL(file.url) && archive.safeGitHubURL(file.sourceURL))) return null;
      return data;
    } catch { return null; }
  }

  async function load(force = false) {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    $("retry-button").disabled = true;
    grid.setAttribute("aria-busy", "true");
    const cached = currentData || readCache();
    if (cached) render(cached, true);
    try {
      if (!force && cached && !cached.warnings.length && Date.now() - cached.checkedAt < cacheLifetime) return;
      state.hidden = true;
      notice.hidden = true;
      status.hidden = false;
      status.classList.remove("visually-hidden");
      status.textContent = cached ? "Checking for updates…" : "Loading the collection…";
      if (!cached) $("skeleton").hidden = false;
      const data = await archive.load(config);
      render(data);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* Storage is optional. */ }
    } catch (error) {
      if (cached) {
        render(cached, true);
        notice.textContent = `Could not refresh the collection. Showing saved results from ${new Date(cached.checkedAt).toLocaleString()}. ${error.message}`;
        notice.hidden = false;
      } else {
        $("sync-status").textContent = "Collection unavailable";
        showState(error.code === "not-found" ? "Collection not found" : "Couldn't load the collection", error.message, true);
      }
    } finally {
      busy = false;
      refresh.disabled = false;
      $("retry-button").disabled = false;
      grid.setAttribute("aria-busy", "false");
    }
  }

  refresh.addEventListener("click", () => load(true));
  $("retry-button").addEventListener("click", () => load(true));
  load();
})();
