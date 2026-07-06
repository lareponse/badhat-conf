const $ = id => document.getElementById(id);

const outputs = [
    {
        group: "apache",
        checkbox: "hasDevHttp",
        filename: "{{devHost}}.conf",
        template: "tpl-dev-http"
    },
    {
        group: "apache",
        checkbox: "hasStagingHttp",
        requiresStaging: true,
        filename: "{{stagingHost}}.conf",
        template: "tpl-staging-http"
    },
    {
        group: "apache",
        checkbox: "hasStagingSsl",
        requiresStaging: true,
        filename: "{{stagingHost}}-le-ssl.conf",
        template: "tpl-staging-ssl"
    },
    {
        group: "apache",
        checkbox: "hasProdSsl",
        filename: "{{domain}}-le-ssl.conf",
        template: "tpl-prod-ssl"
    },
    {
        group: "release",
        checkbox: "hasReleaseCommands",
        filename: "{{domain}}-release-commands.sh",
        template: "tpl-release-commands"
    }
];

function cleanHost(value) {
    return value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

function cleanPrefix(value) {
    return value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

function cleanPath(value) {
    const trimmed = value.trim();
    if (trimmed === "/") {
        return "/";
    }
    return trimmed.replace(/\/+$/g, "");
}

function cleanToken(value) {
    return value.trim();
}

function selected(id) {
    return $(id).checked;
}

function todayReleaseVersion() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}_001`;
}

function setDefaultReleaseVersion() {
    if (!$('version').value.trim()) {
        $('version').value = todayReleaseVersion();
    }
}

function siteConfig() {
    const domain = cleanHost($("domain").value);
    const stagingPrefix = cleanPrefix($("stagingPrefix").value);
    const devPrefix = cleanPrefix($("devPrefix").value);
    const webRoot = cleanPath($("webRoot").value);
    const apacheSites = cleanPath($("apacheSites").value);
    const apacheLogs = cleanPath($("apacheLogs").value);
    const apacheBadhat = cleanPath($("apacheBadhat").value);
    const apacheCreds = cleanPath($("apacheCreds").value);
    const repo = cleanToken($("repo").value);
    const gitRef = cleanToken($("gitRef").value);
    const version = cleanToken($("version").value);

    return {
        domain,
        stagingPrefix,
        devPrefix,
        repo,
        gitRef,
        version,
        webRoot,
        apacheSites,
        apacheLogs,
        apacheBadhat,
        apacheCreds,
        releaseRoot: `${webRoot}/${domain}.releases`,
        releasePath: `${webRoot}/${domain}.releases/${version}`,
        prodRoot: `${webRoot}/${domain}.prod`,
        stagingRoot: `${webRoot}/${domain}.${stagingPrefix}`,
        devRoot: `${webRoot}/${domain}`,
        stagingHost: `${stagingPrefix}.${domain}`,
        devHost: `${devPrefix}.${domain}`,
        stagingReleaseCommands: stagingPrefix ? `# Point staging to the release\nsudo ln -sfnT "${webRoot}/${domain}.releases/${version}" "${webRoot}/${domain}.${stagingPrefix}"\nsudo apache2ctl configtest\nsudo systemctl reload apache2\n\n` : "",
        stagingTargetCheck: stagingPrefix ? `readlink -f "${webRoot}/${domain}.${stagingPrefix}"` : "",
        stagingHostCheck: stagingPrefix ? `curl -I "http://${stagingPrefix}.${domain}/"\n` : "",
        serverAliases: selected("hasWww") ? `    ServerAlias www.${domain}` : ""
    };
}

function validationRules(data) {
    const rules = [
        ["domain", "Production domain must be a valid hostname, for example liebrex.net.", /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/],
        ["devPrefix", "Dev prefix is required and must contain only letters, numbers and hyphens.", /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/],
        ["webRoot", "Web root must be an absolute path.", /^\/.+/],
        ["apacheSites", "Apache sites-available path must be absolute.", /^\/.+/],
        ["apacheLogs", "Apache logs path must be absolute.", /^\/.+/],
        ["apacheBadhat", "BADHAT Apache includes path must be absolute.", /^\/.+/],
        ["apacheCreds", "Credentials includes path must be absolute.", /^\/.+/]
    ];

    if (data.stagingPrefix && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(data.stagingPrefix)) {
        rules.push(["stagingPrefix", "Staging prefix may be empty. When present, it must contain only letters, numbers and hyphens.", /^$/]);
    }

    if (selected("hasReleaseCommands")) {
        rules.push(["repo", "Git repository is required for release commands.", /^\S+$/]);
        rules.push(["gitRef", "Git ref is required for release commands.", /^\S+$/]);
        rules.push(["version", "Release version must use only letters, numbers, dots, underscores and hyphens.", /^[a-zA-Z0-9._-]+$/]);
    }

    return rules.filter(rule => !rule[2].test(data[rule[0]]));
}

