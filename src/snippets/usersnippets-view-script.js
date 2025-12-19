const vscode = acquireVsCodeApi();

const container = document.getElementById("snippetsContainer");

function getSnippetIndexFromCard(snippetCard) {
    return [...snippetsPerNameContainer.children].indexOf(snippetCard);
}

function addSnippetCard(snippet) {
    let editing = false;

    const snippetCard = document.createElement("div");
    snippetCard.className = "snippetCard";

    const details = document.createElement("div");
    details.className = "details";

    const snippetPrefixContainer = document.createElement("div");
    snippetPrefixContainer.className = "snippetPrefixContainer";

    const snippetPrefixLabel = document.createElement("label");
    snippetPrefixLabel.innerText = "Prefix"

    const snippetPrefix = document.createElement("textarea");
    snippetPrefix.className = "snippetPrefix";
    snippetPrefix.readOnly = !editing;

    snippetPrefixContainer.appendChild(snippetPrefixLabel);
    snippetPrefixContainer.appendChild(snippetPrefix);

    const snippetDescriptionContainer = document.createElement("div");
    snippetDescriptionContainer.className = "snippetDescriptionContainer";

    const snippetDescriptionLabel = document.createElement("label");
    snippetDescriptionLabel.innerText = "Description"

    const snippetDescription = document.createElement("textarea");
    snippetDescription.className = "snippetDescription";
    snippetDescription.readOnly = !editing;

    snippetDescriptionContainer.appendChild(snippetDescriptionLabel);
    snippetDescriptionContainer.appendChild(snippetDescription);

    details.appendChild(snippetPrefixContainer);
    details.appendChild(snippetDescriptionContainer);

    const body = document.createElement("div");
    body.className = "body";

    const snippetBodyContainer = document.createElement("div");
    snippetBodyContainer.className = "snippetBodyContainer";

    const snippetBodyLabel = document.createElement("label");
    snippetBodyLabel.innerText = "Body"

    const snippetBodyTextareaContainer = document.createElement("div");
    snippetBodyTextareaContainer.className = "snippetBodyTextareaContainer";

    const snippetBody = document.createElement("textarea");
    snippetBody.readOnly = !editing;
    snippetBody.className = "snippetBody";

    const copyIcon = document.createElement("i");
    copyIcon.className = "codicon codicon-copy";

    copyIcon.addEventListener("click", () => {
        vscode.postMessage({
            command: "copySnippet",
            snippet: snippetBody.value
        });
    });

    snippetBodyTextareaContainer.appendChild(snippetBody);
    snippetBodyTextareaContainer.appendChild(copyIcon);

    snippetBodyContainer.appendChild(snippetBodyLabel);
    snippetBodyContainer.appendChild(snippetBodyTextareaContainer);

    body.appendChild(snippetBodyContainer);

    snippetPrefix.value = snippet.prefix;
    snippetDescription.value = snippet.description;
    snippetBody.value = snippet.body;

    snippetCard.appendChild(details);
    snippetCard.appendChild(body);

    snippetPrefix.addEventListener("focus", (e) => {
        if (snippetPrefix.readOnly) e.target.blur();
    });
    snippetDescription.addEventListener("focus", (e) => {
        if (snippetDescription.readOnly) e.target.blur();
    });
    snippetBody.addEventListener("focus", (e) => {
        if (snippetBody.readOnly) e.target.blur();
    });

    const footer = document.createElement("div");
    footer.className = "footerRow";

    const iconsContainer = document.createElement("div");
    iconsContainer.className = "iconsContainer";

    const editIcon = document.createElement("i");
    editIcon.className = "codicon codicon-edit";
    const deleteIcon = document.createElement("i");
    deleteIcon.className = "codicon codicon-trash";

    iconsContainer.appendChild(editIcon);
    iconsContainer.appendChild(deleteIcon);

    footer.appendChild(iconsContainer);

    editIcon.addEventListener("click", () => {
        editing = !editing;

        snippetPrefix.readOnly = !editing;
        snippetDescription.readOnly = !editing;
        snippetBody.readOnly = !editing;

        editIcon.className = editing ? "codicon codicon-save" : "codicon codicon-edit";

        if (!editing) {
            const snippet = {
                prefix: snippetPrefix.value,
                body: snippetBody.value,
                description: snippetDescription.value
            }

            safeUserSnippets[getSnippetIndexFromCard(snippetCard)] = snippet;
            vscode.postMessage({
                command: "editSnippet",
                snippetIndex: getSnippetIndexFromCard(snippetCard),
                snippet: snippet
            });
        }
    });

    deleteIcon.addEventListener("click", () => {
        safeUserSnippets.splice(getSnippetIndexFromCard(snippetCard), 1);   
        
        vscode.postMessage({
            command: "deleteSnippet",
            snippetIndex: getSnippetIndexFromCard(snippetCard)
        });

        snippetCard.remove();
    });

    snippetCard.appendChild(footer);

    return snippetCard;
}

const header = document.createElement("div");
header.className = "header";

let editingName = false;

