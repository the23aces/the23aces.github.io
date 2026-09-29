// The only file you need to configure. Never put a GitHub token here.
window.IPA_CONFIG = Object.freeze({
  // Leave empty to detect the account from https://YOUR-USERNAME.github.io.
  // Set this explicitly for a custom domain or a repository in another account.
  owner: "the23aces",

  // Exact repository slug from its URL, e.g. github.com/you/ipas.
  // The display name can contain an apostrophe; GitHub repository slugs cannot.
  repo: "ipas",

  // Empty uses the repository's default branch. Tags and commit SHAs work too.
  branch: "",

  // Empty scans all folders. Example: "apps" only scans apps/ and its children.
  // Applies to repository files, not release attachments.
  folder: "",

  // "both", "repository", or "releases". Releases support larger IPA files.
  source: "both",

  // Website name, independent of the repository name.
  title: "ipa's",
});
