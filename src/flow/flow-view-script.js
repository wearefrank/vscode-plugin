const svg = container.querySelector("svg");

function fitSvg() {
    if (!svg) return;

    const bbox = svg.getBBox();
    if (!bbox.width || !bbox.height) return;

    const PADDING = 10;

    svg.setAttribute(
        "viewBox",
        `${bbox.x - PADDING} ${bbox.y - PADDING} ${bbox.width + PADDING * 2} ${bbox.height + PADDING * 2}`
    );

    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}



window.addEventListener("load", fitSvg);