const snippetNameContainer = document.createElement("div");
snippetNameContainer.className = "snippetNameContainer";

const snippetName = document.createElement("textarea");
snippetName.className = "snippetName";
snippetName.value = name;
snippetName.readOnly = !editingName;

snippetNameContainer.appendChild(snippetName);

const editIcon = document.createElement("i");
editIcon.className = "codicon codicon-edit";
editIcon.title = "Change name";

editIcon.addEventListener("click", () => {
    editingName = !editingName;

    snippetName.readOnly = !editingName;
 
    editIcon.className = editingName ? "codicon codicon-save" : "codicon codicon-edit";

    if (!editingName) {
        vscode.postMessage({
            command: "changeNameOfUserSnippets",
            newName: snippetName.value
        });
    }
});

snippetNameContainer.appendChild(editIcon);

const contributeButton = document.createElement("button");
contributeButton.className = "contributeButton";

contributeButton.innerText = "Contribute to the Frank!Framework Wiki!";

const exportIcon = document.createElement("i");
exportIcon.className = "codicon codicon-export";
exportIcon.title = "Export snippet";

contributeButton.appendChild(exportIcon);

contributeButton.addEventListener("click", () => {
    vscode.postMessage({
        command: "exportUserSnippets",
        name: name
    });
});

header.appendChild(snippetNameContainer);
header.appendChild(contributeButton);

container.appendChild(header);

const newSnippetCard = document.createElement("div");
newSnippetCard.className = "snippetCard";
newSnippetCard.classList.add("newSnippetCard");

const details = document.createElement("div");
details.className = "details";

const footer = document.createElement("div");
footer.className = "footerRow";

const iconsContainer = document.createElement("div");
iconsContainer.className = "iconsContainer";

const addIcon = document.createElement("i");
addIcon.className = "codicon codicon-add";
addIcon.title = "Add snippet";
addIcon.classList.add("addIcon");

iconsContainer.appendChild(addIcon);

footer.appendChild(iconsContainer);

const snippetPrefixContainer = document.createElement("div");
snippetPrefixContainer.className = "snippetPrefixContainer";
const snippetPrefixLabel = document.createElement("label");
snippetPrefixLabel.innerText = "Prefix"
const snippetPrefix = document.createElement("textarea");
snippetPrefix.className = "snippetPrefix";
snippetPrefix.placeholder = "e.g. myReusableAdapter";

snippetPrefixContainer.appendChild(snippetPrefixLabel);
snippetPrefixContainer.appendChild(snippetPrefix);

const snippetDescriptionContainer = document.createElement("div");
snippetDescriptionContainer.className = "snippetDescriptionContainer";
const snippetDescriptionLabel = document.createElement("label");
snippetDescriptionLabel.innerText = "Description"
const snippetDescription = document.createElement("textarea");
snippetDescription.className = "snippetDescription";
snippetDescription.placeholder = "Short description of what this snippet is for";

snippetDescriptionContainer.appendChild(snippetDescriptionLabel);
snippetDescriptionContainer.appendChild(snippetDescription);

details.appendChild(snippetPrefixContainer);
details.appendChild(snippetDescriptionContainer);

const body = document.createElement("div");
body.className = "body";

const snippetBodyContainer = document.createElement("div");
snippetBodyContainer.className = "snippetBodyContainer";
const snippetBodyLabel = document.createElement("label");
snippetBodyLabel.innerText = "Body"
const snippetBody = document.createElement("textarea");
snippetBody.className = "snippetBody";
snippetBody.placeholder = "Snippet body";

snippetBodyContainer.appendChild(snippetBodyLabel);
snippetBodyContainer.appendChild(snippetBody);

body.appendChild(snippetBodyContainer);

newSnippetCard.appendChild(details);
newSnippetCard.appendChild(body);
newSnippetCard.appendChild(footer);

addIcon.addEventListener("click", () => {
    if (!snippetPrefix.value.trim()|| !snippetBody.value.trim() || !snippetDescription.value.trim() ) {
        vscode.postMessage({
            command: "error",
        });
    } else {
        const snippet = {
            prefix: snippetPrefix.value,
            body: snippetBody.value,
            description: snippetDescription.value
        }

        snippetPrefix.value = "";
        snippetBody.value = "";
        snippetDescription.value = "";

        const newIndex = safeUserSnippets.length;

        safeUserSnippets.push(snippet);   

        snippetsPerNameContainer.appendChild(addSnippetCard(snippet, newIndex));

        vscode.postMessage({
            command: "addSnippet",
            snippet: snippet
        });
        }
});

container.appendChild(newSnippetCard);

const divider = document.createElement("div");
divider.className = "snippetDivider";
container.appendChild(divider);

const snippetsPerNameContainer = document.createElement("div");
snippetsPerNameContainer.className = "snippetsPerNameContainer";

safeUserSnippets.forEach((snippet) => {
    let snippetCard = addSnippetCard(snippet);

    snippetsPerNameContainer.appendChild(snippetCard);
});

container.appendChild(snippetsPerNameContainer);