function applyValidationState(errors) {
    document.querySelectorAll("input").forEach(input => input.classList.remove("error"));

    for (const error of errors) {
        const input = $(error[0]);
        if (input) {
            input.classList.add("error");
        }
    }

    if (errors.length === 0) {
        $("validation").innerHTML = "";
        return;
    }

    $("validation").innerHTML = `
        <div class="errors">
            <strong>Fix before using generated files</strong>
            <ul>
                ${errors.map(error => `<li>${escapeHtml(error[1])}</li>`).join("")}
            </ul>
        </div>
    `;
}

function templateText(id) {
    return $(id).content.textContent.trim();
}

function fill(template, data) {
    return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
        return Object.hasOwn(data, key) ? data[key] : match;
    });
}

function fileList(data) {
    return outputs
        .filter(item => selected(item.checkbox))
        .filter(item => !item.requiresStaging || Boolean(data.stagingPrefix))
        .map(item => {
            return {
                group: item.group,
                name: fill(item.filename, data),
                content: fill(templateText(item.template), data) + "\n"
            };
        });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function download(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    a.remove();
    URL.revokeObjectURL(url);
}

function renderFileGroup(files, title) {
    if (files.length === 0) {
        return "";
    }

    return `
        <h2 class="group-title">${escapeHtml(title)}</h2>
        ${files.map((file, index) => `
            <article class="file">
                <h2>
                    <span>${escapeHtml(file.name)}</span>
                    <button type="button" data-download="${file.group}:${index}">Download</button>
                </h2>
                <pre><code>${escapeHtml(file.content)}</code></pre>
            </article>
        `).join("")}
    `;
}

function render() {
    const data = siteConfig();
    const errors = validationRules(data);

    applyValidationState(errors);

    if (errors.length > 0) {
        $("summary").innerHTML = "";
        $("apacheOutput").innerHTML = "";
        $("releaseOutput").innerHTML = "";
        return [];
    }

    const files = fileList(data);
    const apacheFiles = files.filter(file => file.group === "apache");
    const releaseFiles = files.filter(file => file.group === "release");
    const stagingScheme = selected("hasStagingSsl") ? "https" : "http";

    const stagingLine = data.stagingPrefix
        ? `staging: <code>${stagingScheme}://${escapeHtml(data.stagingHost)}</code> → <code>${escapeHtml(data.stagingRoot)}/public</code><br>`
        : `staging: <em>not generated; staging prefix is empty</em><br>`;

    $("summary").innerHTML = `
        <strong>Model</strong><br>
        dev: <code>http://${escapeHtml(data.devHost)}</code> → <code>${escapeHtml(data.devRoot)}/public</code><br>
        ${stagingLine}
        prod: <code>https://${escapeHtml(data.domain)}</code> → <code>${escapeHtml(data.prodRoot)}/public</code>
    `;

    $("apacheOutput").innerHTML = renderFileGroup(apacheFiles, "Apache vhost files");
    $("releaseOutput").innerHTML = renderFileGroup(releaseFiles, "Release, Git and server work");

    const grouped = {
        apache: apacheFiles,
        release: releaseFiles
    };

    document.querySelectorAll("[data-download]").forEach(button => {
        button.addEventListener("click", () => {
            const [group, index] = button.dataset.download.split(":");
            const file = grouped[group][Number(index)];
            download(file.name, file.content);
        });
    });

    return files;
}

$("generate").addEventListener("click", render);

$("downloadAll").addEventListener("click", () => {
    for (const file of render()) {
        download(file.name, file.content);
    }
});

setDefaultReleaseVersion();

document.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
});

render();
