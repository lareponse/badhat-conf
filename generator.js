const $ = id => document.getElementById(id);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function cleanHost(value) {
  return value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

function cleanPath(value) {
  const path = value.trim();
  return path === "/" ? "/" : path.replace(/\/+$/g, "");
}

function todayVersion() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_001`;
}

function validLabel(label) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

function validHostname(host) {
  return host.split(".").length > 1 && host.split(".").every(validLabel);
}

function selected(id) {
  return Boolean($(id)?.checked);
}

function rawModel() {
  return {
    domain: cleanHost($("domain").value),
    stagingPrefix: cleanHost($("stagingPrefix").value),
    devSuffix: cleanHost($("devSuffix").value),
    webRoot: cleanPath($("webRoot").value),
    apacheSites: cleanPath($("apacheSites").value),
    apacheLogs: cleanPath($("apacheLogs").value),
    apacheBadhat: cleanPath($("apacheBadhat").value),
    apacheCreds: cleanPath($("apacheCreds").value),
    repo: $("repo").value.trim(),
    gitRef: $("gitRef").value.trim(),
    version: $("version").value.trim()
  };
}

function derivedModel(model) {
  const prodRoot = `${model.webRoot}/${model.domain}.prod`;
  const releaseRoot = `${model.webRoot}/${model.domain}.releases`;
  const releasePath = `${releaseRoot}/${model.version}`;

  const stagingRoot = model.stagingPrefix
    ? `${model.webRoot}/${model.domain}.${model.stagingPrefix}`
    : "";

  const stagingHost = model.stagingPrefix
    ? `${model.stagingPrefix}.${model.domain}`
    : "";

  const devRoot = `${model.webRoot}/${model.domain}`;
  const devHost = `${model.domain}.${model.devSuffix}`;

  const devLogBase = selected("hasGlobalDevLog")
    ? `${model.apacheLogs}/${model.domain}.dev`
    : `${model.apacheLogs}/${model.domain}.${model.devSuffix}`;

  return {
    ...model,
    prodRoot,
    releaseRoot,
    releasePath,
    stagingRoot,
    stagingHost,
    devRoot,
    devHost,
    devErrorLog: `${devLogBase}.error.log`,
    devAccessLog: `${devLogBase}.access.log`,
    serverAliases: selected("hasWww") ? `    ServerAlias www.${model.domain}` : "",
    stagingRelease: model.stagingPrefix
      ? `sudo ln -sfnT "${releasePath}" "${stagingRoot}"\n`
      : "",
    stagingCheck: model.stagingPrefix
      ? `readlink -f "${stagingRoot}"\ncurl -I "http://${stagingHost}/"\n`
      : ""
  };
}

function validate(model) {
  const errors = [];

  if (!validHostname(model.domain)) {
    errors.push(["domain", "Production domain must be a valid hostname."]);
  }

  if (!validLabel(model.devSuffix)) {
    errors.push(["devSuffix", "Dev suffix is required and must be one valid DNS label."]);
  }

  if (model.stagingPrefix && !validLabel(model.stagingPrefix)) {
    errors.push(["stagingPrefix", "Staging prefix may be empty, or one valid DNS label."]);
  }

  ["webRoot", "apacheSites", "apacheLogs", "apacheBadhat", "apacheCreds"].forEach(id => {
    if (!model[id].startsWith("/")) {
      errors.push([id, `${id} must be an absolute path.`]);
    }
  });

  if (selected("hasReleaseCommands")) {
    if (!model.repo) errors.push(["repo", "Git repository is required."]);
    if (!model.gitRef) errors.push(["gitRef", "Git ref is required."]);

    if (!/^[a-zA-Z0-9._-]+$/.test(model.version)) {
      errors.push([
        "version",
        "Release version may only contain letters, numbers, dots, underscores and hyphens."
      ]);
    }
  }

  return errors;
}

function fill(text, data) {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => data[key] ?? "");
}

function fileTemplates() {
  return $$("template[data-file]").map(template => ({
    template,
    checkbox: template.dataset.checkbox || "",
    needs: template.dataset.needs || "",
    title: template.dataset.title || "Generated file",
    name: template.dataset.name || "generated.txt"
  }));
}

function fileIsEnabled(file, data) {
  if (file.checkbox && !selected(file.checkbox)) return false;
  if (file.needs && !data[file.needs]) return false;
  return true;
}

function files(data) {
  return fileTemplates()
    .filter(file => fileIsEnabled(file, data))
    .map(file => ({
      title: fill(file.title, data),
      name: fill(file.name, data),
      content: fill(file.template.content.textContent.trim(), data) + "\n"
    }));
}

function renderValidation(errors) {
  $$("input").forEach(input => input.classList.remove("error"));

  errors.forEach(([id]) => {
    const input = $(id);
    if (input) input.classList.add("error");
  });

  const target = $("validation");
  target.replaceChildren();

  if (!errors.length) return;

  const box = document.createElement("div");
  box.className = "errors";

  const title = document.createElement("strong");
  title.textContent = "Fix before using generated files";

  const list = document.createElement("ul");

  errors.forEach(([, message]) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });

  box.append(title, list);
  target.append(box);
}

function code(text) {
  const element = document.createElement("code");
  element.textContent = text;
  return element;
}

function endpoint(label, url, path) {
  const fragment = document.createDocumentFragment();

  fragment.append(`${label}: `);
  fragment.append(code(url));
  fragment.append(" → ");
  fragment.append(code(path));
  fragment.append(document.createElement("br"));

  return fragment;
}

function unavailable(label, text) {
  const fragment = document.createDocumentFragment();
  const em = document.createElement("em");

  em.textContent = text;

  fragment.append(`${label}: `, em, document.createElement("br"));

  return fragment;
}

function renderSummary(data) {
  const target = $("summary");
  const title = document.createElement("strong");

  title.textContent = "Generated model";

  target.replaceChildren(
    title,
    document.createElement("br"),
    endpoint("dev", `http://${data.devHost}`, `${data.devRoot}/public`),
    data.stagingPrefix
      ? endpoint("staging", `http://${data.stagingHost}`, `${data.stagingRoot}/public`)
      : unavailable("staging", "not generated"),
    endpoint("prod", `https://${data.domain}`, `${data.prodRoot}/public`)
  );
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

function renderOutput(fileList) {
  const target = $("output");
  const template = $("tpl-output-file");

  target.replaceChildren();

  fileList.forEach(file => {
    const article = template.content.firstElementChild.cloneNode(true);
    const button = article.querySelector("button");

    article.querySelector("[data-title]").textContent = file.title;
    article.querySelector("[data-name]").textContent = file.name;
    article.querySelector("[data-content]").textContent = file.content;

    button.addEventListener("click", () => {
      copyText(file.content);
      button.textContent = "Copied";
      setTimeout(() => button.textContent = "⧉", 900);
    });

    target.append(article);
  });
}

function render() {
  const base = rawModel();
  const errors = validate(base);

  renderValidation(errors);

  if (errors.length) {
    $("summary").replaceChildren();
    $("output").replaceChildren();
    return;
  }

  const data = derivedModel(base);

  renderSummary(data);
  renderOutput(files(data));
}

if (!$("version").value.trim()) {
  $("version").value = todayVersion();
}

$$("input").forEach(input => {
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});

render();