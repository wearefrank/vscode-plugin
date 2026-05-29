// @ts-check
(function () {
    const vscode = acquireVsCodeApi();
    const isSkeleton = document.body.dataset.isSkeleton === 'true';

    let configCount = 0;

    function addConfig(defaultValue = '') {
        configCount++;
        const list = document.getElementById('configurations-list');
        const item = document.createElement('div');
        item.className = 'config-item';
        item.dataset.id = String(configCount);
        item.innerHTML = `
            <input type="text" class="config-name" placeholder="my-configuration" autocomplete="off" value="${defaultValue}" />
            <button class="remove-button" type="button" title="Remove configuration">✕</button>
        `;
        item.querySelector('.remove-button').addEventListener('click', () => {
            item.remove();
            updateRemoveButtons();
        });
        list.appendChild(item);
        updateRemoveButtons();
        item.querySelector('.config-name').focus();
    }

    function updateRemoveButtons() {
        const items = document.querySelectorAll('.config-item');
        items.forEach(item => {
            item.querySelector('.remove-button').disabled = items.length === 1;
        });
    }

    function showError(message) {
        const banner = document.getElementById('error-banner');
        banner.textContent = message;
        banner.classList.remove('hidden');
        banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function clearError() {
        document.getElementById('error-banner').classList.add('hidden');
    }

    document.getElementById('browseBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'pickFolder' });
    });

    document.getElementById('addConfigBtn').addEventListener('click', () => addConfig());

    document.getElementById('createBtn').addEventListener('click', () => {
        clearError();

        const frankName = document.getElementById('frankName').value.trim();
        const rootDir = document.getElementById('rootDir').value.trim();
        const configInputs = document.querySelectorAll('.config-name');
        const configurations = Array.from(configInputs)
            .map(input => input.value.trim())
            .filter(v => v.length > 0);

        if (!frankName) { showError('Frank Name is required.'); return; }
        if (!rootDir) { showError('Root Directory is required.'); return; }
        if (!isSkeleton && configurations.length === 0) { showError('At least one configuration name is required.'); return; }

        const boilerplate = document.getElementById('boilerplateCheck').checked;

        document.getElementById('createBtn').disabled = true;
        document.getElementById('createBtn').textContent = 'Creating...';

        vscode.postMessage({ command: 'submit', frankName, rootDir, configurations, boilerplate });
    });

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'folderSelected') {
            document.getElementById('rootDir').value = msg.path;
        } else if (msg.command === 'error') {
            showError(msg.message);
            document.getElementById('createBtn').disabled = false;
            document.getElementById('createBtn').textContent = 'Create Frank!';
        }
    });

    if (!isSkeleton) { addConfig(); }
}());
