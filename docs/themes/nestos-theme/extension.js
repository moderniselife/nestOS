const vscode = require('vscode');
const path = require('path');

function activate(context) {
    const extensionPath = context.extensionPath;
    const cssPath = path.join(extensionPath, 'styles', 'custom.css');
    const jsPath = path.join(extensionPath, 'styles', 'custom.js');

    // Convert to file:/// URI format
    const cssUri = `file:///${cssPath.replace(/\\/g, '/')}`;
    const jsUri = `file:///${jsPath.replace(/\\/g, '/')}`;

    // Update VS Code settings
    const config = vscode.workspace.getConfiguration();
    config.update('vscode_custom_css.imports', [cssUri, jsUri], true)
        .then(() => {
            vscode.window.showInformationMessage('NestOS Theme: Custom styles applied. Please reload VS Code.');
        });
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};