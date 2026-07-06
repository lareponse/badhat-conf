const $ = id => document.getElementById(id);

const vhosts = [
  {
    checkbox: "hasDevHttp",
    needsStaging: false,
    title: "Development HTTP",
    name: "{{devHost}}.conf",
    template: "tpl-dev-http"
  },
  {
    checkbox: "hasStagingHttp",
    needsStaging: true,
    title: "Staging HTTP",
    name: "{{stagingHost}}.conf",
    template: "tpl-staging-http"
  },
  {
    checkbox: "hasStagingSsl",
    needsStaging: true,
    title: "Staging HTTPS",
    name: "{{stagingHost}}-le-ssl.conf",
    template: "tpl-staging-ssl"
  },
  {
    checkbox: "hasProdSsl",
    needsStaging: false,
    title: "Production HTTPS",
    name: "{{domain}}-le-ssl.conf",
    template: "tpl-prod-ssl"
  }
];

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
  return $(id).checked;
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
      errors.push(["version", "Release version may only contain letters, numbers, dots, underscores and hyphens."]);
    }
  }

  return errors;
}

function template(id) {
  return $(id).content.textContent.trim();
}

function fill(text, data) {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => data[key] ?? "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function files(data) {
  const apacheFiles = vhosts
    .filter(vhost => selected(vhost.checkbox))
    .filter(vhost => !vhost.needsStaging || data.stagingPrefix)
    .map(vhost => ({
      title: vhost.title,
      name: fill(vhost.name, data),
      content: fill(template(vhost.template), data) + "\n"
    }));

  const releaseFiles = selected("hasReleaseCommands")
    ? [{
        title: "Release commands",
        name: `${data.domain}-release-commands.sh`,
        content: fill(template("tpl-release"), data) + "\n"
      }]
    : [];

  return [...apacheFiles, ...releaseFiles];
}

function renderValidation(errors) {
  document.querySelectorAll("input").forEach(input => input.classList.remove("error"));

  errors.forEach(([id]) => {
    const input = $(id);
    if (input) input.classList.add("error");
  });

  $("validation").innerHTML = errors.length
    ? `<div class="errors"><strong>Fix before using generated files</strong><ul>${errors.map(error => `<li>${escapeHtml(error[1])}</li>`).join("")}</ul></div>`
    : "";
}

function renderSummary(data) {
  const staging = data.stagingPrefix
    ? `staging: <code>http://${escapeHtml(data.stagingHost)}</code> → <code>${escapeHtml(data.stagingRoot)}/public</code><br>`
    : `staging: <em>not generated</em><br>`;

  $("summary").innerHTML = `
    <strong>Generated model</strong><br>
    dev: <code>http://${escapeHtml(data.devHost)}</code> → <code>${escapeHtml(data.devRoot)}/public</code><br>
    ${staging}
    prod: <code>https://${escapeHtml(data.domain)}</code> → <code>${escapeHtml(data.prodRoot)}/public</code>
  `;
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

function renderOutput(fileList) {
  $("output").innerHTML = fileList.map((file, index) => `
    <article class="file">
      <h2>
        <span>
          ${escapeHtml(file.title)}<br>
          <small>${escapeHtml(file.name)}</small>
        </span>
        <button type="button" data-copy="${index}" title="Copy">⧉</button>
      </h2>
      <pre><code>${escapeHtml(file.content)}</code></pre>
    </article>
  `).join("");

  document.querySelectorAll("[data-copy]").forEach(button => {
    button.addEventListener("click", () => {
      copyText(fileList[Number(button.dataset.copy)].content);
      button.textContent = "Copied";
      setTimeout(() => button.textContent = "⧉", 900);
    });
  });
}

function render() {
  const base = rawModel();
  const errors = validate(base);

  renderValidation(errors);

  if (errors.length) {
    $("summary").innerHTML = "";
    $("output").innerHTML = "";
    return;
  }

  const data = derivedModel(base);
  renderSummary(data);
  renderOutput(files(data));
}

if (!$("version").value.trim()) {
  $("version").value = todayVersion();
}

document.querySelectorAll("input").forEach(input => {
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});

render();