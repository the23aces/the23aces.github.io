/* GitHub data layer. No credentials, dependencies, or write requests. */
(() => {
  "use strict";

  class ArchiveError extends Error {
    constructor(message, code = "network", status = 0) {
      super(message);
      this.name = "ArchiveError";
      this.code = code;
      this.status = status;
    }
  }

  const segment = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const pathURL = value => value.split("/").map(segment).join("/");
  const isIPA = value => typeof value === "string" && /\.ipa$/i.test(value);
  const validSize = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

  function settings(input = {}, hostname = "") {
    const detected = hostname.match(/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.github\.io$/i);
    const config = {
      owner: String(input.owner || detected?.[1] || "").trim(),
      repo: String(input.repo ?? "ipas").trim(),
      branch: String(input.branch || "").trim(),
      folder: String(input.folder || "").replace(/^\/+|\/+$/g, ""),
      source: input.source || "both",
      title: String(input.title || "ipa's"),
    };
    if (!config.owner) throw new ArchiveError("Set the GitHub account that owns your IPA repository.", "setup");
    if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(config.owner)) {
      throw new ArchiveError("Use a GitHub username or organization name in config.js, without a URL.", "config");
    }
    if (!/^[a-z0-9._-]{1,100}$/i.test(config.repo) || [".", ".."].includes(config.repo)) {
      throw new ArchiveError("Set repo in config.js to the exact GitHub repository slug. Apostrophes are not valid in repository slugs.", "config");
    }
    if (!config.folder.split("/").every(part => part !== "." && part !== ".." && !part.includes("\\"))) {
      throw new ArchiveError("Use a folder path such as apps or apps/ios in config.js.", "config");
    }
    if (!["both", "repository", "releases"].includes(config.source)) {
      throw new ArchiveError('Set source in config.js to "both", "repository", or "releases".', "config");
    }
    return Object.freeze(config);
  }

  function repositoryURL(config) {
    return `https://github.com/${segment(config.owner)}/${segment(config.repo)}`;
  }

  function safeGitHubURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password && !url.port;
    } catch { return false; }
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
    if (bytes === 0) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** power)).toLocaleString(undefined, { maximumFractionDigits: power > 0 ? 1 : 0 })} ${units[power]}`;
  }

  async function requestJSON(url, context) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const cancel = () => controller.abort();
    context.signal?.addEventListener("abort", cancel, { once: true });
    if (context.signal?.aborted) controller.abort();
    try {
      const response = await context.fetch(url, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        const retry = response.headers.get("retry-after");
        if (response.status === 429 || (response.status === 403 && (remaining === "0" || retry))) {
          const reset = Number(response.headers.get("x-ratelimit-reset"));
          const after = reset > 0 ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : " Please try again later.";
          throw new ArchiveError(`GitHub is temporarily limiting requests.${after}`, "rate-limit", response.status);
        }
        if (response.status === 404) throw new ArchiveError("The repository or branch could not be found. Check config.js and make sure the IPA repository is public.", "not-found", 404);
        if (response.status === 409) throw new ArchiveError("This repository does not have any commits yet.", "empty", 409);
        if (response.status === 403) throw new ArchiveError("GitHub is temporarily refusing this request. Please try again later.", "access", 403);
        throw new ArchiveError(`GitHub returned an error (${response.status}). Please try again.`, "api", response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      if (error.name === "AbortError") throw new ArchiveError("The connection timed out. Please try again.", "timeout");
      throw new ArchiveError("Could not reach GitHub. Check your internet connection and try again.", "network");
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", cancel);
    }
  }

  function withinFolder(path, folder) {
    return !folder || path.startsWith(`${folder}/`);
  }

  async function getTree(base, sha, config, context) {
    const tree = await requestJSON(`${base}/git/trees/${segment(sha)}?recursive=1`, context);
    if (!Array.isArray(tree.tree)) throw new ArchiveError("GitHub returned an unreadable file list. Please try again.", "api");
    if (!tree.truncated) return tree.tree;

    // GitHub caps recursive trees. Walk individual trees instead of silently
    // omitting files, and skip unrelated branches when a folder is configured.
    const entries = [];
    const queue = [{ sha, prefix: "" }];
    while (queue.length) {
      const current = queue.shift();
      const data = await requestJSON(`${base}/git/trees/${segment(current.sha)}`, context);
      if (data.truncated || !Array.isArray(data.tree)) throw new ArchiveError("The file list is too large. Set a smaller folder in config.js.", "too-large");
      for (const entry of data.tree) {
        const path = current.prefix + entry.path;
        if (entry.type === "tree") {
          if (!config.folder || path === config.folder || config.folder.startsWith(`${path}/`) || path.startsWith(`${config.folder}/`)) {
            queue.push({ sha: entry.sha, prefix: `${path}/` });
          }
        } else if (withinFolder(path, config.folder)) entries.push({ ...entry, path });
      }
    }
    return entries;
  }

  async function repositoryFiles(config, context) {
    const base = context.base;
    const query = new URLSearchParams({ per_page: "1" });
    if (config.branch) query.set("sha", config.branch);
    let commits;
    try { commits = await requestJSON(`${base}/commits?${query}`, context); }
    catch (error) { if (error.code === "empty") return { files: [], warnings: [] }; throw error; }
    if (!Array.isArray(commits)) throw new ArchiveError("GitHub returned an unreadable repository response.", "api");
    if (!commits.length) return { files: [], warnings: [] };
    const commit = commits[0];
    if (!commit.sha || !commit.commit?.tree?.sha) throw new ArchiveError("GitHub did not return a file-tree reference.", "api");
    const entries = await getTree(base, commit.commit.tree.sha, config, context);
    const files = [];
    let lfsCount = 0;
    for (const entry of entries) {
      if (entry.type !== "blob" || entry.mode === "120000" || !isIPA(entry.path) || !withinFolder(entry.path, config.folder)) continue;
      // An LFS pointer is a small text file, not the IPA itself. Do not offer
      // it as a broken download or report the pointer's size as the app size.
      if (entry.size <= 1024) {
        const blob = await requestJSON(`${base}/git/blobs/${segment(entry.sha)}`, context);
        if (blob.encoding === "base64" && typeof blob.content === "string") {
          const text = atob(blob.content.replace(/\s/g, ""));
          if (text.startsWith("version https://git-lfs.github.com/spec/v1")) { lfsCount++; continue; }
        }
      }
      const parts = entry.path.split("/");
      const name = parts.pop();
      const root = repositoryURL(config);
      files.push({
        id: `file:${entry.path}`,
        name,
        path: entry.path,
        size: validSize(entry.size),
        kind: "repository",
        label: parts.length ? parts.join("/") : "Repository file",
        url: `${root}/raw/${segment(commit.sha)}/${pathURL(entry.path)}?download=1`,
        sourceURL: `${root}/blob/${segment(commit.sha)}/${pathURL(entry.path)}`,
      });
    }
    return {
      files,
      warnings: lfsCount ? [`${lfsCount} Git LFS ${lfsCount === 1 ? "file was" : "files were"} skipped. Upload the actual IPA files as GitHub Release attachments to include them here.`] : [],
    };
  }

  async function releaseFiles(config, context) {
    const files = [];
    const warnings = [];
    for (let page = 1; ; page++) {
      let releases;
      try { releases = await requestJSON(`${context.base}/releases?per_page=100&page=${page}`, context); }
      catch (error) {
        if (page === 1) throw error;
        warnings.push(`Some older releases could not be loaded. ${error.message}`);
        break;
      }
      if (!Array.isArray(releases)) throw new ArchiveError("GitHub returned an unreadable release list.", "api");
      for (const release of releases) {
        if (release.draft) continue;
        for (const asset of release.assets || []) {
          const expectedPath = `/${config.owner}/${config.repo}/releases/download/`.toLowerCase();
          if (!isIPA(asset.name) || asset.state !== "uploaded" || !safeGitHubURL(asset.browser_download_url)) continue;
          if (!new URL(asset.browser_download_url).pathname.toLowerCase().startsWith(expectedPath)) continue;
          files.push({
            id: `release:${asset.id}`,
            name: asset.name,
            path: `${release.tag_name} / ${asset.name}`,
            size: validSize(asset.size),
            kind: "release",
            label: release.prerelease ? `Pre-release · ${release.tag_name}` : `Release · ${release.tag_name}`,
            url: asset.browser_download_url,
            sourceURL: `${repositoryURL(config)}/releases/tag/${segment(release.tag_name)}`,
          });
        }
      }
      if (releases.length < 100) break;
    }
    return { files, warnings };
  }

  async function load(config, options = {}) {
    const context = {
      fetch: options.fetch || globalThis.fetch.bind(globalThis),
      signal: options.signal,
      base: `https://api.github.com/repos/${segment(config.owner)}/${segment(config.repo)}`,
    };
    const jobs = [];
    if (config.source !== "releases") jobs.push({ name: "Repository files", run: repositoryFiles(config, context) });
    if (config.source !== "repository") jobs.push({ name: "Release attachments", run: releaseFiles(config, context) });
    const results = await Promise.allSettled(jobs.map(job => job.run));
    if (results.every(result => result.status === "rejected")) throw results[0].reason;
    const files = [];
    const warnings = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        files.push(...result.value.files);
        warnings.push(...result.value.warnings);
      } else warnings.push(`${jobs[index].name} could not be loaded. ${result.reason.message}`);
    });
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    files.sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.path, b.path));
    return { files, warnings, checkedAt: Date.now() };
  }

  globalThis.IPAArchive = Object.freeze({ ArchiveError, settings, repositoryURL, safeGitHubURL, formatSize, load });
})();
